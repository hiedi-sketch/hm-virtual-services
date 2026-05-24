const express = require('express');
const db = require('../../db/database');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const { encrypt, decrypt } = require('../../utils/crypto');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

// ClickUp status → local status
const STATUS_MAP = {
  'open': 'todo', 'to do': 'todo', 'backlog': 'todo',
  'in progress': 'in_progress', 'active': 'in_progress',
  'review': 'in_review', 'in review': 'in_review', 'testing': 'in_review',
  'complete': 'done', 'closed': 'done', 'done': 'done',
};

// local status → ClickUp status name to try
const LOCAL_TO_CU = { todo: 'Open', in_progress: 'in progress', in_review: 'review', done: 'complete' };

function getToken() {
  const row = db.prepare("SELECT value FROM integration_settings WHERE key = 'clickup_token'").get();
  return row ? decrypt(row.value) : null;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM integration_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO integration_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

async function cuFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('ClickUp token not configured');
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.err || `ClickUp API error ${res.status}`);
  }
  return res.json();
}

router.post('/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  setSetting('clickup_token', encrypt(token));
  res.json({ message: 'ClickUp token saved' });
});

router.get('/status', (req, res) => {
  const hasToken = !!getToken();
  const teamId = getSetting('clickup_team_id');
  const lastSynced = getSetting('clickup_last_synced');

  // Support new multi-list format (JSON array) and old single-list format
  const listsRaw = getSetting('clickup_lists');
  let lists = [];
  if (listsRaw) {
    try { lists = JSON.parse(listsRaw); } catch {}
  } else {
    // Migrate from old single-list storage
    const listId = getSetting('clickup_list_id');
    const listName = getSetting('clickup_list_name');
    if (listId) lists = [{ id: listId, name: listName || listId }];
  }

  res.json({ data: { connected: hasToken, teamId, lists, lastSynced } });
});

// Get teams (workspaces)
router.get('/teams', async (req, res) => {
  try {
    const data = await cuFetch('/team');
    res.json({ data: data.teams });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get spaces for a team
router.get('/teams/:teamId/spaces', async (req, res) => {
  try {
    const data = await cuFetch(`/team/${req.params.teamId}/space?archived=false`);
    res.json({ data: data.spaces });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get lists for a space
router.get('/spaces/:spaceId/lists', async (req, res) => {
  try {
    const [folders, lists] = await Promise.all([
      cuFetch(`/space/${req.params.spaceId}/folder?archived=false`),
      cuFetch(`/space/${req.params.spaceId}/list?archived=false`),
    ]);
    const folderLists = await Promise.all(
      folders.folders.map(f => cuFetch(`/folder/${f.id}/list?archived=false`).then(r => r.lists))
    );
    const allLists = [...lists.lists, ...folderLists.flat()];
    res.json({ data: allLists.map(l => ({ id: l.id, name: l.name, folder: l.folder?.name })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Save selected lists (array of {id, name} objects)
router.post('/list', (req, res) => {
  const { teamId, lists } = req.body;
  if (!Array.isArray(lists) || lists.length === 0) {
    return res.status(400).json({ error: 'At least one list required' });
  }
  setSetting('clickup_team_id', teamId);
  setSetting('clickup_lists', JSON.stringify(lists));
  // Clear old single-list keys if they exist (migration)
  db.prepare("DELETE FROM integration_settings WHERE key IN ('clickup_list_id','clickup_list_name')").run();
  res.json({ message: `${lists.length} list(s) saved` });
});

// Main sync — parses ClickUp tags to assign client (by contact name) and BK/VA type
router.post('/sync', async (req, res) => {
  // Support both new multi-list and old single-list storage
  const listsRaw = getSetting('clickup_lists');
  let selectedLists = [];
  if (listsRaw) {
    try { selectedLists = JSON.parse(listsRaw); } catch {}
  } else {
    const listId = getSetting('clickup_list_id');
    const listName = getSetting('clickup_list_name');
    if (listId) selectedLists = [{ id: listId, name: listName || listId }];
  }
  if (selectedLists.length === 0) return res.status(400).json({ error: 'No list configured' });

  // Fetch tasks from all selected lists, deduplicated by ClickUp task ID
  const taskMap = new Map();
  await Promise.all(selectedLists.map(async list => {
    const data = await cuFetch(`/list/${list.id}/task?include_closed=true&subtasks=true`);
    (data.tasks || []).forEach(t => { if (!taskMap.has(t.id)) taskMap.set(t.id, t); });
  }));
  const tasks = Array.from(taskMap.values());

  // Load all active clients once for tag matching
  const allClients = db.prepare("SELECT id, contact_name, business_name FROM clients WHERE status = 'active'").all();

  let created = 0, updated = 0;
  const syncedIds = new Set();

  for (const t of tasks) {
    syncedIds.add(t.id);
    const rawStatus = (t.status?.status || '').toLowerCase();
    const localStatus = STATUS_MAP[rawStatus] || 'todo';
    const dueDate = t.due_date ? new Date(Number(t.due_date)).toISOString().split('T')[0] : null;
    // ClickUp priority: 1=urgent, 2=high, 3=normal, 4=low
    const cuPriority = t.priority?.priority;
    const priority = cuPriority === '1' || cuPriority === '2' ? 'high'
      : cuPriority === '3' ? 'medium' : 'low';

    // Parse tags: tag objects have a .name property
    const tagNames = (t.tags || []).map(tag =>
      (typeof tag === 'string' ? tag : (tag.name || '')).toLowerCase().trim()
    );

    // Match client by contact_name (case-insensitive)
    const matchedClient = allClients.find(c =>
      tagNames.includes(c.contact_name.toLowerCase().trim())
    );

    // BK or VA from tags; default to 'bk'
    const taskType = tagNames.includes('va') ? 'va' : 'bk';

    const existing = db.prepare("SELECT * FROM tasks WHERE source = 'clickup' AND source_id = ?").get(t.id);

    if (existing) {
      // Dashboard is master: preserve local status unless ClickUp marks done
      const newStatus = localStatus === 'done' ? 'done'
        : (existing.status === 'done' ? 'in_progress' : existing.status);

      // Always update client/type from tags; preserve local edits to other fields
      db.prepare(`
        UPDATE tasks SET
          title=?, description=?, status=?, due_date=?, priority=?,
          task_type=?,
          client_id = COALESCE(?, client_id),
          source_archived=0, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        t.name, t.description || null, newStatus, dueDate, priority,
        taskType,
        matchedClient ? matchedClient.id : null,
        existing.id
      );
      updated++;
    } else {
      db.prepare(`
        INSERT INTO tasks
          (title, description, status, priority, due_date, is_client_visible,
           source, source_id, source_archived, task_type, client_id)
        VALUES (?, ?, ?, ?, ?, 0, 'clickup', ?, 0, ?, ?)
      `).run(
        t.name, t.description || null, localStatus, priority, dueDate,
        t.id, taskType, matchedClient ? matchedClient.id : null
      );
      created++;
    }
  }

  // Mark tasks no longer in ClickUp as archived
  const existingCuTasks = db.prepare("SELECT id, source_id FROM tasks WHERE source = 'clickup' AND source_archived = 0").all();
  for (const et of existingCuTasks) {
    if (!syncedIds.has(et.source_id)) {
      db.prepare('UPDATE tasks SET source_archived = 1 WHERE id = ?').run(et.id);
    }
  }

  setSetting('clickup_last_synced', new Date().toISOString());
  res.json({ message: `Sync complete — ${created} created, ${updated} updated` });
});

// Push status change back to ClickUp
router.post('/push/:taskId', async (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND source = 'clickup'").get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found or not ClickUp-sourced' });

  const cuStatus = LOCAL_TO_CU[task.status] || 'Open';
  try {
    await cuFetch(`/task/${task.source_id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: cuStatus }),
    });
    res.json({ message: `ClickUp task updated to "${cuStatus}"` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/disconnect', (req, res) => {
  ['clickup_token', 'clickup_team_id', 'clickup_list_id', 'clickup_list_name', 'clickup_lists', 'clickup_last_synced'].forEach(k => {
    db.prepare('DELETE FROM integration_settings WHERE key = ?').run(k);
  });
  res.json({ message: 'ClickUp disconnected' });
});

module.exports = router;
