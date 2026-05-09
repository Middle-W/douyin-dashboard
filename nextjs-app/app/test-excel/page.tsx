'use client';
import { useState } from 'react';

export default function TestExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const test = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/test-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error + '\nRaw headers: ' + (data.rawHeaders || 'N/A'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1>Excel 诊断工具</h1>
      <p style={{ color: '#666' }}>上传Excel文件，预览解析结果（不写入数据库）</p>
      
      <div style={{ marginTop: 20 }}>
        <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button onClick={test} disabled={!file || loading} style={{ marginLeft: 12, padding: '8px 16px' }}>
          {loading ? '解析中...' : '测试解析'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>解析结果</h3>
            <p><b>文件名:</b> {result.fileName}</p>
            <p><b>Sheet数:</b> {result.sheetNames.join(', ')}</p>
            <p><b>总行数:</b> {result.totalRowsInFile}</p>
            <p><b>有效行数:</b> {result.totalRows} (跳过空行: {result.skippedEmpty}, 退款: {result.skippedRefund})</p>
            <p><b>有效日期数:</b> {result.validDates}</p>
            <p><b>日期范围:</b> {result.dateFrom} ~ {result.dateTo}</p>
            <p><b>所有日期:</b> {result.dateRange.join(', ')}</p>
            {result.badDates.length > 0 && (
              <p style={{ color: 'red' }}><b>解析失败的日期:</b> {JSON.stringify(result.badDates)}</p>
            )}
          </div>

          <h3>前5行预览</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>行号</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>账号</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>原始时间</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>类型</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>解析日期</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>收入</th>
                <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {result.preview.map((p: any) => (
                <tr key={p.row}>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{p.row}</td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{p.accountRaw}</td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{String(p.payTimeRaw)}</td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{p.payTimeType}</td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0', fontWeight: 'bold', color: p.parsedDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? 'green' : 'red' }}>
                    {p.parsedDate}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{p.income}</td>
                  <td style={{ padding: 8, border: '1px solid #e2e8f0' }}>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
