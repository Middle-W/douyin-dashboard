import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get('preview') === '1';

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

    const headers = rows[0];
    const dateCols: { idx: number; date: string }[] = [];

    for (let i = 1; i < headers.length; i++) {
      const h = headers[i];
      let dateStr: string | null = null;
      if (h instanceof Date) {
        dateStr = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
      } else if (typeof h === 'number') {
        const date = new Date(1899, 11, 30 + h);
        dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } else if (typeof h === 'string' && h.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateStr = h;
      }
      if (dateStr) {
        dateCols.push({ idx: i, date: dateStr });
      }
    }

    if (dateCols.length === 0) {
      return NextResponse.json({ error: 'No date columns found' }, { status: 400 });
    }

    // Fetch all account names for prefix matching
    const { data: allAccounts } = await supabaseAdmin.from('accounts').select('name');
    const accountNames = (allAccounts || []).map((a: any) => a.name);

    const nameMap: Record<string, string> = {};
    const unmatched: string[] = [];
    const matchDetails: Record<string, { raw: string; matched: string; type: 'exact' | 'prefix' }> = {};

    const costs: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawName = String(row[0] || '').trim();
      if (!rawName) continue;

      // Resolve name: exact match first, then prefix match
      let resolvedName = nameMap[rawName];
      let matchType: 'exact' | 'prefix' | null = null;
      if (!resolvedName) {
        if (accountNames.includes(rawName)) {
          resolvedName = rawName;
          matchType = 'exact';
        } else {
          const prefixMatch = accountNames.find(n => n.startsWith(rawName));
          if (prefixMatch) {
            resolvedName = prefixMatch;
            matchType = 'prefix';
          }
        }
        nameMap[rawName] = resolvedName || '';
      } else {
        matchType = accountNames.includes(rawName) ? 'exact' : 'prefix';
      }

      if (!resolvedName) {
        if (!unmatched.includes(rawName)) unmatched.push(rawName);
        continue;
      }

      if (!matchDetails[resolvedName]) {
        matchDetails[resolvedName] = { raw: rawName, matched: resolvedName, type: matchType! };
      }

      for (const dc of dateCols) {
        const cost = parseFloat(row[dc.idx]) || 0;
        if (cost > 0) {
          costs.push({
            account_name: resolvedName,
            date: dc.date,
            cost: Math.round(cost * 100) / 100
          });
        }
      }
    }

    if (costs.length === 0) {
      return NextResponse.json({ error: 'No cost data found', unmatched }, { status: 400 });
    }

    // Preview mode: return match summary without writing to DB
    if (isPreview) {
      return NextResponse.json({
        preview: true,
        totalRows: rows.length - 1,
        dateCols: dateCols.map(d => d.date),
        matchedCount: Object.keys(matchDetails).length,
        unmatchedCount: unmatched.length,
        matchedAccounts: Object.values(matchDetails),
        unmatchedAccounts: unmatched,
        totalRecords: costs.length
      });
    }

    const { error } = await supabaseAdmin
      .from('daily_costs')
      .upsert(costs, { onConflict: 'account_name,date' });

    if (error) {
      console.error('Cost insert error:', error);
      return NextResponse.json({ error: error.message, unmatched }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      accounts: new Set(costs.map(c => c.account_name)).size,
      records: costs.length,
      unmatched: unmatched.length > 0 ? unmatched : undefined
    });

  } catch (err: any) {
    console.error('Cost upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
