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
        totalAmount: 0,
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
          totalAmount: 0,
          avgDaily: 0,
          daily: {}
        };
      }
      accountMap[name].daily[s.date] = s.orders;
      accountMap[name].totalOrders += s.orders;
      accountMap[name].totalIncome += parseFloat(s.income);
      accountMap[name].totalAmount += parseFloat(s.amount);
      allDates.add(s.date);
    }

    const accountList = Object.values(accountMap).map((a: any) => ({
      ...a,
      totalIncome: Math.round(a.totalIncome * 100) / 100,
      totalAmount: Math.round(a.totalAmount * 100) / 100,
      avgDaily: a.totalOrders > 0 ? Math.round(a.totalOrders / Object.keys(a.daily).length * 10) / 10 : 0
    })).sort((a: any, b: any) => b.totalOrders - a.totalOrders);

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
