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

    // Expected columns: 账号名称/抖音名称, 类型/账号类型, 状态/账号状态, 选品人, 编号, 备注, 运营人
    const headers = rows[0];
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => {
      const headerStr = String(h || '').trim();
      if (!idx.name && (headerStr === '抖音名称' || headerStr === '账号名称' || headerStr === '名称')) idx.name = i;
      if (!idx.type && (headerStr === '类型' || headerStr === '账号类型')) idx.type = i;
      if (!idx.status && (headerStr === '状态' || headerStr === '账号状态')) idx.status = i;
      if (!idx.buyer && (headerStr === '选品人' || headerStr === '买家')) idx.buyer = i;
      if (!idx.code && (headerStr === '编号' || headerStr === 'code')) idx.code = i;
      if (!idx.remark && (headerStr === '备注' || headerStr === 'remark')) idx.remark = i;
      if (!idx.operator && (headerStr === '运营人' || headerStr === 'operator' || headerStr === '备用')) idx.operator = i;
    });

    if (idx.name === undefined) {
      return NextResponse.json({ error: 'Invalid file format: need 账号名称 column' }, { status: 400 });
    }

    // Parse rows, dedupe by name (keep last)
    const recordMap = new Map<string, any>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[idx.name] || '').trim();
      if (!name) continue;

      const record: any = { name };
      if (idx.type !== undefined) {
        const v = String(row[idx.type] || '').trim();
        record.account_type = v || null;
      }
      if (idx.status !== undefined) {
        const v = String(row[idx.status] || '').trim();
        record.status = v || null;
      }
      if (idx.buyer !== undefined) {
        const v = String(row[idx.buyer] || '').trim();
        record.buyer = v || null;
      }
      if (idx.code !== undefined) {
        const v = String(row[idx.code] || '').trim();
        record.code = v || null;
      }
      if (idx.remark !== undefined) {
        const v = String(row[idx.remark] || '').trim();
        record.remark = v || null;
      }
      if (idx.operator !== undefined) {
        const v = String(row[idx.operator] || '').trim();
        record.operator = v || null;
      }

      // Unknown columns go into metadata
      const metadata: Record<string, string> = {};
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const colName = String(headers[colIdx] || '').trim();
        if (!colName) continue;
        if (['编号','抖音名称','账号名称','名称','类型','账号类型','状态','账号状态','选品人','买家','code','备注','remark','运营人','operator','备用'].includes(colName)) continue;
        const val = row[colIdx];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          metadata[colName] = String(val).trim();
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

    // Check duplicate codes within Excel
    const codeMap = new Map<string, string>();
    for (const r of updates) {
      if (r.code) {
        if (codeMap.has(r.code)) {
          return NextResponse.json({ error: `Excel 内编号重复："${r.code}" 被 "${codeMap.get(r.code)}" 和 "${r.name}" 同时使用` }, { status: 400 });
        }
        codeMap.set(r.code, r.name);
      }
    }

    // Check codes against existing database (exclude accounts in this upload)
    const codesToCheck = updates.filter(r => r.code).map(r => r.code);
    if (codesToCheck.length > 0) {
      const namesInUpload = updates.map(r => r.name);
      const { data: existingCodes } = await supabaseAdmin
        .from('accounts')
        .select('name, code')
        .in('code', codesToCheck)
        .not('name', 'in', `(${namesInUpload.map(n => `"${n}"`).join(',')})`);
      if (existingCodes && existingCodes.length > 0) {
        const first = existingCodes[0];
        return NextResponse.json({ error: `编号 "${first.code}" 已被账号 "${first.name}" 使用` }, { status: 409 });
      }
    }

    console.log(`[upload-meta] Parsed ${updates.length} unique accounts from Excel. Headers:`, headers);

    // Batch upsert
    const batchSize = 500;
    let updated = 0;
    const errors: string[] = [];
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      console.log(`[upload-meta] Upserting batch ${i/batchSize + 1}, size=${batch.length}, first=`, batch[0]?.name);
      const { error } = await supabaseAdmin.from('accounts').upsert(batch, { onConflict: 'name' });
      if (error) {
        console.error(`[upload-meta] Batch ${i/batchSize + 1} error:`, error);
        errors.push(`Batch ${i/batchSize + 1}: ${error.message} (code: ${error.code})`);
      } else {
        updated += batch.length;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: 'Partial update failed', details: errors, updated, total: updates.length }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated, total: updates.length });

  } catch (err: any) {
    console.error('Upload meta error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
