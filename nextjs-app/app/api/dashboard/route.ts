import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Get all accounts with meta info
    const { data: accounts, error: accError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .order('name');

    if (accError) throw accError;

    // Get all daily stats
    const { data: stats, error: statsError } = await supabaseAdmin
      .from('daily_stats')
      .select('*')
      .order('date');

    if (statsError) throw statsError;

    // Get all daily costs
    const { data: costs, error: costsError } = await supabaseAdmin
      .from('daily_costs')
      .select('*')
      .order('date');

    if (costsError) throw costsError;

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
      accountMap[acc.name] = {
        account: acc.name,
        accountRaw: acc.name + '()',
        operator: acc.operator || '',
        accountType: acc.account_type || '',
        metaBuyer: acc.buyer || '',
        metaStatus: acc.status || '',
        totalOrders: 0,
        totalIncome: 0,
        totalNetIncome: 0,
        totalCost: 0,
        totalProfit: 0,
        avgDaily: 0,
        daily: {}
      };
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
      const netIncome = parseFloat(s.net_income || s.income) * 0.9; // fallback
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
      totalAccounts: accountList.length,
      generatedAt: new Date().toISOString().slice(0, 10)
    });

  } catch (err: any) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
