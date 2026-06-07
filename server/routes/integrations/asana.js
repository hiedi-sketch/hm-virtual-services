const express = require('express');
const { pool } = require('../../db/database');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const { encrypt, decrypt } = require('../../utils/crypto');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const ASANA_BASE = 'https://app.asana.com/api/1.0';

async function getToken() {
  const { rows } = await pool.query("SELECT value FROM integration_settings WHERE key = 'asana_token'");
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

async function asanaFetch(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error('Asana token not configured');
  const res = await fetch(`${ASANA_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `Asana API error ${res.status}`);
  }
  return res.json();
}

router.post('/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await setSetting('asana_token', encrypt(token));
    res.json({ message: 'Asana token saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const [hasToken, workspaceGid, workspaceName, lastSynced, projectsRaw] = await Promise.all([
      getToken().then(t => !!t),
      getSetting('asana_workspace_gid'),
      getSetting('asana_workspace_name'),
      getSetting('asana_last_synced'),
      getSetting('asana_projects'),
    ]);
    const projects = projectsRaw ? JSON.parse(projectsRaw) : [];
    res.json({ data: { connected: hasToken, workspaceGid, workspaceName, lastSynced, projects } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workspaces', async (req, res) => {
  try {
    const data = await asanaFetch('/workspaces');
    res.json({ data: data.data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/workspace', async (req, res) => {
  try {
    const { gid, name } = req.body;
    if (!gid) return res.status(400).json({ error: 'Workspace GID required' });
    await setSetting('asana_workspace_gid', gid);
    await setSetting('asana_workspace_name', name || gid);
    const data = await asanaFetch(`/workspaces/${gid}/projects?opt_fields=gid,name`);
    await setSetting('asana_projects', JSON.stringify(data.data.map(p => ({ gid: p.gid, name: p.name, enabled: false }))));
    res.json({ data: data.data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/projects', async (req, res) => {
  try {
    const { projects } = req.body;
    await setSetting('asana_projects', JSON.stringify(projects));
    res.json({ message: 'Projects saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const projectsRaw = await getSetting('asana_projects');
    if (!projectsRaw) return res.status(400).json({ error: 'No projects configured' });

    const projects = JSON.parse(projectsRaw).filter(p => p.enabled);
    if (!projects.length) return res.status(400).json({ error: 'No projects selected for sync' });

    let created = 0, updated = 0;

    for (const project of projects) {
      const tasksData = await asanaFetch(
        `/projects/${project.gid}/tasks?opt_fields=gid,name,completed,due_on,notes,assignee`
      );

      const syncedGids = new Set();
      for (const t of tasksData.data) {
        syncedGids.add(t.gid);
        const localStatus = t.completed ? 'done' : 'in_progress';
        const { rows } = await pool.query("SELECT * FROM tasks WHERE source = 'asana' AND source_id = $1", [t.gid]);
        const existing = rows[0];

        if (existing) {
          const newStatus = t.completed ? 'done' : (existing.status === 'done' ? 'in_progress' : existing.status);
          await pool.query(`
            UPDATE tasks SET title=$1, description=$2, status=$3, due_date=$4, source_archived=0, updated_at=NOW()
            WHERE id=$5
          `, [t.name, t.notes || null, newStatus, t.due_on || null, existing.id]);
          updated++;
        } else {
          await pool.query(`
            INSERT INTO tasks (title, description, status, due_date, is_client_visible, source, source_id, source_archived)
            VALUES ($1, $2, $3, $4, 0, 'asana', $5, 0)
          `, [t.name, t.notes || null, localStatus, t.due_on || null, t.gid]);
          created++;
        }
      }

      const { rows: existingTasks } = await pool.query(
        "SELECT id, source_id FROM tasks WHERE source = 'asana' AND source_archived = 0"
      );
      for (const et of existingTasks) {
        if (!syncedGids.has(et.source_id)) {
          await pool.query('UPDATE tasks SET source_archived = 1 WHERE id = $1', [et.id]);
        }
      }
    }

    await setSetting('asana_last_synced', new Date().toISOString());
    res.json({ message: `Sync complete — ${created} created, ${updated} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/:taskId', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1 AND source = 'asana'", [req.params.taskId]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found or not Asana-sourced' });

    const completed = task.status === 'done';
    await asanaFetch(`/tasks/${task.source_id}`, {
      method: 'PUT',
      body: JSON.stringify({ data: { completed } }),
    });
    res.json({ message: `Asana task marked ${completed ? 'complete' : 'incomplete'}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/disconnect', async (req, res) => {
  try {
    const keys = ['asana_token', 'asana_workspace_gid', 'asana_workspace_name', 'asana_last_synced', 'asana_projects'];
    for (const k of keys) {
      await pool.query('DELETE FROM integration_settings WHERE key = $1', [k]);
    }
    res.json({ message: 'Asana disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
