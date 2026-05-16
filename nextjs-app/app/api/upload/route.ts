import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export const maxDuration = 60;

function safeParseDate(payTime: any): string | null {
  if (!payTime) return null;
  if (payTime instanceof Date) {
    const y = payTime.getFullYear();
    const m = String(payTime.getMonth() + 1).padStart(2, '0');
    const d = String(payTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(payTime).trim();

  // YYYY-MM-DD or YYYY-M-D
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const m = String(isoMatch[2]).padStart(2, '0');
    const d = String(isoMatch[3]).padStart(2, '0');
    return `${isoMatch[1]}-${m}-${d}`;
  }

  // YYYY/MM/DD or YYYY/M/D
  const slashMatch = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const m = String(slashMatch[2]).padStart(2, '0');
    const d = String(slashMatch[3]).padStart(2, '0');
    return `${slashMatch[1]}-${m}-${d}`;
  }

  // General fallback: try Date.parse
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch {}

  return null;
}

// Batch upsert helper
async function batchUpsert(table: string, records: any[], onConflict: string, batchSize = 500) {
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabaseAdmin.from(table).upsert(batch, { onConflict });
    if (error) {
      console.error(`Batch upsert error [${i}-${i + batch.length}]:`, error);
      errors.push(error.message);
    } else {
      inserted += batch.length;
    }
  }
  return { inserted, errors };
}

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
      if (h === '订单状态') idx.status = i;
    });

    if (idx.account === undefined || idx.time === undefined) {
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 });
    }

    // Fetch existing account metadata to preserve account_type, buyer, status
    const { data: existingAccounts } = await supabaseAdmin
      .from('accounts')
      .select('name, account_type, buyer, status, operator');
    const accountMeta: Record<string, any> = {};
    for (const a of existingAccounts || []) {
      accountMeta[a.name] = a;
    }

    // Aggregate data BY DAY
    const accounts: Record<string, any> = {};
    const allDates = new Set<string>();
    let skippedRefund = 0;
    let skippedEmpty = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const accountRaw = row[idx.account];
      const payTime = row[idx.time];
      const orderStatus = row[idx.status];
      
      if (!accountRaw || !payTime) {
        skippedEmpty++;
        continue;
      }
      
      if (orderStatus && String(orderStatus).includes('退款')) {
        skippedRefund++;
        continue;
      }

      const accountName = String(accountRaw).split('(')[0].trim();
      const date = safeParseDate(payTime);
      if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn(`Invalid date at row ${i}:`, payTime, '->', date);
        continue;
      }
      
      const income = parseFloat(row[idx.income]) || 0;
      const amount = parseFloat(row[idx.amount]) || 0;

      if (!accounts[accountName]) {
        const meta = accountMeta[accountName];
        accounts[accountName] = {
          name: accountName,
          operator: meta?.operator || row[idx.operator] || '',
          account_type: meta?.account_type || '',
          buyer: meta?.buyer || '',
          status: meta?.status || '',
          daily: {}
        };
      }
      
      if (!accounts[accountName].daily[date]) {
        accounts[accountName].daily[date] = {
          orders: 0,
          income: 0,
          amount: 0,
          net_income: 0
        };
      }
      accounts[accountName].daily[date].orders += 1;
      accounts[accountName].daily[date].income += income;
      accounts[accountName].daily[date].amount += amount;
      accounts[accountName].daily[date].net_income += income * 0.9;
      
      allDates.add(date);
    }

    const accountList = Object.values(accounts);
    const sortedDates = Array.from(allDates).sort();
    const dateFrom = sortedDates[0];
    const dateTo = sortedDates[sortedDates.length - 1];

    // Preview mode: return match summary without writing to DB
    if (isPreview) {
      const existingNames = new Set((existingAccounts || []).map((a: any) => a.name));
      const matched = accountList.filter((a: any) => existingNames.has(a.name));
      const unmatched = accountList.filter((a: any) => !existingNames.has(a.name));
      return NextResponse.json({
        preview: true,
        totalRows: rows.length - 1,
        totalAccounts: accountList.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matchedAccounts: matched.map((a: any) => a.name),
        newAccounts: unmatched.map((a: any) => a.name),
        dateRange: { from: dateFrom, to: dateTo },
        skippedRefund,
        skippedEmpty
      });
    }

    // Debug: log parsed date distribution
    console.log('Upload parsed dates:', sortedDates);
    console.log('Total rows:', rows.length - 1, 'Skipped refund:', skippedRefund, 'Skipped empty/invalid:', skippedEmpty);

    // Upsert accounts in batches
    const accountRecords = accountList.map(acc => ({
      name: acc.name,
      operator: acc.operator,
      account_type: acc.account_type,
      buyer: acc.buyer || '',
      status: acc.status || ''
    }));
    const accountResult = await batchUpsert('accounts', accountRecords, 'name', 500);

    // Build daily stats
    const stats = [];
    for (const acc of accountList) {
      for (const [date, dayData] of Object.entries(acc.daily)) {
        stats.push({
          account_name: acc.name,
          date,
          orders: (dayData as any).orders,
          income: Math.round((dayData as any).income * 100) / 100,
          amount: Math.round((dayData as any).amount * 100) / 100,
          net_income: Math.round((dayData as any).net_income * 100) / 100
        });
      }
    }

    // DEBUG: Check record count before delete
    const { count: countBefore } = await supabaseAdmin
      .from('daily_stats')
      .select('*', { count: 'exact', head: true });
    
    const { count: countInRangeBefore } = await supabaseAdmin
      .from('daily_stats')
      .select('*', { count: 'exact', head: true })
      .gte('date', dateFrom)
      .lte('date', dateTo);

    // STRATEGY: Delete old records for these dates, then insert fresh data
    const { error: deleteError, count: deletedCount } = await supabaseAdmin
      .from('daily_stats')
      .delete({ count: 'exact' })
      .gte('date', dateFrom)
      .lte('date', dateTo);
    
    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to clear old data: ' + deleteError.message }, { status: 500 });
    }

    // Insert daily_stats in batches
    const statsResult = await batchUpsert('daily_stats', stats, 'account_name,date', 500);

    // DEBUG: Check record count after insert
    const { count: countAfter } = await supabaseAdmin
      .from('daily_stats')
      .select('*', { count: 'exact', head: true });
    
    const { data: sampleData } = await supabaseAdmin
      .from('daily_stats')
      .select('*')
      .eq('date', dateTo)
      .limit(3);

    const { data: dateList } = await supabaseAdmin
      .from('daily_stats')
      .select('date')
      .order('date')
      .limit(50);

    const uniqueDates = [...new Set((dateList || []).map(d => d.date))];

    // Verify
    if (!sampleData || sampleData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Data verification failed: inserted records not found in database',
        debug: { countBefore, countInRangeBefore, deletedCount, countAfter, uniqueDates }
      }, { status: 500 });
    }

    if (statsResult.errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Partial insert failed',
        details: statsResult.errors,
        accountsInserted: accountResult.inserted,
        statsInserted: statsResult.inserted,
        totalStats: stats.length
      }, { status: 500 });
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
      accountsInserted: accountResult.inserted,
      statsRecords: stats.length,
      statsInserted: statsResult.inserted,
      dates: sortedDates.length,
      dateFrom,
      dateTo,
      parsedDates: sortedDates,
      skippedRefund,
      skippedEmpty,
      debug: {
        countBefore,
        countInRangeBefore,
        deletedCount,
        countAfter,
        uniqueDatesInDb: uniqueDates
      }
    });

  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
