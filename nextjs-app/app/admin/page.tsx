'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Account { [key: string]: string | number; }
interface FieldDef { id: number; key: string; label: string; show_in_admin: boolean; show_in_dashboard: boolean; is_system: boolean; sort_order: number; }

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: checked ? '#0071e3' : '#d1d1d6', position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
    </button>
  );
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

export default function AdminPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchEditField, setBatchEditField] = useState('');
  const [batchEditValue, setBatchEditValue] = useState('');
  const [batchUpdating, setBatchUpdating] = useState(false);

  // Account filter state
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');

  // Field manager state
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldAdmin, setNewFieldAdmin] = useState(true);
  const [newFieldDash, setNewFieldDash] = useState(false);

  // Data management state
  const [dataTab, setDataTab] = useState<'stats'|'costs'>('stats');
  const [dataDate, setDataDate] = useState('');
  const [dataList, setDataList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [editingData, setEditingData] = useState<any>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Windows scheduled tasks check state
  const [taskCheck, setTaskCheck] = useState<{
    loading: boolean;
    tasks: Array<{ taskName: string; nextRunTime: string; status: string; lastRunTime: string }>;
    error: string;
  }>({
    loading: false,
    tasks: [],
    error: ''
  });

  // Data calendar picker
  const [showDataCalendar, setShowDataCalendar] = useState(false);
  const [dataCalMonth, setDataCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const dataCalendarRef = useRef<HTMLDivElement>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      setAccounts(json.accounts || []);
    } catch (e: any) { setError(e.message); }
  }, []);

  const loadFields = useCallback(async () => {
    try {
      const res = await fetch('/api/account-fields?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      setFields(json.fields || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const checkScheduledTasks = useCallback(async () => {
    setTaskCheck(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const res = await fetch('/api/scheduled-tasks?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTaskCheck({
        loading: false,
        tasks: json.tasks || [],
        error: ''
      });
    } catch (e: any) {
      setTaskCheck({
        loading: false,
        tasks: [],
        error: e.message
      });
    }
  }, []);

  useEffect(() => { loadAccounts(); loadFields(); checkScheduledTasks(); }, [loadAccounts, loadFields, checkScheduledTasks]);

  // Close calendar on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dataCalendarRef.current && !dataCalendarRef.current.contains(e.target as Node)) {
        setShowDataCalendar(false);
      }
    }
    if (showDataCalendar) { document.addEventListener('mousedown', handleClick); }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDataCalendar]);

  const adminFields = fields.filter(f => f.show_in_admin).sort((a, b) => a.sort_order - b.sort_order);
  const allKeys = new Set(fields.map(f => f.key));
  accounts.forEach(a => Object.keys(a).forEach(k => allKeys.add(k)));

  const filterableFields = fields
    .filter(f => !['name','id','created_at'].includes(f.key))
    .map(f => f.key);
  const filterOptions = filterField
    ? Array.from(new Set(accounts.map(a => String(a[filterField] || '')))).filter(v => v).sort()
    : [];

  const filtered = accounts
    .filter(a => {
      if (filterField && filterValue) {
        if (String(a[filterField] || '') !== filterValue) return false;
      }
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return Array.from(allKeys).some(k => String(a[k] || '').toLowerCase().includes(s));
    })
    .sort((a, b) => {
      const ca = String(a.code || '').trim();
      const cb = String(b.code || '').trim();
      if (!ca && !cb) return 0;
      if (!ca) return 1;
      if (!cb) return -1;
      return ca.localeCompare(cb, 'zh-CN');
    });

  const uploadFile = async (api: string, file: File, label: string) => {
    setMessage('');
    // 文件大小检查（Vercel Hobby 限制 4.5MB）
    if (file.size > 4.5 * 1024 * 1024) {
      setMessage(`文件太大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，请拆分成小文件上传（单文件不超过 4MB）`);
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(api, { method: 'POST', body: formData });
      // 检查响应是否为 JSON
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const text = await res.text();
        // 尝试提取有用的错误信息
        const errorHint = text.includes('Entity Too Large') || text.includes('too large')
          ? '文件太大，请拆分成小文件上传'
          : text.includes('timeout') || text.includes('TIMEOUT')
          ? '处理超时，请稍后重试或拆分成小文件'
          : text.length > 200 ? text.slice(0, 200) + '...' : text;
        throw new Error(`上传失败 (${res.status}): ${errorHint}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage(`${label} 上传成功` + (json.updated ? `，更新 ${json.updated} 条` : json.records ? `，共 ${json.records} 条` : ''));
      if (api === '/api/upload-meta') loadAccounts();
    } catch (err: any) { setMessage(err.message); }
  };

  const addField = async () => {
    if (!newFieldKey.trim() || !newFieldLabel.trim()) { setMessage('字段key和名称不能为空'); return; }
    try {
      const res = await fetch('/api/account-fields', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newFieldKey.trim(), label: newFieldLabel.trim(), show_in_admin: newFieldAdmin, show_in_dashboard: newFieldDash })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage('字段添加成功');
      setNewFieldKey(''); setNewFieldLabel(''); setNewFieldAdmin(true); setNewFieldDash(false);
      loadFields();
    } catch (e: any) { setMessage(e.message); }
  };

  const updateField = async (id: number, patch: Partial<FieldDef>) => {
    try {
      const res = await fetch(`/api/account-fields/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      loadFields();
    } catch (e: any) { setMessage(e.message); }
  };

  const deleteField = async (id: number) => {
    if (!confirm('确定删除该字段吗？数据不会丢失，但不再显示。')) return;
    try {
      const res = await fetch(`/api/account-fields/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage('字段删除成功');
      loadFields();
    } catch (e: any) { setMessage(e.message); }
  };

  const moveField = async (field: FieldDef, direction: -1 | 1) => {
    const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(f => f.id === field.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await updateField(field.id, { sort_order: other.sort_order });
    await updateField(other.id, { sort_order: field.sort_order });
    loadFields();
  };

  const saveAccount = async (formData: Record<string, string>) => {
    if (!formData.name?.trim()) { setMessage('账号名称不能为空'); return; }
    try {
      const url = editingAccount ? '/api/accounts/' + encodeURIComponent(String(editingAccount.name)) : '/api/accounts';
      const res = await fetch(url, { method: editingAccount ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage(editingAccount ? '修改成功' : '新增成功');
      setModalOpen(false);
      loadAccounts();
    } catch (e: any) { setMessage(e.message); }
  };

  const removeAccount = async (name: string) => {
    if (!confirm('确定删除账号 "' + name + '" 吗？')) return;
    try {
      const res = await fetch('/api/accounts/' + encodeURIComponent(name), { method: 'DELETE' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage('删除成功');
      loadAccounts();
    } catch (e: any) { setMessage(e.message); }
  };

  const batchRemoveAccounts = async () => {
    if (selectedAccounts.size === 0) { setMessage('请先选择要删除的账号'); return; }
    if (!confirm(`确定删除选中的 ${selectedAccounts.size} 个账号？`)) return;
    let success = 0, fail = 0;
    for (const name of selectedAccounts) {
      try {
        const res = await fetch('/api/accounts/' + encodeURIComponent(name), { method: 'DELETE' });
        const json = await res.json();
        if (json.error) { fail++; continue; }
        success++;
      } catch { fail++; }
    }
    setMessage(`删除完成：成功 ${success} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`);
    setSelectedAccounts(new Set());
    loadAccounts();
  };

  const batchUpdateAccounts = async () => {
    if (selectedAccounts.size === 0) { setMessage('请先选择要编辑的账号'); return; }
    if (!batchEditField) { setMessage('请选择要修改的字段'); return; }
    setBatchUpdating(true);
    let success = 0, fail = 0;
    for (const name of selectedAccounts) {
      try {
        const acc = accounts.find((a: any) => String(a.name) === name);
        if (!acc) { fail++; continue; }
        const updateData: Record<string, string> = {};
        Object.keys(acc).forEach(k => { updateData[k] = String(acc[k] || ''); });
        updateData[batchEditField] = batchEditValue;
        const res = await fetch('/api/accounts/' + encodeURIComponent(name), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData)
        });
        const json = await res.json();
        if (json.error) { fail++; continue; }
        success++;
      } catch { fail++; }
    }
    setBatchUpdating(false);
    setMessage(`批量更新完成：成功 ${success} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`);
    setBatchEditOpen(false);
    setBatchEditField('');
    setBatchEditValue('');
    setSelectedAccounts(new Set());
    loadAccounts();
  };

  const getLabel = (key: string) => fields.find(f => f.key === key)?.label || key;

  const loadData = async (tab: 'stats'|'costs', date: string) => {
    if (!date) return;
    setDataLoading(true); setDataMsg(''); setSelectedKeys(new Set());
    try {
      const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
      const res = await fetch(`${api}?date=${date}&t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const raw = tab === 'stats' ? json.stats : json.costs;
      // Sort by account code to match account list order
      const sorted = [...raw].sort((a: any, b: any) => {
        const getCode = (name: string) => {
          const acc = accounts.find((ac: any) => String(ac.name || '') === name);
          return String(acc?.code || '').trim();
        };
        const ca = getCode(a.account_name);
        const cb = getCode(b.account_name);
        if (!ca && !cb) return String(a.account_name).localeCompare(String(b.account_name), 'zh-CN');
        if (!ca) return 1;
        if (!cb) return -1;
        return ca.localeCompare(cb, 'zh-CN');
      });
      setDataList(sorted);
    } catch (e: any) { setDataMsg(e.message); }
    finally { setDataLoading(false); }
  };

  const saveData = async (tab: 'stats'|'costs', item: any) => {
    setDataMsg('');
    try {
      const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
      const res = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDataMsg('更新成功'); setEditingData(null); loadData(tab, dataDate);
    } catch (e: any) { setDataMsg(e.message); }
  };

  const removeData = async (tab: 'stats'|'costs', account_name: string, date: string) => {
    if (!confirm(`确定删除 ${account_name} ${date} 的数据？`)) return;
    setDataMsg('');
    try {
      const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
      const res = await fetch(`${api}?account_name=${encodeURIComponent(account_name)}&date=${date}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDataMsg('删除成功'); loadData(tab, dataDate);
    } catch (e: any) { setDataMsg(e.message); }
  };

  const batchDeleteData = async (tab: 'stats'|'costs') => {
    if (selectedKeys.size === 0) { setDataMsg('请先选择要删除的数据'); return; }
    if (!confirm(`确定批量删除选中的 ${selectedKeys.size} 条数据吗？`)) return;
    setDataMsg('');
    let success = 0, fail = 0;
    for (const key of Array.from(selectedKeys)) {
      const [account_name, date] = key.split('|');
      try {
        const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
        const res = await fetch(`${api}?account_name=${encodeURIComponent(account_name)}&date=${date}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        success++;
      } catch (e) { fail++; }
    }
    setDataMsg(`删除完成：成功 ${success} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`);
    setSelectedKeys(new Set());
    loadData(tab, dataDate);
  };

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: '#ffffff', color: '#1d1d1f', padding: '24px', borderBottom: '1px solid #e8e8ed' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, margin: '0 0 4px', fontWeight: 700, letterSpacing: '-0.02em' }}>账号管理后台</h1>
            <div style={{ fontSize: 13, color: '#86868b' }}>共 {accounts.length} 个账号 | {fields.length} 个字段</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => document.getElementById('data-manager')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#0071e3'; (e.target as HTMLButtonElement).style.color = 'white'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'white'; (e.target as HTMLButtonElement).style.color = '#0071e3'; }}
            >📊 数据管理</button>
            <a href="/"
              style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s', display: 'inline-block' }}
              onMouseEnter={e => { (e.target as HTMLAnchorElement).style.background = '#0071e3'; (e.target as HTMLAnchorElement).style.color = 'white'; }}
              onMouseLeave={e => { (e.target as HTMLAnchorElement).style.background = 'white'; (e.target as HTMLAnchorElement).style.color = '#0071e3'; }}
            >← 返回看板</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
        {/* Upload Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[
            { title: '📦 上传订单数据', desc: '精选订单Excel，按天聚合', api: '/api/upload' },
            { title: '🔥 上传消耗数据', desc: '消耗Excel（账号名+日期列+金额）', api: '/api/upload-cost' },
            { title: '📋 上传账号基础信息', desc: '批量更新类型、选品人等', api: '/api/upload-meta' },
          ].map(card => (
            <div key={card.api} style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#1d1d1f' }}>{card.title}</div>
              <div style={{ fontSize: 12, color: '#86868b', marginBottom: 16 }}>{card.desc}</div>
              <label style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 10, background: '#f5f5f7', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e8e8ed' }}>
                选择文件
                <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(card.api, f, card.title); e.target.value = ''; }} />
              </label>
            </div>
          ))}
        </div>

        {/* Windows Scheduled Tasks Check */}
        <div style={{ background: 'white', borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1d1d1f' }}>⏰ 系统定时任务检查</h2>
            <button
              onClick={checkScheduledTasks}
              disabled={taskCheck.loading}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: taskCheck.loading ? '#94a3b8' : '#0071e3',
                color: 'white', fontSize: 13, fontWeight: 600, cursor: taskCheck.loading ? 'not-allowed' : 'pointer'
              }}
            >
              {taskCheck.loading ? '检查中...' : '🔄 刷新检查'}
            </button>
          </div>

          {taskCheck.error && (
            <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              ⚠️ {taskCheck.error}
            </div>
          )}

          {taskCheck.tasks.length === 0 && !taskCheck.loading && !taskCheck.error && (
            <div style={{ padding: 20, textAlign: 'center', color: '#86868b', fontSize: 13 }}>
              未检测到定时任务
            </div>
          )}

          {taskCheck.tasks.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f7' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>任务名称</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>状态</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>上次运行</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>下次运行</th>
                  </tr>
                </thead>
                <tbody>
                  {taskCheck.tasks.map((task, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500, color: '#1d1d1f' }}>{task.taskName}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: task.status === 'Ready' || task.status === '就绪' ? '#f0fdf4' : task.status === 'Running' || task.status === '正在运行' ? '#eff6ff' : '#fef2f2',
                          color: task.status === 'Ready' || task.status === '就绪' ? '#16a34a' : task.status === 'Running' || task.status === '正在运行' ? '#2563eb' : '#dc2626'
                        }}>
                          {task.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{task.lastRunTime}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{task.nextRunTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Field Manager */}
        <div style={{ background: 'white', borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#1d1d1f' }}>🔧 字段管理</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>字段key（英文）</label>
              <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} placeholder="如：group" style={{ display: 'block', marginTop: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, width: 140 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>显示名称</label>
              <input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="如：分组" style={{ display: 'block', marginTop: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, width: 140 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>管理后台</label>
              <ToggleSwitch checked={newFieldAdmin} onChange={() => setNewFieldAdmin(v => !v)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>看板显示</label>
              <ToggleSwitch checked={newFieldDash} onChange={() => setNewFieldDash(v => !v)} />
            </div>
            <button onClick={addField} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#0071e3', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 添加字段</button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f7' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>字段key</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>显示名称</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>管理后台</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>看板显示</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: 100 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {fields.sort((a, b) => a.sort_order - b.sort_order).map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#64748b' }}>{f.key}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input
                      defaultValue={f.label}
                      onBlur={e => { if (e.target.value !== f.label) updateField(f.id, { label: e.target.value }); }}
                      style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 13, width: 120 }}
                    />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <ToggleSwitch checked={f.show_in_admin} onChange={() => updateField(f.id, { show_in_admin: !f.show_in_admin })} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <ToggleSwitch checked={f.show_in_dashboard} onChange={() => updateField(f.id, { show_in_dashboard: !f.show_in_dashboard })} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button onClick={() => moveField(f, -1)} disabled={f.sort_order <= 1} style={{ padding: '2px 6px', fontSize: 11, marginRight: 4 }}>↑</button>
                    <button onClick={() => moveField(f, 1)} style={{ padding: '2px 6px', fontSize: 11, marginRight: 4 }}>↓</button>
                    <button
                      onClick={() => f.is_system ? alert('系统字段不能删除') : deleteField(f.id)}
                      style={{
                        padding: '2px 6px', fontSize: 11,
                        color: f.is_system ? '#94a3b8' : '#dc2626',
                        border: f.is_system ? '1px solid #e2e8f0' : '1px solid #fecaca',
                        background: f.is_system ? '#f8fafc' : '#fef2f2',
                        borderRadius: 4, cursor: f.is_system ? 'not-allowed' : 'pointer'
                      }}
                    >删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {message && (
          <div style={{ background: '#fff9c4', border: '1px solid #f9a825', borderRadius: 12, padding: '12px 18px', marginBottom: 16, fontSize: 13, color: '#8a6d0b' }}>{message}</div>
        )}

        {/* Account Toolbar */}
        <div style={{ background: 'white', borderRadius: 20, padding: 20, marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="搜索账号..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e8ed', fontSize: 14, background: '#f5f5f7' }} />
            <select value={filterField} onChange={e => { setFilterField(e.target.value); setFilterValue(''); }}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e8ed', fontSize: 13, minWidth: 100, background: 'white' }}>
              <option value="">筛选字段</option>
              {filterableFields.map(key => {
                const label = fields.find(f => f.key === key)?.label || key;
                return <option key={key} value={key}>{label}</option>;
              })}
            </select>
            {filterField && (
              <select value={filterValue} onChange={e => setFilterValue(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e8ed', fontSize: 13, minWidth: 100, background: 'white' }}>
                <option value="">全部</option>
                {filterOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {(filterField || filterValue) && (
              <button onClick={() => { setFilterField(''); setFilterValue(''); }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e8ed', background: '#f5f5f7', color: '#515154', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                清除筛选
              </button>
            )}
            {selectedAccounts.size > 0 && (
              <>
                <button onClick={() => setBatchEditOpen(!batchEditOpen)}
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  批量编辑 ({selectedAccounts.size})
                </button>
                <button onClick={batchRemoveAccounts}
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#ff3b30', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  批量删除
                </button>
              </>
            )}
            <button onClick={() => { setEditingAccount(null); setModalOpen(true); }} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#0071e3', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ 新增账号</button>
          </div>
          {batchEditOpen && selectedAccounts.size > 0 && (
            <div style={{ marginTop: 14, padding: 14, background: '#f5f5f7', borderRadius: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={batchEditField} onChange={e => setBatchEditField(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e8ed', fontSize: 13, minWidth: 120 }}>
                <option value="">选择字段...</option>
                {fields.filter(f => !['name','id','created_at'].includes(f.key)).map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <input type="text" value={batchEditValue} onChange={e => setBatchEditValue(e.target.value)}
                placeholder="新值" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e8ed', fontSize: 13, minWidth: 140 }} />
              <button onClick={batchUpdateAccounts} disabled={batchUpdating}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: batchUpdating ? '#94a3b8' : '#0071e3', color: 'white', fontSize: 13, fontWeight: 600, cursor: batchUpdating ? 'not-allowed' : 'pointer' }}>
                {batchUpdating ? '更新中...' : '确认更新'}
              </button>
              <button onClick={() => { setBatchEditOpen(false); setBatchEditField(''); setBatchEditValue(''); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e8e8ed', background: 'white', color: '#515154', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                取消
              </button>
            </div>
          )}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div> :
         error ? <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>错误: {error}</div> : (
          <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.04)', overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f5f5f7' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 40 }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every((a: any) => selectedAccounts.has(String(a.name)))}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedAccounts(prev => {
                            const next = new Set(prev);
                            filtered.forEach((a: any) => next.add(String(a.name)));
                            return next;
                          });
                        } else {
                          setSelectedAccounts(prev => {
                            const next = new Set(prev);
                            filtered.forEach((a: any) => next.delete(String(a.name)));
                            return next;
                          });
                        }
                      }}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                  </th>
                  {adminFields.map(f => (
                    <th key={f.key} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{f.label}</th>
                  ))}
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 100, whiteSpace: 'nowrap' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(acc => (
                  <tr key={acc.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <input type="checkbox"
                        checked={selectedAccounts.has(String(acc.name))}
                        onChange={e => {
                          const name = String(acc.name);
                          setSelectedAccounts(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(name);
                            else next.delete(name);
                            return next;
                          });
                        }}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                    {adminFields.map(f => (
                      <td key={f.key} style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {f.key === 'account_type'
                          ? <span style={{ padding: '2px 10px', borderRadius: 12, background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500 }}>{acc[f.key] || '-'}</span>
                          : (acc[f.key] || '-')}
                      </td>
                    ))}
                    <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setEditingAccount(acc); setModalOpen(true); }} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #e8e8ed', background: 'white', fontSize: 12, cursor: 'pointer', marginRight: 6, color: '#0071e3' }}>编辑</button>
                      <button onClick={() => removeAccount(String(acc.name))} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#ff3b30', fontSize: 12, cursor: 'pointer' }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>没有找到匹配的账号</div>}
          </div>
        )}
        {/* Data Manager */}
        <div id="data-manager" style={{ background: 'white', borderRadius: 20, padding: 24, marginTop: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1d1d1f' }}>📊 数据管理</h2>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e8ed', background: '#f5f5f7', color: '#515154', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            ↑ 返回顶部
          </button>
        </div>

        {/* Tab Switch */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { key: 'stats' as const, label: '订单数据' },
            { key: 'costs' as const, label: '消耗数据' },
          ].map(t => (
            <button key={t.key} onClick={() => { setDataTab(t.key); setDataList([]); setDataMsg(''); }}
              style={{ padding: '8px 18px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: dataTab === t.key ? '#0071e3' : '#f5f5f7', color: dataTab === t.key ? 'white' : '#1d1d1f' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Date picker + query */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div ref={dataCalendarRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowDataCalendar(!showDataCalendar)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e8ed', fontSize: 14, background: 'white', cursor: 'pointer', minWidth: 120, textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 6, color: dataDate ? '#1d1d1f' : '#86868b' }}>
              {dataDate || '选择日期'} <span style={{ fontSize: 14 }}>📅</span>
            </button>
            {showDataCalendar && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 100, background: 'white', padding: 16, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: 280, border: '1px solid #f1f5f9', userSelect: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <button onClick={(e) => { e.stopPropagation(); setDataCalMonth(new Date(dataCalMonth.getFullYear(), dataCalMonth.getMonth() - 1)); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', padding: '4px 10px', borderRadius: 6 }}>‹</button>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{dataCalMonth.getFullYear()}年{dataCalMonth.getMonth() + 1}月</span>
                  <button onClick={(e) => { e.stopPropagation(); setDataCalMonth(new Date(dataCalMonth.getFullYear(), dataCalMonth.getMonth() + 1)); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', padding: '4px 10px', borderRadius: 6 }}>›</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
                  {['一','二','三','四','五','六','日'].map(w => (
                    <div key={w} style={{ textAlign: 'center', fontSize: 12, color: '#999', padding: '4px 0', fontWeight: 500 }}>{w}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                  {getCalendarDays(dataCalMonth.getFullYear(), dataCalMonth.getMonth()).map((cell, idx) => {
                    const today = new Date();
                    const isToday = sameDay(cell.date, today);
                    const isSelected = dataDate && sameDay(cell.date, new Date(dataDate + 'T00:00:00'));
                    let bg = 'transparent';
                    let color = cell.current ? '#1d1d1f' : '#c5c5c7';
                    if (isSelected) { bg = '#0071e3'; color = 'white'; }
                    return (
                      <div
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setDataDate(fmtYMD(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate())); setShowDataCalendar(false); }}
                        style={{ textAlign: 'center', padding: '6px 0', fontSize: 13, cursor: 'pointer', borderRadius: 4, background: bg, color, fontWeight: isToday ? 700 : 400, position: 'relative' }}
                      >
                        {cell.date.getDate()}
                        {isToday && !isSelected && (
                          <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#0071e3' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => loadData(dataTab, dataDate)}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#0071e3', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            查询
          </button>
          {dataList.length > 0 && (
            <button onClick={() => batchDeleteData(dataTab)}
              style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #fecaca', background: selectedKeys.size > 0 ? '#fef2f2' : '#f5f5f7', color: selectedKeys.size > 0 ? '#ff3b30' : '#86868b', fontSize: 13, fontWeight: 600, cursor: selectedKeys.size > 0 ? 'pointer' : 'not-allowed' }}>
              批量删除 {selectedKeys.size > 0 ? `(${selectedKeys.size})` : ''}
            </button>
          )}
          {dataMsg && <span style={{ fontSize: 13, color: dataMsg.includes('成功') ? '#34c759' : '#ff3b30' }}>{dataMsg}</span>}
        </div>

        {dataLoading ? <div style={{ textAlign: 'center', padding: 30, color: '#86868b' }}>加载中...</div> : (
          dataList.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f7' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed', width: 40 }}>
                      <input type="checkbox" checked={dataList.length > 0 && selectedKeys.size === dataList.length} onChange={e => {
                        if (e.target.checked) {
                          const all = new Set<string>();
                          dataList.forEach((item: any) => all.add(`${item.account_name}|${item.date}`));
                          setSelectedKeys(all);
                        } else {
                          setSelectedKeys(new Set());
                        }
                      }} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>账号</th>
                    {dataTab === 'stats' && (
                      <>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>单量</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>净佣金</th>
                      </>
                    )}
                    {dataTab === 'costs' && (
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>消耗</th>
                    )}
                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed', width: 140 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dataList.map((item, idx) => {
                    const isEdit = editingData && editingData.account_name === item.account_name && editingData.date === item.date;
                    return (
                      <tr key={item.account_name + item.date} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedKeys.has(`${item.account_name}|${item.date}`)} onChange={e => {
                            const key = `${item.account_name}|${item.date}`;
                            const next = new Set(selectedKeys);
                            if (e.target.checked) next.add(key); else next.delete(key);
                            setSelectedKeys(next);
                          }} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{item.account_name}</td>
                        {dataTab === 'stats' && (
                          <>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {isEdit ? (
                                <input type="number" value={editingData.orders} onChange={e => setEditingData({...editingData, orders: e.target.value})}
                                  style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8e8ed', fontSize: 13 }} />
                              ) : item.orders}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {isEdit ? (
                                <input type="number" step="0.01" value={editingData.net_income} onChange={e => setEditingData({...editingData, net_income: e.target.value})}
                                  style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8e8ed', fontSize: 13 }} />
                              ) : item.net_income}
                            </td>
                          </>
                        )}
                        {dataTab === 'costs' && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {isEdit ? (
                              <input type="number" step="0.01" value={editingData.cost} onChange={e => setEditingData({...editingData, cost: e.target.value})}
                                style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8e8ed', fontSize: 13 }} />
                            ) : item.cost}
                          </td>
                        )}
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {isEdit ? (
                            <>
                              <button onClick={() => saveData(dataTab, editingData)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#0071e3', color: 'white', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>保存</button>
                              <button onClick={() => setEditingData(null)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #e8e8ed', background: 'white', fontSize: 11, cursor: 'pointer' }}>取消</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingData({...item})} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #e8e8ed', background: 'white', fontSize: 11, cursor: 'pointer', marginRight: 4, color: '#0071e3' }}>编辑</button>
                              <button onClick={() => removeData(dataTab, item.account_name, item.date)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#ff3b30', fontSize: 11, cursor: 'pointer' }}>删除</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : dataDate ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#86868b', fontSize: 13 }}>该日期暂无数据</div>
          ) : null
        )}
      </div>

      {/* Edit Modal */}
      {modalOpen && (
        <EditModal account={editingAccount} fields={fields} getLabel={getLabel} onSave={saveAccount} onClose={() => setModalOpen(false)} />
      )}
    </div>
  </div>
  );
}

function EditModal({ account, fields, getLabel, onSave, onClose }: {
  account: Account | null; fields: FieldDef[]; getLabel: (k: string) => string;
  onSave: (data: Record<string, string>) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = account ? String(account[f.key] || '') : ''; });
    // Also include any extra keys from account
    if (account) Object.keys(account).forEach(k => { if (!(k in init)) init[k] = String(account[k] || ''); });
    setForm(init);
  }, [account, fields]);

  const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: 480, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>{account ? '编辑账号' : '新增账号'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ordered.map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                {f.label} {f.key === 'name' ? '*' : ''}
              </label>
              {f.key === 'remark' ? (
                <textarea value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
              ) : (
                <input type="text" value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', background: 'white' }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={() => onSave(form)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0071e3', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>保存</button>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e8e8ed', background: 'white', fontSize: 14, cursor: 'pointer', color: '#1d1d1f' }}>取消</button>
        </div>
      </div>
    </div>
  );
}
