'use client';
import { useState, useEffect, useCallback } from 'react';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>错误: {error}</div>;
  if (!data) return null;

  const accounts = data.accounts || [];
  const dates = data.dates || [];
  const totOrders = accounts.reduce((s: number, a: any) => s + (a.totalOrders || 0), 0);
  const totNetIncome = accounts.reduce((s: number, a: any) => s + (a.totalNetIncome || 0), 0);
  const totCost = accounts.reduce((s: number, a: any) => s + (a.totalCost || 0), 0);
  const totProfit = accounts.reduce((s: number, a: any) => s + (a.totalProfit || 0), 0);

  const stats = [
    { label: '单量', value: totOrders.toLocaleString(), color: '#4f46e5', icon: '📦' },
    { label: '有效净佣金', value: '¥' + Math.round(totNetIncome).toLocaleString(), color: '#10b981', icon: '💰' },
    { label: '消耗', value: '¥' + Math.round(totCost).toLocaleString(), color: '#f59e0b', icon: '🔥' },
    { label: '利润', value: '¥' + Math.round(totProfit).toLocaleString(), color: totProfit >= 0 ? '#06b6d4' : '#ef4444', icon: '📈' }
  ];

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', color: 'white', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, margin: '0 0 8px', fontWeight: 800 }}>抖音账号数据中心</h1>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            📅 {dates[0]} 至 {dates[dates.length - 1]} | 📊 {accounts.length} 个账号
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 28 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: s.color }} />
              <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 8 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1f2937' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>📋 账号明细</span>
            <a href="/admin" style={{ padding: '8px 16px', background: '#0f172a', color: 'white', textDecoration: 'none', borderRadius: 8, fontSize: 14 }}>⚙️ 管理后台</a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['排名','账号','选品人','状态','类型','单量','净佣金','消耗','利润','日均'].map(h => (
                    <th key={h} style={{ padding: '12px 10px', textAlign: h === '账号' ? 'left' : 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a: any, i: number) => (
                  <tr key={a.account} style={{ transition: 'background 0.12s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b' }}>{i + 1}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#0f172a' }}>{a.account}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{a.metaBuyer || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>{a.metaStatus ? <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>{a.metaStatus}</span> : '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{a.metaType || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#4f46e5' }}>{(a.totalOrders || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#10b981' }}>¥{Math.round(a.totalNetIncome || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#f59e0b' }}>¥{Math.round(a.totalCost || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: (a.totalProfit || 0) >= 0 ? '#06b6d4' : '#ef4444' }}>¥{Math.round(a.totalProfit || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{(a.avgDaily || 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>
          抖音账号数据中心 | 数据已过滤退款/退货订单 | 净佣金已扣除10%平台技术服务费
        </div>
      </div>
    </div>
  );
}
