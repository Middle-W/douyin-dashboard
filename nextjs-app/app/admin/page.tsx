'use client';
import { useState, useEffect, useCallback } from 'react';

export default function AdminPage() {
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [costFile, setCostFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const loadAccounts = useCallback(async () => {
    try { const res = await fetch('/api/accounts'); const data = await res.json(); setAccounts(data); }
    catch { showToast('加载账号失败'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const uploadOrders = async () => {
    if (!orderFile) return;
    setUploading(true);
    const fd = new FormData(); fd.append('file', orderFile);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { setResult(data); showToast(`上传成功: ${data.accounts}个账号, 过滤${data.skippedRefund}笔退款`); loadAccounts(); }
      else showToast(data.error || '上传失败');
    } catch { showToast('上传出错'); } finally { setUploading(false); }
  };

  const uploadCosts = async () => {
    if (!costFile) return;
    setUploading(true);
    const fd = new FormData(); fd.append('file', costFile);
    try {
      const res = await fetch('/api/upload-cost', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { showToast(`消耗上传成功: ${data.accounts}个账号, ${data.records}条记录`); }
      else showToast(data.error || '上传失败');
    } catch { showToast('上传出错'); } finally { setUploading(false); }
  };

  const updateAccount = async (name: string, field: string, value: string) => {
    try {
      const res = await fetch('/api/accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, [field]: value }) });
      if (res.ok) showToast('保存成功');
    } catch { showToast('保存失败'); }
  };

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', color: 'white', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 800 }}>⚙️ 数据管理中心</h1>
          <a href="/" style={{ color: 'white', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8 }}>📊 返回看板</a>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {/* Order Upload */}
        <div style={{ background: 'white', padding: 24, borderRadius: 16, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700 }}>📦 上传精选订单 Excel</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>系统会自动过滤退款/退货订单，并扣除10%平台技术服务费计算净佣金</p>
          <input type="file" accept=".xlsx" onChange={e => setOrderFile(e.target.files?.[0] || null)} />
          <button onClick={uploadOrders} disabled={!orderFile || uploading} style={{ marginLeft: 12, padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {uploading ? '上传中...' : '解析并入库'}
          </button>
          {result && (
            <div style={{ marginTop: 16, padding: 16, background: '#f0fdf4', borderRadius: 10, fontSize: 14, color: '#166534' }}>
              <strong>✅ 解析成功</strong><br/>
              账号: {result.accounts} | 日期范围: {result.dateFrom} ~ {result.dateTo}<br/>
              已过滤退款订单: {result.skippedRefund} 笔
            </div>
          )}
        </div>

        {/* Cost Upload */}
        <div style={{ background: 'white', padding: 24, borderRadius: 16, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700 }}>🔥 上传消耗数据 Excel</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>格式：第一列账号名称，后面各列为日期（支持Excel日期格式或YYYY-MM-DD）</p>
          <input type="file" accept=".xlsx" onChange={e => setCostFile(e.target.files?.[0] || null)} />
          <button onClick={uploadCosts} disabled={!costFile || uploading} style={{ marginLeft: 12, padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {uploading ? '上传中...' : '上传消耗'}
          </button>
        </div>

        {/* Accounts Table */}
        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700 }}>📝 账号备注信息 ({accounts.length})</h2>
          {loading ? <p>加载中...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['账号','选品人','状态','账号类型'].map(h => (
                    <th key={h} style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.name}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{acc.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}><input defaultValue={acc.buyer || ''} onBlur={e => updateAccount(acc.name, 'buyer', e.target.value)} style={{ padding: 4, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13 }} /></td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}><input defaultValue={acc.status || ''} onBlur={e => updateAccount(acc.name, 'status', e.target.value)} style={{ padding: 4, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13 }} /></td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}><input defaultValue={acc.account_type || ''} onBlur={e => updateAccount(acc.name, 'account_type', e.target.value)} style={{ padding: 4, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: 10, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}
