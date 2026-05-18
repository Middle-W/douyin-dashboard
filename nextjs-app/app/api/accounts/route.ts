import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET /api/accounts - List all accounts
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .order('name');

    if (error) throw error;

    // Flatten metadata into each account object
    const accounts = (data || []).map((a: any) => {
      const flat = { ...a };
      if (a.metadata && typeof a.metadata === 'object') {
        Object.entries(a.metadata).forEach(([k, v]) => {
          if (!(k in flat)) flat[k] = v;
        });
      }
      delete flat.metadata;
      return flat;
    });

    return NextResponse.json({ accounts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/accounts - Create a new account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, operator, account_type, buyer, status, code, remark, ...rest } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: '账号名称不能为空' }, { status: 400 });
    }

    // Check code uniqueness
    const trimmedCode = code ? String(code).trim() : '';
    if (trimmedCode) {
      const { data: existingCode } = await supabaseAdmin
        .from('accounts')
        .select('name')
        .eq('code', trimmedCode)
        .maybeSingle();
      if (existingCode) {
        return NextResponse.json({ error: `编号 "${trimmedCode}" 已被账号 "${existingCode.name}" 使用` }, { status: 409 });
      }
    }

    // Separate standard fields from metadata fields
    const metadata: Record<string, any> = {};
    Object.entries(rest).forEach(([k, v]) => {
      if (!['name','operator','account_type','buyer','status','code','remark','id','created_at'].includes(k)) {
        metadata[k] = v;
      }
    });

    const insertData: any = {
      name: String(name).trim(),
      operator: operator || '',
      account_type: account_type || '',
      buyer: buyer || '',
      status: status || '',
      code: code || '',
      remark: remark || ''
    };
    if (Object.keys(metadata).length > 0) {
      insertData.metadata = metadata;
    }

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate')) {
        return NextResponse.json({ error: '账号名称已存在' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, account: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/accounts - Batch delete accounts (body: { names: string[] })
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const names = body.names;

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: '缺少 names 参数' }, { status: 400 });
    }

    // Supabase 批量删除：.in('name', names)
    const { error } = await supabaseAdmin
      .from('accounts')
      .delete()
      .in('name', names);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: names.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
