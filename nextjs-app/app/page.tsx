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
  const totO = accounts.reduce((s: number, a: any) => s + (a.totalOrders || 0), 0);
  const totI = accounts.reduce((s: number, a: any) => s + (a.totalIncome || 0), 0);

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)', color: 'white', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>抖音账号数据中心</h1>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            📅 数据周期: {dates[0]} 至 {dates[dates.length - 1]} | 📊 {accounts.length} 个账号
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 28 }}>
          {[
            { label: '总订单量', value: totO.toLocaleString() },
            { label: '总收入', value: '¥' + Math.round(totI).toLocaleString() },
            { label: '日均订单', value: (totO / accounts.length / dates.length).toFixed(1) },
            { label: 'TOP 1', value: accounts[0]?.totalOrders?.toLocaleString() || 0, sub: accounts[0]?.account }
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', padding: 24, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1f2937' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>{s.sub}</div>}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: ['#4f46e5','#10b981','#f59e0b','#ef4444'][i] }} />
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>📋 账号明细</span>
            <a href="/admin" style={{ padding: '8px 16px', background: '#4f46e5', color: 'white', textDecoration: 'none', borderRadius: 8, fontSize: 14 }}>⚙️ 管理后台</a>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>#</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>账号</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>选品人</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>状态</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>账号类型</th>
                  <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>订单量</th>
                  <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>收入</th>
                  <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>日均</th>
                  {dates.map(d => (
                    <th key={d} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0 }}>{d.slice(5).replace('-', '/')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a: any, i: number) => (
                  <tr key={a.account} style={{ transition: 'background 0.12s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#1f2937' }}>{a.account}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>{a.metaBuyer || '-'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>{a.metaStatus ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{a.metaStatus}</span> : '-'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>{a.metaType || '-'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>{(a.totalOrders || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>¥{Math.round(a.totalIncome || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{(a.avgDaily || 0).toFixed(1)}</td>
                    {dates.map(d => {
                      const v = a.daily?.[d] || 0;
                      return (
                        <td key={d} style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{v}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
          抖音账号数据中心 | 数据来源: 精选订单
        </div>
      </div>
    </div>
  );
}
