'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';

type Metric = 'orders' | 'netIncome' | 'cost' | 'profit';

const METRIC_CONFIG: Record<Metric, { label: string; color: string; prefix: string; icon: string; field: string }> = {
  orders: { label: '单量', color: '#0071e3', prefix: '', icon: '📦', field: 'totalOrders' },
  netIncome: { label: '有效净佣金', color: '#af52de', prefix: '¥', icon: '💰', field: 'totalNetIncome' },
  cost: { label: '消耗', color: '#ff9500', prefix: '¥', icon: '🔥', field: 'totalCost' },
  profit: { label: '利润', color: '#34c759', prefix: '¥', icon: '📈', field: 'totalProfit' },
};

const METRIC_KEYS: Metric[] = ['orders', 'netIncome', 'cost', 'profit'];

function getLast7Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMetric, setActiveMetric] = useState<Metric>('orders');
  const [last7Dates, setLast7Dates] = useState<string[]>([]);

  // Filters - inspired by 抖老板
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('近7天');
  // Dynamic filters: { dataKey: [selectedValues] }
  const [dashFilters, setDashFilters] = useState<Record<string, string[]>>({});
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [showAvgCol, setShowAvgCol] = useState(() => {
    try { return localStorage.getItem('dash_show_avg') !== 'false'; } catch { return true; }
  });
  const [sortDesc, setSortDesc] = useState(true);

  const dashFields = (data?.fields || []).filter((f: any) => f.show_in_dashboard);

  // Date preset helper - safe for any month/year
  function getPresetDates(preset: string): [string, string] | null {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); // 0-based
    const d = today.getDate();

    const fmt = (date: Date) => {
      const yy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };

    if (preset === '今日') {
      const s = new Date(y, m, d);
      return [fmt(s), fmt(s)];
    }
    if (preset === '昨日') {
      const s = new Date(y, m, d - 1);
      return [fmt(s), fmt(s)];
    }
    if (preset === '近7天') {
      const s = new Date(y, m, d - 7);
      const e = new Date(y, m, d - 1);
      return [fmt(s), fmt(e)];
    }
    if (preset === '近30天') {
      const s = new Date(y, m, d - 30);
      const e = new Date(y, m, d - 1);
      return [fmt(s), fmt(e)];
    }
    if (preset === '本月') {
      const s = new Date(y, m, 1);
      return [fmt(s), fmt(today)];
    }
    if (preset === '上月') {
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 0); // last day of prev month
      return [fmt(s), fmt(e)];
    }
    if (preset === '本周') {
      const day = today.getDay() || 7; // 1=Mon...7=Sun
      const s = new Date(y, m, d - day + 1);
      return [fmt(s), fmt(today)];
    }
    return null;
  }

  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function fmtYMD(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function getCalendarDays(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const weekday = first.getDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    const days: { date: Date; current: boolean }[] = [];
    const prevLast = new Date(year, month, 0);
    for (let i = offset - 1; i >= 0; i--) {
      days.push({ date: new Date(prevLast.getFullYear(), prevLast.getMonth(), prevLast.getDate() - i), current: false });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      days.push({ date: new Date(year, month, i), current: true });
    }
    const need = 42 - days.length;
    for (let i = 1; i <= need; i++) {
      days.push({ date: new Date(year, month + 1, i), current: false });
    }
    return days;
  }

  // Pre-compute display data (must be before any useEffect to avoid TDZ)
  const allAccounts = data?.accounts || [];

  // Map db field key to dashboard data key
  function getDashDataKey(fieldKey: string) {
    const map: Record<string, string> = { account_type: 'accountType', buyer: 'metaBuyer', status: 'metaStatus' };
    return map[fieldKey] || fieldKey;
  }

  // Dynamically build filter fields from fields config + actual data
  const allFilterFields: { key: string; label: string; dataKey: string }[] = useMemo(() => {
    if (!data) return [];
    return (data.fields || [])
      .filter((f: any) => f.show_in_dashboard && !['name','id','created_at'].includes(f.key))
      .map((f: any) => ({ key: f.key, label: f.label, dataKey: getDashDataKey(f.key) }))
      .filter((f: any) => allAccounts.some((a: any) => !!a[f.dataKey]));
  }, [data, allAccounts]);

  const primaryFilters = allFilterFields.slice(0, 3);
  const moreFilters = allFilterFields.slice(3);

  // Effective date range
  const effectiveDateRange = (() => {
    if (!data) return { from: '', to: '', dates: [] as string[] };
    const preset = getPresetDates(datePreset);
    const from = preset ? preset[0] : (dateFrom || last7Dates[0] || '');
    const to = preset ? preset[1] : (dateTo || last7Dates[last7Dates.length - 1] || '');
    if (from && to) {
      const dates: string[] = [];
      const s = new Date(from + 'T00:00:00');
      const e = new Date(to + 'T00:00:00');
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dates.push(`${yy}-${mm}-${dd}`);
      }
      return { from, to, dates };
    }
    return { from: '', to: '', dates: last7Dates };
  })();
  const displayDates = effectiveDateRange.dates;

  const displayAccounts = (() => {
    if (!data) return [];
    let result = allAccounts;
    for (const { dataKey } of allFilterFields) {
      const selected = dashFilters[dataKey] || [];
      if (selected.length > 0) {
        result = result.filter((a: any) => selected.includes(a[dataKey]));
      }
    }
    return result.map((a: any) => {
      const m = getRangeMetrics(a, displayDates);
      return {
        ...a,
        _orders: m.orders,
        _netIncome: m.netIncome,
        _cost: m.cost,
        _profit: m.profit,
        _avgDaily: m.days > 0 ? m.orders / m.days : 0,
      };
    });
  })();

  // Active filter tags
  const activeFilters = (() => {
    const tags: { key: string; label: string; onRemove: () => void }[] = [];
    if (datePreset && datePreset !== '自定义') {
      tags.push({ key: 'preset', label: `📅 ${datePreset}`, onRemove: () => { setDatePreset('近7天'); setDateFrom(''); setDateTo(''); } });
    } else if (datePreset === '自定义' && dateFrom && dateTo) {
      tags.push({ key: 'date', label: `📅 ${dateFrom} ~ ${dateTo}`, onRemove: () => { setDateFrom(''); setDateTo(''); setDatePreset('近7天'); } });
    }
    for (const { label, dataKey } of allFilterFields) {
      const selected = dashFilters[dataKey] || [];
      selected.forEach(v => tags.push({ key: `${dataKey}-${v}`, label: `${label}: ${v}`, onRemove: () => setDashFilters(prev => ({ ...prev, [dataKey]: (prev[dataKey] || []).filter(x => x !== v) })) }));
    }
    return tags;
  })();

  const trendCanvasRef = useRef<HTMLCanvasElement>(null);
  const top10CanvasRef = useRef<HTMLCanvasElement>(null);
  const trendChartRef = useRef<any>(null);
  const top10ChartRef = useRef<any>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLast7Dates(getLast7Days());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDatePicker]);

  useEffect(() => {
    return () => {
      if (trendChartRef.current) { trendChartRef.current.destroy(); trendChartRef.current = null; }
      if (top10ChartRef.current) { top10ChartRef.current.destroy(); top10ChartRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!data || displayDates.length === 0) return;
    renderTrendChart();
    renderTop10Chart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeMetric, displayDates]);

  function getMetricValue(a: any, metric: Metric) {
    if (metric === 'orders') return a.totalOrders || 0;
    if (metric === 'netIncome') return a.totalNetIncome || 0;
    if (metric === 'cost') return a.totalCost || 0;
    return a.totalProfit || 0;
  }

  function getDailyMetric(d: any, metric: Metric) {
    if (!d) return 0;
    if (metric === 'orders') return d.orders || 0;
    if (metric === 'netIncome') return d.netIncome || 0;
    if (metric === 'cost') return d.cost || 0;
    return d.profit || 0;
  }

  function getAvgDaily(a: any, metric: Metric) {
    const val = getMetricValue(a, metric);
    const days = Object.keys(a.daily || {}).length;
    return days > 0 ? val / days : 0;
  }

  // Compute account metrics within a date range
  function getRangeMetrics(a: any, dates: string[]) {
    let orders = 0, income = 0, netIncome = 0, cost = 0, profit = 0;
    for (const date of dates) {
      const d = a.daily?.[date];
      if (d) {
        orders += d.orders || 0;
        income += d.income || 0;
        netIncome += d.netIncome || 0;
        cost += d.cost || 0;
        profit += d.profit || 0;
      }
    }
    return { orders, income, netIncome, cost, profit, days: dates.length };
  }

  function formatValue(val: number, metric: Metric) {
    const cfg = METRIC_CONFIG[metric];
    if (metric === 'orders') return val.toLocaleString();
    return cfg.prefix + Math.round(val).toLocaleString();
  }

  function renderTrendChart() {
    if (trendChartRef.current) { trendChartRef.current.destroy(); }
    if (!trendCanvasRef.current) return;

    const cfg = METRIC_CONFIG[activeMetric];
    const totals = displayDates.map(date => {
      return displayAccounts.reduce((s: number, a: any) => {
        return s + getDailyMetric(a.daily?.[date], activeMetric);
      }, 0);
    });

    trendChartRef.current = new Chart(trendCanvasRef.current, {
      type: 'line',
      data: {
        labels: displayDates.map(d => d.slice(5).replace('-', '/')),
        datasets: [{
          label: cfg.label,
          data: totals,
          borderColor: cfg.color,
          backgroundColor: cfg.color + '14',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: cfg.color,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx: any) => cfg.label + ': ' + formatValue(ctx.raw, activeMetric)
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
          x: { grid: { display: false } }
        }
      }
    });
  };

  function renderTop10Chart() {
    if (top10ChartRef.current) { top10ChartRef.current.destroy(); }
    if (!top10CanvasRef.current) return;

    const cfg = METRIC_CONFIG[activeMetric];
    const sorted = [...displayAccounts].sort((a, b) => getDisplayMetricValue(b, activeMetric) - getDisplayMetricValue(a, activeMetric)).slice(0, 10);
    const colors = ['#4f46e5','#7c3aed','#db2777','#ec4899','#f59e0b','#10b981','#06b6d4','#3b82f6','#8b5cf6','#f43f5e'];

    top10ChartRef.current = new Chart(top10CanvasRef.current, {
      type: 'bar',
      data: {
        labels: sorted.map((a: any) => (a.account || '').substring(0, 8)),
        datasets: [{
          label: cfg.label,
          data: sorted.map((a: any) => getDisplayMetricValue(a, activeMetric)),
          backgroundColor: colors,
          borderRadius: 6,
          barThickness: 18,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (ctx: any) => formatValue(ctx.raw, activeMetric)
            }
          }
        },
        scales: {
          x: { grid: { color: '#f3f4f6' } },
          y: { grid: { display: false } }
        }
      }
    });
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>错误: {error}</div>;
  if (!data) return null;

  const cfg = METRIC_CONFIG[activeMetric];

  const getDisplayMetricValue = (a: any, metric: Metric) => {
    if (metric === 'orders') return a._orders || 0;
    if (metric === 'netIncome') return a._netIncome || 0;
    if (metric === 'cost') return a._cost || 0;
    return a._profit || 0;
  };

  const totalValue = displayAccounts.reduce((s: number, a: any) => s + getDisplayMetricValue(a, activeMetric), 0);
  const sortedAccounts = [...displayAccounts].sort((a, b) => {
    const diff = getDisplayMetricValue(a, activeMetric) - getDisplayMetricValue(b, activeMetric);
    return sortDesc ? -diff : diff;
  });

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e8ed', color: '#1d1d1f', padding: '28px 24px' }}>
        <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 32, margin: '0 0 6px', fontWeight: 700, letterSpacing: '-0.02em' }}>抖音账号数据中心</h1>
            <div style={{ fontSize: 15, color: '#86868b' }}>
              📅 {displayDates[0] || ''} 至 {displayDates[displayDates.length - 1] || ''} · 📊 {allAccounts.length} 个账号
            </div>
          </div>
          <a href="/admin" style={{ padding: '8px 20px', background: '#0071e3', color: 'white', textDecoration: 'none', borderRadius: 980, fontSize: 14, fontWeight: 500 }}>管理后台</a>
        </div>
      </div>

      <div style={{ maxWidth: '100%', margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ background: '#ffffff', borderRadius: 20, padding: 24, marginBottom: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'stretch', position: 'sticky', top: 0, zIndex: 50 }}>
          {/* Filters */}
          <div>
          {/* Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600, minWidth: 40 }}>日期</span>
            {['今日', '昨日', '近7天', '近30天', '本月', '上月', '自定义'].map(p => {
              const isActive = datePreset === p || (p === '自定义' && datePreset === '自定义');
              return (
                <button key={p} onClick={() => {
                  if (p === '自定义') {
                    const range = getPresetDates(datePreset) || [last7Dates[0] || '', last7Dates[last7Dates.length - 1] || ''];
                    setDateFrom(range[0]);
                    setDateTo(range[1]);
                    setDatePreset('自定义');
                  } else {
                    const range = getPresetDates(p);
                    if (range) {
                      setDateFrom(range[0]);
                      setDateTo(range[1]);
                    }
                    setDatePreset(p);
                  }
                }} style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 13, border: 'none', cursor: 'pointer',
                  background: isActive ? '#0071e3' : '#f5f5f7',
                  color: isActive ? 'white' : '#515154',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s'
                }}>{p}</button>
              );
            })}
            {datePreset === '自定义' && (
              <div ref={datePickerRef} style={{ position: 'relative', marginLeft: 8 }}>
                <button onClick={() => setShowDatePicker(!showDatePicker)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #e8e8ed', borderRadius: 10, fontSize: 13, background: 'white', cursor: 'pointer', fontWeight: 500 }}>
                  <span style={{ color: '#1d1d1f' }}>{dateFrom ? dateFrom.replace(/-/g, '/') : '开始'} ~ {dateTo ? dateTo.replace(/-/g, '/') : '结束'}</span>
                  <span style={{ fontSize: 14 }}>📅</span>
                </button>
                {showDatePicker && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 100, background: 'white', padding: '20px 24px', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: 560, border: '1px solid #f1f5f9', userSelect: 'none' }}>
                    {/* 日期范围显示 */}
                    <div style={{ textAlign: 'center', marginBottom: 14, padding: '10px 0', background: '#f5f5f7', borderRadius: 10 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f' }}>{dateFrom || '开始日期'} <span style={{ color: '#86868b', fontWeight: 400 }}>~</span> {dateTo || '结束日期'}</div>
                    </div>

                    {/* 月份导航 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <button onClick={(e) => { e.stopPropagation(); setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1)); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', padding: '4px 10px', borderRadius: 6 }}>‹</button>
                      <div style={{ display: 'flex', gap: 140, fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>
                        <span>{pickerMonth.getFullYear()}年{pickerMonth.getMonth() + 1}月</span>
                        <span>{new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1).getFullYear()}年{new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1).getMonth() + 1}月</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1)); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', padding: '4px 10px', borderRadius: 6 }}>›</button>
                    </div>

                    {/* 双月日历 */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      {[0, 1].map(offset => {
                        const calMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + offset);
                        const days = getCalendarDays(calMonth.getFullYear(), calMonth.getMonth());
                        return (
                          <div key={offset} style={{ flex: 1 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
                              {['一','二','三','四','五','六','日'].map(w => (
                                <div key={w} style={{ textAlign: 'center', fontSize: 12, color: '#999', padding: '4px 0', fontWeight: 500 }}>{w}</div>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                              {days.map((cell, idx) => {
                                const today = new Date();
                                const isToday = sameDay(cell.date, today);
                                const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
                                const toDate = dateTo ? new Date(dateTo + 'T00:00:00') : null;
                                const isStart = fromDate && sameDay(cell.date, fromDate);
                                const isEnd = toDate && sameDay(cell.date, toDate);
                                const isRange = fromDate && toDate && cell.date > new Date(Math.min(fromDate.getTime(), toDate.getTime())) && cell.date < new Date(Math.max(fromDate.getTime(), toDate.getTime()));

                                let bg = 'transparent';
                                let color = cell.current ? '#1d1d1f' : '#c5c5c7';
                                if (isStart || isEnd) { bg = '#0071e3'; color = 'white'; }
                                else if (isRange) { bg = '#e6f0ff'; color = '#0071e3'; }

                                return (
                                  <div
                                    key={idx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const clicked = new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate());
                                      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
                                      const to = dateTo ? new Date(dateTo + 'T00:00:00') : null;
                                      if (!from || (from && to)) {
                                        setDateFrom(fmtYMD(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()));
                                        setDateTo('');
                                      } else {
                                        if (clicked.getTime() < from.getTime()) {
                                          setDateTo(dateFrom);
                                          setDateFrom(fmtYMD(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()));
                                        } else {
                                          setDateTo(fmtYMD(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()));
                                        }
                                      }
                                    }}
                                    style={{
                                      textAlign: 'center',
                                      padding: '5px 0',
                                      fontSize: 13,
                                      cursor: 'pointer',
                                      borderRadius: 4,
                                      background: bg,
                                      color,
                                      fontWeight: isToday ? 700 : 400,
                                      position: 'relative',
                                    }}
                                  >
                                    {cell.date.getDate()}
                                    {isToday && !isStart && !isEnd && (
                                      <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#0071e3' }} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setShowDatePicker(false)} style={{ width: '100%', padding: '10px', background: '#0071e3', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>确定</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Primary Field Filters */}
          {primaryFilters.map(({ label, dataKey }: { label: string; dataKey: string }) => {
            const options: string[] = Array.from(new Set<string>(allAccounts.map((a: any) => String(a[dataKey] || '')))).filter(v => !!v).sort();
            if (options.length === 0) return null;
            const selected = dashFilters[dataKey] || [];
            return (
              <div key={dataKey} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 36 }}>{label}</span>
                <button onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: [] }))} style={{
                  padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                  background: selected.length === 0 ? '#0071e3' : '#ffffff',
                  color: selected.length === 0 ? 'white' : '#515154',
                  fontWeight: selected.length === 0 ? 600 : 400,
                }}>全部</button>
                {options.map(v => {
                  const isActive = selected.includes(v);
                  return (
                    <button key={v} onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: isActive ? (prev[dataKey] || []).filter(x => x !== v) : [...(prev[dataKey] || []), v] }))} style={{
                      padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                      background: isActive ? '#0071e3' : '#ffffff',
                      color: isActive ? 'white' : '#515154',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.15s'
                    }}>{v}</button>
                  );
                })}
              </div>
            );
          })}

          {/* More Filters */}
          {moreFilters.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => setShowMoreFilters(!showMoreFilters)}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #e8e8ed', background: showMoreFilters ? '#f0fdfa' : '#ffffff', color: '#0f766e', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {showMoreFilters ? '收起筛选' : '更多筛选'} {showMoreFilters ? '▲' : '▼'}
              </button>
              {showMoreFilters && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {moreFilters.map(({ label, dataKey }: { label: string; dataKey: string }) => {
                    const options: string[] = Array.from(new Set<string>(allAccounts.map((a: any) => String(a[dataKey] || '')))).filter(v => !!v).sort();
                    if (options.length === 0) return null;
                    const selected = dashFilters[dataKey] || [];
                    return (
                      <div key={dataKey} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 36 }}>{label}</span>
                        <button onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: [] }))} style={{
                          padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                          background: selected.length === 0 ? '#0071e3' : '#ffffff',
                          color: selected.length === 0 ? 'white' : '#515154',
                          fontWeight: selected.length === 0 ? 600 : 400,
                        }}>全部</button>
                        {options.map(v => {
                          const isActive = selected.includes(v);
                          return (
                            <button key={v} onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: isActive ? (prev[dataKey] || []).filter(x => x !== v) : [...(prev[dataKey] || []), v] }))} style={{
                              padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                              background: isActive ? '#0071e3' : '#ffffff',
                              color: isActive ? 'white' : '#515154',
                              fontWeight: isActive ? 600 : 400,
                              transition: 'all 0.15s'
                            }}>{v}</button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active filter tags */}
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>已选:</span>
              {activeFilters.map(tag => (
                <span key={tag.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 6, fontSize: 12, color: '#0f766e' }}>
                  {tag.label}
                  <button onClick={tag.onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: '#0d9488', padding: 0 }}>×</button>
                </span>
              ))}
              <button onClick={() => { setDatePreset('近7天'); setDateFrom(''); setDateTo(''); setDashFilters({}); }} style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 12, border: 'none', background: '#f1f5f9', borderRadius: 6, cursor: 'pointer', color: '#64748b' }}>清除全部</button>
            </div>
          )}
        </div>

          {/* Metric Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {METRIC_KEYS.map(m => {
            const c = METRIC_CONFIG[m];
            const val = displayAccounts.reduce((s: number, a: any) => s + getDisplayMetricValue(a, m), 0);
            const isActive = activeMetric === m;
            const isNegativeProfit = m === 'profit' && val < 0;
            return (
              <button
                key={m}
                onClick={() => setActiveMetric(m)}
                style={{
                  borderRadius: 18,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  padding: 0,
                  background: '#ffffff',
                  boxShadow: isActive ? `0 6px 24px ${c.color}28` : '0 2px 10px rgba(0,0,0,0.05)',
                  transition: 'all 0.25s ease',
                  transform: isActive ? 'translateY(-3px)' : 'none',
                }}
              >
                {/* 上部色块标题区 */}
                <div style={{
                  height: '33%',
                  minHeight: 56,
                  background: isNegativeProfit ? '#ff3b30' : c.color,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 20px',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 18, filter: 'brightness(0) invert(1)' }}>{c.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', letterSpacing: '0.04em' }}>{c.label}</span>
                </div>
                {/* 下部数值区 */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  background: '#ffffff',
                }}>
                  <div style={{ fontSize: 34, fontWeight: 700, color: isNegativeProfit ? '#ff3b30' : '#1d1d1f' }}>{formatValue(val, m)}</div>
                </div>
              </button>
            );
          })}
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24, marginBottom: 28 }}>
          <div style={{ background: '#ffffff', padding: 28, borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#1d1d1f' }}>{cfg.label} 7天趋势</div>
            <div style={{ height: 280 }}>
              <canvas ref={trendCanvasRef} />
            </div>
          </div>
          <div style={{ background: '#ffffff', padding: 28, borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#1d1d1f' }}>{cfg.label} Top 10</div>
            <div style={{ height: 280 }}>
              <canvas ref={top10CanvasRef} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: activeMetric === 'orders' ? '#f0f5ff' : activeMetric === 'netIncome' ? '#f8f5ff' : activeMetric === 'cost' ? '#fff8f0' : '#f0fff5', borderBottom: '1px solid #e8e8ed' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: cfg.color }} />
              <span style={{ fontSize: 18, fontWeight: 600, color: '#1d1d1f' }}>账号明细（按{cfg.label}排序）</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto', padding: '0 4px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f7' }}>
                  <th
                    onClick={() => setSortDesc(v => !v)}
                    style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: 'none' }}
                  >
                    排名 {sortDesc ? '↓' : '↑'}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>账号</th>
                  {dashFields.map((f: any) => (
                    <th key={f.key} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>{f.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>单量</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>净佣金</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>消耗</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>利润</th>
                  {showAvgCol && <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>日均{cfg.label}</th>}
                  {displayDates.map(d => (
                    <th key={d} style={{ padding: '10px 6px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#a1a1a6', whiteSpace: 'nowrap', borderBottom: 'none' }}>{parseInt(d.slice(8))}日</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAccounts.map((a: any, i: number) => {
                  const maxVal = Math.max(...displayDates.map(d => getDailyMetric(a.daily?.[d], activeMetric)), 1);
                  const avgVal = activeMetric === 'orders' ? (a._avgDaily || 0) : (getDisplayMetricValue(a, activeMetric) / (displayDates.length || 1));
                  return (
                    <tr key={a.account} style={{ background: i % 2 === 1 ? '#fafafa' : '#ffffff', transition: 'background 0.12s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f7')} onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? '#fafafa' : '#ffffff')}>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#86868b', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#1d1d1f' }}>{a.account}</td>
                      {dashFields.map((f: any) => (
                        <td key={f.key} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', color: '#515154', fontSize: 12 }}>
                          {f.key === 'account_type' ? (a.accountType || '-') :
                           f.key === 'status' ? (a.metaStatus ? <span style={{ color: '#ff3b30', fontWeight: 500, fontSize: 11 }}>{a.metaStatus}</span> : '-') :
                           f.key === 'buyer' ? (a.metaBuyer || '-') :
                           f.key === 'code' ? (a.code || '-') :
                           f.key === 'remark' ? (a.remark || '-') :
                           (a[f.key] || '-')}
                        </td>
                      ))}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#0071e3', fontSize: 12 }}>{(a._orders || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 500, color: '#af52de', fontSize: 12 }}>¥{Math.round(a._netIncome || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 500, color: '#ff9500', fontSize: 12 }}>¥{Math.round(a._cost || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: (a._profit || 0) >= 0 ? '#34c759' : '#ff3b30', fontSize: 12 }}>¥{Math.round(a._profit || 0).toLocaleString()}</td>
                      {showAvgCol && <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', color: '#86868b', fontSize: 12 }}>{activeMetric === 'orders' ? avgVal.toFixed(1) : formatValue(avgVal, activeMetric)}</td>}
                      {displayDates.map(date => {
                        const v = getDailyMetric(a.daily?.[date], activeMetric);
                        if (v < 0) {
                          return (
                            <td key={date} style={{ padding: '6px 6px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 700, fontSize: 11, background: '#fff0f0', color: '#ff3b30', borderRadius: 4 }}>
                              {activeMetric === 'orders' ? v : '¥' + Math.round(v)}
                            </td>
                          );
                        }
                        const ratio = v / maxVal;
                        const alpha = 0.06 + ratio * 0.24;
                        return (
                          <td key={date} style={{ padding: '6px 6px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 11, background: `rgba(0,113,227,${alpha})`, color: '#1d1d1f', borderRadius: 4 }}>
                            {activeMetric === 'orders' ? v : '¥' + Math.round(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>



        <div style={{ textAlign: 'center', padding: 32, color: '#a1a1a6', fontSize: 12, fontWeight: 400 }}>
          抖音账号数据中心 · 数据已过滤退款/退货订单 · 净佣金已扣除10%平台技术服务费
        </div>
      </div>
    </div>
  );
}
