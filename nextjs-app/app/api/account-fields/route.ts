import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET /api/account-fields - List all field configs
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('account_fields')
      .select('*')
      .order('sort_order');

    if (error) throw error;
    return NextResponse.json({ fields: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/account-fields - Create a new field
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, label, show_in_admin, show_in_dashboard } = body;

    if (!key || !String(key).trim()) {
      return NextResponse.json({ error: '字段key不能为空' }, { status: 400 });
    }
    if (!label || !String(label).trim()) {
      return NextResponse.json({ error: '字段名称不能为空' }, { status: 400 });
    }

    const { data: maxSort } = await supabaseAdmin
      .from('account_fields')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await supabaseAdmin
      .from('account_fields')
      .insert({
        key: String(key).trim(),
        label: String(label).trim(),
        show_in_admin: show_in_admin ?? true,
        show_in_dashboard: show_in_dashboard ?? false,
        sort_order: (maxSort?.sort_order || 0) + 1
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate')) {
        return NextResponse.json({ error: '字段key已存在' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, field: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
