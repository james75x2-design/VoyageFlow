// VoyageFlow MCP Phase 1 — Tool-calling loop
// Provider-agnostic orchestration: model asks for a tool, Worker executes it,
// tool result is fed back, and the model returns a final answer.

export async function runToolLoop({
  messages,
  tools,
  callModel,
  executeTool,
  ctx = {},
  maxRounds = 4,
  logEvent = () => {}
}) {
  const working = [...messages];
  const toolCalls = [];
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds++;
    const turn = await callModel(working, tools);

    if (turn.type === 'final') {
      logEvent('info', 'tool_loop_final', { rounds, tool_calls: toolCalls.length });
      return { finalText: turn.text, rounds, toolCalls };
    }

    if (turn.type === 'tool_calls') {
      working.push({ role: 'assistant', tool_calls: turn.calls });

      for (const call of turn.calls) {
        let result;
        try {
          result = await executeTool(call.name, call.args, ctx);
        } catch (err) {
          result = { error: String(err && err.message ? err.message : err) };
        }

        toolCalls.push({ name: call.name, args: call.args, result });
        working.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result)
        });
        logEvent('info', 'tool_executed', { name: call.name });
      }
      continue;
    }

    logEvent('warn', 'tool_loop_unknown_turn', { rounds });
    return { finalText: '', rounds, toolCalls, error: 'unknown_turn_type' };
  }

  logEvent('warn', 'tool_loop_max_rounds', { rounds });
  return { finalText: '', rounds, toolCalls, error: 'max_rounds_exceeded' };
}
