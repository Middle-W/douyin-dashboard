import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/data-stats?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabaseAdmin
      .from('daily_stats')
      .select('account_name, date, orders, income, amount, net_income')
      .eq('date', date)
      .order('account_name');

    if (error) throw error;

    return NextResponse.json({ stats: data || [] }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

// PUT /api/data-stats - Update a single record
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_name, date, orders, net_income, income, amount } = body;

    if (!account_name || !date) {
      return NextResponse.json({ error: 'account_name and date are required' }, { status: 400, headers: corsHeaders });
    }

    const updateData: any = {};
    if (orders !== undefined) updateData.orders = parseInt(orders) || 0;
    if (net_income !== undefined) updateData.net_income = parseFloat(net_income) || 0;
    if (income !== undefined) updateData.income = parseFloat(income) || 0;
    if (amount !== undefined) updateData.amount = parseFloat(amount) || 0;

    const { data, error } = await supabaseAdmin
      .from('daily_stats')
      .update(updateData)
      .eq('account_name', account_name)
      .eq('date', date)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, record: data }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE /api/data-stats
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const account_name = searchParams.get('account_name');
    const date = searchParams.get('date');

    if (!account_name || !date) {
      return NextResponse.json({ error: 'account_name and date are required' }, { status: 400, headers: corsHeaders });
    }

    const { error } = await supabaseAdmin
      .from('daily_stats')
      .delete()
      .eq('account_name', account_name)
      .eq('date', date);

    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
