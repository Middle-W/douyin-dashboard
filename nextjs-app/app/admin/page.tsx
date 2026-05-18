'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Account { [key: string]: any; metadata?: Record<string, string>; }
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

function extractId(detail: string): string {
  if (!detail) return '';
  // 提取户ID (10位以上数字)
  const uidMatch = detail.match(/户ID[：:\s]*(\d{10,})/);
  if (uidMatch) return uidMatch[1];
  // 提取UID (18-20位数字)
  const uidMatch2 = detail.match(/UID[：:\s]*(\d{18,20})/);
  if (uidMatch2) return uidMatch2[1];
  // 兜底：提取任意10位以上连续数字
  const genericMatch = detail.match(/(\d{10,})/);
  if (genericMatch) return genericMatch[1];
  return '';
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

  // 账号列表分页
  const PAGE_SIZE_OPTIONS = [20, 40, 80, 120, 200];
  const [pageSize, setPageSize] = useState(20);
  const [pageNum, setPageNum] = useState(1);
  useEffect(() => { setPageNum(1); }, [pageSize, search, filterField, filterValue]);

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

  // Pending errors state
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');
  const [pendingDetail, setPendingDetail] = useState<any>(null);
  const [pendingDetailOpen, setPendingDetailOpen] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, any>>({});
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());

  // Data calendar picker
  const [showDataCalendar, setShowDataCalendar] = useState(false);
  const [dataCalMonth, setDataCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const dataCalendarRef = useRef<HTMLDivElement>(null);

  // Upload preview
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ api: string; file: File; label: string } | null>(null);

  const [datesLoading, setDatesLoading] = useState(false);

  const loadAvailableDates = async (tab: 'stats'|'costs', month: string) => {
    setDatesLoading(true);
    try {
      const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
      const res = await fetch(`${api}?month=${month}&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAvailableDates(new Set(json.dates || []));
    } catch (e) {
      console.error('Load available dates error:', e);
      setAvailableDates(new Set());
    } finally {
      setDatesLoading(false);
    }
  };

  useEffect(() => {
    if (showDataCalendar) {
      const month = `${dataCalMonth.getFullYear()}-${String(dataCalMonth.getMonth() + 1).padStart(2, '0')}`;
      loadAvailableDates(dataTab, month);
    }
  }, [showDataCalendar, dataCalMonth, dataTab]);

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

  useEffect(() => { loadAccounts(); loadFields(); }, [loadAccounts, loadFields]);

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
      const ca = String(a.code || '').trim() || String(a.name || '').trim();
      const cb = String(b.code || '').trim() || String(b.name || '').trim();
      return ca.localeCompare(cb, 'zh-CN');
    });

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(pageNum, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const uploadFile = async (api: string, file: File, label: string, skipPreview = false) => {
    setMessage('');
    // 文件大小检查（Vercel Hobby 限制 4.5MB）
    if (file.size > 4.5 * 1024 * 1024) {
      setMessage(`文件太大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，请拆分成小文件上传（单文件不超过 4MB）`);
      return;
    }

    // 订单和消耗数据先走预览
    if (!skipPreview && (api === '/api/upload' || api === '/api/upload-cost')) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${api}?preview=1`, { method: 'POST', body: formData });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`预览失败 (${res.status}): ${text.slice(0, 200)}`);
        }
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setUploadPreview({ ...json, label });
        setPendingUpload({ api, file, label });
        setShowPreviewModal(true);
        return;
      } catch (err: any) {
        setMessage(err.message);
        return;
      }
    }

    // 正常上传（账号信息 或 确认后的订单/消耗）
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(api, { method: 'POST', body: formData });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const text = await res.text();
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

  const confirmUpload = async () => {
    if (!pendingUpload) return;
    setShowPreviewModal(false);
    const { api, file, label } = pendingUpload;
    setPendingUpload(null);
    setUploadPreview(null);
    // 直接走上传逻辑，跳过预览
    await uploadFile(api, file, label, true);
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
      const res = await fetch('/api/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [name] })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage('删除成功');
      loadAccounts();
    } catch (e: any) { setMessage(e.message); }
  };

  const batchRemoveAccounts = async () => {
    if (selectedAccounts.size === 0) { setMessage('请先选择要删除的账号'); return; }
    if (!confirm(`确定删除选中的 ${selectedAccounts.size} 个账号？`)) return;
    try {
      const res = await fetch('/api/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: Array.from(selectedAccounts) })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMessage(`删除完成：成功 ${json.deleted} 条`);
    } catch (e: any) {
      setMessage(e.message);
    }
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
      // Sort by account code (fallback to name) to match account list order
      const sorted = [...raw].sort((a: any, b: any) => {
        const getCode = (name: string) => {
          const acc = accounts.find((ac: any) => String(ac.name || '') === name);
          return String(acc?.code || '').trim() || String(name || '').trim();
        };
        const ca = getCode(a.account_name);
        const cb = getCode(b.account_name);
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
    
    // 如果全选了，直接按日期批量删除（秒删）
    if (selectedKeys.size === dataList.length) {
      if (!confirm(`确定删除 ${dataDate} 的全部 ${dataList.length} 条${tab === 'stats' ? '统计数据' : '消耗数据'}？`)) return;
      setDataMsg('');
      try {
        const api = tab === 'stats' ? '/api/data-stats' : '/api/data-costs';
        const res = await fetch(`${api}?date=${dataDate}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setDataMsg(`删除完成：成功 ${json.deleted || dataList.length} 条`);
      } catch (e: any) { setDataMsg(e.message); }
      setSelectedKeys(new Set());
      loadData(tab, dataDate);
      return;
    }
    
    // 部分选中，逐条删除
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

  // ===== Pending Errors Functions =====
  const loadPending = async () => {
    setPendingLoading(true); setPendingMsg('');
    try {
      const res = await fetch('/api/pending-errors?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPendingList(json.items || []);
    } catch (e: any) { setPendingMsg(e.message); }
    finally { setPendingLoading(false); }
  };

  const loadPendingDetail = async (filename: string) => {
    try {
      const res = await fetch('/api/pending-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load', filename }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPendingDetail({ ...json.content, _filename: filename });
      setPendingDetailOpen(true);
      setPendingEdits({});
    } catch (e: any) { setPendingMsg(e.message); }
  };

  const processPending = async (filename: string, selectedOnly?: boolean) => {
    setPendingMsg('');
    try {
      const edits = Object.entries(pendingEdits).map(([oldName, edit]: [string, any]) => ({
        oldName,
        ...edit,
      })).filter(e => e.newName || e.orders !== undefined || e.net_income !== undefined || e.cost !== undefined);

      const body: any = { action: 'process', filename, edits: edits.length > 0 ? edits : undefined };
      if (selectedOnly) {
        body.selectedNames = Array.from(pendingSelected);
      }

      const res = await fetch('/api/pending-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPendingMsg(json.message || '处理成功');
      setPendingDetailOpen(false);
      setPendingDetail(null);
      setPendingSelected(new Set());
      loadPending();
    } catch (e: any) { setPendingMsg(e.message); }
  };

  const deletePending = async (filename: string) => {
    if (!confirm('确定删除该异常记录？')) return;
    setPendingMsg('');
    try {
      const res = await fetch('/api/pending-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', filename }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPendingMsg('已删除');
      loadPending();
    } catch (e: any) { setPendingMsg(e.message); }
  };

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: '#ffffff', color: '#1d1d1f', padding: '24px', borderBottom: '1px solid #e8e8ed' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, margin: '0 0 4px', fontWeight: 700, letterSpacing: '-0.02em' }}>账号管理后台 - 公司版</h1>
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
            { title: '📋 上传账号基础信息', desc: 'Excel 第一行为字段名（如：抖音名称/类型/状态/选品人/编号/备注/运营人），下方每行一个账号', api: '/api/upload-meta' },
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

        {/* 分页控制栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, background: '#fff', color: '#1d1d1f', cursor: 'pointer' }}
            >
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}条/页</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#86868b', whiteSpace: 'nowrap' }}>
              共 {filtered.length} 条
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPageNum(v => Math.max(1, v - 1))}
              disabled={pageNum <= 1}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, background: '#fff', color: pageNum <= 1 ? '#c7c7cc' : '#0071e3', cursor: pageNum <= 1 ? 'not-allowed' : 'pointer' }}
            >
              上一页
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              {(() => {
                const renderPages = (total: number, current: number) => {
                  const delta = 2;
                  const range = [];
                  const rangeWithDots = [];
                  let l;
                  for (let i = 1; i <= total; i++) {
                    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                      range.push(i);
                    }
                  }
                  for (let i of range) {
                    if (l) {
                      if (i - l === 2) {
                        rangeWithDots.push(l + 1);
                      } else if (i - l !== 1) {
                        rangeWithDots.push('...');
                      }
                    }
                    rangeWithDots.push(i);
                    l = i;
                  }
                  return rangeWithDots;
                };

                const pages = renderPages(totalPages, pageNum);
                return (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {pages.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => typeof p === 'number' && setPageNum(p)}
                        disabled={p === '...'}
                        style={{
                          width: p === '...' ? 'auto' : 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid #d2d2d7',
                          fontSize: 13,
                          fontWeight: p === pageNum ? 700 : 400,
                          background: p === pageNum ? '#0071e3' : '#fff',
                          color: p === pageNum ? '#fff' : '#1d1d1f',
                          cursor: p === '...' ? 'default' : 'pointer',
                          padding: p === '...' ? '0 8px' : 0,
                          flexShrink: 0,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <button
              onClick={() => setPageNum(v => Math.min(totalPages, v + 1))}
              disabled={pageNum >= totalPages}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, background: '#fff', color: pageNum >= totalPages ? '#c7c7cc' : '#0071e3', cursor: pageNum >= totalPages ? 'not-allowed' : 'pointer' }}
            >
              下一页
            </button>
          </div>
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
                {paginated.map(acc => (
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
                          ? <span style={{ padding: '2px 10px', borderRadius: 12, background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500 }}>{acc[f.key] || acc.metadata?.[f.key] || '-'}</span>
                          : (acc[f.key] || acc.metadata?.[f.key] || '-')}
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
            {/* 底部分页 */}
            {filtered.length > pageSize && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 0 8px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => setPageNum(v => Math.max(1, v - 1))}
                  disabled={pageNum <= 1}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, background: '#fff', color: pageNum <= 1 ? '#c7c7cc' : '#0071e3', cursor: pageNum <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  上一页
                </button>
              {(() => {
                const renderPages = (total: number, current: number) => {
                  const delta = 2;
                  const range = [];
                  const rangeWithDots = [];
                  let l;
                  for (let i = 1; i <= total; i++) {
                    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                      range.push(i);
                    }
                  }
                  for (let i of range) {
                    if (l) {
                      if (i - l === 2) {
                        rangeWithDots.push(l + 1);
                      } else if (i - l !== 1) {
                        rangeWithDots.push('...');
                      }
                    }
                    rangeWithDots.push(i);
                    l = i;
                  }
                  return rangeWithDots;
                };

                const pages = renderPages(totalPages, pageNum);
                return (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {pages.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => typeof p === 'number' && setPageNum(p)}
                        disabled={p === '...'}
                        style={{
                          width: p === '...' ? 'auto' : 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid #d2d2d7',
                          fontSize: 13,
                          fontWeight: p === pageNum ? 700 : 400,
                          background: p === pageNum ? '#0071e3' : '#fff',
                          color: p === pageNum ? '#fff' : '#1d1d1f',
                          cursor: p === '...' ? 'default' : 'pointer',
                          padding: p === '...' ? '0 8px' : 0,
                          flexShrink: 0,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                );
              })()}
                <button
                  onClick={() => setPageNum(v => Math.min(totalPages, v + 1))}
                  disabled={pageNum >= totalPages}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, background: '#fff', color: pageNum >= totalPages ? '#c7c7cc' : '#0071e3', cursor: pageNum >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                  下一页
                </button>
              </div>
            )}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>没有找到匹配的账号</div>}
          </div>
        )}
        {/* Pending Errors Manager */}
        <div id="pending-errors" style={{ background: 'white', borderRadius: 20, padding: 24, marginTop: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1d1d1f' }}>⚠️ 异常数据处理</h2>
            <button onClick={loadPending}
              style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🔄 刷新
            </button>
          </div>
          {pendingMsg && <div style={{ fontSize: 13, color: pendingMsg.includes('成功') || pendingMsg.includes('已') ? '#34c759' : '#ff3b30', marginBottom: 12 }}>{pendingMsg}</div>}
          {pendingLoading ? <div style={{ textAlign: 'center', padding: 30, color: '#86868b' }}>加载中...</div> : (
            pendingList.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f7' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>类型</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>日期</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>记录数</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>未匹配</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>错误原因</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>创建时间</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e8ed', width: 180 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingList.map((item, idx) => (
                      <tr key={item.filename} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 10px', borderRadius: 12, background: item.type === 'stats' ? '#e8f5e9' : '#fff3e0', color: item.type === 'stats' ? '#2e7d32' : '#ef6c00', fontSize: 12, fontWeight: 500 }}>
                            {item.type === 'stats' ? '订单数据' : '消耗数据'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{item.date}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.recordCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: item.unmatched > 0 ? '#c62828' : '#2e7d32' }}>{item.unmatched}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.error}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#86868b' }}>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => loadPendingDetail(item.filename)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>处理</button>
                          <button onClick={() => deletePending(item.filename)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#ff3b30', fontSize: 12, cursor: 'pointer' }}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: '#86868b', fontSize: 13 }}>暂无异常数据 🎉</div>
            )
          )}
        </div>

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
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{dataCalMonth.getFullYear()}年{dataCalMonth.getMonth() + 1}月 {datesLoading ? '(加载中...)' : availableDates.size > 0 ? `(${availableDates.size}天有数据)` : ''}</span>
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
                    const dateStr = fmtYMD(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate());
                    let bg = 'transparent';
                    let color = cell.current ? '#1d1d1f' : '#c5c5c7';
                    const hasData = !datesLoading && availableDates.has(dateStr);
                    if (isSelected) { bg = '#0071e3'; color = 'white'; }
                    else if (cell.current && !hasData) { color = '#c5c5c7'; }
                    return (
                      <div
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setDataDate(dateStr); setShowDataCalendar(false); }}
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

      {/* Upload Preview Modal */}
      {showPreviewModal && uploadPreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setShowPreviewModal(false); setPendingUpload(null); }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: 520, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>📋 {uploadPreview.label} - 上传预览</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#86868b' }}>Excel 总行数</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1d1d1f' }}>{uploadPreview.totalRows || 0}</div>
              </div>
              <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#86868b' }}>识别到账号数</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1d1d1f' }}>{uploadPreview.totalAccounts || uploadPreview.matchedCount + uploadPreview.unmatchedCount || 0}</div>
              </div>
              <div style={{ background: '#e8f5e9', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#2e7d32' }}>✅ 匹配成功</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2e7d32' }}>{uploadPreview.matchedCount || 0}</div>
              </div>
              <div style={{ background: uploadPreview.unmatchedCount > 0 ? '#ffebee' : '#e8f5e9', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: uploadPreview.unmatchedCount > 0 ? '#c62828' : '#2e7d32' }}>{uploadPreview.unmatchedCount > 0 ? '⚠️ 匹配不上' : '✅ 全部匹配'}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: uploadPreview.unmatchedCount > 0 ? '#c62828' : '#2e7d32' }}>{uploadPreview.unmatchedCount || 0}</div>
              </div>
            </div>

            {uploadPreview.dateRange && (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                日期范围：{uploadPreview.dateRange.from} ~ {uploadPreview.dateRange.to}
              </div>
            )}
            {uploadPreview.dateCols && (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                识别到 {uploadPreview.dateCols.length} 个日期列：{uploadPreview.dateCols.slice(0, 3).join('、')}{uploadPreview.dateCols.length > 3 ? '...' : ''}
              </div>
            )}

            {uploadPreview.newAccounts && uploadPreview.newAccounts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c62828', marginBottom: 6 }}>🆕 将创建的新账号（{uploadPreview.newAccounts.length} 个）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {uploadPreview.newAccounts.map((name: string) => (
                    <span key={name} style={{ padding: '4px 10px', borderRadius: 6, background: '#ffebee', color: '#c62828', fontSize: 12, border: '1px solid #ffcdd2' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {uploadPreview.unmatchedAccounts && uploadPreview.unmatchedAccounts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c62828', marginBottom: 6 }}>❌ 匹配不上的账号（数据将被丢弃，{uploadPreview.unmatchedAccounts.length} 个）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {uploadPreview.unmatchedAccounts.map((name: string) => (
                    <span key={name} style={{ padding: '4px 10px', borderRadius: 6, background: '#ffebee', color: '#c62828', fontSize: 12, border: '1px solid #ffcdd2' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {uploadPreview.matchedAccounts && uploadPreview.matchedAccounts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2e7d32', marginBottom: 6 }}>✅ 匹配成功的账号（{uploadPreview.matchedAccounts.length} 个）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {uploadPreview.matchedAccounts.slice(0, 20).map((name: string) => (
                    <span key={name} style={{ padding: '4px 10px', borderRadius: 6, background: '#e8f5e9', color: '#2e7d32', fontSize: 12, border: '1px solid #c8e6c9' }}>{name}</span>
                  ))}
                  {uploadPreview.matchedAccounts.length > 20 && (
                    <span style={{ padding: '4px 10px', borderRadius: 6, background: '#e8f5e9', color: '#2e7d32', fontSize: 12 }}>+{uploadPreview.matchedAccounts.length - 20} 个</span>
                  )}
                </div>
              </div>
            )}

            {uploadPreview.skippedRefund > 0 && (
              <div style={{ fontSize: 12, color: '#86868b', marginBottom: 8 }}>已过滤退款订单：{uploadPreview.skippedRefund} 条</div>
            )}
            {uploadPreview.skippedEmpty > 0 && (
              <div style={{ fontSize: 12, color: '#86868b', marginBottom: 8 }}>已过滤空行/无效行：{uploadPreview.skippedEmpty} 条</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={confirmUpload} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0071e3', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>确认上传</button>
              <button onClick={() => { setShowPreviewModal(false); setPendingUpload(null); }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e8e8ed', background: 'white', fontSize: 14, cursor: 'pointer', color: '#1d1d1f' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Detail Modal */}
      {pendingDetailOpen && pendingDetail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setPendingDetailOpen(false); setPendingDetail(null); setPendingEdits({}); }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: 640, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>⚠️ 异常数据详情</h2>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
              类型：{pendingDetail.type === 'stats' ? '订单数据' : '消耗数据'} | 日期：{pendingDetail.date} | 共 {pendingDetail.data?.length || 0} 条
            </div>
            {pendingDetail.error && (
              <div style={{ fontSize: 12, color: '#c62828', marginBottom: 12, padding: '8px 12px', background: '#ffebee', borderRadius: 8 }}>错误：{pendingDetail.error}</div>
            )}
            {pendingDetail.unmatched && pendingDetail.unmatched.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c62828', marginBottom: 6 }}>未匹配账号：{pendingDetail.unmatched.length} 个</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pendingDetail.unmatched.map((name: string) => (
                    <span key={name} style={{ padding: '3px 8px', borderRadius: 6, background: '#ffebee', color: '#c62828', fontSize: 12 }}>{name}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', marginBottom: 6 }}>数据列表</div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f7' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8ed', width: 40 }}>
                        <input
                          type="checkbox"
                          checked={pendingDetail.data?.length > 0 && pendingDetail.data.every((d: any) => pendingSelected.has(d.name))}
                          onChange={e => {
                            if (e.target.checked) {
                              setPendingSelected(new Set(pendingDetail.data.map((d: any) => d.name)));
                            } else {
                              setPendingSelected(new Set());
                            }
                          }}
                        />
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>原始名称</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e8ed' }}>{pendingDetail.type === 'costs' ? '户ID' : 'UID'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>修正名称</th>
                      {pendingDetail.type === 'stats' && (<>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>单量</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>净佣金</th>
                      </>)}
                      {pendingDetail.type === 'costs' && (
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8ed' }}>消耗</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDetail.data?.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={pendingSelected.has(item.name)}
                            onChange={e => {
                              setPendingSelected(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(item.name);
                                else next.delete(item.name);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 12, color: '#1d1d1f' }}>{item.name}</td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{extractId(item.detail) || '-'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="text"
                            value={pendingEdits[item.name]?.newName ?? item.name}
                            onChange={e => setPendingEdits(prev => ({ ...prev, [item.name]: { ...prev[item.name], newName: e.target.value } }))}
                            style={{ width: 100, padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}
                          />
                        </td>
                        {pendingDetail.type === 'stats' && (<>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              value={pendingEdits[item.name]?.orders ?? item.orders ?? 0}
                              onChange={e => setPendingEdits(prev => ({ ...prev, [item.name]: { ...prev[item.name], orders: parseInt(e.target.value) || 0 } }))}
                              style={{ width: 60, padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={pendingEdits[item.name]?.net_income ?? item.net_income ?? 0}
                              onChange={e => setPendingEdits(prev => ({ ...prev, [item.name]: { ...prev[item.name], net_income: parseFloat(e.target.value) || 0 } }))}
                              style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}
                            />
                          </td>
                        </>)}
                        {pendingDetail.type === 'costs' && (
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={pendingEdits[item.name]?.cost ?? item.cost ?? 0}
                              onChange={e => setPendingEdits(prev => ({ ...prev, [item.name]: { ...prev[item.name], cost: parseFloat(e.target.value) || 0 } }))}
                              style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => {
                  // 只处理选中的行
                  if (pendingSelected.size === 0) {
                    setPendingMsg('请先勾选要处理的数据');
                    return;
                  }
                  processPending(pendingDetail._filename || `${pendingDetail.type}-${pendingDetail.date}`, true);
                }}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#34c759', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                入库选中 ({pendingSelected.size})
              </button>
              <button
                onClick={() => processPending(pendingDetail._filename || `${pendingDetail.type}-${pendingDetail.date}`)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #0071e3', background: 'white', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                全部入库
              </button>
              <button
                onClick={() => { setPendingDetailOpen(false); setPendingDetail(null); setPendingEdits({}); setPendingSelected(new Set()); }}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #e8e8ed', background: 'white', fontSize: 14, cursor: 'pointer', color: '#1d1d1f' }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
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
    fields.forEach(f => { init[f.key] = account ? String(account[f.key] || account.metadata?.[f.key] || '') : ''; });
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
