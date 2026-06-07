const express = require('express');
const { pool, withTransaction } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const VALID_TOOLS = [
  'send_email',
  'fetch_qbo_bills',
  'create_asana_task',
  'read_gmail',
  'update_ap_status',
  'draft_reply',
];

const VALID_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

const VALID_STATUSES = ['active', 'inactive'];

function validate(body) {
  const errors = [];
  const { name, client_id, system_prompt, model, status, tools } = body;

  if (!name || typeof name !== 'string' || !name.trim()) errors.push('name is required');
  else if (name.trim().length > 100) errors.push('name must be 100 characters or fewer');

  if (!client_id || !Number.isInteger(Number(client_id)) || Number(client_id) < 1)
    errors.push('client_id must be a positive integer');

  if (!system_prompt || typeof system_prompt !== 'string' || !system_prompt.trim())
    errors.push('system_prompt is required');

  if (model !== undefined && !VALID_MODELS.includes(model))
    errors.push(`model must be one of: ${VALID_MODELS.join(', ')}`);

  if (status !== undefined && !VALID_STATUSES.includes(status))
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);

  if (tools !== undefined) {
    if (!Array.isArray(tools)) {
      errors.push('tools must be an array');
    } else {
      const invalid = tools.filter((t) => !VALID_TOOLS.includes(t));
      if (invalid.length) errors.push(`unknown tools: ${invalid.join(', ')}`);
    }
  }

  return errors;
}

// GET /api/agents — admin sees all; client sees only their own
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT a.*,
        COALESCE(
          json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled))
          FILTER (WHERE at.id IS NOT NULL),
          '[]'
        ) AS tools
      FROM agents a
      LEFT JOIN agent_tools at ON at.agent_id = a.id
    `;
    const params = [];

    if (req.user.role === 'client') {
      const { rows } = await pool.query(
        'SELECT id FROM clients WHERE user_id = $1',
        [req.user.id],
      );
      if (!rows.length) return res.json({ data: [] });
      params.push(rows[0].id);
      query += ` WHERE a.client_id = $1`;
    } else if (req.query.client_id) {
      params.push(req.query.client_id);
      query += ` WHERE a.client_id = $1`;
    }

    query += ' GROUP BY a.id ORDER BY a.created_at DESC';

    const { rows: agents } = await pool.query(query, params);
    res.json({ data: agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT a.*,
        COALESCE(
          json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled))
          FILTER (WHERE at.id IS NOT NULL),
          '[]'
        ) AS tools
       FROM agents a
       LEFT JOIN agent_tools at ON at.agent_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [id],
    );

    if (!rows.length) return res.status(404).json({ error: 'Agent not found' });
    const agent = rows[0];

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query(
        'SELECT id FROM clients WHERE user_id = $1',
        [req.user.id],
      );
      if (!clientRows.length || clientRows[0].id !== agent.client_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({ data: agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents — admin only
router.post('/', requireAdmin, async (req, res) => {
  try {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const {
      name,
      client_id,
      system_prompt,
      description = null,
      model = 'claude-sonnet-4-6',
      status = 'active',
      tools = [],
    } = req.body;

    const agent = await withTransaction(async (client) => {
      const { rows: [newAgent] } = await client.query(
        `INSERT INTO agents (client_id, name, description, system_prompt, model, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [Number(client_id), name.trim(), description, system_prompt.trim(), model, status],
      );

      if (tools.length) {
        const toolValues = tools
          .map((_, i) => `($1, $${i + 2}, true)`)
          .join(', ');
        await client.query(
          `INSERT INTO agent_tools (agent_id, tool_name, enabled) VALUES ${toolValues}`,
          [newAgent.id, ...tools],
        );
      }

      return newAgent;
    });

    res.status(201).json({ data: { ...agent, tools: tools.map((t) => ({ tool_name: t, enabled: true })) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id — admin only
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: existing } = await pool.query('SELECT id FROM agents WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Agent not found' });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const {
      name,
      client_id,
      system_prompt,
      description = null,
      model = 'claude-sonnet-4-6',
      status = 'active',
      tools = [],
    } = req.body;

    const agent = await withTransaction(async (client) => {
      const { rows: [updated] } = await client.query(
        `UPDATE agents
         SET client_id = $1, name = $2, description = $3, system_prompt = $4,
             model = $5, status = $6
         WHERE id = $7
         RETURNING *`,
        [Number(client_id), name.trim(), description, system_prompt.trim(), model, status, id],
      );

      // Replace tools: delete existing, insert new set
      await client.query('DELETE FROM agent_tools WHERE agent_id = $1', [id]);
      if (tools.length) {
        const toolValues = tools
          .map((_, i) => `($1, $${i + 2}, true)`)
          .join(', ');
        await client.query(
          `INSERT INTO agent_tools (agent_id, tool_name, enabled) VALUES ${toolValues}`,
          [id, ...tools],
        );
      }

      return updated;
    });

    res.json({ data: { ...agent, tools: tools.map((t) => ({ tool_name: t, enabled: true })) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id — admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Agent not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
