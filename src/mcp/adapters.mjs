// VoyageFlow MCP Phase 1 — Gemini/Groq function-calling adapters.
// Pure helpers: no network calls, Worker-safe.

export function toolsForGroq(toolDefs) {
  return toolDefs.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

export function messagesForGroq(messages, systemPrompt) {
  const out = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });

  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content });
    } else if (m.role === 'assistant' && m.tool_calls) {
      out.push({
        role: 'assistant',
        content: null,
        tool_calls: m.tool_calls.map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }))
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export function parseGroqResponse(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return { type: 'final', text: '' };

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      calls: msg.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        args: safeParse(tc.function?.arguments)
      }))
    };
  }

  return { type: 'final', text: msg.content || '' };
}

export function toolsForGemini(toolDefs) {
  return [{
    functionDeclarations: toolDefs.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }))
  }];
}

export function contentsForGemini(messages) {
  const contents = [];

  for (const m of messages) {
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: m.name,
            response: { result: safeParse(m.content) }
          }
        }]
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      contents.push({
        role: 'model',
        parts: m.tool_calls.map(c => ({ functionCall: { name: c.name, args: c.args } }))
      });
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }]
      });
    }
  }

  return contents;
}

export function parseGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return { type: 'final', text: '' };

  const fnParts = parts.filter(p => p.functionCall);
  if (fnParts.length > 0) {
    return {
      type: 'tool_calls',
      calls: fnParts.map((p, i) => ({
        id: `gemini-call-${i}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {}
      }))
    };
  }

  return { type: 'final', text: parts.map(p => p.text || '').join('').trim() };
}

function safeParse(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
