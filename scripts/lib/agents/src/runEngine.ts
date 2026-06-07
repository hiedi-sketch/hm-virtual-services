import Anthropic from '@anthropic-ai/sdk';
import pool from './db/pool.js';
import { TOOL_REGISTRY } from './toolRegistry.js';

// ── Stubs (replace with real implementations later) ──────────────────────────

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  return { result: 'stub: tool not yet implemented' };
}

export async function getMemory(
  agentId: string,
  clientId: string
): Promise<string> {
  return '';
}

export async function setMemory(
  agentId: string,
  clientId: string,
  key: string,
  value: string
): Promise<void> {
  return;
}

// ── Main run function ─────────────────────────────────────────────────────────

export async function runAgent(
  agentId: string,
  triggerType: string,
  input: unknown
): Promise<{ success: boolean; output: string; runId: string }> {
  const startedAt = new Date();
  const steps: unknown[] = [];
  let runId = '';

  try {
    // 1. LOAD agent config + enabled tools
    const agentResult = await pool.query(
      `SELECT a.*,
         COALESCE(
           array_agg(at.tool_name) FILTER (WHERE at.enabled = true),
           ARRAY[]::text[]
         ) AS enabled_tools
       FROM agents a
       LEFT JOIN agent_tools at ON at.agent_id = <a.id>
       WHERE <a.id> = $1
       GROUP BY <a.id>`,
      [agentId]
    );
    const agent = agentResult.rows[0];
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // 2. LOAD MEMORY
    const memorySummary = await getMemory(agentId, String(agent.client_id));

    // 3. BUILD MESSAGES
    const systemPrompt = memorySummary
      ? `${agent.system_prompt}\n\n--- Relevant Memory ---\n${memorySummary}`
      : agent.system_prompt;

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Trigger: ${triggerType}\nInput: ${JSON.stringify(input)}`,
      },
    ];

    // Filter TOOL_REGISTRY to only this agent's enabled tools
    const enabledToolNames: string[] = agent.enabled_tools ?? [];
    const tools = TOOL_REGISTRY.filter(t => enabledToolNames.includes(t.name));

    // 4. CALL CLAUDE
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const MAX_ITERATIONS = 5;
    let finalOutput = '';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: agent.model as string,
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      steps.push({ iteration: iteration + 1, stop_reason: response.stop_reason, content: response.content });

      // 5. HANDLE TOOL USE LOOP
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
        finalOutput = textBlock?.text ?? '';
        break;
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeToolCall(
              block.name,
              block.input as Record<string, unknown>
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: <block.id>,
              content: JSON.stringify(result),
            });
          }
        }
        messages.push({ role: 'user', content: toolResults });
      } else {
        // Unexpected stop reason — capture text and exit
        const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
        finalOutput = textBlock?.text ?? '';
        break;
      }
    }

    // 6. LOG completed run
    const runResult = await pool.query(
      `INSERT INTO agent_runs
         (agent_id, trigger_type, status, input, output, steps, started_at, completed_at)
       VALUES ($1, $2, 'completed', $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING id`,
      [
        agentId,
        triggerType,
        JSON.stringify(input),
        JSON.stringify({ text: finalOutput }),
        JSON.stringify(steps),
        startedAt.toISOString(),
        new Date().toISOString(),
      ]
    );
    runId = runResult.rows[0].id as string;

    // 7. UPDATE MEMORY (extend when setMemory is implemented)
    await setMemory(agentId, String(agent.client_id), 'last_run', new Date().toISOString());

    // 8. RETURN
    return { success: true, output: finalOutput, runId };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    try {
      const runResult = await pool.query(
        `INSERT INTO agent_runs
           (agent_id, trigger_type, status, input, error, steps, started_at, completed_at)
         VALUES ($1, $2, 'failed', $3::jsonb, $4, $5::jsonb, $6, $7)
         RETURNING id`,
        [
          agentId,
          triggerType,
          JSON.stringify(input),
          message,
          JSON.stringify(steps),
          startedAt.toISOString(),
          new Date().toISOString(),
        ]
      );
      runId = runResult.rows[0].id as string;
    } catch (logErr) {
      console.error('Failed to log run failure:', logErr);
    }

    return { success: false, output: message, runId };
  }
}
