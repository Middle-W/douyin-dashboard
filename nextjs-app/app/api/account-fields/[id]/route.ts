import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// PUT /api/account-fields/:id - Update field config
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const { label, show_in_admin, show_in_dashboard, sort_order } = body;

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (show_in_admin !== undefined) updateData.show_in_admin = show_in_admin;
    if (show_in_dashboard !== undefined) updateData.show_in_dashboard = show_in_dashboard;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('account_fields')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: '字段不存在' }, { status: 404 });

    return NextResponse.json({ success: true, field: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/account-fields/:id - Delete field (only non-system)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    // Check if system field
    const { data: field } = await supabaseAdmin
      .from('account_fields')
      .select('is_system')
      .eq('id', id)
      .single();

    if (field?.is_system) {
      return NextResponse.json({ error: '系统字段不能删除' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('account_fields')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
