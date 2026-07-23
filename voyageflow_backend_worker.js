import { TRAVEL_CHUNKS, EMBEDDING_MODEL, EMBEDDING_DIMS } from "./data/index/worker-chunks.js";

/**
 * VoyageFlow Serverless Cloudflare Worker — AI Gateway Router (v2.1.1)
 * Format:    ES Module (required for env secrets access)
 * Primary:   Google Gemini API (gemini-2.5-flash)
 * Fallback:  Groq API — tries gpt-oss-120b first, then llama-3.3-70b-versatile
 *
 *  * v2.3.0 Improvements over v2.2.0:
 *   - Hybrid retrieval: keyword scoring + vector similarity with score fusion
 *   - Cloudflare Workers AI embeddings (@cf/baai/bge-small-en-v1.5, 384 dims)
 *   - Graceful fallback to keyword-only if embedding call fails
 *   - Weighted score fusion (0.5 keyword + 0.5 vector, tunable)
 *
 * v2.2.0 Improvements over v2.1.1:
 *   - RAG mode (mode: "rag") with embedded travel chunk retrieval + citations
 *   - Retrieves top-5 chunks via keyword scoring (mirrors src/rag/retrieve.mjs)
 *   - Enforces citation IDs against retrieved chunk set
 *   - Preserves existing itinerary/booking flow with zero regression
 * 
 * v2.1.1 Polish over v2.1.0:
 *   - logEvent now uses console.warn / console.error for proper Cloudflare log levels
 *   - Health endpoint tolerates trailing slash (/health and /health/)
 *   - Stricter root GET routing (only root path returns info payload)
 *
 * v2.1.0 Improvements over v2.0:
 *   - GET /health endpoint for uptime monitoring
 *   - Worker version + latency metrics returned in response meta
 *   - Origin allowlist for CORS (locked down from wildcard)
 *   - Payload size limits (max messages + max text length)
 *   - Structured JSON logging for Cloudflare log search
 *
 * v2.0 Improvements over v1.0:
 *   - Real Groq model IDs (removed invalid qwen/qwen3.6-27b)
 *   - Dynamic date injection (no more hardcoded "July 2, 2026")
 *   - Message-shape validation (safer parsing)
 *   - Timeout protection (25s AbortController on upstream calls)
 *   - Rate-limit surfacing (429 bubbles up cleanly)
 */

// ─── Worker Metadata ──────────────────────────────────────────────────────────
const WORKER_VERSION = "2.3.0";
const WORKER_SERVICE = "voyageflow-worker";

// ─── Groq Fallback Model Chain ────────────────────────────────────────────────
// Verify these IDs against your Groq console before deploying.
const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile"
];

// ─── Upstream Timeout (ms) ────────────────────────────────────────────────────
const UPSTREAM_TIMEOUT_MS = 25000;

// ─── Payload Limits ───────────────────────────────────────────────────────────
const MAX_MESSAGES = 30;
const MAX_TEXT_LENGTH = 8000;

// ─── CORS Allowlist ───────────────────────────────────────────────────────────
// Add any additional origins here (custom domains, local dev, etc.)
const ALLOWED_ORIGINS = [
  "https://james75x2-design.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  
// GitHub Codespaces preview URLs — allow the specific ones you use for testing
  "https://literate-tribble-jr544vxxxwppcrxw-8000.app.github.dev"
];

// ─── System Prompt Template ───────────────────────────────────────────────────
// {{CURRENT_DATE}} is replaced at request time so date reasoning never drifts.
const SYSTEM_PROMPT_TEMPLATE = `# Role
You are the Travel Data Extraction API for VoyageFlow, an elite, high-end travel concierge application. Your purpose is to converse with a user, design a beautiful personalized itinerary, gather their travel intent, and output a structured JSON payload matching the Booking.com and Flights Demand API specifications.

# Objective
Extract the following information from the user's input:
1. Booker's country of origin (default to "us" if unknown).
2. Check-in date (YYYY-MM-DD format).
3. Check-out date (YYYY-MM-DD format).
4. Guest counts (Adults, Rooms, and Child ages).
5. Destination (Either a City Name or a 3-letter Airport IATA code).

# Itinerary Design & JSON Output
When all required fields are known (destination, dates, and travelers), you MUST ALWAYS complete these two steps in exact order:
1. FIRST, write a personalized, high-end travel guide, insider tips, and a complete day-by-day highlights itinerary for their stay. You MUST ALWAYS write the itinerary before generating the JSON block, even if the user directly provides all parameters at once in their first message. Never skip the itinerary. Keep the formatting luxurious and modern.
2. At the very end of your response, output a single valid JSON block containing the extracted parameters in this exact structure:
\`\`\`json
{
  "booker": {
    "country": "string (2-letter code)"
  },
  "checkin": "string (YYYY-MM-DD)",
  "checkout": "string (YYYY-MM-DD)",
  "guests": {
    "number_of_adults": integer,
    "number_of_rooms": integer,
    "children": [integer, integer]
  },
  "location_type": "string (either 'city' or 'airport')",
  "location_value": "string (the plain text city name OR the 3-letter airport code)"
}
\`\`\`

# Rules & Constraints
1. **Dynamic Year Context:** The current date is {{CURRENT_DATE}}. If the user states a date without a year (e.g., "August 1st"), evaluate it against the current date:
   - If the date is still in the future for this year, use this year.
   - If the date has already passed for this year, assume they mean the upcoming occurrence in the next year.
2. **Location Handling:** Determine if the user is targeting a city or an airport:
   - **City Input:** If they provide a city name, address, or landmark (e.g., "near Central Park" or "Eiffel Tower"), resolve it to its parent city. Output the clean, plain-text city name (e.g., "New York" or "Paris") in location_value and set location_type to "city".
   - **Country/Island Input:** If they provide a whole country or island chain (e.g., "Maldives", "Bali", "Japan"), resolve it to its primary arrival capital city.
   - **Airport Input:** If they provide an airport name or code (e.g., "HNL" or "Honolulu Airport"), extract the 3-letter IATA code, output it in location_value, and set location_type to "airport".
3. **Missing Data Policy:** If the user has not provided the dates or location, do NOT output the JSON block yet. Ask a short, conversational, and direct question to gather the missing fields first.
4. **Defaults:** If the user does not mention a room count, default "number_of_rooms" to 1. If they do not mention children, default "children" to an empty array [].
   - NEVER use technical words like "JSON", "payload", "schema", "API", "format", "extraction", "fields", or "parameters".
   - NEVER explain your internal date calculations, year-rounding logic, or reference math.
   - Maintain the voice of a professional travel curator.

# Example Interaction

*User:* "I want to go to Honolulu on August 1st for 4 days with my wife."
*AI Response:*
Honolulu is the perfect destination for a refreshing island getaway! Here is an exclusive mini-itinerary and highlights plan for your stay:

### 🌴 Honolulu Highlight Escape

* **Day 1: Arrival & Sunset over Waikiki** — Check into your resort and head straight to the beach to catch an iconic Hawaiian sunset.
* **Day 2: Historic Sites & Luxury Dining** — Visit Pearl Harbor in the morning, followed by upscale shopping and oceanfront dining at luxury Waikiki restaurants.
* **Day 3: Diamond Head Hike & Catamaran Cruise** — Catch the sunrise from the top of Diamond Head Crater, and spend the afternoon on a relaxed catamaran sailing excursion.
* **Day 4: Departure** — Savor a final morning coffee overlooking the waves before heading out.

I have generated your premium travel summary and direct booking resources below:
\`\`\`json
{
  "booker": {
    "country": "us"
  },
  "checkin": "2026-08-01",
  "checkout": "2026-08-05",
  "guests": {
    "number_of_adults": 2,
    "number_of_rooms": 1,
    "children": []
  },
  "location_type": "city",
  "location_value": "Honolulu"
}
\`\`\``;

// ─── CORS Helper ──────────────────────────────────────────────────────────────
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

// ─── Structured Logging ───────────────────────────────────────────────────────
// Uses console.warn / console.error for proper Cloudflare log severity levels.
function logEvent(level, event, data = {}) {
  const payload = JSON.stringify({
    level,
    event,
    service: WORKER_SERVICE,
    version: WORKER_VERSION,
    timestamp: new Date().toISOString(),
    ...data
  });

  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function getCurrentDateString() {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

function buildSystemPrompt() {
  return SYSTEM_PROMPT_TEMPLATE.replace(
    "{{CURRENT_DATE}}",
    getCurrentDateString()
  );
}

// ─── Message Validation ───────────────────────────────────────────────────────
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Missing or empty messages array");
  }

  if (messages.length > MAX_MESSAGES) {
    throw new Error(`Too many messages (max ${MAX_MESSAGES})`);
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg || typeof msg !== "object") {
      throw new Error(`Message at index ${i} is not an object`);
    }

    if (!msg.role || typeof msg.role !== "string") {
      throw new Error(`Message at index ${i} is missing a valid role`);
    }

    if (!Array.isArray(msg.parts) || msg.parts.length === 0) {
      throw new Error(`Message at index ${i} is missing parts[]`);
    }

    const text = msg.parts[0]?.text;
    if (typeof text !== "string") {
      throw new Error(`Message at index ${i} is missing parts[0].text`);
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Message at index ${i} exceeds ${MAX_TEXT_LENGTH} chars`);
    }
  }
}
// ─── RAG: Vector Similarity Helpers (v2.3.0) ──────────────────────────────────
// Week 3 additions: computes cosine similarity between query embedding and
// pre-computed chunk embeddings, then fuses with keyword score.

const RAG_KEYWORD_WEIGHT = 0.5;
const RAG_VECTOR_WEIGHT = 0.5;

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedQuery(env, query) {
  if (!env.AI) return null;
  try {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: [query] });
    return result?.data?.[0] || null;
  } catch (err) {
    return null;
  }
}

function normalizeScores(items, scoreKey) {
  const scores = items.map(x => x[scoreKey]);
  const max = Math.max(...scores, 0);
  if (max === 0) {
    return items.map(x => ({ ...x, [`${scoreKey}_norm`]: 0 }));
  }
  return items.map(x => ({ ...x, [`${scoreKey}_norm`]: x[scoreKey] / max }));
}

async function ragRetrieveHybrid(env, query, topK) {
  const queryTokens = ragTokenize(query);
  if (queryTokens.length === 0) return [];

  // Signal 1: keyword scoring across ALL chunks
  const keywordScored = TRAVEL_CHUNKS.map(c => ({
    chunk_id: c.chunk_id,
    section: c.section,
    source_path: c.source_path,
    text: c.text,
    embedding: c.embedding,
    keyword_score: ragScoreChunk(queryTokens, c.text),
    vector_score: 0
  }));

  // Signal 2: vector similarity (if AI binding is available)
  const queryEmbedding = await embedQuery(env, query);
  if (queryEmbedding) {
    for (const c of keywordScored) {
      c.vector_score = cosineSimilarity(queryEmbedding, c.embedding);
    }
  }

  // Filter: keep chunks with keyword hits OR meaningful vector similarity
  const VECTOR_THRESHOLD = 0.3;
  let candidates = keywordScored.filter(c =>
    c.keyword_score > 0 || c.vector_score >= VECTOR_THRESHOLD
  );
  if (candidates.length === 0) return [];

  // Normalize per signal, then fuse with weighted sum
  candidates = normalizeScores(candidates, "keyword_score");
  candidates = normalizeScores(candidates, "vector_score");

  const fused = candidates.map(c => ({
    ...c,
    fused_score:
      RAG_KEYWORD_WEIGHT * c.keyword_score_norm +
      RAG_VECTOR_WEIGHT * c.vector_score_norm
  }));

  return fused
    .sort((a, b) => b.fused_score - a.fused_score)
    .slice(0, topK)
    .map(c => ({
      chunk_id: c.chunk_id,
      section: c.section,
      source_path: c.source_path,
      text: c.text,
      score: Number(c.fused_score.toFixed(4)),
      keyword_score: c.keyword_score,
      vector_score: Number(c.vector_score.toFixed(4)),
      retrieval_signal: queryEmbedding ? "hybrid" : "keyword_only"
    }));
}

// ─── RAG: Retrieval + Prompt Helpers (v2.2.0) ─────────────────────────────────
// Reuses the same keyword-scoring logic as src/rag/retrieve.mjs so local eval
// results and production Worker results stay aligned.

const RAG_TOP_K = 5;
const RAG_FALLBACK_ANSWER =
  "I don't have enough evidence in the current VoyageFlow travel knowledge base to answer that.";

function ragTokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function ragScoreChunk(queryTokens, text) {
  const chunkTokens = ragTokenize(text);
  const set = new Set(chunkTokens);
  const lower = text.toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 2;
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function ragRetrieve(query, topK = RAG_TOP_K) {
  const queryTokens = ragTokenize(query);
  if (queryTokens.length === 0) return [];

  return TRAVEL_CHUNKS
    .map(c => ({
      chunk_id: c.chunk_id,
      section: c.section,
      source_path: c.source_path,
      text: c.text,
      score: ragScoreChunk(queryTokens, c.text)
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function ragBuildContext(chunks) {
  return chunks
    .map(c => [
      `<source id="${c.chunk_id}">`,
      `section: ${c.section || "Unknown section"}`,
      `source_path: ${c.source_path || "Unknown source"}`,
      `retrieval_score: ${c.score ?? "unknown"}`,
      "",
      String(c.text || "").trim(),
      `</source>`
    ].join("\n"))
    .join("\n\n");
}

function ragBuildSystemPrompt(query, chunks) {
  const allowedIds = chunks.map(c => c.chunk_id).join(", ");
  const context = ragBuildContext(chunks);
  return `
You are VoyageFlow, an AI travel concierge answering a user's factual question.
Answer using ONLY the retrieved travel context below. Do not use outside knowledge.

Rules:
1. Use only facts found inside <source> blocks.
2. Cite every factual sentence using exact chunk IDs in square brackets, e.g. [${chunks[0]?.chunk_id || "chunk-id"}].
3. Allowed citation IDs: ${allowedIds}
4. If the context does not contain enough information to answer, respond with exactly:
   "${RAG_FALLBACK_ANSWER}"
5. Do not invent citations or sources.
6. Return valid JSON only. Do not include markdown fences like \`\`\`json.

Return this JSON shape exactly:
{
  "answer_markdown": "Natural language travel answer with inline [chunk_id] citations.",
  "citations": [
    { "claim": "Short claim being supported.", "chunk_ids": ["chunk_id"] }
  ],
  "unanswered": false
}

Retrieved context:
${context}

User query:
${query}
`.trim();
}

function ragExtractQuery(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "user") {
      return msg.parts?.[0]?.text || "";
    }
  }
  return "";
}

function ragParseJsonSafely(rawText) {
  if (!rawText) return null;
  const cleaned = String(rawText)
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function ragNormalizeAnswer(rawText, allowedChunkIds) {
  const parsed = ragParseJsonSafely(rawText);
  if (
    parsed &&
    typeof parsed.answer_markdown === "string" &&
    Array.isArray(parsed.citations) &&
    typeof parsed.unanswered === "boolean"
  ) {
    return parsed;
  }

  // Plain-text fallback: extract [chunk_id] citations from raw output.
  const text = String(rawText || "").trim();
  const inlineIds = [...text.matchAll(/\[([a-z0-9._-]+::\d{3})\]/gi)]
    .map(m => m[1])
    .filter(id => allowedChunkIds.includes(id));

  return {
    answer_markdown: text || RAG_FALLBACK_ANSWER,
    citations: [...new Set(inlineIds)].map(id => ({
      claim: "Extracted from plain-text model output.",
      chunk_ids: [id]
    })),
    unanswered: text === RAG_FALLBACK_ANSWER || text.length === 0
  };
}
// ─── Fetch With Timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── JSON Response Helper ─────────────────────────────────────────────────────
function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// ─── Path Normalizer ──────────────────────────────────────────────────────────
// Strips trailing slash so /health and /health/ both match.
function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

// ─── ES Module Export ─────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const startTime = Date.now();
    const corsHeaders = getCorsHeaders(request);
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check (tolerates trailing slash)
    if (request.method === "GET" && path === "/health") {
      return jsonResponse({
        status: "ok",
        service: WORKER_SERVICE,
        version: WORKER_VERSION,
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // Root GET returns friendly info (only for root path, not arbitrary paths)
    if (request.method === "GET" && path === "") {
      return jsonResponse({
        service: WORKER_SERVICE,
        version: WORKER_VERSION,
        message: "This endpoint accepts POST requests with { messages: [...] } payload."
      }, 200, corsHeaders);
    }

    // Unknown GET paths return 404
    if (request.method === "GET") {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }

    // Method guard
    if (request.method !== "POST") {
      return jsonResponse({ error: "Only POST requests allowed" }, 405, corsHeaders);
    }

    // Parse + validate body
    let messages;
    let mode = "chat";
    try {
      const body = await request.json();
      messages = body?.messages;
      mode = body?.mode === "rag" ? "rag" : "chat";
      validateMessages(messages);
    } catch (err) {
      logEvent("warn", "validation_failed", { error: err.message });
      return jsonResponse({ error: `Bad request: ${err.message}` }, 400, corsHeaders);
    }

    // ── RAG mode: retrieve + build citation-enforcing prompt ────────────────
    // If mode !== "rag", we fall through to the original itinerary/booking flow.
    let ragChunks = [];
    let ragAllowedIds = [];
    let systemPrompt;

    if (mode === "rag") {
      const query = ragExtractQuery(messages);
      if (!query) {
        logEvent("warn", "rag_missing_query", {});
        return jsonResponse({ error: "Missing user query for RAG mode." }, 400, corsHeaders);
      }

      ragChunks = await ragRetrieveHybrid(env, query, RAG_TOP_K);
      ragAllowedIds = ragChunks.map(c => c.chunk_id);

      logEvent("info", "rag_retrieved", {
        query_len: query.length,
        chunks_count: ragChunks.length,
        chunk_ids: ragAllowedIds,
        retrieval_signal: ragChunks[0]?.retrieval_signal || "none"
      });

      // No relevant chunks → return fallback answer WITHOUT calling LLM (fast path).
      if (ragChunks.length === 0) {
        return jsonResponse({
          answer_markdown: RAG_FALLBACK_ANSWER,
          citations: [],
          unanswered: true,
          meta: {
            mode: "rag",
            version: WORKER_VERSION,
            model: "none",
            chunks_used: [],
            latency_ms: Date.now() - startTime
          }
        }, 200, corsHeaders);
      }

      // Replace user turn with the RAG prompt; keep the array shape Gemini/Groq expect.
      const ragPrompt = ragBuildSystemPrompt(query, ragChunks);
      messages = [{ role: "user", parts: [{ text: ragPrompt }] }];
      systemPrompt = "You are a strict retrieval-grounded assistant. Follow the user's instructions exactly and return only valid JSON.";
    } else {
      systemPrompt = buildSystemPrompt();
    }

    let rawContent = null;
    let usedModel = null;
    let rateLimited = false;
    const failureLogs = [];

    // ── Attempt 1: Gemini primary ────────────────────────────────────────────
    try {
      rawContent = await callGemini(messages, systemPrompt, env);
      usedModel = "gemini-2.5-flash";
    } catch (geminiError) {
      logEvent("warn", "gemini_failed", { error: geminiError.message });
      failureLogs.push(`Gemini: ${geminiError.message}`);

      if (geminiError.message.includes("RATE_LIMIT")) {
        rateLimited = true;
      }

      // ── Attempt 2+: Groq fallback chain ────────────────────────────────────
      for (const model of GROQ_FALLBACK_MODELS) {
        try {
          rawContent = await callGroq(messages, model, systemPrompt, env);
          usedModel = model;
          logEvent("info", "groq_fallback_succeeded", { model });
          rateLimited = false;
          break;
        } catch (groqError) {
          logEvent("warn", "groq_failed", { model, error: groqError.message });
          failureLogs.push(`Groq (${model}): ${groqError.message}`);

          if (groqError.message.includes("RATE_LIMIT")) {
            rateLimited = true;
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;

// ── Success ──────────────────────────────────────────────────────────────
    if (rawContent) {
      logEvent("info", "request_succeeded", {
        mode,
        model: usedModel,
        latency_ms: latencyMs
      });

      // RAG mode: normalize LLM output into the citation-enforced JSON shape.
      if (mode === "rag") {
        const normalized = ragNormalizeAnswer(rawContent, ragAllowedIds);

        // Enforce that every cited chunk_id is in the retrieved set.
        const cleanCitations = (normalized.citations || [])
          .map(c => ({
            claim: typeof c.claim === "string" ? c.claim : "",
            chunk_ids: Array.isArray(c.chunk_ids)
              ? c.chunk_ids.filter(id => ragAllowedIds.includes(id))
              : []
          }))
          .filter(c => c.chunk_ids.length > 0);

        return jsonResponse({
          answer_markdown: normalized.answer_markdown || RAG_FALLBACK_ANSWER,
          citations: cleanCitations,
          unanswered: Boolean(normalized.unanswered) || cleanCitations.length === 0,
          meta: {
            mode: "rag",
            model: usedModel,
            version: WORKER_VERSION,
            latency_ms: latencyMs,
            chunks_used: ragChunks.map(c => ({
              chunk_id: c.chunk_id,
              section: c.section,
              score: c.score
            }))
          }
        }, 200, corsHeaders);
      }

      // Default (chat/booking) mode: unchanged response shape.
      return jsonResponse({
        reply: rawContent,
        meta: {
          model: usedModel,
          version: WORKER_VERSION,
          latency_ms: latencyMs
        }
      }, 200, corsHeaders);
    }

    // ── All engines failed ───────────────────────────────────────────────────
    logEvent("error", "all_providers_failed", {
      rate_limited: rateLimited,
      latency_ms: latencyMs,
      logs: failureLogs
    });

    return jsonResponse({
      error: rateLimited
        ? "VoyageFlow is temporarily busy — please try again in a moment."
        : "All AI routing providers failed to respond.",
      logs: failureLogs.join(" | "),
      meta: { version: WORKER_VERSION, latency_ms: latencyMs }
    }, rateLimited ? 429 : 502, corsHeaders);
  }
};

// ─── Primary Engine: Google Gemini ────────────────────────────────────────────
async function callGemini(messages, systemPrompt, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Configuration missing: GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: messages,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1500
        }
      })
    }, UPSTREAM_TIMEOUT_MS);
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Gemini timeout (>25s)");
    }
    throw new Error(`Gemini network error: ${err.message}`);
  }

  if (response.status === 429) {
    throw new Error("Gemini RATE_LIMIT (429)");
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response returned from Gemini");
  return text;
}

// ─── Fallback Engine: Groq ────────────────────────────────────────────────────
async function callGroq(messages, model, systemPrompt, env) {
  if (!env.GROQ_API_KEY) {
    throw new Error("Configuration missing: GROQ_API_KEY");
  }

  const promptPayload = [
    { role: "system", content: systemPrompt },
    ...messages.map(msg => ({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.parts[0].text
    }))
  ];

  let response;
  try {
    response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: promptPayload,
        temperature: 0.2,
        max_tokens: 1500
      })
    }, UPSTREAM_TIMEOUT_MS);
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Groq timeout on ${model} (>25s)`);
    }
    throw new Error(`Groq network error on ${model}: ${err.message}`);
  }

  if (response.status === 429) {
    throw new Error(`Groq RATE_LIMIT on ${model} (429)`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq Error on ${model} (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from Groq model: ${model}`);
  return text;
}
