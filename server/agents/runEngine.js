'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db/database');
const { getToolByName } = require('./toolRegistry');
const { executeToolCall } = require('./toolHandlers');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TOOL_ITERATIONS = 5;

// Stubs — will be replaced when memory table integration is built
async function getMemory(agentId, clientId) {
  return '';
}

async function setMemory(agentId, clientId, key, value) {
  return;
}

async function runAgent(agentId, triggerType, input) {
  let runId = '';
  const startedAt = new Date();
  const steps = [];

  try {
    // 1. LOAD — agent config + enabled tools
    const { rows } = await pool.query(
      `SELECT a.*, COALESCE(
         array_agg(at.tool_name) FILTER (WHERE at.enabled = true),
         '{}'
       ) AS enabled_tools
       FROM agents a
       LEFT JOIN agent_tools at ON at.agent_id = a.id
       WHERE a.id = $1 AND a.status = 'active'
       GROUP BY a.id`,
      [agentId],
    );

    if (!rows.length) throw new Error(`Agent ${agentId} not found or inactive`);
    const agent = rows[0];

    // 2. LOAD MEMORY
    const memory = await getMemory(agentId, String(agent.client_id));

    // 3. BUILD MESSAGES
    const systemPrompt = memory
      ? `${agent.system_prompt}\n\n## Memory\n${memory}`
      : agent.system_prompt;

    const messages = [
      { role: 'user', content: `Trigger: ${triggerType}\nInput: ${JSON.stringify(input)}` },
    ];

    // 4. Resolve tool definitions for this agent
    const tools = (agent.enabled_tools || [])
      .map((name) => getToolByName(name))
      .filter(Boolean);

    // 5. HANDLE TOOL USE LOOP
    let finalOutput = '';

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: agent.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages,
      });

      steps.push({ iteration: i + 1, stop_reason: response.stop_reason, content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        finalOutput = textBlock ? textBlock.text : '';
        break;
      }

      if (response.stop_reason !== 'tool_use') break;

      // Append assistant message, execute tools, append results
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await executeToolCall(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // 6. LOG completed run
    const { rows: [run] } = await pool.query(
      `INSERT INTO agent_runs (agent_id, trigger_type, status, input, output, steps, started_at, completed_at)
       VALUES ($1, $2, 'completed', $3, $4, $5, $6, now())
       RETURNING id`,
      [agentId, triggerType, JSON.stringify(input), JSON.stringify(finalOutput), JSON.stringify(steps), startedAt],
    );
    runId = run.id;

    // 7. UPDATE MEMORY
    await setMemory(agentId, String(agent.client_id), 'last_run', finalOutput.slice(0, 500));

    return { success: true, output: finalOutput, runId };
  } catch (err) {
    const errorMessage = err.message || String(err);
    try {
      const { rows: [run] } = await pool.query(
        `INSERT INTO agent_runs (agent_id, trigger_type, status, input, error, steps, started_at, completed_at)
         VALUES ($1, $2, 'failed', $3, $4, $5, $6, now())
         RETURNING id`,
        [agentId, triggerType, JSON.stringify(input), errorMessage, JSON.stringify(steps), startedAt],
      );
      runId = run.id;
    } catch (_) {
      // best-effort logging
    }
    return { success: false, output: '', runId };
  }
}

module.exports = { runAgent, getMemory, setMemory };
