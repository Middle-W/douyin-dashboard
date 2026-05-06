import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

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

    const headers = rows[0];
    const dateCols: { idx: number; date: string }[] = [];

    for (let i = 1; i < headers.length; i++) {
      const h = headers[i];
      let dateStr: string;
      if (typeof h === 'number') {
        const date = new Date(1899, 11, 30 + h);
        dateStr = date.toISOString().slice(0, 10);
      } else if (typeof h === 'string' && h.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateStr = h;
      } else {
        continue;
      }
      dateCols.push({ idx: i, date: dateStr });
    }

    if (dateCols.length === 0) {
      return NextResponse.json({ error: 'No date columns found' }, { status: 400 });
    }

    const costs: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const accountName = String(row[0] || '').trim();
      if (!accountName) continue;

      for (const dc of dateCols) {
        const cost = parseFloat(row[dc.idx]) || 0;
        if (cost > 0) {
          costs.push({
            account_name: accountName,
            date: dc.date,
            cost: Math.round(cost * 100) / 100
          });
        }
      }
    }

    if (costs.length === 0) {
      return NextResponse.json({ error: 'No cost data found' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('daily_costs')
      .upsert(costs, { onConflict: 'account_name,date' });

    if (error) {
      console.error('Cost insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      accounts: new Set(costs.map(c => c.account_name)).size,
      records: costs.length
    });

  } catch (err: any) {
    console.error('Cost upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
