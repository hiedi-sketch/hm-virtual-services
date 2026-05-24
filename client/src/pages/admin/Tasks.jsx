import { useState, useEffect } from 'react';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';

// ─── Column config ────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'todo',        label: 'To Do',       color: '#6B7280', bg: 'bg-gray-50',   border: 'border-gray-300' },
  { key: 'in_progress', label: 'In Progress',  color: '#2563EB', bg: 'bg-blue-50',   border: 'border-blue-300' },
  { key: 'in_review',   label: 'In Review',    color: '#7C3AED', bg: 'bg-violet-50', border: 'border-violet-300' },
  { key: 'done',        label: 'Done',         color: '#16A34A', bg: 'bg-green-50',  border: 'border-green-300' },
];

const STATUS_CYCLE = {
  todo: 'in_progress', in_progress: 'in_review', in_review: 'done', done: 'todo',
};

// ─── Priority config ───────────────────────────────────────────────────────────
const PRIORITY = {
  high:   { dot: 'bg-red-500',    label: 'High',   text: 'text-red-600' },
  medium: { dot: 'bg-orange-400', label: 'Medium', text: 'text-orange-500' },
  low:    { dot: 'bg-gray-300',   label: 'Low',    text: 'text-gray-400' },
};

// ─── Source badge ──────────────────────────────────────────────────────────────
const SOURCE_BADGE = {
  clickup: { label: 'CU', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  asana:   { label: 'AS', cls: 'bg-pink-100 text-pink-700 border-pink-200' },
};

// ─── Task type badge ───────────────────────────────────────────────────────────
const TYPE_BADGE = {
  va: 'bg-blue-50 text-blue-700 border-blue-200',
  bk: 'bg-gray-100 text-gray-500 border-gray-200',
};

function PriorityDot({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.low;
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${p.dot}`} title={p.label} />;
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onEdit, onDelete, onAdvance, onPushSource, onPin }) {
  const src = task.source ? SOURCE_BADGE[task.source] : null;
  const archived = !!task.source_archived;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const pinned = !!task.is_pinned;

  return (
    <div
      className={`group bg-white rounded-lg border shadow-sm hover:shadow-md transition-all cursor-pointer
        ${archived ? 'opacity-50 border-dashed border-gray-300' : 'border-gray-200 hover:border-gray-300'}
        ${pinned ? 'ring-1 ring-amber-300' : ''}`}
      onClick={() => onEdit(task)}
    >
      {/* Color bar by task type */}
      <div className={`h-1 rounded-t-lg ${task.task_type === 'va' ? 'bg-blue-400' : 'bg-gray-300'}`} />

      <div className="p-3">
        {/* Top row: priority + title + source + pin */}
        <div className="flex items-start gap-2 mb-2">
          <PriorityDot priority={task.priority} />
          <p className="text-sm font-semibold text-gray-800 flex-1 leading-snug">{task.title}</p>
          <div className="flex items-center gap-1 shrink-0">
            {src && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${src.cls}`}>
                {src.label}
              </span>
            )}
            {archived && <span className="text-xs text-silver italic">archived</span>}
          </div>
        </div>

        {/* Client + type chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {task.client_name && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary/8 text-primary px-2 py-0.5 rounded-full font-medium">
              👤 {task.client_name}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${TYPE_BADGE[task.task_type] || TYPE_BADGE.bk}`}>
            {task.task_type || 'BK'}
          </span>
        </div>

        {/* Footer: due date + actions */}
        <div className="flex items-center justify-between mt-1">
          <div>
            {task.due_date && (
              <span className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                📅 {task.due_date}
                {isOverdue && ' · overdue'}
              </span>
            )}
            {task.is_client_visible ? (
              <span className="text-xs text-accent ml-2">👤 client</span>
            ) : null}
          </div>

          {/* Actions — stop click bubbling to card onClick */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onPin(task)}
              title={pinned ? 'Remove from Up Next' : 'Pin to Up Next'}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${pinned ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
            >
              📌
            </button>
            <button
              onClick={() => onAdvance(task)}
              title={`Move to ${STATUS_CYCLE[task.status]?.replace('_', ' ')}`}
              className="text-xs text-gray-400 hover:text-primary px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors font-bold"
            >
              →
            </button>
            {task.source && !archived && (
              <button
                onClick={() => onPushSource(task)}
                title={`Push to ${task.source}`}
                className="text-xs text-gray-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors"
              >
                ↑CU
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="text-xs text-gray-300 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List-view row ─────────────────────────────────────────────────────────────
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done' };
const STATUS_CLS   = {
  todo:        'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-50 text-blue-700',
  in_review:   'bg-violet-50 text-violet-700',
  done:        'bg-green-50 text-green-700',
};

function TaskRow({ task, selected, onToggle, onEdit, onDelete, onAdvance, onPushSource, onPin }) {
  const src = task.source ? SOURCE_BADGE[task.source] : null;
  const archived = !!task.source_archived;
  const pinned = !!task.is_pinned;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <tr
      className={`group border-b border-linen cursor-pointer transition-colors ${archived ? 'opacity-50' : ''} ${selected ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-linen/40'}`}
      onClick={() => onEdit(task)}
    >
      {/* Checkbox */}
      <td className="pl-3 pr-1 py-3 w-8" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="w-4 h-4 accent-primary cursor-pointer"
          checked={selected}
          onChange={() => onToggle(task.id)}
        />
      </td>

      {/* Priority dot */}
      <td className="pr-2 py-3 w-6">
        <PriorityDot priority={task.priority} />
      </td>

      {/* Title */}
      <td className="py-3 pr-4">
        <span className="text-sm font-semibold text-gray-800">{task.title}</span>
      </td>

      {/* Client */}
      <td className="py-3 pr-4 text-sm text-primary">
        {task.client_name || <span className="text-gray-300">—</span>}
      </td>

      {/* Type */}
      <td className="py-3 pr-4">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${TYPE_BADGE[task.task_type] || TYPE_BADGE.bk}`}>
          {task.task_type || 'bk'}
        </span>
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[task.status]}`}>
          {STATUS_LABEL[task.status]}
        </span>
      </td>

      {/* Due date */}
      <td className={`py-3 pr-4 text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
        {task.due_date || '—'}
        {isOverdue && ' ·overdue'}
      </td>

      {/* Source */}
      <td className="py-3 pr-4">
        {src && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${src.cls}`}>{src.label}</span>}
      </td>

      {/* Actions */}
      <td className="py-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onPin(task)}
            title={pinned ? 'Remove from Up Next' : 'Pin to Up Next'}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${pinned ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-500'}`}>
            📌
          </button>
          <button onClick={() => onAdvance(task)}
            title="Advance status"
            className="text-xs text-gray-400 hover:text-primary px-1.5 py-0.5 rounded hover:bg-primary/10 font-bold">
            →
          </button>
          {task.source && !archived && (
            <button onClick={() => onPushSource(task)}
              className="text-xs text-gray-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-50">
              ↑CU
            </button>
          )}
          <button onClick={() => onDelete(task.id)}
            className="text-xs text-gray-300 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50">
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── View toggle icons ─────────────────────────────────────────────────────────
function KanbanIcon({ active }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-primary' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 16 16">
      <rect x="1" y="1" width="4" height="14" rx="1" />
      <rect x="6" y="1" width="4" height="10" rx="1" />
      <rect x="11" y="1" width="4" height="12" rx="1" />
    </svg>
  );
}

function ListIcon({ active }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-primary' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
      <line x1="4" y1="4" x2="14" y2="4" />
      <line x1="4" y1="8" x2="14" y2="8" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <circle cx="1.5" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="1.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="1.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminTasks() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState({
    client_id: '', task_type: 'bk', title: '', description: '',
    status: 'todo', priority: 'medium', due_date: '', is_client_visible: false,
  });

  const [view, setView] = useState(() => localStorage.getItem('hm_tasks_view') || 'kanban');
  const [clickupStatus, setClickupStatus] = useState(null);
  const [syncingClickup, setSyncingClickup] = useState(false);
  const [sortDue, setSortDue] = useState(null); // null | 'asc' | 'desc'
  const [filterDue, setFilterDue] = useState('');
  const [filterDueDate, setFilterDueDate] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkForm, setBulkForm] = useState({ client_id: '', task_type: '', status: '', due_date: '' });
  const [bulkSaving, setBulkSaving] = useState(false);

  function switchView(v) {
    setView(v);
    localStorage.setItem('hm_tasks_view', v);
    setSelectedIds(new Set());
  }

  function load() {
    setLoading(true);
    api.get('/tasks', {
      params: {
        client_id: filterClient || undefined,
        task_type: filterType || undefined,
      },
    })
      .then(r => setTasks(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data.data));
    api.get('/integrations/clickup/status').then(r => setClickupStatus(r.data.data)).catch(() => {});
    load();
  }, []);

  useEffect(() => { load(); }, [filterClient, filterType]);

  function openNew() {
    setEditTask(null);
    setForm({ client_id: '', task_type: 'bk', title: '', description: '', status: 'todo', priority: 'medium', due_date: '', is_client_visible: false });
    setShowModal(true);
  }

  function openEdit(task) {
    setEditTask(task);
    setForm({
      client_id: task.client_id || '',
      task_type: task.task_type || 'bk',
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date || '',
      is_client_visible: !!task.is_client_visible,
    });
    setShowModal(true);
  }

  async function advanceStatus(task) {
    const next = STATUS_CYCLE[task.status];
    await api.put(`/tasks/${task.id}`, { status: next });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
    if (task.source === 'clickup') api.post(`/integrations/clickup/push/${task.id}`).catch(() => {});
    if (task.source === 'asana') api.post(`/integrations/asana/push/${task.id}`).catch(() => {});
  }

  async function pushSource(task) {
    try {
      const r = await api.post(`/integrations/${task.source}/push/${task.id}`);
      toast.success(r.data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Push failed');
    }
  }

  async function togglePin(task) {
    const next = task.is_pinned ? 0 : 1;
    await api.put(`/tasks/${task.id}`, { is_pinned: next });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_pinned: next } : t));
    if (next) toast.success('Pinned to Up Next');
  }

  async function completePin(task) {
    await api.put(`/tasks/${task.id}`, { status: 'done', is_pinned: 0 });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', is_pinned: 0 } : t));
    toast.success('Task completed ✓');
    if (task.source === 'clickup') api.post(`/integrations/clickup/push/${task.id}`).catch(() => {});
  }

  async function syncClickup() {
    setSyncingClickup(true);
    try {
      const r = await api.post('/integrations/clickup/sync');
      toast.success(r.data.message);
      load();
      api.get('/integrations/clickup/status').then(r => setClickupStatus(r.data.data));
    } catch (err) {
      toast.error(err.response?.data?.error || 'ClickUp sync failed');
    } finally { setSyncingClickup(false); }
  }

  async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    await api.delete(`/tasks/${id}`);
    toast.success('Task deleted');
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function saveTask(e) {
    e.preventDefault();
    try {
      if (editTask) {
        const r = await api.put(`/tasks/${editTask.id}`, form);
        setTasks(prev => prev.map(t => t.id === editTask.id ? r.data.data : t));
        // Push status update to source if changed
        if (editTask.source === 'clickup' && form.status !== editTask.status) {
          api.post(`/integrations/clickup/push/${editTask.id}`).catch(() => {});
        }
        toast.success('Task updated');
      } else {
        const r = await api.post('/tasks', form);
        setTasks(prev => [...prev, r.data.data]);
        toast.success('Task created');
      }
      setShowModal(false);
    } catch { toast.error('Failed to save task'); }
  }

  const TODAY = new Date().toISOString().split('T')[0];
  const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  function applyDueFilter(list) {
    if (filterDue === 'overdue')   return list.filter(t => t.due_date && t.due_date < TODAY && t.status !== 'done');
    if (filterDue === 'today')     return list.filter(t => t.due_date === TODAY);
    if (filterDue === 'tomorrow')  return list.filter(t => t.due_date === TOMORROW);
    if (filterDue === 'custom' && filterDueDate) return list.filter(t => t.due_date === filterDueDate);
    return list;
  }

  function applyDueSort(list) {
    if (!sortDue) return list;
    return [...list].sort((a, b) => {
      const da = a.due_date || '9999-99-99';
      const db = b.due_date || '9999-99-99';
      return sortDue === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }

  function cycleSortDue() {
    setSortDue(s => s === null ? 'asc' : s === 'asc' ? 'desc' : null);
  }

  // All tasks visible in the list view (for select-all)
  const visibleListTasks = COLUMNS.flatMap(col => tasksByStatus(col.key));

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleListTasks.length && visibleListTasks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleListTasks.map(t => t.id)));
    }
  }

  async function applyBulk() {
    const patch = {};
    if (bulkForm.client_id !== '')  patch.client_id  = Number(bulkForm.client_id) || null;
    if (bulkForm.task_type)         patch.task_type   = bulkForm.task_type;
    if (bulkForm.status)            patch.status      = bulkForm.status;
    if (bulkForm.due_date)          patch.due_date    = bulkForm.due_date;
    if (Object.keys(patch).length === 0) { toast.error('Choose at least one field to change'); return; }
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id => api.put(`/tasks/${id}`, patch)));
      toast.success(`${selectedIds.size} task(s) updated`);
      setSelectedIds(new Set());
      setBulkForm({ client_id: '', task_type: '', status: '', due_date: '' });
      load();
    } catch { toast.error('Some updates failed'); }
    finally { setBulkSaving(false); }
  }

  function tasksByStatus(status) {
    const base = tasks.filter(t =>
      t.status === status &&
      (showArchived ? true : !t.source_archived)
    );
    return applyDueSort(applyDueFilter(base));
  }

  const totalByType = (type) => tasks.filter(t => t.task_type === type && !t.source_archived).length;

  return (
    <div className="p-6 h-full flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tasks</h1>
          <p className="text-xs text-silver mt-0.5">
            {totalByType('va')} VA · {totalByType('bk')} BK
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ClickUp sync */}
          {clickupStatus?.connected && (
            <button
              onClick={syncClickup}
              disabled={syncingClickup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50 border border-purple-200"
            >
              <span className={syncingClickup ? 'animate-spin inline-block' : ''}>↻</span>
              {syncingClickup ? 'Syncing…' : 'Sync ClickUp'}
              {clickupStatus.lastSynced && (
                <span className="text-xs text-purple-400 font-normal hidden lg:inline">
                  · {new Date(clickupStatus.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
          )}

          {/* Filters */}
          <select className="input text-sm w-44" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.contact_name}</option>
            ))}
          </select>

          <select className="input text-sm w-32" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="va">VA only</option>
            <option value="bk">BK only</option>
          </select>

          {/* Due date filter */}
          <select
            className="input text-sm w-36"
            value={filterDue}
            onChange={e => { setFilterDue(e.target.value); setFilterDueDate(''); }}
          >
            <option value="">All dates</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="custom">Pick date…</option>
          </select>
          {filterDue === 'custom' && (
            <input
              type="date"
              className="input text-sm w-40"
              value={filterDueDate}
              onChange={e => setFilterDueDate(e.target.value)}
            />
          )}

          <label className="flex items-center gap-1.5 text-xs text-silver cursor-pointer select-none">
            <input type="checkbox" className="accent-primary" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Archived
          </label>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-linen overflow-hidden">
            <button
              onClick={() => switchView('kanban')}
              title="Board view"
              className={`p-2 transition-colors ${view === 'kanban' ? 'bg-primary/10' : 'bg-white hover:bg-linen'}`}
            >
              <KanbanIcon active={view === 'kanban'} />
            </button>
            <button
              onClick={() => switchView('list')}
              title="List view"
              className={`p-2 border-l border-linen transition-colors ${view === 'list' ? 'bg-primary/10' : 'bg-white hover:bg-linen'}`}
            >
              <ListIcon active={view === 'list'} />
            </button>
          </div>

          <button onClick={openNew} className="btn-primary text-sm">+ New Task</button>
        </div>
      </div>

      {/* ── Up Next ── */}
      {tasks.filter(t => t.is_pinned && !t.source_archived).length > 0 && (
        <div className="mb-4 bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
            <span className="text-sm">📌</span>
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Up Next</span>
            <span className="text-xs text-amber-500 font-medium">
              {tasks.filter(t => t.is_pinned && !t.source_archived).length} task{tasks.filter(t => t.is_pinned && !t.source_archived).length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-2 p-3 overflow-x-auto">
            {tasks
              .filter(t => t.is_pinned && !t.source_archived)
              .map(task => {
                const isOverdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0];
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2.5 min-w-56 max-w-72 shrink-0 group/pin"
                  >
                    <PriorityDot priority={task.priority} />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(task)}>
                      <p className="text-sm font-semibold text-charcoal leading-snug truncate">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {task.client_name && (
                          <span className="text-xs text-primary font-medium truncate">{task.client_name}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0 rounded-full border font-bold uppercase ${TYPE_BADGE[task.task_type] || TYPE_BADGE.bk}`}>
                          {task.task_type || 'bk'}
                        </span>
                        {task.due_date && (
                          <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            📅 {task.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Complete button */}
                    <button
                      onClick={() => completePin(task)}
                      title="Mark done & remove from Up Next"
                      className="w-7 h-7 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-500 flex items-center justify-center text-gray-300 hover:text-white transition-all shrink-0 font-bold text-sm"
                    >
                      ✓
                    </button>
                    {/* Unpin button */}
                    <button
                      onClick={() => togglePin(task)}
                      title="Remove from Up Next"
                      className="text-gray-300 hover:text-gray-500 opacity-0 group-hover/pin:opacity-100 transition-all text-xs shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Kanban Board ── */}
      {view === 'kanban' && (
        <div className="grid grid-cols-4 gap-4 flex-1 min-h-0 overflow-x-auto">
          {COLUMNS.map(col => {
            const colTasks = tasksByStatus(col.key);
            return (
              <div key={col.key} className="flex flex-col min-w-56 min-h-0">
                <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-4 ${col.bg} mb-2`}
                  style={{ borderTopColor: col.color }}>
                  <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 text-gray-500 border">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 flex-1 overflow-y-auto pb-2 pr-1">
                  {loading ? (
                    <>
                      <div className="h-24 bg-white border border-gray-200 rounded-lg animate-pulse" />
                      <div className="h-16 bg-white border border-gray-200 rounded-lg animate-pulse" />
                    </>
                  ) : colTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-lg">
                      <span className="text-xs text-gray-300">No tasks</span>
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <TaskCard key={task.id} task={task} onEdit={openEdit}
                        onDelete={deleteTask} onAdvance={advanceStatus} onPushSource={pushSource} onPin={togglePin} />
                    ))
                  )}
                  <button
                    onClick={() => { openNew(); setForm(f => ({ ...f, status: col.key })); }}
                    className="text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg py-2 transition-colors mt-1"
                  >
                    + Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className="card overflow-y-auto p-0 flex-1 min-h-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-linen animate-pulse rounded" />)}
            </div>
          ) : COLUMNS.every(col => tasksByStatus(col.key).length === 0) ? (
            <p className="text-center py-12 text-silver text-sm">No tasks found.</p>
          ) : (
            <>
            {/* ── Bulk action bar ── */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/10 flex-wrap">
                <span className="text-sm font-semibold text-primary shrink-0">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-silver hover:text-charcoal underline shrink-0"
                >
                  Clear
                </button>
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {/* Client */}
                  <select
                    className="input text-xs py-1 w-36"
                    value={bulkForm.client_id}
                    onChange={e => setBulkForm(f => ({ ...f, client_id: e.target.value }))}
                  >
                    <option value="">Client (no change)</option>
                    <option value="0">— Remove client</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.contact_name}</option>
                    ))}
                  </select>
                  {/* Type */}
                  <select
                    className="input text-xs py-1 w-32"
                    value={bulkForm.task_type}
                    onChange={e => setBulkForm(f => ({ ...f, task_type: e.target.value }))}
                  >
                    <option value="">Type (no change)</option>
                    <option value="bk">BK</option>
                    <option value="va">VA</option>
                  </select>
                  {/* Status */}
                  <select
                    className="input text-xs py-1 w-36"
                    value={bulkForm.status}
                    onChange={e => setBulkForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">Status (no change)</option>
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  {/* Due date */}
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      className="input text-xs py-1 w-36"
                      value={bulkForm.due_date}
                      onChange={e => setBulkForm(f => ({ ...f, due_date: e.target.value }))}
                    />
                    {bulkForm.due_date && (
                      <button
                        onClick={() => setBulkForm(f => ({ ...f, due_date: '' }))}
                        className="text-xs text-silver hover:text-charcoal"
                        title="Clear due date field"
                      >✕</button>
                    )}
                  </div>
                  <button
                    onClick={applyBulk}
                    disabled={bulkSaving}
                    className="btn-primary text-xs py-1 px-3 shrink-0"
                  >
                    {bulkSaving ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linen bg-greige/40">
                  {/* Select-all checkbox */}
                  <th className="pl-3 pr-1 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary cursor-pointer"
                      checked={visibleListTasks.length > 0 && selectedIds.size === visibleListTasks.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < visibleListTasks.length; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="pr-2 py-2.5 w-6" />
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-black uppercase tracking-wide">Title</th>
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-black uppercase tracking-wide">Client</th>
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-black uppercase tracking-wide">Type</th>
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-black uppercase tracking-wide">Status</th>
                  <th
                    className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-primary transition-colors group"
                    onClick={cycleSortDue}
                  >
                    <span className={sortDue ? 'text-primary' : 'text-black'}>Due</span>
                    <span className="ml-1 text-gray-300 group-hover:text-primary transition-colors">
                      {sortDue === 'asc' ? '↑' : sortDue === 'desc' ? '↓' : '↕'}
                    </span>
                  </th>
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-black uppercase tracking-wide">Source</th>
                  <th className="py-2.5 pr-4" />
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map(col => {
                  const colTasks = tasksByStatus(col.key);
                  if (colTasks.length === 0) return null;
                  return [
                    // Section header row per status group
                    <tr key={`hdr-${col.key}`}>
                      <td colSpan={9} className="pl-4 pt-4 pb-1">
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col.color }}>
                          {col.label} · {colTasks.length}
                        </span>
                      </td>
                    </tr>,
                    ...colTasks.map(task => (
                      <TaskRow key={task.id} task={task}
                        selected={selectedIds.has(task.id)}
                        onToggle={toggleSelect}
                        onEdit={openEdit}
                        onDelete={deleteTask} onAdvance={advanceStatus} onPushSource={pushSource} onPin={togglePin} />
                    )),
                  ];
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTask ? 'Edit Task' : 'New Task'}>
        <form onSubmit={saveTask} className="space-y-4">

          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client</label>
              <select className="input" value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">None (internal)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.contact_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Service Type</label>
              <div className="flex rounded-lg border border-linen overflow-hidden text-sm font-semibold">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, task_type: 'bk' }))}
                  className={`flex-1 py-2 transition-colors ${form.task_type === 'bk' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:text-primary'}`}>
                  BK
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, task_type: 'va' }))}
                  className={`flex-1 py-2 border-l border-linen transition-colors ${form.task_type === 'va' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:text-primary'}`}>
                  VA
                </button>
              </div>
              <p className="text-xs text-silver mt-1">VA tasks count toward client hours budget</p>
            </div>

            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="high">🔴 High</option>
                <option value="medium">🟠 Medium</option>
                <option value="low">⚪ Low</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-20" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-primary w-4 h-4"
              checked={form.is_client_visible}
              onChange={e => setForm(f => ({ ...f, is_client_visible: e.target.checked }))} />
            <span className="text-sm">Visible to client in their portal</span>
          </label>

          {editTask?.source === 'clickup' && (
            <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
              ⚡ This task is synced from ClickUp. Status changes will be pushed back automatically.
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editTask ? 'Update' : 'Create'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
