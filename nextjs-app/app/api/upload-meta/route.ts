import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

/**
 * 已知accounts表字段映射
 * 不在此列表的字段 -> 放到metadata JSONB
 */
const KNOWN_COLUMNS = new Set([
  'name', 'account_type', 'status', 'buyer', 'code', 'remark', 'operator',
  'metadata', 'id', 'created_at', 'updated_at'
]);

function getFieldKey(header: string): string {
  const h = header.trim();
  const map: Record<string, string> = {
    '账号名称': 'name', '抖音名称': 'name', '名称': 'name',
    '类型': 'account_type', '账号类型': 'account_type',
    '状态': 'status', '账号状态': 'status',
    '选品人': 'buyer', '买家': 'buyer',
    '编号': 'code', 'code': 'code',
    '备注': 'remark', 'remark': 'remark',
    '运营人': 'operator', 'operator': 'operator', '备用': 'operator',
  };
  return map[h] || h.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').toLowerCase();
}

async function ensureFields(headers: string[]) {
  const { data: existing } = await supabaseAdmin.from('account_fields').select('key, label');
  const existingKeys = new Set((existing || []).map(f => f.key));

  const toInsert = [];
  let sortOrder = (existing || []).length + 1;

  for (const h of headers) {
    const key = getFieldKey(h);
    if (key === 'name') continue;
    if (!existingKeys.has(key)) {
      toInsert.push({
        key,
        label: h.trim(),
        show_in_admin: true,
        show_in_dashboard: false,
        sort_order: sortOrder++,
      });
      existingKeys.add(key);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('account_fields').insert(toInsert);
    if (error) console.error('Insert fields error:', error);
    else console.log('Inserted fields:', toInsert.map(f => f.key).join(', '));
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    const headers = rows[0].map(h => String(h || '').trim());
    console.log('[upload-meta] Excel headers:', headers);

    // 第一列必须是账号名称
    const nameKey = getFieldKey(headers[0]);
    if (nameKey !== 'name') {
      return NextResponse.json({ error: `第一列必须是"账号名称"，当前是"${headers[0]}"`, status: 400 });
    }

    // 根据表头动态创建account_fields配置
    await ensureFields(headers);

    // 解析数据
    const recordMap = new Map<string, any>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const record: any = { name };
      const metadata: Record<string, string> = {};

      for (let colIdx = 1; colIdx < headers.length; colIdx++) {
        const header = headers[colIdx];
        const key = getFieldKey(header);
        const val = row[colIdx];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const strVal = String(val).trim();
          // 已知列直接放入record，未知列放入metadata
          if (KNOWN_COLUMNS.has(key)) {
            record[key] = strVal;
          } else {
            metadata[key] = strVal;
          }
        }
      }

      if (Object.keys(metadata).length > 0) {
        record.metadata = metadata;
      }

      recordMap.set(name, record);
    }

    const updates = Array.from(recordMap.values());
    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 });
    }

    console.log(`[upload-meta] Parsed ${updates.length} unique accounts`);

    // Batch upsert
    const batchSize = 500;
    let updated = 0;
    const errors: string[] = [];
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const { error } = await supabaseAdmin.from('accounts').upsert(batch, { onConflict: 'name' });
      if (error) {
        console.error(`[upload-meta] Batch error:`, error);
        errors.push(`Batch ${i/batchSize + 1}: ${error.message}`);
      } else {
        updated += batch.length;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: 'Partial update failed', details: errors, updated, total: updates.length }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated, total: updates.length, fields: headers });

  } catch (err: any) {
    console.error('Upload meta error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
