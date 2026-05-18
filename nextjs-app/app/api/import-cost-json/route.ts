import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { savePending } from '@/lib/save-pending';

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

// 从detail文本中提取户ID（10位以上数字）
function extractId(detail: string): string {
  if (!detail) return '';
  const match = detail.match(/户ID[：:\s]*(\d{10,})/);
  return match ? match[1] : '';
}

export async function POST(request: NextRequest) {
  let date = '';
  let rawCosts: any[] = [];
  try {
    const body = await request.json();
    date = body.date || '';
    rawCosts = body.costs || [];

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(rawCosts) || rawCosts.length === 0) {
      return NextResponse.json({ error: 'No cost data provided' }, { status: 400, headers: corsHeaders });
    }

    // Fetch accounts with metadata (contains 户ID)
    const { data: allAccounts } = await supabaseAdmin.from('accounts').select('name, metadata');
    
    // Build maps: 户ID -> name, and name -> name
    const idToName: Record<string, string> = {};
    const nameToName: Record<string, string> = {};
    
    for (const acc of allAccounts || []) {
      const name = acc.name;
      nameToName[name] = name;
      
      // Extract 户ID from metadata
      const metadata = acc.metadata || {};
      const id = metadata['户id'] || metadata['户ID'] || metadata['uid'] || '';
      if (id && typeof id === 'string') {
        idToName[id] = name;
      }
    }

    const nameMap: Record<string, string> = {};
    const unmatched: string[] = [];
    const costs: any[] = [];

    for (const item of rawCosts) {
      const rawName = String(item.name || '').trim();
      const cost = parseFloat(item.cost);
      const detail = String(item.detail || '');
      
      if (!rawName || isNaN(cost) || cost <= 0) continue;

      let resolvedName = nameMap[rawName];
      if (!resolvedName) {
        // 1. Try exact name match
        if (nameToName[rawName]) {
          resolvedName = rawName;
        } else {
          // 2. Try ID match (from detail text)
          const id = extractId(detail);
          if (id && idToName[id]) {
            resolvedName = idToName[id];
          } else {
            // 3. Fallback to fuzzy name matching
            const prefixMatch = Object.keys(nameToName).find(n => n.startsWith(rawName));
            if (prefixMatch) resolvedName = prefixMatch;
            else {
              const includeMatch = Object.keys(nameToName).find(n => n.includes(rawName));
              if (includeMatch) resolvedName = includeMatch;
              else {
                const reverseMatch = Object.keys(nameToName).find(n => rawName.includes(n) && n.length >= 2);
                if (reverseMatch) resolvedName = reverseMatch;
              }
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
      savePending('costs', date, rawCosts, 'No valid cost data after matching', unmatched);
      return NextResponse.json({
        error: 'No valid cost data after matching',
        unmatched,
        debug: {
          totalReceived: rawCosts.length,
          sampleNames: rawCosts.slice(0, 20).map((c: any) => String(c.name || '').trim()),
        }
      }, { status: 400, headers: corsHeaders });
    }

    // Save partial unmatched to pending
    if (unmatched.length > 0) {
      savePending('costs', date, rawCosts, `Partial match: ${costs.length}/${rawCosts.length} matched, ${unmatched.length} unmatched`, unmatched);
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
    savePending('costs', date, rawCosts, err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
