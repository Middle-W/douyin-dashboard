import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

function safeParseDate(payTime: any): string | null {
  if (!payTime) return null;
  
  // JavaScript Date object from xlsx.js
  if (payTime instanceof Date) {
    const y = payTime.getFullYear();
    const m = String(payTime.getMonth() + 1).padStart(2, '0');
    const d = String(payTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  const str = String(payTime).trim();
  
  // "2026-04-29 12:34:56" or "2026-04-29"
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  
  // "2026/04/29 12:34:56" or "2026/04/29"
  const slashMatch = str.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
  
  // "04/29/2026" (US format)
  const usMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
  
  // Fallback - just take first 10 chars if they look like a date
  if (str.length >= 10 && /^\d/.test(str)) {
    return str.slice(0, 10);
  }
  
  return str.slice(0, 10);
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
    
    const sheetInfo = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const ref = sheet['!ref'];
      return { name, ref };
    });
    
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

    // Show raw headers for diagnosis
    const rawHeaders = headers.map((h, i) => `${i}:${JSON.stringify(h)}`).join(', ');

    if (idx.account === undefined || idx.time === undefined) {
      return NextResponse.json({ 
        error: 'Invalid file format', 
        rawHeaders,
        foundHeaders: idx 
      }, { status: 400 });
    }

    // Preview first 5 rows
    const preview = [];
    for (let i = 1; i < Math.min(6, rows.length); i++) {
      const row = rows[i];
      const rawTime = row[idx.time];
      preview.push({
        row: i,
        accountRaw: row[idx.account],
        payTimeRaw: rawTime,
        payTimeType: typeof rawTime,
        parsedDate: safeParseDate(rawTime),
        income: row[idx.income],
        status: row[idx.status]
      });
    }

    // Parse all rows to count dates
    const allDates = new Set<string>();
    const badDates: any[] = [];
    let skippedRefund = 0;
    let skippedEmpty = 0;
    let totalRows = 0;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const accountRaw = row[idx.account];
      const payTime = row[idx.time];
      const orderStatus = row[idx.status];
      
      if (!accountRaw || !payTime) {
        skippedEmpty++;
        continue;
      }
      
      totalRows++;
      
      if (orderStatus && String(orderStatus).includes('退款')) {
        skippedRefund++;
        continue;
      }

      const date = safeParseDate(payTime);
      if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        allDates.add(date);
      } else {
        badDates.push({ row: i, raw: payTime, parsed: date });
      }
    }

    const sortedDates = Array.from(allDates).sort();

    return NextResponse.json({
      success: true,
      fileName: file.name,
      sheetNames: workbook.SheetNames,
      sheetInfo,
      totalRowsInFile: rows.length - 1,
      totalRows,
      skippedEmpty,
      skippedRefund,
      validDates: sortedDates.length,
      dateFrom: sortedDates[0] || null,
      dateTo: sortedDates[sortedDates.length - 1] || null,
      dateRange: sortedDates,
      badDates: badDates.slice(0, 20),
      preview,
      rawHeaders
    });

  } catch (err: any) {
    console.error('Test Excel error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
