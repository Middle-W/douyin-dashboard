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
      
      // Supabase 默认限制1000行，需要分页获取所有日期的唯一值
      let allDates: string[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from('daily_costs')
          .select('date')
          .gte('date', `${month}-01`)
          .lte('date', endStr)
          .order('date')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allDates = allDates.concat(data.map((d: any) => d.date));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      const normalizeDate = (val: any): string => {
        if (!val) return '';
        if (val instanceof Date) {
          return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
        }
        const s = String(val);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
      };
      const dates = [...new Set(allDates.map((d: any) => normalizeDate(d)))];
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

// DELETE /api/data-costs - 支持单条删除(account_name+date) 或 批量删除(仅date)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const account_name = searchParams.get('account_name');
    const date = searchParams.get('date');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400, headers: corsHeaders });
    }

    let query = supabaseAdmin.from('daily_costs').delete().eq('date', date);
    
    // 如果指定了 account_name，只删这一条；否则删除该日期全部
    if (account_name) {
      query = query.eq('account_name', account_name);
    }

    const { error, count } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: count || 0 }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
