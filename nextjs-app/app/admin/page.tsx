'use client';
import { useState, useEffect, useCallback } from 'react';

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      setAccounts(data);
    } catch {
      showToast('加载账号失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadResult(data);
        showToast(`上传成功: ${data.accounts} 个账号`);
        loadAccounts();
      } else {
        showToast(data.error || '上传失败');
      }
    } catch {
      showToast('上传出错');
    } finally {
      setUploading(false);
    }
  };

  const updateAccount = async (name: string, field: string, value: string) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, [field]: value })
      });
      if (res.ok) showToast('保存成功');
    } catch {
      showToast('保存失败');
    }
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)', color: 'white', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>⚙️ 数据管理中心</h1>
          <a href="/" style={{ color: 'white', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8 }}>📊 返回看板</a>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {/* Upload */}
        <div style={{ background: 'white', padding: 24, borderRadius: 14, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>📁 上传精选订单 Excel</h2>
          <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{ marginLeft: 12, padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {uploading ? '上传中...' : '解析并入库'}
          </button>
          {uploadResult && (
            <div style={{ marginTop: 16, padding: 16, background: '#f9fafb', borderRadius: 10, fontSize: 14 }}>
              <strong>解析成功</strong><br/>
              账号: {uploadResult.accounts} | 日期: {uploadResult.dateFrom} ~ {uploadResult.dateTo}
            </div>
          )}
        </div>

        {/* Accounts Table */}
        <div style={{ background: 'white', padding: 24, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>📝 账号备注信息 ({accounts.length})</h2>
          {loading ? <p>加载中...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>账号</th>
                    <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>选品人</th>
                    <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>状态</th>
                    <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>账号类型</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.name}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{acc.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>
                        <input defaultValue={acc.buyer || ''} onBlur={e => updateAccount(acc.name, 'buyer', e.target.value)} style={{ padding: 4, border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>
                        <input defaultValue={acc.status || ''} onBlur={e => updateAccount(acc.name, 'status', e.target.value)} style={{ padding: 4, border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>
                        <input defaultValue={acc.account_type || ''} onBlur={e => updateAccount(acc.name, 'account_type', e.target.value)} style={{ padding: 4, border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1f2937', color: 'white', padding: '12px 20px', borderRadius: 10, zIndex: 9999 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
