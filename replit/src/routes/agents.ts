import { Router } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();

const VALID_TOOLS = ['send_email', 'fetch_qbo_bills', 'create_asana_task', 'read_gmail', 'update_ap_status', 'draft_reply'];
const VALID_MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const VALID_STATUSES = ['active', 'inactive'];

function validate(body: any): string[] {
  const errors: string[] = [];
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
    if (!Array.isArray(tools)) errors.push('tools must be an array');
    else {
      const invalid = tools.filter((t: string) => !VALID_TOOLS.includes(t));
      if (invalid.length) errors.push(`unknown tools: ${invalid.join(', ')}`);
    }
  }
  return errors;
}

// GET /api/agents
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const user = req.session.user!;
    let result;

    if (user.role === 'admin') {
      if (req.query['client_id']) {
        const cid = Number(req.query['client_id']);
        result = await db.execute(sql`
          SELECT a.*, COALESCE(json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled)) FILTER (WHERE at.id IS NOT NULL), '[]'::json) AS tools
          FROM agents a LEFT JOIN agent_tools at ON at.agent_id = a.id
          WHERE a.client_id = ${cid} GROUP BY a.id ORDER BY a.created_at DESC`);
      } else {
        result = await db.execute(sql`
          SELECT a.*, COALESCE(json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled)) FILTER (WHERE at.id IS NOT NULL), '[]'::json) AS tools
          FROM agents a LEFT JOIN agent_tools at ON at.agent_id = a.id
          GROUP BY a.id ORDER BY a.created_at DESC`);
      }
    } else {
      const clientId = (user as any).client_id;
      if (!clientId) return res.json({ data: [] });
      result = await db.execute(sql`
        SELECT a.*, COALESCE(json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled)) FILTER (WHERE at.id IS NOT NULL), '[]'::json) AS tools
        FROM agents a LEFT JOIN agent_tools at ON at.agent_id = a.id
        WHERE a.client_id = ${clientId} GROUP BY a.id ORDER BY a.created_at DESC`);
    }

    res.json({ data: (result as any).rows ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
router.get('/agents/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT a.*, COALESCE(json_agg(json_build_object('tool_name', at.tool_name, 'enabled', at.enabled)) FILTER (WHERE at.id IS NOT NULL), '[]'::json) AS tools
      FROM agents a LEFT JOIN agent_tools at ON at.agent_id = a.id
      WHERE a.id = ${id} GROUP BY a.id`);
    const rows = (result as any).rows ?? [];
    if (!rows.length) return res.status(404).json({ error: 'Agent not found' });
    const agent = rows[0];

    const user = req.session.user!;
    if (user.role !== 'admin' && (user as any).client_id !== agent.client_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ data: agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents
router.post('/agents', requireAdmin, async (req, res) => {
  try {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { name, client_id, system_prompt, description = null, model = 'claude-sonnet-4-6', status = 'active', tools = [] } = req.body;

    const agentResult = await db.execute(sql`
      INSERT INTO agents (client_id, name, description, system_prompt, model, status)
      VALUES (${Number(client_id)}, ${name.trim()}, ${description}, ${system_prompt.trim()}, ${model}, ${status})
      RETURNING *`);
    const agent = (agentResult as any).rows[0];

    if (tools.length) {
      for (const toolName of tools) {
        await db.execute(sql`INSERT INTO agent_tools (agent_id, tool_name, enabled) VALUES (${agent.id}, ${toolName}, true)`);
      }
    }

    res.status(201).json({ data: { ...agent, tools: tools.map((t: string) => ({ tool_name: t, enabled: true })) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id
router.put('/agents/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await db.execute(sql`SELECT id FROM agents WHERE id = ${id}`);
    if (!((exists as any).rows?.length)) return res.status(404).json({ error: 'Agent not found' });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { name, client_id, system_prompt, description = null, model = 'claude-sonnet-4-6', status = 'active', tools = [] } = req.body;

    const updateResult = await db.execute(sql`
      UPDATE agents SET client_id = ${Number(client_id)}, name = ${name.trim()}, description = ${description},
        system_prompt = ${system_prompt.trim()}, model = ${model}, status = ${status}
      WHERE id = ${id} RETURNING *`);
    const agent = (updateResult as any).rows[0];

    await db.execute(sql`DELETE FROM agent_tools WHERE agent_id = ${id}`);
    for (const toolName of tools) {
      await db.execute(sql`INSERT INTO agent_tools (agent_id, tool_name, enabled) VALUES (${id}, ${toolName}, true)`);
    }

    res.json({ data: { ...agent, tools: tools.map((t: string) => ({ tool_name: t, enabled: true })) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id
router.delete('/agents/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`DELETE FROM agents WHERE id = ${id} RETURNING id`);
    if (!((result as any).rows?.length)) return res.status(404).json({ error: 'Agent not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
