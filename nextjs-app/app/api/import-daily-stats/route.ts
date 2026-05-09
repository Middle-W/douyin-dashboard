import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, stats: rawStats } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(rawStats) || rawStats.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400, headers: corsHeaders });
    }

    // Fetch all account names for matching
    const { data: allAccounts } = await supabaseAdmin.from('accounts').select('name');
    const accountNames = (allAccounts || []).map((a: any) => a.name);

    const nameMap: Record<string, string> = {};
    const unmatched: string[] = [];
    const upserts: any[] = [];

    for (const item of rawStats) {
      const rawName = String(item.name || '').trim();
      const orders = parseInt(item.orders) || 0;
      const netIncome = parseFloat(item.net_income) || 0;
      if (!rawName) continue;

      let resolvedName = nameMap[rawName];
      if (!resolvedName) {
        if (accountNames.includes(rawName)) {
          resolvedName = rawName;
        } else {
          // 多种匹配策略：前缀、包含、被包含
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

      upserts.push({
        account_name: resolvedName,
        date,
        orders,
        net_income: Math.round(netIncome * 100) / 100,
      });
    }

    if (upserts.length === 0) {
      return NextResponse.json({
        error: 'No valid data after matching',
        unmatched,
        debug: {
          totalReceived: rawStats.length,
          sampleNames: rawStats.slice(0, 20).map((s: any) => String(s.name || '').trim()),
          dbNames: accountNames.slice(0, 50),
        }
      }, { status: 400, headers: corsHeaders });
    }

    // Batch operation: fetch all existing records for this date in one query
    const { data: existingRecords } = await supabaseAdmin
      .from('daily_stats')
      .select('account_name, income, amount')
      .eq('date', date);

    const existingMap = new Map<string, { income: number; amount: number }>();
    for (const r of existingRecords || []) {
      existingMap.set(r.account_name, { income: r.income, amount: r.amount });
    }

    // Build complete payloads with preserved income/amount
    const payloads = upserts.map(item => {
      const existing = existingMap.get(item.account_name);
      return {
        account_name: item.account_name,
        date: item.date,
        orders: item.orders,
        net_income: item.net_income,
        income: existing ? existing.income : 0,
        amount: existing ? existing.amount : 0,
      };
    });

    // Single batch upsert (99 records well within 1000 limit)
    const { error: upsertError } = await supabaseAdmin
      .from('daily_stats')
      .upsert(payloads, { onConflict: 'account_name,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      date,
      accounts: new Set(upserts.map(s => s.account_name)).size,
      records: upserts.length,
      unmatched: unmatched.length > 0 ? unmatched : undefined
    }, { headers: corsHeaders });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
