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
    const { date, costs: rawCosts } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(rawCosts) || rawCosts.length === 0) {
      return NextResponse.json({ error: 'No cost data provided' }, { status: 400, headers: corsHeaders });
    }

    // Fetch all account names for prefix matching
    const { data: allAccounts } = await supabaseAdmin.from('accounts').select('name');
    const accountNames = (allAccounts || []).map((a: any) => a.name);

    const nameMap: Record<string, string> = {};
    const unmatched: string[] = [];
    const costs: any[] = [];

    for (const item of rawCosts) {
      const rawName = String(item.name || '').trim();
      const cost = parseFloat(item.cost);
      if (!rawName || isNaN(cost) || cost <= 0) continue;

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

      costs.push({
        account_name: resolvedName,
        date,
        cost: Math.round(cost * 100) / 100
      });
    }

    if (costs.length === 0) {
      return NextResponse.json({
        error: 'No valid cost data after matching',
        unmatched,
        debug: {
          totalReceived: rawCosts.length,
          sampleNames: rawCosts.slice(0, 20).map((c: any) => String(c.name || '').trim()),
          dbNames: accountNames.slice(0, 50),
        }
      }, { status: 400, headers: corsHeaders });
    }

    const { error } = await supabaseAdmin
      .from('daily_costs')
      .upsert(costs, { onConflict: 'account_name,date' });

    if (error) {
      return NextResponse.json({ error: error.message, unmatched }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      date,
      accounts: new Set(costs.map(c => c.account_name)).size,
      records: costs.length,
      updated: costs.length,
      unmatched: unmatched.length > 0 ? unmatched : undefined
    }, { headers: corsHeaders });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
