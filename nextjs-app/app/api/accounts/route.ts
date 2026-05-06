import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.from('accounts').select('*').order('name');
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, buyer, status, account_type } = body;
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('accounts').upsert({ name, buyer, status, account_type }, { onConflict: 'name' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get('name');
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('accounts').delete().eq('name', name);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
