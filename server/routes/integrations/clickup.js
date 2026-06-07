const express = require('express');
const { pool } = require('../../db/database');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const { encrypt, decrypt } = require('../../utils/crypto');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

const STATUS_MAP = {
  'open': 'todo', 'to do': 'todo', 'backlog': 'todo',
  'in progress': 'in_progress', 'active': 'in_progress',
  'review': 'in_review', 'in review': 'in_review', 'testing': 'in_review',
  'complete': 'done', 'closed': 'done', 'done': 'done',
};

const LOCAL_TO_CU = { todo: 'Open', in_progress: 'in progress', in_review: 'review', done: 'complete' };

async function getToken() {
  const { rows } = await pool.query("SELECT value FROM integration_settings WHERE key = 'clickup_token'");
  return rows[0] ? decrypt(rows[0].value) : null;
}

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM integration_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO integration_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

async function cuFetch(path, options = {}) {
  const token = await getToken();
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

router.post('/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await setSetting('clickup_token', encrypt(token));
    res.json({ message: 'ClickUp token saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const [hasToken, teamId, lastSynced, listsRaw, listId, listName] = await Promise.all([
      getToken().then(t => !!t),
      getSetting('clickup_team_id'),
      getSetting('clickup_last_synced'),
      getSetting('clickup_lists'),
      getSetting('clickup_list_id'),
      getSetting('clickup_list_name'),
    ]);

    let lists = [];
    if (listsRaw) {
      try { lists = JSON.parse(listsRaw); } catch {}
    } else if (listId) {
      lists = [{ id: listId, name: listName || listId }];
    }

    res.json({ data: { connected: hasToken, teamId, lists, lastSynced } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/teams', async (req, res) => {
  try {
    const data = await cuFetch('/team');
    res.json({ data: data.teams });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/teams/:teamId/spaces', async (req, res) => {
  try {
    const data = await cuFetch(`/team/${req.params.teamId}/space?archived=false`);
    res.json({ data: data.spaces });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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

router.post('/list', async (req, res) => {
  try {
    const { teamId, lists } = req.body;
    if (!Array.isArray(lists) || lists.length === 0) {
      return res.status(400).json({ error: 'At least one list required' });
    }
    await setSetting('clickup_team_id', teamId);
    await setSetting('clickup_lists', JSON.stringify(lists));
    await pool.query("DELETE FROM integration_settings WHERE key IN ('clickup_list_id','clickup_list_name')");
    res.json({ message: `${lists.length} list(s) saved` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const listsRaw = await getSetting('clickup_lists');
    let selectedLists = [];
    if (listsRaw) {
      try { selectedLists = JSON.parse(listsRaw); } catch {}
    } else {
      const [listId, listName] = await Promise.all([getSetting('clickup_list_id'), getSetting('clickup_list_name')]);
      if (listId) selectedLists = [{ id: listId, name: listName || listId }];
    }
    if (selectedLists.length === 0) return res.status(400).json({ error: 'No list configured' });

    const taskMap = new Map();
    await Promise.all(selectedLists.map(async list => {
      const data = await cuFetch(`/list/${list.id}/task?include_closed=true&subtasks=true`);
      (data.tasks || []).forEach(t => { if (!taskMap.has(t.id)) taskMap.set(t.id, t); });
    }));
    const tasks = Array.from(taskMap.values());

    const { rows: allClients } = await pool.query(
      "SELECT id, contact_name, business_name FROM clients WHERE status = 'active'"
    );

    let created = 0, updated = 0;
    const syncedIds = new Set();

    for (const t of tasks) {
      syncedIds.add(t.id);
      const rawStatus = (t.status?.status || '').toLowerCase();
      const localStatus = STATUS_MAP[rawStatus] || 'todo';
      const dueDate = t.due_date ? new Date(Number(t.due_date)).toISOString().split('T')[0] : null;
      const cuPriority = t.priority?.priority;
      const priority = cuPriority === '1' || cuPriority === '2' ? 'high'
        : cuPriority === '3' ? 'medium' : 'low';

      const tagNames = (t.tags || []).map(tag =>
        (typeof tag === 'string' ? tag : (tag.name || '')).toLowerCase().trim()
      );

      const matchedClient = allClients.find(c =>
        tagNames.includes(c.contact_name.toLowerCase().trim())
      );

      const taskType = tagNames.includes('va') ? 'va' : 'bk';

      const { rows } = await pool.query("SELECT * FROM tasks WHERE source = 'clickup' AND source_id = $1", [t.id]);
      const existing = rows[0];

      if (existing) {
        const newStatus = localStatus === 'done' ? 'done'
          : (existing.status === 'done' ? 'in_progress' : existing.status);

        await pool.query(`
          UPDATE tasks SET
            title=$1, description=$2, status=$3, due_date=$4, priority=$5,
            task_type=$6,
            client_id = COALESCE($7, client_id),
            source_archived=0, updated_at=NOW()
          WHERE id=$8
        `, [
          t.name, t.description || null, newStatus, dueDate, priority,
          taskType,
          matchedClient ? matchedClient.id : null,
          existing.id,
        ]);
        updated++;
      } else {
        await pool.query(`
          INSERT INTO tasks
            (title, description, status, priority, due_date, is_client_visible,
             source, source_id, source_archived, task_type, client_id)
          VALUES ($1, $2, $3, $4, $5, 0, 'clickup', $6, 0, $7, $8)
        `, [
          t.name, t.description || null, localStatus, priority, dueDate,
          t.id, taskType, matchedClient ? matchedClient.id : null,
        ]);
        created++;
      }
    }

    const { rows: existingCuTasks } = await pool.query(
      "SELECT id, source_id FROM tasks WHERE source = 'clickup' AND source_archived = 0"
    );
    for (const et of existingCuTasks) {
      if (!syncedIds.has(et.source_id)) {
        await pool.query('UPDATE tasks SET source_archived = 1 WHERE id = $1', [et.id]);
      }
    }

    await setSetting('clickup_last_synced', new Date().toISOString());
    res.json({ message: `Sync complete — ${created} created, ${updated} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/:taskId', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1 AND source = 'clickup'", [req.params.taskId]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found or not ClickUp-sourced' });

    const cuStatus = LOCAL_TO_CU[task.status] || 'Open';
    await cuFetch(`/task/${task.source_id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: cuStatus }),
    });
    res.json({ message: `ClickUp task updated to "${cuStatus}"` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/disconnect', async (req, res) => {
  try {
    const keys = ['clickup_token', 'clickup_team_id', 'clickup_list_id', 'clickup_list_name', 'clickup_lists', 'clickup_last_synced'];
    for (const k of keys) {
      await pool.query('DELETE FROM integration_settings WHERE key = $1', [k]);
    }
    res.json({ message: 'ClickUp disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
