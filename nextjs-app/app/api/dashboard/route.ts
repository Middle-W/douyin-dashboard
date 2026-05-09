import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Force dynamic rendering - never cache
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function flattenAccount(acc: any) {
  const flat = { ...acc };
  if (acc.metadata && typeof acc.metadata === 'object') {
    Object.entries(acc.metadata).forEach(([k, v]) => {
      if (!(k in flat)) flat[k] = v;
    });
  }
  delete flat.metadata;
  return flat;
}

export async function GET() {
  try {
    // Get field configs
    const { data: fieldConfigs } = await supabaseAdmin
      .from('account_fields')
      .select('*')
      .order('sort_order');

    // Get all accounts with meta info
    const { data: accounts, error: accError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .order('name');

    if (accError) throw accError;

    // Get all daily stats with pagination (Supabase default limit is 1000)
    const stats: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: pageData, error: pageError } = await supabaseAdmin
        .from('daily_stats')
        .select('*')
        .order('date')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (pageError) throw pageError;
      if (pageData && pageData.length > 0) {
        stats.push(...pageData);
      }
      hasMore = pageData && pageData.length === pageSize;
      page++;
      if (page > 10) break; // Safety limit
    }

    // Get all daily costs with pagination
    const costs: any[] = [];
    let costPage = 0;
    let costHasMore = true;
    while (costHasMore) {
      const { data: costPageData, error: costPageError } = await supabaseAdmin
        .from('daily_costs')
        .select('*')
        .order('date')
        .range(costPage * pageSize, (costPage + 1) * pageSize - 1);
      
      if (costPageError) throw costPageError;
      if (costPageData && costPageData.length > 0) {
        costs.push(...costPageData);
      }
      costHasMore = costPageData && costPageData.length === pageSize;
      costPage++;
      if (costPage > 10) break;
    }

    // Build cost lookup
    const costMap: Record<string, Record<string, number>> = {};
    for (const c of costs || []) {
      if (!costMap[c.account_name]) costMap[c.account_name] = {};
      costMap[c.account_name][c.date] = parseFloat(c.cost);
    }

    // Aggregate
    const accountMap: Record<string, any> = {};
    const allDates = new Set<string>();

    for (const acc of accounts || []) {
      const flat = flattenAccount(acc);
      accountMap[acc.name] = {
        account: flat.name,
        accountRaw: flat.name + '()',
        operator: flat.operator || '',
        accountType: flat.account_type || '',
        metaBuyer: flat.buyer || '',
        metaStatus: flat.status || '',
        code: flat.code || '',
        remark: flat.remark || '',
        totalOrders: 0,
        totalIncome: 0,
        totalNetIncome: 0,
        totalCost: 0,
        totalProfit: 0,
        avgDaily: 0,
        daily: {}
      };
      // Copy any additional metadata fields
      Object.entries(flat).forEach(([k, v]) => {
        if (!['name','operator','account_type','buyer','status','code','remark','id','created_at'].includes(k)) {
          accountMap[acc.name][k] = v;
        }
      });
    }

    for (const s of stats || []) {
      const name = s.account_name;
      if (!accountMap[name]) {
        accountMap[name] = {
          account: name,
          accountRaw: name + '()',
          operator: '',
          accountType: '',
          metaBuyer: '',
          metaStatus: '',
          totalOrders: 0,
          totalIncome: 0,
          totalNetIncome: 0,
          totalCost: 0,
          totalProfit: 0,
          avgDaily: 0,
          daily: {}
        };
      }
      const cost = costMap[name]?.[s.date] || 0;
      const netIncome = parseFloat(s.net_income || s.income);
      const profit = netIncome - cost;

      accountMap[name].daily[s.date] = {
        orders: s.orders,
        income: parseFloat(s.income),
        netIncome: parseFloat(s.net_income || s.income),
        cost,
        profit
      };
      accountMap[name].totalOrders += s.orders;
      accountMap[name].totalIncome += parseFloat(s.income);
      accountMap[name].totalNetIncome += parseFloat(s.net_income || s.income);
      accountMap[name].totalCost += cost;
      accountMap[name].totalProfit += profit;
      allDates.add(s.date);
    }

    // Add cost-only accounts (accounts with cost but no orders)
    for (const [name, dates] of Object.entries(costMap)) {
      if (!accountMap[name]) {
        accountMap[name] = {
          account: name,
          accountRaw: name + '()',
          operator: '',
          accountType: '',
          metaBuyer: '',
          metaStatus: '',
          totalOrders: 0,
          totalIncome: 0,
          totalNetIncome: 0,
          totalCost: 0,
          totalProfit: 0,
          avgDaily: 0,
          daily: {}
        };
      }
      for (const [date, cost] of Object.entries(dates)) {
        if (!accountMap[name].daily[date]) {
          accountMap[name].daily[date] = { orders: 0, income: 0, netIncome: 0, cost, profit: -cost };
          accountMap[name].totalCost += cost;
          accountMap[name].totalProfit -= cost;
          allDates.add(date);
        }
      }
    }

    const accountList = Object.values(accountMap).map((a: any) => ({
      ...a,
      totalIncome: Math.round(a.totalIncome * 100) / 100,
      totalNetIncome: Math.round(a.totalNetIncome * 100) / 100,
      totalCost: Math.round(a.totalCost * 100) / 100,
      totalProfit: Math.round(a.totalProfit * 100) / 100,
      avgDaily: a.totalOrders > 0 ? Math.round(a.totalOrders / Object.keys(a.daily).length * 10) / 10 : 0
    })).sort((a: any, b: any) => b.totalProfit - a.totalProfit);

    const sortedDates = Array.from(allDates).sort();

    return NextResponse.json({
      accounts: accountList,
      dates: sortedDates,
      latestDate: sortedDates[sortedDates.length - 1] || '',
      totalAccounts: accountList.length,
      fields: fieldConfigs || [],
      generatedAt: new Date().toISOString().slice(0, 10)
    });

  } catch (err: any) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
