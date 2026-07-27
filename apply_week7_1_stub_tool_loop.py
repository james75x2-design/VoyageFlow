from pathlib import Path
p = Path('voyageflow_backend_worker.js')
s = p.read_text()

imports = '''import { TRAVEL_CHUNKS, EMBEDDING_MODEL, EMBEDDING_DIMS } from "./data/index/worker-chunks.js";
import { runToolLoop } from "./src/mcp/tool-loop.mjs";
import { TOOL_DEFS, executeTool } from "./src/mcp/tools.mjs";
import {
  toolsForGemini,
  contentsForGemini,
  parseGeminiResponse,
  toolsForGroq,
  messagesForGroq,
  parseGroqResponse
} from "./src/mcp/adapters.mjs";'''
old_import = 'import { TRAVEL_CHUNKS, EMBEDDING_MODEL, EMBEDDING_DIMS } from "./data/index/worker-chunks.js";'
if 'runToolLoop' not in s:
    if old_import not in s:
        raise SystemExit('ERROR: top import anchor not found')
    s = s.replace(old_import, imports, 1)

old_gem = 'rawContent = await callGemini(messages, systemPrompt, env);'
new_gem = 'rawContent = mode === "rag"\n        ? await callGemini(messages, systemPrompt, env)\n        : await callGeminiWithToolLoop(messages, systemPrompt, env);'
if new_gem not in s:
    if old_gem not in s:
        raise SystemExit('ERROR: Gemini call anchor not found')
    s = s.replace(old_gem, new_gem, 1)

old_groq = 'rawContent = await callGroq(messages, model, systemPrompt, env);'
new_groq = 'rawContent = mode === "rag"\n            ? await callGroq(messages, model, systemPrompt, env)\n            : await callGroqWithToolLoop(messages, model, systemPrompt, env);'
if new_groq not in s:
    if old_groq not in s:
        raise SystemExit('ERROR: Groq call anchor not found')
    s = s.replace(old_groq, new_groq, 1)

anchor = '// ─── Primary Engine: Google Gemini ────────────────────────────────────────────\nasync function callGemini(messages, systemPrompt, env) {'
helper = r'''
// ─── Week 7.1: Tool Loop Helpers (stub transit tool) ──────────────────────────
function normalizeMessagesForToolLoop(messages) {
  return messages.map(msg => ({
    role: msg.role === "model" ? "assistant" : msg.role,
    content: msg.parts?.[0]?.text || ""
  }));
}

async function callGeminiWithToolLoop(messages, systemPrompt, env) {
  const loopMessages = normalizeMessagesForToolLoop(messages);
  const result = await runToolLoop({
    messages: loopMessages,
    tools: TOOL_DEFS,
    executeTool,
    ctx: { env },
    maxRounds: 4,
    logEvent,
    callModel: async (workingMessages, tools) => {
      const data = await callGeminiToolTurn(workingMessages, tools, systemPrompt, env);
      return parseGeminiResponse(data);
    }
  });

  if (result.error) {
    throw new Error(`Gemini tool loop failed: ${result.error}`);
  }
  return result.finalText;
}

async function callGroqWithToolLoop(messages, model, systemPrompt, env) {
  const loopMessages = normalizeMessagesForToolLoop(messages);
  const result = await runToolLoop({
    messages: loopMessages,
    tools: TOOL_DEFS,
    executeTool,
    ctx: { env },
    maxRounds: 4,
    logEvent,
    callModel: async (workingMessages, tools) => {
      const data = await callGroqToolTurn(workingMessages, tools, model, systemPrompt, env);
      return parseGroqResponse(data);
    }
  });

  if (result.error) {
    throw new Error(`Groq tool loop failed on ${model}: ${result.error}`);
  }
  return result.finalText;
}

async function callGeminiToolTurn(workingMessages, tools, systemPrompt, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Configuration missing: GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contentsForGemini(workingMessages),
      tools: toolsForGemini(tools),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    })
  }, UPSTREAM_TIMEOUT_MS);

  if (response.status === 429) {
    throw new Error("Gemini RATE_LIMIT (429)");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
  }
  return response.json();
}

async function callGroqToolTurn(workingMessages, tools, model, systemPrompt, env) {
  if (!env.GROQ_API_KEY) {
    throw new Error("Configuration missing: GROQ_API_KEY");
  }

  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: messagesForGroq(workingMessages, systemPrompt),
      tools: toolsForGroq(tools),
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 4096
    })
  }, UPSTREAM_TIMEOUT_MS);
ienti
  if (response.status === 429) {
    throw new Error(`Groq RATE_LIMIT on ${model} (429)`);
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq Error on ${model} (${response.status}): ${errBody}`);
  }
  return response.json();
}

'''
# remove accidental marker if present in raw string after edit
helper = helper.replace('\nienti\n', '\n')
if 'Week 7.1: Tool Loop Helpers' not in s:
    if anchor not in s:
        raise SystemExit('ERROR: helper insertion anchor not found')
    s = s.replace(anchor, helper + anchor, 1)

p.write_text(s)
print('OK patched Week 7.1 stub tool loop')
