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

// GET /api/data-costs?date=YYYY-MM-DD 或 ?month=YYYY-MM
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const month = searchParams.get('month');

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const monthEnd = new Date(y, m, 0);
      const endStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabaseAdmin
        .from('daily_costs')
        .select('date')
        .gte('date', `${month}-01`)
        .lte('date', endStr)
        .order('date');
      if (error) throw error;
      const dates = [...new Set((data || []).map((d: any) => {
        const ds = String(d.date || '');
        return ds.includes('T') ? ds.split('T')[0] : ds.slice(0, 10);
      }))];
      return NextResponse.json({ dates }, { headers: corsHeaders });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabaseAdmin
      .from('daily_costs')
      .select('account_name, date, cost')
      .eq('date', date)
      .order('account_name');

    if (error) throw error;

    return NextResponse.json({ costs: data || [] }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

// PUT /api/data-costs - Update a single record
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_name, date, cost } = body;

    if (!account_name || !date) {
      return NextResponse.json({ error: 'account_name and date are required' }, { status: 400, headers: corsHeaders });
    }

    const updateData: any = {};
    if (cost !== undefined) updateData.cost = parseFloat(cost) || 0;

    const { data, error } = await supabaseAdmin
      .from('daily_costs')
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

// DELETE /api/data-costs
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const account_name = searchParams.get('account_name');
    const date = searchParams.get('date');

    if (!account_name || !date) {
      return NextResponse.json({ error: 'account_name and date are required' }, { status: 400, headers: corsHeaders });
    }

    const { error } = await supabaseAdmin
      .from('daily_costs')
      .delete()
      .eq('account_name', account_name)
      .eq('date', date);

    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
