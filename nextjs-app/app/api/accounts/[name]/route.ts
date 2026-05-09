import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// PUT /api/accounts/[name] - Update an account
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const oldName = decodeURIComponent(params.name);
    const body = await request.json();
    const { name: newName, operator, account_type, buyer, status, code, remark, ...rest } = body;

    const finalName = newName ? String(newName).trim() : oldName;
    const trimmedCode = code ? String(code).trim() : '';

    // Check code uniqueness (exclude self)
    if (trimmedCode) {
      const { data: existingCode } = await supabaseAdmin
        .from('accounts')
        .select('name')
        .eq('code', trimmedCode)
        .neq('name', oldName)
        .maybeSingle();
      if (existingCode) {
        return NextResponse.json({ error: `编号 "${trimmedCode}" 已被账号 "${existingCode.name}" 使用` }, { status: 409 });
      }
    }

    // Separate standard fields from metadata fields
    const updateData: any = {
      operator: operator || '',
      account_type: account_type || '',
      buyer: buyer || '',
      status: status || '',
      code: trimmedCode,
      remark: remark || ''
    };

    if (finalName !== oldName) {
      updateData.name = finalName;
    }

    const metadataUpdates: Record<string, any> = {};
    Object.entries(rest).forEach(([k, v]) => {
      if (!['name','operator','account_type','buyer','status','code','remark','id','created_at'].includes(k)) {
        metadataUpdates[k] = v;
      }
    });

    if (Object.keys(metadataUpdates).length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('accounts')
        .select('metadata')
        .eq('name', oldName)
        .single();

      const currentMeta = (existing?.metadata as Record<string, any>) || {};
      updateData.metadata = { ...currentMeta, ...metadataUpdates };
    }

    // Update account
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .update(updateData)
      .eq('name', oldName)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }

    // Cascade update account_name in daily_stats and daily_costs if name changed
    if (finalName !== oldName) {
      const [statsRes, costsRes] = await Promise.all([
        supabaseAdmin.from('daily_stats').update({ account_name: finalName }).eq('account_name', oldName),
        supabaseAdmin.from('daily_costs').update({ account_name: finalName }).eq('account_name', oldName)
      ]);
      if (statsRes.error) console.error('Cascade update daily_stats failed:', statsRes.error);
      if (costsRes.error) console.error('Cascade update daily_costs failed:', costsRes.error);
    }

    return NextResponse.json({ success: true, account: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/accounts/[name] - Delete an account
export async function DELETE(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const name = decodeURIComponent(params.name);

    const { error } = await supabaseAdmin
      .from('accounts')
      .delete()
      .eq('name', name);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
