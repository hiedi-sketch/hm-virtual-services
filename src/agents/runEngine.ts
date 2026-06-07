import Anthropic from '@anthropic-ai/sdk';
import pool from './db/pool.js';
import { getToolByName, TOOL_REGISTRY } from './toolRegistry.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TOOL_ITERATIONS = 5;

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<unknown> {
  // Stub — real implementations live in toolHandlers.ts
  console.log(`[agent] tool call: ${toolName}`, toolInput);
  return { result: 'stub: tool not yet implemented', tool: toolName, input: toolInput };
}

export async function getMemory(agentId: string, clientId: number): Promise<string> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM agent_memory WHERE agent_id = $1 AND client_id = $2',
    [agentId, clientId],
  );
  if (!rows.length) return '';
  return rows.map((r) => `${r.key}: ${r.value}`).join('\n');
}

export async function setMemory(
  agentId: string,
  clientId: number,
  key: string,
  value: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_memory (agent_id, client_id, key, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id, client_id, key) DO UPDATE SET value = $4, updated_at = now()`,
    [agentId, clientId, key, value],
  );
}

type AgentRow = {
  id: string;
  client_id: number;
  name: string;
  system_prompt: string;
  model: string;
  enabled_tools: string[];
};

export async function runAgent(
  agentId: string,
  triggerType: string,
  input: Record<string, unknown>,
): Promise<{ success: boolean; output: unknown; runId: string | null; error?: string }> {
  let runId: string | null = null;
  const startedAt = new Date();

  try {
    // 1. Load agent + its enabled tools
    const agentResult = await pool.query<AgentRow>(
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

    if (!agentResult.rows.length) {
      throw new Error(`Agent ${agentId} not found or inactive`);
    }

    const agent = agentResult.rows[0];

    // 2. Load memory
    const memory = await getMemory(agentId, agent.client_id);

    // 3. Build system + initial user message
    const systemPrompt = memory
      ? `${agent.system_prompt}\n\n## Memory\n${memory}`
      : agent.system_prompt;

    const userMessage = `Trigger: ${triggerType}\nInput: ${JSON.stringify(input)}`;

    // 4. Resolve which tools to expose
    const tools = agent.enabled_tools
      .map((name) => getToolByName(name))
      .filter(Boolean) as (typeof TOOL_REGISTRY)[number][];

    // 5. Tool-use loop (max MAX_TOOL_ITERATIONS rounds)
    type Message = Anthropic.MessageParam;
    const messages: Message[] = [{ role: 'user', content: userMessage }];
    let finalOutput: unknown = null;
    const steps: unknown[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: agent.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      steps.push({ iteration: i + 1, stop_reason: response.stop_reason, content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        finalOutput = textBlock ? (textBlock as Anthropic.TextBlock).text : null;
        break;
      }

      if (response.stop_reason !== 'tool_use') break;

      // Execute every tool_use block in this response
      const assistantContent = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of assistantContent) {
        if (block.type !== 'tool_use') continue;
        const result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // 6. Log successful run
    const { rows: [run] } = await pool.query<{ id: string }>(
      `INSERT INTO agent_runs (agent_id, trigger_type, status, input, output, steps, started_at, completed_at)
       VALUES ($1, $2, 'completed', $3, $4, $5, $6, now())
       RETURNING id`,
      [agentId, triggerType, JSON.stringify(input), JSON.stringify(finalOutput), JSON.stringify(steps), startedAt],
    );
    runId = run.id;

    return { success: true, output: finalOutput, runId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log failed run
    try {
      const { rows: [run] } = await pool.query<{ id: string }>(
        `INSERT INTO agent_runs (agent_id, trigger_type, status, input, error, started_at, completed_at)
         VALUES ($1, $2, 'failed', $3, $4, $5, now())
         RETURNING id`,
        [agentId, triggerType, JSON.stringify(input), errorMessage, startedAt],
      );
      runId = run.id;
    } catch (_logErr) {
      // best-effort logging
    }

    return { success: false, output: null, runId, error: errorMessage };
  }
}
