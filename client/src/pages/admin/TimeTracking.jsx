import { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';

function fmtDuration(value) {
  const secs = Math.floor(Number(value || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
~
function fmtTimer(secs) {
  const h = Math.floor(secs / 3600)
    .toString()
    .padStart(2, '0');

  const m = Math.floor((secs % 3600) / 60)
    .toString()
    .padStart(2, '0');

  const s = (secs % 60)
    .toString()
    .padStart(2, '0');

  return `${h}:${m}:${s}`;
}

function getLocalDateTime() {
  return new Date(
    new Date().getTime() - new Date().getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);
}

function TypeToggle({ value, onChange, disabled }) {
  return (
    <div className="flex rounded-lg border border-linen overflow-hidden text-xs font-semibold">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('bk')}
        className={`px-3 py-2 transition-colors ${
          value === 'bk'
            ? 'bg-primary text-white'
            : 'bg-white text-black hover:text-primary'
        }`}
      >
        BK
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('va')}
        className={`px-3 py-2 border-l border-linen transition-colors ${
          value === 'va'
            ? 'bg-primary text-white'
            : 'bg-white text-black hover:text-primary'
        }`}
      >
        VA
      </button>
    </div>
  );
}

function TypeBadge({ type }) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
        type === 'va'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {(type || 'va').toUpperCase()}
    </span>
  );
}

const BLANK_FORM = {
  client_id: '',
  task_id: '',
  description: '',
  start_time:  getLocalDateTime(),
  end_time: getLocalDateTime(),
  duration_seconds: 0,
  task_type: 'va',
};

export default function AdminTimeTracking() {
  const [clients, setClients] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);

  const [timerSecs, setTimerSecs] = useState(0);

  const [tasks, setTasks] = useState([]);
  const [timerClientId, setTimerClientId] = useState('');
  const [timerTaskId, setTimerTaskId] = useState('');
  const [timerDesc, setTimerDesc] = useState('');
  const [timerType, setTimerType] = useState('va');

  const [timerStartTime, setTimerStartTime] = useState(null);

  const intervalRef = useRef(null);
  // Tracks the effective wall-clock start so elapsed = Date.now() - startTimeRef.current
  // (adjusted on resume to account for already-elapsed seconds)
  const startTimeRef = useRef(null);

  const [form, setForm] = useState(BLANK_FORM);

  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');

  const [dateFilterMode, setDateFilterMode] = useState('month');

  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const [filterDate, setFilterDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [filterStartDate, setFilterStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [filterEndDate, setFilterEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // ── Restore timer from localStorage on mount ─────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('hm_timer');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s.clientId !== undefined) setTimerClientId(s.clientId);
      if (s.taskId   !== undefined) setTimerTaskId(s.taskId);
      if (s.desc     !== undefined) setTimerDesc(s.desc);
      if (s.type     !== undefined) setTimerType(s.type);
      if (s.actualStart) setTimerStartTime(new Date(s.actualStart));

      if (s.running && s.wallStart) {
        startTimeRef.current = s.wallStart;
        const elapsed = Math.floor((Date.now() - s.wallStart) / 1000);
        setTimerSecs(elapsed);
        setTimerRunning(true);
        setTimerPaused(false);
        intervalRef.current = setInterval(() => {
          setTimerSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 500);
      } else if (s.paused) {
        setTimerSecs(s.pausedSecs || 0);
        setTimerRunning(false);
        setTimerPaused(true);
      }
    } catch {
      localStorage.removeItem('hm_timer');
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadEntries();
    loadTasks();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [
    filterClient,
    filterType,
    dateFilterMode,
    filterMonth,
    filterDate,
    filterStartDate,
    filterEndDate,
  ]);

  async function loadTasks() {
    const [todo, inProgress] = await Promise.all([
      api.get('/tasks', { params: { status: 'todo' } }),
      api.get('/tasks', { params: { status: 'in_progress' } }),
    ]);
    setTasks([...todo.data.data, ...inProgress.data.data]);
  }

  async function loadClients() {
    const res = await api.get('/clients', {
      params: { status: 'active' },
    });

    setClients(res.data.data);
  }

  async function loadEntries() {
    setLoading(true);

    let start;
    let end;

    if (dateFilterMode === 'month') {
      const [year, month] = filterMonth.split('-');

      start = `${year}-${month}-01`;

      end = new Date(
        Number(year),
        Number(month),
        0
      )
        .toISOString()
        .split('T')[0];
    }

    if (dateFilterMode === 'date') {
      start = filterDate;
      end = filterDate;
    }

    if (dateFilterMode === 'range') {
      start = filterStartDate;
      end = filterEndDate;
    }

    try {
      const res = await api.get('/time-entries', {
        params: {
          client_id: filterClient || undefined,
          task_type: filterType || undefined,
          start_date: start,
          end_date: end,
        },
      });

      setEntries(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  function startTimer() {
    clearInterval(intervalRef.current);

    const now = new Date();
    const wallStart = Date.now(); // wall-clock anchor for elapsed calculation

    setTimerStartTime(now);
    setTimerSecs(0);
    setTimerRunning(true);
    setTimerPaused(false);

    startTimeRef.current = wallStart;

    // Persist so the timer survives tab switches / navigation
    localStorage.setItem('hm_timer', JSON.stringify({
      running: true,
      paused: false,
      wallStart,
      actualStart: now.toISOString(),
      clientId: timerClientId,
      taskId: timerTaskId,
      desc: timerDesc,
      type: timerType,
    }));

    // Use 500ms so even a briefly throttled tab catches up quickly
    intervalRef.current = setInterval(() => {
      setTimerSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }

  function pauseTimer() {
    clearInterval(intervalRef.current);

    // Capture accurate elapsed seconds at pause moment
    const pausedSecs = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : timerSecs;

    setTimerSecs(pausedSecs);
    setTimerRunning(false);
    setTimerPaused(true);

    // Update localStorage to reflect paused state
    try {
      const saved = JSON.parse(localStorage.getItem('hm_timer') || '{}');
      localStorage.setItem('hm_timer', JSON.stringify({
        ...saved,
        running: false,
        paused: true,
        pausedSecs,
      }));
    } catch { /* ignore */ }
  }

  function resumeTimer() {
    clearInterval(intervalRef.current);

    // Re-anchor wall-clock so that elapsed continues from pausedSecs
    const wallStart = Date.now() - timerSecs * 1000;
    startTimeRef.current = wallStart;

    setTimerRunning(true);
    setTimerPaused(false);

    try {
      const saved = JSON.parse(localStorage.getItem('hm_timer') || '{}');
      localStorage.setItem('hm_timer', JSON.stringify({
        ...saved,
        running: true,
        paused: false,
        wallStart,
      }));
    } catch { /* ignore */ }

    intervalRef.current = setInterval(() => {
      setTimerSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }

  function stopTimer() {
    clearInterval(intervalRef.current);

    const end = new Date();

    // When running: recalculate from wall clock (accurate even if tab was throttled)
    // When paused:  timerSecs already holds the accurate count from pauseTimer()
    const finalSecs = (!timerPaused && startTimeRef.current)
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : timerSecs;

    setTimerRunning(false);
    setTimerPaused(false);

    localStorage.removeItem('hm_timer');

    const startRef = timerStartTime || new Date(Date.now() - finalSecs * 1000);

    const localStart = new Date(
      startRef.getTime() - startRef.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);

    const localEnd = new Date(
      end.getTime() - end.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);

    setForm({
      client_id: timerClientId,
      task_id: timerTaskId,
      description: timerDesc,
      start_time: localStart,
      end_time: localEnd,
      duration_seconds: finalSecs,
      task_type: timerType,
    });

    setShowModal(true);
  }

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  async function saveEntry(e) {
    e.preventDefault();

    try {
      if (editEntry) {
        await api.put(`/time-entries/${editEntry.id}`, form);

        toast.success('Entry updated');
      } else {
        await api.post('/time-entries', form);

        toast.success('Time logged');
      }

      setShowModal(false);
      setEditEntry(null);

      setForm(BLANK_FORM);

      setTimerSecs(0);
      setTimerDesc('');
      setTimerClientId('');
      setTimerTaskId('');
      setTimerType('va');
      setTimerStartTime(null);
      startTimeRef.current = null;
      localStorage.removeItem('hm_timer');

      loadEntries();
    } catch {
      toast.error('Failed to save');
    }
  }

  function openEdit(entry) {
    setEditEntry(entry);

    setForm({
      client_id: entry.client_id || '',
      task_id: entry.task_id || '',
      description: entry.description || '',
      start_time: entry.start_time || '',
      end_time: entry.end_time || '',
      duration_seconds: entry.duration_seconds || 0,
      task_type: entry.task_type || 'va',
    });

    setShowModal(true);
  }

  function openNew() {
    setEditEntry(null);

    setForm({
      client_id: '',
      task_id: '',
      description: '',
      start_time: getLocalDateTime(),
      end_time: getLocalDateTime(),
      duration_seconds: 0,
      task_type: 'va',
    });
    setShowModal(true);
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this entry?')) return;

    await api.delete(`/time-entries/${id}`);

    toast.success('Deleted');

    loadEntries();
  }

  function exportCSV() {
    const rows = [
      [
        'Client',
        'Type',
        'Description',
        'Start',
        'End',
        'Duration',
      ],
    ];

    entries.forEach(e => {
      rows.push([
        e.client_name || 'Internal',
        (e.task_type || 'va').toUpperCase(),
        e.description || '',
        e.start_time || '',
        e.end_time || '',
        fmtDuration(e.duration_seconds),
      ]);
    });

    const csv = rows
      .map(r => r.map(c => `"${c}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv',
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;
    a.download = 'time-log.csv';

    a.click();
  }

  const totalSeconds = entries.reduce(
    (sum, e) => sum + Number(e.duration_seconds || 0),
    0
  );

  const bkSeconds = entries
    .filter(e => (e.task_type || 'va') === 'bk')
    .reduce(
      (sum, e) => sum + Number(e.duration_seconds || 0),
      0
    );

  const vaSeconds = entries
    .filter(e => e.task_type === 'va')
    .reduce(
      (sum, e) => sum + Number(e.duration_seconds || 0),
      0
    );

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">
          Time Tracking
        </h1>

        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="btn-ghost text-sm"
          >
            ↓ Export CSV
          </button>

          <button
            onClick={openNew}
            className="btn-primary"
          >
            + Manual Entry
          </button>
        </div>
      </div>

      {/* TIMER */}

      <div className="card mb-6">
        <h2 className="font-bold text-gray-800 mb-4">
          Timer
        </h2>

        <div className="flex flex-col items-center gap-4">

          <div className="text-4xl font-mono font-bold text-primary">
            {fmtTimer(timerSecs)}
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full">

            {/* Client */}
            <select
              className="input w-52"
              value={timerClientId}
              onChange={e => {
                const val = e.target.value;
                setTimerClientId(val);
                // Clear task selection when client changes (task may not belong to new client)
                setTimerTaskId('');
                try {
                  const s = JSON.parse(localStorage.getItem('hm_timer') || '{}');
                  if (s.running || s.paused) localStorage.setItem('hm_timer', JSON.stringify({ ...s, clientId: val, taskId: '' }));
                } catch {}
              }}
            >
              <option value="">No client (internal)</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.contact_name}</option>
              ))}
            </select>

            {/* BK / VA */}
            <TypeToggle
              value={timerType}
              onChange={val => {
                setTimerType(val);
                try {
                  const s = JSON.parse(localStorage.getItem('hm_timer') || '{}');
                  if (s.running || s.paused) localStorage.setItem('hm_timer', JSON.stringify({ ...s, type: val }));
                } catch {}
              }}
            />

            {/* Task selector */}
            <select
              className="input w-56"
              value={timerTaskId}
              onChange={e => {
                const taskId = e.target.value;
                const task = tasks.find(t => String(t.id) === taskId);
                setTimerTaskId(taskId);
                if (task) {
                  setTimerDesc(task.title);
                  if (task.client_id) setTimerClientId(String(task.client_id));
                }
                try {
                  const s = JSON.parse(localStorage.getItem('hm_timer') || '{}');
                  if (s.running || s.paused) localStorage.setItem('hm_timer', JSON.stringify({
                    ...s,
                    taskId,
                    desc: task ? task.title : s.desc,
                    clientId: task?.client_id ? String(task.client_id) : s.clientId,
                  }));
                } catch {}
              }}
            >
              <option value="">— No task (enter description) —</option>
              {tasks
                .filter(t => !timerClientId || String(t.client_id) === String(timerClientId))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.client_name ? `[${t.client_name}] ` : ''}{t.title}
                  </option>
                ))
              }
            </select>

            {/* Description — free-text when no task, auto-filled when task selected */}
            <input
              className="input flex-1 min-w-48"
              placeholder={timerTaskId ? 'Add notes (optional)…' : 'Task description…'}
              value={timerDesc}
              onChange={e => {
                setTimerDesc(e.target.value);
                try {
                  const s = JSON.parse(localStorage.getItem('hm_timer') || '{}');
                  if (s.running || s.paused) localStorage.setItem('hm_timer', JSON.stringify({ ...s, desc: e.target.value }));
                } catch {}
              }}
            />

            {!timerRunning && !timerPaused ? (
              <button
                onClick={startTimer}
                className="btn-primary px-6"
              >
                ▶ Start
              </button>
            ) : timerPaused ? (
              <div className="flex gap-2">

                <button
                  onClick={resumeTimer}
                  className="btn-primary px-6"
                >
                  ▶ Resume
                </button>

                <button
                  onClick={stopTimer}
                  className="btn-danger px-6"
                >
                  ■ Stop
                </button>

              </div>
            ) : (
              <div className="flex gap-2">

                <button
                  onClick={pauseTimer}
                  className="btn-secondary px-6"
                >
                  ⏸ Pause
                </button>

                <button
                  onClick={stopTimer}
                  className="btn-danger px-6"
                >
                  ■ Stop
                </button>

              </div>
            )}

          </div>
        </div>
      </div>

      {/* FILTERS */}

      <div className="card mb-6">

        <div className="flex flex-wrap gap-4 items-center justify-between">

          <div className="flex gap-3 flex-wrap">

            <select
              className="input w-40"
              value={dateFilterMode}
              onChange={e =>
                setDateFilterMode(e.target.value)
              }
            >
              <option value="month">Month</option>
              <option value="date">Single Date</option>
              <option value="range">Date Range</option>
            </select>

            {dateFilterMode === 'month' && (
              <input
                type="month"
                className="input w-44"
                value={filterMonth}
                onChange={e =>
                  setFilterMonth(e.target.value)
                }
              />
            )}

            {dateFilterMode === 'date' && (
              <input
                type="date"
                className="input w-44"
                value={filterDate}
                onChange={e =>
                  setFilterDate(e.target.value)
                }
              />
            )}

            {dateFilterMode === 'range' && (
              <>
                <input
                  type="date"
                  className="input w-44"
                  value={filterStartDate}
                  onChange={e =>
                    setFilterStartDate(e.target.value)
                  }
                />

                <input
                  type="date"
                  className="input w-44"
                  value={filterEndDate}
                  onChange={e =>
                    setFilterEndDate(e.target.value)
                  }
                />
              </>
            )}

            <select
              className="input w-48"
              value={filterClient}
              onChange={e =>
                setFilterClient(e.target.value)
              }
            >
              <option value="">All clients</option>

              {clients.map(c => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {c.contact_name}
                </option>
              ))}
            </select>

            <select
              className="input w-36"
              value={filterType}
              onChange={e =>
                setFilterType(e.target.value)
              }
            >
              <option value="">All Types</option>
              <option value="bk">BK Only</option>
              <option value="va">VA Only</option>
            </select>

          </div>

          <div className="text-sm text-right">

            <div>
              Total:{' '}
              <span className="font-bold text-primary">
                {fmtDuration(totalSeconds)}
              </span>
            </div>

            <div className="text-xs text-black">
              BK: {fmtDuration(bkSeconds)}
              {' · '}
              VA: {fmtDuration(vaSeconds)}
            </div>

          </div>
        </div>
      </div>

      {/* TABLE */}

      <div className="card">

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-10 bg-linen animate-pulse rounded"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center py-8 text-black">
            No entries found.
          </p>
        ) : (

          <table className="w-full text-sm table-auto border-collapse">

            <thead>
              <tr className="border-b border-linen">

                <th className="pb-2 text-left text-xs font-semibold text-black">
                  Start
                </th>

                <th className="pb-2 text-left text-xs font-semibold text-black">
                  End
                </th>

                <th className="pb-2 text-left text-xs font-semibold text-black">
                  Client
                </th>

                <th className="pb-2 text-left text-xs font-semibold text-black">
                  Type
                </th>

                <th className="pb-2 text-left text-xs font-semibold text-black">
                  Description
                </th>

                <th className="pb-2 text-right text-xs font-semibold text-black">
                  Duration
                </th>

                <th className="pb-2 text-right text-xs font-semibold text-black">
                  Actions
                </th>

              </tr>
            </thead>

            <tbody className="divide-y divide-linen">

              {entries.map(e => (

                <tr
                  key={e.id}
                  className="hover:bg-linen/40"
                >

                  <td className="py-2 text-gray-600">
                    {e.start_time || '-'}
                  </td>

                  <td className="py-2 text-gray-600">
                    {e.end_time || '-'}
                  </td>

                  <td className="py-2 font-medium">
                    {e.client_name || 'Internal'}
                  </td>

                  <td className="py-2">
                    <TypeBadge type={e.task_type} />
                  </td>

                  <td className="py-2 text-gray-600">
                    {e.description || '-'}
                  </td>

                  <td className="py-2 text-right font-semibold text-primary">
                    {fmtDuration(e.duration_seconds)}
                  </td>

                  <td className="py-2 text-right">

                    <button
                      onClick={() => openEdit(e)}
                      className="text-xs text-primary hover:underline mr-2"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL */}

      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditEntry(null);
        }}
        title={
          editEntry
            ? 'Edit Time Entry'
            : 'Log Time'
        }
      >

        <form
          onSubmit={saveEntry}
          className="space-y-4"
        >

          <div>
            <label className="label">
              Client
            </label>

            <select
              className="input"
              value={form.client_id}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  client_id: e.target.value,
                  task_id: '', // clear task when client changes
                }))
              }
            >
              <option value="">Internal</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.contact_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Task (optional)</label>
            <select
              className="input"
              value={form.task_id}
              onChange={e => {
                const taskId = e.target.value;
                const task = tasks.find(t => String(t.id) === taskId);
                setForm(f => ({
                  ...f,
                  task_id: taskId,
                  description: task ? task.title : f.description,
                  client_id: task?.client_id ? String(task.client_id) : f.client_id,
                }));
              }}
            >
              <option value="">— No task (enter description below) —</option>
              {tasks
                .filter(t => !form.client_id || String(t.client_id) === String(form.client_id))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.client_name ? `[${t.client_name}] ` : ''}{t.title}
                  </option>
                ))
              }
            </select>
          </div>

          <div>
            <label className="label">
              Task Type
            </label>

            <TypeToggle
              value={form.task_type}
              onChange={value =>
                setForm(f => ({
                  ...f,
                  task_type: value,
                }))
              }
            />
          </div>

          <div>
            <label className="label">
              Start Time
            </label>

            <input
              type="datetime-local"
              className="input"
              value={form.start_time}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  start_time: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="label">
              End Time
            </label>

            <input
              type="datetime-local"
              className="input"
              value={form.end_time}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  end_time: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="label">
              Duration (minutes)
            </label>

            <input
              type="number"
              min="0"
              step="0.5"
              className="input"
              value={form.duration_seconds ? +(form.duration_seconds / 60).toFixed(2) : ''}
              onChange={e => {
                const mins = Number(e.target.value) || 0;
                setForm(f => ({
                  ...f,
                  duration_seconds: Math.round(mins * 60),
                }));
              }}
            />
            <p className="text-xs text-silver mt-1">
              {form.duration_seconds > 0 && `= ${fmtDuration(form.duration_seconds)}`}
            </p>
          </div>

          <div>
            <label className="label">
              Description
            </label>

            <textarea
              className="input min-h-16"
              value={form.description}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  description: e.target.value,
                }))
              }
            />
          </div>

          <div className="flex gap-2">

            <button
              type="submit"
              className="btn-primary"
            >
              Save Entry
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowModal(false);
                setEditEntry(null);
              }}
            >
              Cancel
            </button>

          </div>
        </form>
      </Modal>
    </div>
  );
}