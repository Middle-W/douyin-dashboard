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

function getPresetDates(preset: string): [string, string] | null {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const fmt = (date: Date) => {
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  if (preset === '今日') return [fmt(new Date(y, m, d)), fmt(new Date(y, m, d))];
  if (preset === '昨日') return [fmt(new Date(y, m, d - 1)), fmt(new Date(y, m, d - 1))];
  if (preset === '近7天') return [fmt(new Date(y, m, d - 7)), fmt(new Date(y, m, d - 1))];
  if (preset === '近30天') return [fmt(new Date(y, m, d - 30)), fmt(new Date(y, m, d - 1))];
  if (preset === '本月') return [fmt(new Date(y, m, 1)), fmt(today)];
  if (preset === '上月') return [fmt(new Date(y, m - 1, 1)), fmt(new Date(y, m, 0))];
  return null;
}

function formatValue(val: number, metric: Metric) {
  const cfg = METRIC_CONFIG[metric];
  if (metric === 'orders') return val.toLocaleString();
  return cfg.prefix + Math.round(val).toLocaleString();
}

function calcHealthScore(account: any, dates: string[]) {
  const orders = dates.reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
  const cost = dates.reduce((s, d) => s + (account.daily?.[d]?.cost || 0), 0);
  const profit = dates.reduce((s, d) => s + (account.daily?.[d]?.profit || 0), 0);
  const netIncome = dates.reduce((s, d) => s + (account.daily?.[d]?.netIncome || 0), 0);
  const days = dates.length;

  let profitScore = 30;
  if (cost > 0) {
    const margin = profit / cost;
    if (margin >= 0.3) profitScore = 30;
    else if (margin >= 0.15) profitScore = 24;
    else if (margin >= 0.05) profitScore = 18;
    else if (margin >= 0) profitScore = 10;
    else profitScore = 0;
  }

  let roiScore = 15;
  if (cost > 0) {
    const roi = netIncome / cost;
    if (roi >= 1.2) roiScore = 15;
    else if (roi >= 0.8) roiScore = 12;
    else if (roi >= 0.5) roiScore = 8;
    else roiScore = 4;
  }

  let activeScore = 20;
  const avgOrders = days > 0 ? orders / days : 0;
  if (avgOrders >= 5) activeScore = 20;
  else if (avgOrders >= 2) activeScore = 15;
  else if (avgOrders >= 0.5) activeScore = 8;
  else activeScore = 0;

  let trendScore = 15;
  if (dates.length >= 2) {
    const mid = Math.floor(dates.length / 2);
    const firstOrders = dates.slice(0, mid).reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
    const secondOrders = dates.slice(mid).reduce((s, d) => s + (account.daily?.[d]?.orders || 0), 0);
    if (firstOrders > 0) {
      const change = (secondOrders - firstOrders) / firstOrders;
      if (change >= 0.2) trendScore = 15;
      else if (change >= -0.1) trendScore = 12;
      else if (change >= -0.3) trendScore = 7;
      else trendScore = 3;
    }
  }

  let stabilityScore = 10;
  if (dates.length >= 2) {
    const costs = dates.map(d => account.daily?.[d]?.cost || 0);
    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
    const variance = costs.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / costs.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
    if (cv <= 0.3) stabilityScore = 10;
    else if (cv <= 0.6) stabilityScore = 7;
    else if (cv <= 1.0) stabilityScore = 4;
    else stabilityScore = 1;
  }

  const total = profitScore + roiScore + activeScore + trendScore + stabilityScore;
  let grade: 'good' | 'warn' | 'bad' = 'good';
  if (total < 50) grade = 'bad';
  else if (total < 70) grade = 'warn';

  return { total, grade };
}

export default function MobileDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMetric, setActiveMetric] = useState<Metric>('netIncome');
  const [datePreset, setDatePreset] = useState('今日');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<'metric' | 'profit' | 'health'>('metric');
  const [sortDesc, setSortDesc] = useState(true);

  /* 新增：搜索 + 分页 + 状态筛选 */
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'abnormal'>('all');

  const trendCanvasRef = useRef<HTMLCanvasElement>(null);
  const trendChartRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => loadData(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (datePreset && datePreset !== '自定义') {
      const range = getPresetDates(datePreset);
      if (range) { setDateFrom(range[0]); setDateTo(range[1]); }
    }
  }, [datePreset]);

  /* 筛选条件变化时自动回到第1页 */
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, datePreset, sortKey, sortDesc, activeMetric]);

  const allAccounts = data?.accounts || [];

  const displayDates = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    const dates: string[] = [];
    const start = new Date(dateFrom + 'T00:00:00');
    const end = new Date(dateTo + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return dates;
  }, [dateFrom, dateTo]);

  const displayAccounts = useMemo(() => {
    return allAccounts.map((a: any) => ({
      ...a,
      _orders: displayDates.reduce((s: number, d: string) => s + (a.daily?.[d]?.orders || 0), 0),
      _netIncome: displayDates.reduce((s: number, d: string) => s + (a.daily?.[d]?.netIncome || 0), 0),
      _cost: displayDates.reduce((s: number, d: string) => s + (a.daily?.[d]?.cost || 0), 0),
      _profit: displayDates.reduce((s: number, d: string) => s + (a.daily?.[d]?.profit || 0), 0),
      _health: calcHealthScore(a, displayDates),
    }));
  }, [allAccounts, displayDates]);

  /* 搜索 + 状态过滤 */
  const filteredAccounts = useMemo(() => {
    let arr = [...displayAccounts];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      arr = arr.filter((a: any) => a.account?.toLowerCase().includes(q));
    }
    if (statusFilter === 'normal') {
      arr = arr.filter((a: any) => (a._health?.total || 0) >= 50);
    } else if (statusFilter === 'abnormal') {
      arr = arr.filter((a: any) => (a._health?.total || 100) < 50);
    }
    return arr;
  }, [displayAccounts, searchQuery, statusFilter]);

  const sortedAccounts = useMemo(() => {
    const arr = [...filteredAccounts];
    arr.sort((a: any, b: any) => {
      if (sortKey === 'health') {
        const diff = (a._health?.total || 0) - (b._health?.total || 0);
        return sortDesc ? -diff : diff;
      }
      if (sortKey === 'profit') {
        const diff = a._profit - b._profit;
        return sortDesc ? -diff : diff;
      }
      const diff = (a[METRIC_CONFIG[activeMetric].field] || 0) - (b[METRIC_CONFIG[activeMetric].field] || 0);
      return sortDesc ? -diff : diff;
    });
    return arr;
  }, [filteredAccounts, sortKey, sortDesc, activeMetric]);

  /* 分页 */
  const totalPages = Math.max(1, Math.ceil(sortedAccounts.length / pageSize));
  const pagedAccounts = useMemo(() => {
    return sortedAccounts.slice((page - 1) * pageSize, page * pageSize);
  }, [sortedAccounts, page, pageSize]);

  const totals = useMemo(() => {
    return {
      orders: displayAccounts.reduce((s: number, a: any) => s + a._orders, 0),
      netIncome: displayAccounts.reduce((s: number, a: any) => s + a._netIncome, 0),
      cost: displayAccounts.reduce((s: number, a: any) => s + a._cost, 0),
      profit: displayAccounts.reduce((s: number, a: any) => s + a._profit, 0),
    };
  }, [displayAccounts]);

  /* 趋势图 */
  useEffect(() => {
    if (!trendCanvasRef.current || !data || displayDates.length === 0) return;
    const cfg = METRIC_CONFIG[activeMetric];
    const trendTotals = displayDates.map(date => {
      return displayAccounts.reduce((s: number, a: any) => s + (a.daily?.[date]?.[activeMetric === 'orders' ? 'orders' : activeMetric === 'netIncome' ? 'netIncome' : activeMetric === 'cost' ? 'cost' : 'profit'] || 0), 0);
    });

    if (trendChartRef.current) trendChartRef.current.destroy();
    trendChartRef.current = new Chart(trendCanvasRef.current, {
      type: 'line',
      data: {
        labels: displayDates.map(d => d.slice(5)),
        datasets: [{
          label: cfg.label,
          data: trendTotals,
          borderColor: cfg.color,
          backgroundColor: cfg.color + '18',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 } } }
        }
      }
    });
    return () => { if (trendChartRef.current) { trendChartRef.current.destroy(); trendChartRef.current = null; } };
  }, [data, displayDates, activeMetric, displayAccounts]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#86868b' }}>
      加载中...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#ff3b30', gap: 12, padding: 24 }}>
      <div>加载失败: {error}</div>
      <button onClick={() => { setLoading(true); setError(''); loadData(); }} style={{ padding: '10px 24px', borderRadius: 20, border: 'none', background: '#0071e3', color: 'white', fontSize: 14 }}>重试</button>
    </div>
  );

  const cfg = METRIC_CONFIG[activeMetric];

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 100, background: '#f5f5f7' }}>
      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e8ed', padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 700, color: '#1d1d1f' }}>抖音数据中心</h1>
            <div style={{ fontSize: 11, color: '#86868b' }}>
              {dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`} · {allAccounts.length} 个账号
            </div>
          </div>
          <a href="/" style={{ padding: '5px 12px', background: '#0071e3', color: 'white', textDecoration: 'none', borderRadius: 980, fontSize: 12, fontWeight: 500 }}>桌面版</a>
        </div>
      </div>

      {/* Metric Cards — 收窄紧凑，4个一排 */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {METRIC_KEYS.map(m => {
          const c = METRIC_CONFIG[m];
          const val = totals[m];
          const isActive = activeMetric === m;
          return (
            <button
              key={m}
              onClick={() => setActiveMetric(m)}
              style={{
                flex: '0 0 calc(25% - 6px)',
                minWidth: 72,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                background: '#ffffff',
                boxShadow: isActive ? `0 4px 12px ${c.color}28` : '0 1px 4px rgba(0,0,0,0.05)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ height: 30, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0' }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#ffffff' }}>{c.icon}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 2px' }}>
                <div style={{ fontSize: 10, color: '#86868b', marginBottom: 1, whiteSpace: 'nowrap' }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', whiteSpace: 'nowrap' }}>{formatValue(val, m)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trend Chart */}
      <div style={{ margin: '0 16px 12px', background: '#ffffff', borderRadius: 14, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 6 }}>{cfg.label}趋势</div>
        <div style={{ height: 140 }}>
          <canvas ref={trendCanvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* Search */}
      <div style={{ margin: '0 16px 10px', position: 'relative' }}>
        <input
          type="text"
          placeholder="搜索账号..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 32px',
            borderRadius: 10,
            border: '1px solid #e8e8ed',
            fontSize: 13,
            background: '#ffffff',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#a1a1a6' }}>🔍</span>
      </div>

      {/* Status Filter + Sort */}
      <div style={{ margin: '0 16px 10px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'normal', label: '正常' },
          { key: 'abnormal', label: '异常' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key as any)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
              background: statusFilter === s.key ? '#34c759' : '#ffffff',
              color: statusFilter === s.key ? 'white' : '#515154',
              fontWeight: statusFilter === s.key ? 600 : 400,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            {s.label}
          </button>
        ))}
        <div style={{ width: 1, background: '#e8e8ed', margin: '2px 4px' }} />
        {[
          { key: 'metric', label: `按${cfg.label}` },
          { key: 'profit', label: '按利润' },
          { key: 'health', label: '按健康度' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => { if (sortKey === s.key) setSortDesc(!sortDesc); else { setSortKey(s.key as any); setSortDesc(true); } }}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
              background: sortKey === s.key ? '#0071e3' : '#ffffff',
              color: sortKey === s.key ? 'white' : '#515154',
              fontWeight: sortKey === s.key ? 600 : 400,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            {s.label} {sortKey === s.key ? (sortDesc ? '↓' : '↑') : ''}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div style={{ margin: '0 16px 8px', fontSize: 11, color: '#86868b' }}>
        共 {sortedAccounts.length} 个账号
      </div>

      {/* Account Cards */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pagedAccounts.map((a: any, i: number) => (
          <div key={a.account} style={{ background: '#ffffff', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#86868b', minWidth: 18 }}>{(page - 1) * pageSize + i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>{a.account}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: a._health?.grade === 'good' ? '#34c759' : a._health?.grade === 'warn' ? '#ff9500' : '#ff3b30' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: a._health?.grade === 'good' ? '#34c759' : a._health?.grade === 'warn' ? '#ff9500' : '#ff3b30' }}>{a._health?.total ?? '-'}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#86868b', marginBottom: 1 }}>单量</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0071e3' }}>{a._orders.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#86868b', marginBottom: 1 }}>净佣金</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#af52de' }}>¥{Math.round(a._netIncome).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#86868b', marginBottom: 1 }}>消耗</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ff9500' }}>¥{Math.round(a._cost).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#86868b', marginBottom: 1 }}>利润</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: a._profit >= 0 ? '#34c759' : '#ff3b30' }}>¥{Math.round(a._profit).toLocaleString()}</div>
              </div>
            </div>
            {/* Daily bars */}
            {displayDates.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 2, alignItems: 'flex-end', height: 28 }}>
                {displayDates.map(d => {
                  const v = a.daily?.[d]?.[activeMetric === 'orders' ? 'orders' : activeMetric === 'netIncome' ? 'netIncome' : activeMetric === 'cost' ? 'cost' : 'profit'] || 0;
                  const maxVal = Math.max(...displayDates.map(dd => a.daily?.[dd]?.[activeMetric === 'orders' ? 'orders' : activeMetric === 'netIncome' ? 'netIncome' : activeMetric === 'cost' ? 'cost' : 'profit'] || 0), 1);
                  const h = Math.max(3, (v / maxVal) * 24);
                  return (
                    <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{ width: '100%', height: h, borderRadius: 2, background: cfg.color, minHeight: 2 }} />
                      <span style={{ fontSize: 7, color: '#a1a1a6' }}>{parseInt(d.slice(8))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ margin: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, border: 'none',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              background: page === 1 ? '#f5f5f7' : '#0071e3', color: page === 1 ? '#a1a1a6' : 'white', fontWeight: 600,
            }}
          >上一页</button>
          <span style={{ fontSize: 13, color: '#515154', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, border: 'none',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              background: page === totalPages ? '#f5f5f7' : '#0071e3', color: page === totalPages ? '#a1a1a6' : 'white', fontWeight: 600,
            }}
          >下一页</button>
        </div>
      )}

      {/* Bottom Date Filter Bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '1px solid #e8e8ed', padding: '6px 10px', display: 'flex', gap: 6, overflowX: 'auto', zIndex: 100, boxShadow: '0 -2px 10px rgba(0,0,0,0.04)' }}>
        {['今日', '昨日', '近7天', '近30天', '本月', '上月'].map(p => (
          <button
            key={p}
            onClick={() => setDatePreset(p)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer',
              background: datePreset === p ? '#0071e3' : '#f5f5f7',
              color: datePreset === p ? 'white' : '#515154',
              fontWeight: datePreset === p ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}
