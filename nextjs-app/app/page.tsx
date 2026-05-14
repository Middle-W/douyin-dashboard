'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';

type Metric = 'orders' | 'netIncome' | 'cost' | 'profit';

const METRIC_CONFIG: Record<Metric, { label: string; color: string; prefix: string; icon: string; field: string }> = {
  orders: { label: '单量', color: '#0071e3', prefix: '', icon: '单', field: 'totalOrders' },
  netIncome: { label: '有效净佣金', color: '#af52de', prefix: '¥', icon: '佣', field: 'totalNetIncome' },
  cost: { label: '消耗', color: '#ff9500', prefix: '¥', icon: '耗', field: 'totalCost' },
  profit: { label: '利润', color: '#34c759', prefix: '¥', icon: '利', field: 'totalProfit' },
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
  const [datePreset, setDatePreset] = useState('今日');
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
  const [sortKey, setSortKey] = useState<'metric' | 'health'>('metric');
  const [showDailyReport, setShowDailyReport] = useState(() => {
    try { return localStorage.getItem('dash_show_report') !== 'false'; } catch { return true; }
  });

  const [countdown, setCountdown] = useState('');

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

  const healthLabelMap: Record<string, string> = { good: '🟢 健康', warn: '🟡 预警', bad: '🔴 危险' };

  // Dynamically build filter fields from fields config + actual data
  const allFilterFields: { key: string; label: string; dataKey: string }[] = useMemo(() => {
    if (!data) return [];
    const fields = (data.fields || [])
      .filter((f: any) => f.show_in_dashboard && !['name','id','created_at'].includes(f.key))
      .map((f: any) => ({ key: f.key, label: f.label, dataKey: getDashDataKey(f.key) }))
      .filter((f: any) => allAccounts.some((a: any) => !!a[f.dataKey]));
    // 添加健康度筛选
    return [...fields, { key: 'health', label: '健康度', dataKey: '_healthGrade' }];
  }, [data, allAccounts]);

  const primaryFilters = allFilterFields.slice(0, 2);
  const moreFilters = allFilterFields.slice(2);

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
      if (dataKey === '_healthGrade') continue; // 健康度在后面单独筛选
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
      selected.forEach(v => tags.push({ key: `${dataKey}-${v}`, label: `${label}: ${healthLabelMap[v] || v}`, onRemove: () => setDashFilters(prev => ({ ...prev, [dataKey]: (prev[dataKey] || []).filter(x => x !== v) })) }));
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

  // Mobile redirect
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(navigator.userAgent);
    if (isMobile && !window.location.pathname.startsWith('/mobile')) {
      window.location.href = '/mobile';
    }
  }, []);

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

  // 下次更新时间倒计时（每半小时：05分 / 35分）
  useEffect(() => {
    function getNextUpdateTime() {
      const now = new Date();
      const next = new Date(now);
      const m = now.getMinutes();
      if (m < 5) {
        next.setMinutes(5, 0, 0);
      } else if (m < 35) {
        next.setMinutes(35, 0, 0);
      } else {
        next.setMinutes(5, 0, 0);
        next.setHours(next.getHours() + 1);
      }
      return next;
    }
    function formatCountdown(ms: number) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    function tick() {
      const diff = getNextUpdateTime().getTime() - Date.now();
      setCountdown(formatCountdown(diff));
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

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

  function calcHealthScore(account: any, dates: string[]) {
    const cost = account._cost || 0;
    const profit = account._profit || 0;
    const netIncome = account._netIncome || 0;
    const orders = account._orders || 0;
    const days = dates.length;

    // 1. 盈利健康 (30%): 利润率 = profit / cost
    let profitScore = 30;
    if (cost > 0) {
      const margin = profit / cost;
      if (margin >= 0.20) profitScore = 30;
      else if (margin >= 0.10) profitScore = 25;
      else if (margin >= 0.05) profitScore = 18;
      else if (margin >= 0) profitScore = 10;
      else profitScore = Math.max(0, 10 + margin * 100);
    } else if (profit > 0) profitScore = 30;
    else profitScore = 15;

    // 2. 投产健康 (25%): ROI = netIncome / cost
    let roiScore = 25;
    if (cost > 0) {
      const roi = netIncome / cost;
      if (roi >= 2.0) roiScore = 25;
      else if (roi >= 1.5) roiScore = 22;
      else if (roi >= 1.0) roiScore = 18;
      else if (roi >= 0.5) roiScore = 12;
      else roiScore = Math.max(0, roi * 24);
    } else if (netIncome > 0) roiScore = 25;
    else roiScore = 12;

    // 3. 活跃健康 (20%): 日均单量
    let activeScore = 20;
    const avgOrders = days > 0 ? orders / days : 0;
    if (avgOrders >= 50) activeScore = 20;
    else if (avgOrders >= 20) activeScore = 17;
    else if (avgOrders >= 10) activeScore = 14;
    else if (avgOrders >= 5) activeScore = 10;
    else if (avgOrders > 0) activeScore = 6;
    else activeScore = 0;

    // 4. 趋势健康 (15%): 前半段 vs 后半段单量
    let trendScore = 15;
    if (dates.length >= 2) {
      const mid = Math.floor(dates.length / 2);
      const firstHalf = dates.slice(0, mid);
      const secondHalf = dates.slice(mid);
      const firstOrders = firstHalf.reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
      const secondOrders = secondHalf.reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
      const avgFirst = firstHalf.length > 0 ? firstOrders / firstHalf.length : 0;
      const avgSecond = secondHalf.length > 0 ? secondOrders / secondHalf.length : 0;
      if (avgFirst > 0) {
        const change = (avgSecond - avgFirst) / avgFirst;
        if (change >= 0.30) trendScore = 15;
        else if (change >= 0.10) trendScore = 13;
        else if (change >= -0.10) trendScore = 11;
        else if (change >= -0.30) trendScore = 7;
        else trendScore = Math.max(0, 15 + change * 30);
      } else if (avgSecond > 0) trendScore = 12;
    }

    // 5. 消耗稳定 (10%): 消耗变异系数
    let stabilityScore = 10;
    if (dates.length >= 2) {
      const dailyCosts = dates.map(d => account.daily?.[d]?.cost || 0).filter(c => c > 0);
      if (dailyCosts.length >= 2) {
        const avg = dailyCosts.reduce((a, b) => a + b, 0) / dailyCosts.length;
        const variance = dailyCosts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / dailyCosts.length;
        const stdDev = Math.sqrt(variance);
        const cv = avg > 0 ? stdDev / avg : 0;
        if (cv <= 0.3) stabilityScore = 10;
        else if (cv <= 0.5) stabilityScore = 8;
        else if (cv <= 0.8) stabilityScore = 6;
        else if (cv <= 1.2) stabilityScore = 4;
        else stabilityScore = 2;
      }
    }

    // 收集异常原因
    const issues: string[] = [];
    if (cost > 0) {
      const margin = profit / cost;
      if (margin < 0) issues.push(`利润率 ${(margin * 100).toFixed(1)}%，亏损状态`);
      else if (margin < 0.05) issues.push(`利润率 ${(margin * 100).toFixed(1)}%，盈利薄弱`);
    }
    if (cost > 0) {
      const roi = netIncome / cost;
      if (roi < 0.5) issues.push(`ROI ${roi.toFixed(2)}，投产低于保本线`);
      else if (roi < 1.0) issues.push(`ROI ${roi.toFixed(2)}，投产偏低`);
    }
    if (avgOrders === 0) issues.push('连续多日无单，活跃度极低');
    else if (avgOrders < 5) issues.push(`日均 ${avgOrders.toFixed(1)} 单，活跃度低`);
    if (dates.length >= 2) {
      const mid = Math.floor(dates.length / 2);
      const firstHalf = dates.slice(0, mid);
      const secondHalf = dates.slice(mid);
      const firstOrders = firstHalf.reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
      const secondOrders = secondHalf.reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
      const avgFirst = firstHalf.length > 0 ? firstOrders / firstHalf.length : 0;
      const avgSecond = secondHalf.length > 0 ? secondOrders / secondHalf.length : 0;
      if (avgFirst > 0) {
        const change = (avgSecond - avgFirst) / avgFirst;
        if (change < -0.30) issues.push(`趋势下滑 ${Math.abs(change * 100).toFixed(0)}%，单量明显萎缩`);
        else if (change < -0.10) issues.push(`趋势下滑 ${Math.abs(change * 100).toFixed(0)}%，注意关注`);
      }
    }

    const total = Math.round(profitScore + roiScore + activeScore + trendScore + stabilityScore);
    return {
      total,
      grade: total >= 80 ? 'good' : total >= 50 ? 'warn' : 'bad' as const,
      details: [
        { label: '盈利健康', score: Math.round(profitScore), max: 30, status: profitScore >= 24 ? 'ok' : profitScore >= 15 ? 'warn' : 'bad' as const },
        { label: '投产健康', score: Math.round(roiScore), max: 25, status: roiScore >= 20 ? 'ok' : roiScore >= 12 ? 'warn' : 'bad' as const },
        { label: '活跃健康', score: Math.round(activeScore), max: 20, status: activeScore >= 16 ? 'ok' : activeScore >= 10 ? 'warn' : 'bad' as const },
        { label: '趋势健康', score: Math.round(trendScore), max: 15, status: trendScore >= 12 ? 'ok' : trendScore >= 7 ? 'warn' : 'bad' as const },
        { label: '消耗稳定', score: Math.round(stabilityScore), max: 10, status: stabilityScore >= 8 ? 'ok' : stabilityScore >= 5 ? 'warn' : 'bad' as const },
      ],
      issues,
    };
  }

  const totalValue = displayAccounts.reduce((s: number, a: any) => s + getDisplayMetricValue(a, activeMetric), 0);

  // 为每个账号计算健康度，支持按健康度排序
  const accountsWithHealth = displayAccounts.map((a: any) => ({
    ...a,
    _health: calcHealthScore(a, displayDates),
  }));

  // 健康度筛选
  const healthFilters = dashFilters['_healthGrade'] || [];
  const filteredAccounts = healthFilters.length > 0
    ? accountsWithHealth.filter((a: any) => healthFilters.includes(a._health?.grade))
    : accountsWithHealth;

  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    if (sortKey === 'health') {
      const diff = (a._health?.total || 0) - (b._health?.total || 0);
      return sortDesc ? -diff : diff;
    }
    const diff = getDisplayMetricValue(a, activeMetric) - getDisplayMetricValue(b, activeMetric);
    return sortDesc ? -diff : diff;
  });

  return (
    <>
      <style>{`
        @keyframes dash-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <a href="/admin" style={{ padding: '8px 20px', background: '#0071e3', color: 'white', textDecoration: 'none', borderRadius: 980, fontSize: 14, fontWeight: 500 }}>管理后台</a>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)',
              borderRadius: 980,
              border: '1px solid #dbe4ff',
              fontSize: 12, color: '#5a6370', fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,113,227,0.06)'
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#34c759', display: 'inline-block',
                boxShadow: '0 0 0 3px rgba(52,199,89,0.15)',
                animation: 'dash-pulse 2.4s ease-in-out infinite'
              }} />
              <span>下次更新</span>
              <span style={{
                fontWeight: 700, color: '#0071e3',
                fontFamily: 'SF Mono, Monaco, "Cascadia Code", monospace',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em'
              }}>
                {countdown}
              </span>
            </div>
          </div>
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
            const options: string[] = dataKey === '_healthGrade'
              ? ['good', 'warn', 'bad']
              : Array.from(new Set<string>(allAccounts.map((a: any) => String(a[dataKey] || '')))).filter(v => !!v).sort();
            if (options.length === 0) return null;
            const selected = dashFilters[dataKey] || [];
            return (
              <div key={dataKey} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600, minWidth: 52 }}>{label}</span>
                <button onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: [] }))} style={{
                  padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                  background: selected.length === 0 ? '#0071e3' : '#f5f5f7',
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
                    }}>{healthLabelMap[v] || v}</button>
                  );
                })}
              </div>
            );
          })}

          {/* More filters expand area */}
          {showMoreFilters && moreFilters.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {moreFilters.map(({ label, dataKey }: { label: string; dataKey: string }) => {
                const options: string[] = dataKey === '_healthGrade'
                  ? ['good', 'warn', 'bad']
                  : Array.from(new Set<string>(allAccounts.map((a: any) => String(a[dataKey] || '')))).filter(v => !!v).sort();
                if (options.length === 0) return null;
                const selected = dashFilters[dataKey] || [];
                return (
                  <div key={dataKey} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600, minWidth: 52 }}>{label}</span>
                    <button onClick={() => setDashFilters(prev => ({ ...prev, [dataKey]: [] }))} style={{
                      padding: '6px 12px', borderRadius: 10, fontSize: 13, border: '1px solid #e8e8ed', cursor: 'pointer',
                      background: selected.length === 0 ? '#0071e3' : '#f5f5f7',
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
                        }}>{healthLabelMap[v] || v}</button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar: More Filters button + Active filter tags on same row */}
          {(moreFilters.length > 0 || activeFilters.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              {/* Left: More Filters button */}
              {moreFilters.length > 0 && (
                <button onClick={() => setShowMoreFilters(!showMoreFilters)}
                  style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #e8e8ed', background: showMoreFilters ? '#f0fdfa' : '#ffffff', color: '#0f766e', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {showMoreFilters ? '收起筛选' : '更多筛选'} {showMoreFilters ? '▲' : '▼'}
                </button>
              )}

              {/* Right: Active filter tags */}
              {activeFilters.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>已选:</span>
                  {activeFilters.map(tag => (
                    <span key={tag.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 6, fontSize: 12, color: '#0f766e' }}>
                      {tag.label}
                      <button onClick={tag.onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: '#0d9488', padding: 0 }}>×</button>
                    </span>
                  ))}
                  <button onClick={() => { setDatePreset('近7天'); setDateFrom(''); setDateTo(''); setDashFilters({}); setShowMoreFilters(false); }} style={{ padding: '4px 12px', fontSize: 12, border: 'none', background: '#f1f5f9', borderRadius: 6, cursor: 'pointer', color: '#64748b' }}>清除全部</button>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Metric Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, height: '100%' }}>
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
                  height: '100%',
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
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{c.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', letterSpacing: '0.04em' }}>{c.label}</span>
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

        {/* Daily Report Card */}
        {/* Daily Report Card */}
        {(() => {
          const totalCost = displayAccounts.reduce((s: number, a: any) => s + (a._cost || 0), 0);
          const totalNetIncome = displayAccounts.reduce((s: number, a: any) => s + (a._netIncome || 0), 0);
          const totalProfit = displayAccounts.reduce((s: number, a: any) => s + (a._profit || 0), 0);
          const abnormal = accountsWithHealth
            .filter((a: any) => (a._health?.total || 100) < 50 && (a.metaStatus === '正常' || !a.metaStatus))
            .sort((a: any, b: any) => (a._health?.total || 100) - (b._health?.total || 100))
            .slice(0, 10);

          // 按账号类型聚合（平均值）
          const typeStats: Record<string, { orders: number; netIncome: number; profit: number; count: number }> = {};
          accountsWithHealth.forEach((a: any) => {
            const type = a.accountType || '未分类';
            if (!typeStats[type]) typeStats[type] = { orders: 0, netIncome: 0, profit: 0, count: 0 };
            typeStats[type].orders += a._orders || 0;
            typeStats[type].netIncome += a._netIncome || 0;
            typeStats[type].profit += a._profit || 0;
            typeStats[type].count += 1;
          });
          const typeByOrders = Object.entries(typeStats).sort((a, b) => (b[1].orders / b[1].count) - (a[1].orders / a[1].count)).slice(0, 5);
          const typeByNetIncome = Object.entries(typeStats).sort((a, b) => (b[1].netIncome / b[1].count) - (a[1].netIncome / a[1].count)).slice(0, 5);
          const typeByProfit = Object.entries(typeStats).sort((a, b) => (b[1].profit / b[1].count) - (a[1].profit / a[1].count)).slice(0, 5);

          // 按选品人聚合（平均值）
          const buyerStats: Record<string, { orders: number; netIncome: number; profit: number; count: number }> = {};
          accountsWithHealth.forEach((a: any) => {
            const buyer = a.metaBuyer || '未分配';
            if (!buyerStats[buyer]) buyerStats[buyer] = { orders: 0, netIncome: 0, profit: 0, count: 0 };
            buyerStats[buyer].orders += a._orders || 0;
            buyerStats[buyer].netIncome += a._netIncome || 0;
            buyerStats[buyer].profit += a._profit || 0;
            buyerStats[buyer].count += 1;
          });
          const buyerByOrders = Object.entries(buyerStats).sort((a, b) => (b[1].orders / b[1].count) - (a[1].orders / a[1].count)).slice(0, 5);
          const buyerByNetIncome = Object.entries(buyerStats).sort((a, b) => (b[1].netIncome / b[1].count) - (a[1].netIncome / a[1].count)).slice(0, 5);
          const buyerByProfit = Object.entries(buyerStats).sort((a, b) => (b[1].profit / b[1].count) - (a[1].profit / a[1].count)).slice(0, 5);

          const avgRoi = totalCost > 0 ? totalNetIncome / totalCost : 0;
          let suggestion = '';
          if (totalCost === 0) suggestion = '暂无消耗数据，建议关注账号投放状态。';
          else if (avgRoi < 0.8) suggestion = '整体投产偏低，建议优化高消耗低产出账号的投放策略。';
          else if (totalProfit < 0) suggestion = '整体利润为负，建议控制消耗或提升转化率。';
          else if (abnormal.length > 0) suggestion = `有 ${abnormal.length} 个账号健康度偏低，建议重点关注。`;
          else suggestion = '整体数据健康，保持现有投放节奏。';

          return (
            <div style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)', marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: showDailyReport ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 4, height: 20, borderRadius: 2, background: '#0071e3' }} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>
                    📋 {displayDates[0] || ''} 至 {displayDates[displayDates.length - 1] || ''} 数据日报
                  </span>
                  <span style={{ fontSize: 12, color: '#a1a1a6', background: '#f5f5f7', padding: '2px 8px', borderRadius: 6 }}>
                    {displayAccounts.length} 个账号
                  </span>
                </div>
                <button
                  onClick={() => { setShowDailyReport(v => { const n = !v; try { localStorage.setItem('dash_show_report', String(n)); } catch {} return n; }); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#86868b', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {showDailyReport ? '收起 ▲' : '展开 ▼'}
                </button>
              </div>
              {showDailyReport && (
                <div style={{ padding: '20px 28px' }}>
                  {/* 账号类型排行 | 选品人排行 | 异常预警 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 24, alignItems: 'start' }}>
                    {/* 模块一：账号类型平均排行 */}
                    <div style={{ background: '#f8f9fa', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #0071e3' }}>账号类型平均排行</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        {/* 单量 */}
                        <div style={{ padding: '0 10px', borderLeft: 'none' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>单量排行</div>
                          {typeByOrders.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#0071e3' }}>{Math.round(stats.orders / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        {/* 净佣金 */}
                        <div style={{ padding: '0 10px', borderLeft: '1px solid #e5e5ea' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>净佣金排行</div>
                          {typeByNetIncome.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#af52de' }}>¥{Math.round(stats.netIncome / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        {/* 利润 */}
                        <div style={{ padding: '0 10px', borderLeft: '1px solid #e5e5ea' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>利润排行</div>
                          {typeByProfit.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: stats.profit >= 0 ? '#34c759' : '#ff3b30' }}>¥{Math.round(stats.profit / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 模块二：选品人平均排行 */}
                    <div style={{ background: '#f8f9fa', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #af52de' }}>选品人平均排行</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        {/* 单量 */}
                        <div style={{ padding: '0 10px', borderLeft: 'none' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>单量排行</div>
                          {buyerByOrders.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#0071e3' }}>{Math.round(stats.orders / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        {/* 净佣金 */}
                        <div style={{ padding: '0 10px', borderLeft: '1px solid #e5e5ea' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>净佣金排行</div>
                          {buyerByNetIncome.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#af52de' }}>¥{Math.round(stats.netIncome / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        {/* 利润 */}
                        <div style={{ padding: '0 10px', borderLeft: '1px solid #e5e5ea' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868b', marginBottom: 8, textAlign: 'center', background: '#fff', padding: '3px 0', borderRadius: 6, letterSpacing: 0.5 }}>利润排行</div>
                          {buyerByProfit.map(([name, stats], i) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f5f5f7' : 'none' }}>
                              <span style={{ fontSize: 12, color: '#515154' }}>{name} <span style={{ color: '#c7c7cc', fontSize: 11 }}>({stats.count}号)</span></span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: stats.profit >= 0 ? '#34c759' : '#ff3b30' }}>¥{Math.round(stats.profit / stats.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 右侧：异常预警 5×2 网格 */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #ff3b30', display: 'flex', alignItems: 'center', gap: 6 }}>
                        异常预警 {abnormal.length > 0 && <span style={{ background: '#fff0f0', color: '#ff3b30', fontSize: 11, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{abnormal.length} 个</span>}
                      </div>
                      {abnormal.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#34c759', padding: '8px 0' }}>✅ 所有账号健康度正常</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 128px)', gap: 6 }}>
                          {abnormal.map((a: any) => (
                            <div key={a.account} style={{ background: '#fff8f8', borderRadius: 10, padding: '10px 8px', border: '1px solid #ffe0e0', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 70 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3b30', flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.account}</span>
                                </div>
                                <span style={{ fontSize: 13, color: '#ff3b30', fontWeight: 700, flexShrink: 0 }}>{a._health?.total}分</span>
                              </div>
                              {a._health?.issues?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {a._health.issues.slice(0, 3).map((issue: string, i: number) => (
                                    <span key={i} style={{ fontSize: 12, color: '#515154', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal' }}>{issue}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })()}

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
                    onClick={() => { setSortKey('metric'); setSortDesc(v => !v); }}
                    style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: 'none' }}
                  >
                    排名 {sortKey === 'metric' ? (sortDesc ? '↓' : '↑') : ''}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none', width: 100 }}>账号</th>
                  <th
                    onClick={() => { setSortKey('health'); setSortDesc(v => !v); }}
                    style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: 'none' }}
                  >
                    健康度 {sortKey === 'health' ? (sortDesc ? '↓' : '↑') : ''}
                  </th>
                  {dashFields.map((f: any) => (
                    <th key={f.key} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>{f.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>单量</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>净佣金</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>消耗</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>利润</th>
                  {showAvgCol && <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap', borderBottom: 'none' }}>日均{cfg.label}</th>}
                  {displayDates.map(d => (
                    <th key={d} style={{ padding: '10px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#a1a1a6', whiteSpace: 'nowrap', borderBottom: 'none' }}>{parseInt(d.slice(8))}日</th>
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
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#1d1d1f', width: 100 }}>{a.account}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', position: 'relative' }}>
                        <div
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'help' }}
                          onMouseEnter={e => {
                            const trigger = e.currentTarget;
                            const tooltip = trigger.nextElementSibling as HTMLElement;
                            if (tooltip) {
                              const rect = trigger.getBoundingClientRect();
                              tooltip.style.display = 'block';
                              tooltip.style.position = 'fixed';
                              tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
                              tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
                              tooltip.style.transform = 'none';
                              tooltip.style.bottom = 'auto';
                              tooltip.style.zIndex = '99999';
                            }
                          }}
                          onMouseLeave={e => {
                            const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                            if (tooltip) tooltip.style.display = 'none';
                          }}
                        >
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                            background: a._health?.grade === 'good' ? '#34c759' : a._health?.grade === 'warn' ? '#ff9500' : '#ff3b30'
                          }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: a._health?.grade === 'good' ? '#34c759' : a._health?.grade === 'warn' ? '#ff9500' : '#ff3b30' }}>
                            {a._health?.total ?? '-'}
                          </span>
                        </div>
                        <div style={{
                          display: 'none', position: 'absolute', zIndex: 9999, left: '50%', transform: 'translateX(-50%)', bottom: '100%',
                          background: '#ffffff', color: '#1d1d1f', borderRadius: 14, padding: '14px 16px', fontSize: 12,
                          minWidth: 200, maxWidth: 230, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', marginBottom: 8,
                          border: '1px solid rgba(0,0,0,0.06)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>健康度诊断</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: a._health?.grade === 'good' ? '#34c759' : a._health?.grade === 'warn' ? '#ff9500' : '#ff3b30' }}>{a._health?.total ?? '-'}<span style={{ fontSize: 11, fontWeight: 500, marginLeft: 2 }}>分</span></span>
                          </div>
                          {a._health?.details.map((d: any) => {
                            const barColor = d.status === 'ok' ? '#34c759' : d.status === 'warn' ? '#ff9500' : '#ff3b30';
                            return (
                              <div key={d.label} style={{ marginBottom: 7 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ color: '#86868b', fontSize: 11 }}>{d.label}</span>
                                  <span style={{ color: barColor, fontWeight: 600, fontSize: 11 }}>{d.score}/{d.max}</span>
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, (d.score / d.max) * 100)}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.3s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
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
    </>
  );
}
