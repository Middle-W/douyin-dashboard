import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabase';
import { savePending } from '@/lib/save-pending';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PENDING_DIR = path.join(process.cwd(), 'pending-errors');

function ensureDir() {
  if (!fs.existsSync(PENDING_DIR)) {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
  }
}

function listPending() {
  ensureDir();
  const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const fullPath = path.join(PENDING_DIR, f);
    const stat = fs.statSync(fullPath);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return {
      filename: f,
      type: content.type,
      date: content.date,
      createdAt: content.createdAt,
      recordCount: content.data?.length || 0,
      error: content.error,
      unmatched: content.unmatched?.length || 0,
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// GET: 列出所有 pending 文件
export async function GET() {
  try {
    ensureDir();
    const items = listPending();
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: 处理 pending 文件
// action: 'load' | 'process' | 'delete'
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, filename, edits } = body;

    if (!filename) {
      return NextResponse.json({ error: 'filename required' }, { status: 400 });
    }

    const filePath = path.join(PENDING_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Load: 读取文件内容
    if (action === 'load') {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return NextResponse.json({ content });
    }

    // Delete: 删除文件
    if (action === 'delete') {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: '已删除' });
    }

    // Process: 重新入库
    if (action === 'process') {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let data = content.data || [];

      // 应用编辑
      if (edits && Array.isArray(edits)) {
        for (const edit of edits) {
          const idx = data.findIndex((d: any) => d.name === edit.oldName);
          if (idx >= 0) {
            if (edit.newName) data[idx].name = edit.newName;
            if (edit.orders !== undefined) data[idx].orders = edit.orders;
            if (edit.net_income !== undefined) data[idx].net_income = edit.net_income;
            if (edit.cost !== undefined) data[idx].cost = edit.cost;
          }
        }
      }

      // 过滤掉 name 为空的数据
      data = data.filter((d: any) => String(d.name || '').trim());

      if (data.length === 0) {
        return NextResponse.json({ error: 'No valid data to process' }, { status: 400 });
      }

      // 重新匹配账号
      const { data: allAccounts } = await supabaseAdmin.from('accounts').select('name');
      const accountNames = (allAccounts || []).map((a: any) => a.name);

      const nameMap: Record<string, string> = {};
      const unmatched: string[] = [];
      const matched: any[] = [];

      for (const item of data) {
        const rawName = String(item.name || '').trim();
        if (!rawName) continue;

        let resolvedName = nameMap[rawName];
        if (!resolvedName) {
          if (accountNames.includes(rawName)) {
            resolvedName = rawName;
          } else {
            const prefixMatch = accountNames.find(n => n.startsWith(rawName));
            if (prefixMatch) resolvedName = prefixMatch;
            else {
              const includeMatch = accountNames.find(n => n.includes(rawName));
              if (includeMatch) resolvedName = includeMatch;
              else {
                const reverseMatch = accountNames.find(n => rawName.includes(n) && n.length >= 2);
                if (reverseMatch) resolvedName = reverseMatch;
              }
            }
          }
          nameMap[rawName] = resolvedName || '';
        }

        if (!resolvedName) {
          if (!unmatched.includes(rawName)) unmatched.push(rawName);
          continue;
        }

        matched.push({ ...item, name: resolvedName });
      }

      if (matched.length === 0) {
        return NextResponse.json({
          error: 'No valid data after matching',
          unmatched,
        }, { status: 400 });
      }

      // 根据类型入库
      const { type, date } = content;
      if (type === 'stats') {
        const { data: existingRecords } = await supabaseAdmin
          .from('daily_stats')
          .select('account_name, income, amount')
          .eq('date', date);

        const existingMap = new Map<string, { income: number; amount: number }>();
        for (const r of existingRecords || []) {
          existingMap.set(r.account_name, { income: r.income, amount: r.amount });
        }

        const payloads = matched.map((item: any) => {
          const existing = existingMap.get(item.name);
          return {
            account_name: item.name,
            date,
            orders: parseInt(item.orders) || 0,
            net_income: parseFloat(item.net_income) || 0,
            income: existing ? existing.income : 0,
            amount: existing ? existing.amount : 0,
          };
        });

        const { error: upsertError } = await supabaseAdmin
          .from('daily_stats')
          .upsert(payloads, { onConflict: 'account_name,date' });

        if (upsertError) {
          return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }
      } else if (type === 'costs') {
        const costs = matched.map((item: any) => ({
          account_name: item.name,
          date,
          cost: Math.round((parseFloat(item.cost) || 0) * 100) / 100,
        }));

        const { error } = await supabaseAdmin
          .from('daily_costs')
          .upsert(costs, { onConflict: 'account_name,date' });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      // 成功后删除 pending 文件
      fs.unlinkSync(filePath);

      return NextResponse.json({
        success: true,
        message: `已入库 ${matched.length} 条${unmatched.length > 0 ? `，${unmatched.length} 条仍匹配不上` : ''}`,
        unmatched: unmatched.length > 0 ? unmatched : undefined,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
