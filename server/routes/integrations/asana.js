const express = require('express');
const db = require('../../db/database');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const { encrypt, decrypt } = require('../../utils/crypto');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const ASANA_BASE = 'https://app.asana.com/api/1.0';

function getToken() {
  const row = db.prepare("SELECT value FROM integration_settings WHERE key = 'asana_token'").get();
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

async function asanaFetch(path, options = {}) {
  const token = getToken();
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

// Save token
router.post('/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  setSetting('asana_token', encrypt(token));
  res.json({ message: 'Asana token saved' });
});

router.get('/status', (req, res) => {
  const hasToken = !!getToken();
  const workspaceGid = getSetting('asana_workspace_gid');
  const workspaceName = getSetting('asana_workspace_name');
  const lastSynced = getSetting('asana_last_synced');
  const projectsRaw = getSetting('asana_projects');
  const projects = projectsRaw ? JSON.parse(projectsRaw) : [];
  res.json({ data: { connected: hasToken, workspaceGid, workspaceName, lastSynced, projects } });
});

// Fetch workspaces (called after token is saved)
router.get('/workspaces', async (req, res) => {
  try {
    const data = await asanaFetch('/workspaces');
    res.json({ data: data.data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Save selected workspace and fetch its projects
router.post('/workspace', async (req, res) => {
  const { gid, name } = req.body;
  if (!gid) return res.status(400).json({ error: 'Workspace GID required' });
  setSetting('asana_workspace_gid', gid);
  setSetting('asana_workspace_name', name || gid);
  try {
    const data = await asanaFetch(`/workspaces/${gid}/projects?opt_fields=gid,name`);
    setSetting('asana_projects', JSON.stringify(data.data.map(p => ({ gid: p.gid, name: p.name, enabled: false }))));
    res.json({ data: data.data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle which projects to sync
router.put('/projects', (req, res) => {
  const { projects } = req.body;
  setSetting('asana_projects', JSON.stringify(projects));
  res.json({ message: 'Projects saved' });
});

// Main sync
router.post('/sync', async (req, res) => {
  const projectsRaw = getSetting('asana_projects');
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
      const existing = db.prepare("SELECT * FROM tasks WHERE source = 'asana' AND source_id = ?").get(t.gid);

      if (existing) {
        // Only overwrite status if Asana says it's done; don't regress in-review back
        const newStatus = t.completed ? 'done' : (existing.status === 'done' ? 'in_progress' : existing.status);
        db.prepare(`
          UPDATE tasks SET title=?, description=?, status=?, due_date=?, source_archived=0, updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(t.name, t.notes || null, newStatus, t.due_on || null, existing.id);
        updated++;
      } else {
        db.prepare(`
          INSERT INTO tasks (title, description, status, due_date, is_client_visible, source, source_id, source_archived)
          VALUES (?, ?, ?, ?, 0, 'asana', ?, 0)
        `).run(t.name, t.notes || null, localStatus, t.due_on || null, t.gid);
        created++;
      }
    }

    // Archive tasks from this project that are no longer in Asana
    const existingTasks = db.prepare("SELECT id, source_id FROM tasks WHERE source = 'asana' AND source_archived = 0").all();
    for (const et of existingTasks) {
      if (!syncedGids.has(et.source_id)) {
        db.prepare('UPDATE tasks SET source_archived = 1 WHERE id = ?').run(et.id);
      }
    }
  }

  setSetting('asana_last_synced', new Date().toISOString());
  res.json({ message: `Sync complete — ${created} created, ${updated} updated` });
});

// Push local status change back to Asana
router.post('/push/:taskId', async (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND source = 'asana'").get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found or not Asana-sourced' });

  const completed = task.status === 'done';
  try {
    await asanaFetch(`/tasks/${task.source_id}`, {
      method: 'PUT',
      body: JSON.stringify({ data: { completed } }),
    });
    res.json({ message: `Asana task marked ${completed ? 'complete' : 'incomplete'}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/disconnect', (req, res) => {
  ['asana_token', 'asana_workspace_gid', 'asana_workspace_name', 'asana_last_synced', 'asana_projects'].forEach(k => {
    db.prepare('DELETE FROM integration_settings WHERE key = ?').run(k);
  });
  res.json({ message: 'Asana disconnected' });
});

module.exports = router;
