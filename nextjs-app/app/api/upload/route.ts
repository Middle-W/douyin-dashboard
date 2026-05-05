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

    // Map headers
    const headers = rows[0];
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (h === '抖音号名称(备注)') idx.account = i;
      if (h === '付款时间') idx.time = i;
      if (h === '预估收入') idx.income = i;
      if (h === '付款金额') idx.amount = i;
      if (h === '运营人') idx.operator = i;
      if (h === '订单类型') idx.type = i;
    });

    if (idx.account === undefined || idx.time === undefined) {
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 });
    }

    // Aggregate data
    const accounts: Record<string, any> = {};
    const allDates = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const accountRaw = row[idx.account];
      const payTime = row[idx.time];
      if (!accountRaw || !payTime) continue;

      const accountName = String(accountRaw).split('(')[0].trim();
      const date = String(payTime).slice(0, 10);
      const income = parseFloat(row[idx.income]) || 0;
      const amount = parseFloat(row[idx.amount]) || 0;

      if (!accounts[accountName]) {
        accounts[accountName] = {
          name: accountName,
          operator: row[idx.operator] || '',
          account_type: row[idx.type] || '小店',
          daily: {},
          totalIncome: 0,
          totalAmount: 0
        };
      }
      accounts[accountName].daily[date] = (accounts[accountName].daily[date] || 0) + 1;
      accounts[accountName].totalIncome += income;
      accounts[accountName].totalAmount += amount;
      allDates.add(date);
    }

    const accountList = Object.values(accounts);
    const sortedDates = Array.from(allDates).sort();
    const dateFrom = sortedDates[0];
    const dateTo = sortedDates[sortedDates.length - 1];

    // Upsert accounts
    for (const acc of accountList) {
      const { error } = await supabaseAdmin
        .from('accounts')
        .upsert({
          name: acc.name,
          operator: acc.operator,
          account_type: acc.account_type
        }, { onConflict: 'name' });
      if (error) console.error('Upsert account error:', error);
    }

    // Insert daily stats
    const stats = [];
    for (const acc of accountList) {
      for (const [date, orders] of Object.entries(acc.daily)) {
        stats.push({
          account_name: acc.name,
          date,
          orders,
          income: Math.round(acc.totalIncome * 100) / 100,
          amount: Math.round(acc.totalAmount * 100) / 100
        });
      }
    }

    // Batch insert
    const { error: statsError } = await supabaseAdmin
      .from('daily_stats')
      .upsert(stats, { onConflict: 'account_name,date' });

    if (statsError) {
      console.error('Stats insert error:', statsError);
      return NextResponse.json({ error: statsError.message }, { status: 500 });
    }

    // Record upload
    await supabaseAdmin.from('uploads').insert({
      filename: file.name,
      account_count: accountList.length,
      date_from: dateFrom,
      date_to: dateTo
    });

    return NextResponse.json({
      success: true,
      accounts: accountList.length,
      dates: sortedDates.length,
      dateFrom,
      dateTo
    });

  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
