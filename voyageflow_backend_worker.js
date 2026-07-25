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
const WORKER_VERSION = "2.4.0";
const WORKER_SERVICE = "voyageflow-worker";

// ─── Week 5.1 P2/P3: Rate limiting + metrics (KV-backed) ──────────────────────
const RATE_LIMIT_MAX = 20;       // max requests per IP per window
const RATE_LIMIT_WINDOW = 60;    // window in seconds

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
  "http://localhost:3000"
  // Note: GitHub Codespaces preview URLs are session-specific. Add your current
  // Codespace origin here temporarily for local testing, or test end-to-end on
  // the live GitHub Pages origin (already allowlisted above).
];

// ─── System Prompt Template ───────────────────────────────────────────────────
// {{CURRENT_DATE}} is replaced at request time so date reasoning never drifts.
const SYSTEM_PROMPT_TEMPLATE = `# Role
You are VoyageFlow — a warm, knowledgeable, high-end travel concierge. You talk like a well-travelled friend who happens to be an expert planner: thoughtful, concise, and genuinely helpful. You are NOT a form-filler or a document generator. You converse, advise, and only when it makes sense produce a polished plan plus a structured booking summary.

# Core Behavior — Converse First
Before generating a full day-by-day itinerary, make sure you understand the traveller. You need enough to personalize, not just enough to fill fields.

- If the request is vague or missing key personalization (interests, travel pace, rough budget, who is going), ask 2-3 short, friendly clarifying questions FIRST. Do not generate the full itinerary yet.
- Even if the user gives destination + dates + travellers up front, if you do not yet know their INTERESTS, PACE, or BUDGET, ask before planning. A great plan needs to know temples vs nightlife, packed vs relaxed, budget vs luxury.
- Only when you have enough to make a genuinely personalized plan should you write the full itinerary.

Ask like a friend, e.g.:
"Japan in spring sounds wonderful. Before I map it out — a few quick things: What draws you most (food, temples, nature, nightlife)? Do you like a packed pace or a relaxed one? And roughly what daily budget are we working with?"

# When You Do Write the Itinerary
Write like a thoughtful human curator, not a link directory:

1. Lead with a short OVERVIEW (2-4 sentences): the shape of the trip, the rough budget range, and the pace. Big picture first.
2. Day-by-day highlights — clean and scannable. Each day: a short title + 1-2 sentences of what to do and WHY it is worth it. Add a one-line rationale for key choices (why this city order, why this day trip).
3. Keep the prose LINK-LIGHT. Do NOT stack multiple links per line. The prose is for inspiration and reasoning; concrete booking links belong in the booking summary at the end. Reference places by name — the booking summary handles where to book.
4. End with 2-3 concrete adjustment offers, e.g.: "Want me to make this more relaxed, swap a city, or add a day trip?" Keep it a conversation, not a one-shot document.

# Long Trips — Keep It Scannable
For trips longer than about 7 days OR spanning multiple cities:
- Open with a one-line "trip at a glance" (e.g. "Osaka 4 nights -> Nagoya 2 -> Tokyo 6").
- Group the plan into PHASES by city or region, with a short summary per phase — do NOT write an exhaustive separate paragraph for all 20+ days.
- If you use a table, use at most ONE compact summary table (phase/city level), never one row per day for a long trip. Keep tables small and readable.
- Prioritise the highlights and the shape of the journey over listing every single day.

# Revising an Existing Plan
If the user asks to change an itinerary you already provided (add a city, swap a day, adjust pace/budget), do NOT reprint the entire itinerary from scratch. Instead:
- Describe the specific change and how it fits, showing only the affected phase or days.
- Then offer: "Want me to regenerate the full updated itinerary?"
Only regenerate the complete plan if they explicitly ask for the full rewrite. This keeps revisions fast and readable.

Tone: luxurious but genuine. Favour insight and judgement over exhaustive lists.

# Booking Summary (Structured Output)
When — and only when — you have destination, dates, and travellers, end your response with a single valid JSON block in this exact structure:
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
This block powers the booking desk. Only include it once you have destination + dates + travellers. If you are still asking clarifying questions, do NOT include it yet.

# Rules & Constraints
1. Dynamic Year Context: The current date is {{CURRENT_DATE}}. If the user states a date without a year (e.g. "August 1st"), evaluate against the current date:
   - If still in the future this year, use this year.
   - If already passed this year, assume the upcoming occurrence next year.
2. Location Handling:
   - City Input: resolve landmarks/addresses to the parent city; output clean city name in location_value, set location_type to "city".
   - Country/Island Input: resolve a whole country or island chain (e.g. "Maldives", "Bali", "Japan") to its primary arrival capital city.
   - Airport Input: extract the 3-letter IATA code, output it in location_value, set location_type to "airport".
3. Missing Data Policy: If dates or location are missing, do NOT output the JSON block — ask a short conversational question. Likewise, if you lack personalization to plan well (interests / pace / budget), ask first.
4. Defaults: default number_of_rooms to 1; default children to an empty array [].
5. Voice discipline:
   - NEVER use technical words like "JSON", "payload", "schema", "API", "format", "extraction", "fields", or "parameters".
   - NEVER explain internal date calculations or reference math.
   - Maintain the voice of a warm, professional travel curator.

# Example — Clarify First (vague request)
*User:* "I want to plan a trip to Japan."
*AI Response:*
Japan is a fantastic choice — it rewards a bit of planning. Before I map it out, a few quick things so I can tailor it to you:
- What pulls you most — food, temples and history, nature, or city energy and nightlife?
- Do you prefer a packed pace or a slower, relaxed one?
- Roughly what daily budget are we working with, and when were you thinking of going (and for how long)?

Once I know that, I will shape a route that actually fits how you like to travel.

# Example — Full Plan (enough detail provided)
*User:* "Honolulu on August 1st for 4 days with my wife. We love beaches and food, relaxed pace, mid-range budget."
*AI Response:*
Perfect — a relaxed, beach-and-food-focused four days in Honolulu on a comfortable mid-range budget. Here is the shape of it: two anchor beach days, one iconic hike-and-sail day, and an easy final morning. Plan on a comfortable mid-range daily spend for meals and activities, with your resort as the biggest line item.

### 🌴 Honolulu — Relaxed Beach & Food Escape

* Day 1 — Arrival & Waikiki sunset. Settle in, then ease into the trip with a sunset stroll along Waikiki. A gentle start so you are not rushing off a flight.
* Day 2 — Beach day + food crawl. A slow morning on the sand, then a few standout local spots for lunch and dinner. This is your "why we came" day.
* Day 3 — Diamond Head sunrise + catamaran. Early hike for the view (worth the alarm), then an afternoon sail to balance effort with something restful.
* Day 4 — Easy departure. A final oceanfront coffee before you head out.

Want me to build in a North Shore day trip, lean the food picks more upscale, or keep it even more low-key?
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

const RAG_CANDIDATE_POOL = 20;
const KB_VERSION = "2026-07-25";   // bump whenever data/index/worker-chunks.js is regenerated; invalidates stale RAG cache
const RERANKER_MODEL = "@cf/baai/bge-reranker-base";

// Cross-encoder reranker (Week 4): rescores top-N hybrid candidates.
// Returns candidates sorted by rerank_score descending, or null on failure
// so the caller can gracefully fall back to hybrid fusion ranking.
async function rerankCandidates(env, query, candidates) {
  if (!env.AI || !candidates || candidates.length === 0) return null;
  try {
    const contexts = candidates.map(c => ({
      text: String(c.text || "").slice(0, 1000)
    }));
    const result = await env.AI.run(RERANKER_MODEL, { query, contexts });
    const scores = result?.response;
    if (!Array.isArray(scores) || scores.length !== candidates.length) return null;

    return candidates
      .map((c, i) => ({
        ...c,
        rerank_score: Number((scores[i]?.score ?? 0).toFixed(4))
      }))
      .sort((a, b) => b.rerank_score - a.rerank_score);
  } catch (err) {
    return null;
  }
}

async function ragRetrieveHybrid(env, query, topK, poolSize) {
  const effectiveK = poolSize || topK;
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
    .slice(0, effectiveK);
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

// Week 5.1: hash the full query for a collision-free, fixed-length cache key.
// Avoids the collision risk of truncating to the first 200 chars.
async function hashQuery(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
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
// ─── Week 5.1 P2/P3: KV counter helpers ───────────────────────────────────────
async function incrementCounter(env, key, ttl) {
  if (!env.RAG_CACHE) return 0;
  try {
    const current = parseInt((await env.RAG_CACHE.get(key)) || "0", 10);
    const next = current + 1;
    await env.RAG_CACHE.put(key, String(next), ttl ? { expirationTtl: ttl } : {});
    return next;
  } catch {
    return 0;
  }
}

async function readCounter(env, key) {
  if (!env.RAG_CACHE) return 0;
  try {
    return parseInt((await env.RAG_CACHE.get(key)) || "0", 10);
  } catch {
    return 0;
  }
}

async function checkRateLimit(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const count = await incrementCounter(env, `ratelimit:${ip}`, RATE_LIMIT_WINDOW);
  return { allowed: count <= RATE_LIMIT_MAX, count, ip };
}

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

    if (request.method === "GET" && path === "/metrics") {
      const hits = await readCounter(env, "metrics:cache_hits");
      const misses = await readCounter(env, "metrics:cache_misses");
      const total = hits + misses;
      return jsonResponse({
        service: WORKER_SERVICE,
        version: WORKER_VERSION,
        cache_hits: hits,
        cache_misses: misses,
        total_rag_requests: total,
        cache_hit_rate: total > 0 ? Number((hits / total).toFixed(4)) : 0,
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

    const rl = await checkRateLimit(env, request);
    if (!rl.allowed) {
      logEvent("warn", "rate_limited", { ip: rl.ip, count: rl.count });
      return jsonResponse(
        { error: "Rate limit exceeded. Please wait a moment and try again." },
        429, corsHeaders
      );
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
    let cacheKey = null;   // Week 5: shared between cache read (rag branch) + write (success block)

    if (mode === "rag") {
      const query = ragExtractQuery(messages);
      if (!query) {
        logEvent("warn", "rag_missing_query", {});
        return jsonResponse({ error: "Missing user query for RAG mode." }, 400, corsHeaders);
      }

      // Week 5: KV cache read. Common queries return instantly with zero AI calls.
      cacheKey = `rag:${KB_VERSION}:${await hashQuery(query.toLowerCase().trim())}`;
      if (env.RAG_CACHE) {
        try {
          const cached = await env.RAG_CACHE.get(cacheKey, "json");
          if (cached) {
            logEvent("info", "rag_cache_hit", { query_len: query.length });
            await incrementCounter(env, "metrics:cache_hits");
            return jsonResponse({
              ...cached,
              meta: { ...cached.meta, cache: "hit", latency_ms: Date.now() - startTime }
            }, 200, corsHeaders);
          }
        } catch (err) {
          logEvent("warn", "rag_cache_read_failed", { error: err.message });
        }
      }

      // Week 4: retrieve top-20 candidates via hybrid, then rerank to top-5.
      const candidatePool = await ragRetrieveHybrid(env, query, RAG_TOP_K, RAG_CANDIDATE_POOL);
      const reranked = await rerankCandidates(env, query, candidatePool);
      let rankingSignal = "hybrid_fusion";

      if (reranked && reranked.length > 0) {
        ragChunks = reranked.slice(0, RAG_TOP_K);
        rankingSignal = "reranker";
      } else {
        ragChunks = candidatePool.slice(0, RAG_TOP_K);
      }

      ragAllowedIds = ragChunks.map(c => c.chunk_id);

      logEvent("info", "rag_retrieved", {
        query_len: query.length,
        candidate_pool_size: candidatePool.length,
        chunks_count: ragChunks.length,
        chunk_ids: ragAllowedIds,
        retrieval_signal: ragChunks[0]?.retrieval_signal || "none",
        ranking_signal: rankingSignal
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

        const ragPayload = {
          answer_markdown: normalized.answer_markdown || RAG_FALLBACK_ANSWER,
          citations: cleanCitations,
          unanswered: Boolean(normalized.unanswered) || cleanCitations.length === 0,
          meta: {
            mode: "rag",
            model: usedModel,
            version: WORKER_VERSION,
            latency_ms: latencyMs,
            ranking_signal: ragChunks[0]?.rerank_score != null ? "reranker" : "hybrid_fusion",
            retrieval_signal: ragChunks[0]?.retrieval_signal || "unknown",
            chunks_used: ragChunks.map(c => ({
              chunk_id: c.chunk_id,
              section: c.section,
              score: c.score,
              keyword_score: c.keyword_score,
              vector_score: c.vector_score,
              rerank_score: c.rerank_score ?? null,
              retrieval_signal: c.retrieval_signal
            }))
          }
        };

        // Week 5: write to KV cache (1-hour TTL) before returning.
        if (env.RAG_CACHE && cacheKey && !ragPayload.unanswered && ragPayload.citations.length > 0) {
          try {
            await env.RAG_CACHE.put(cacheKey, JSON.stringify(ragPayload), { expirationTtl: 3600 });
          } catch (err) {
            logEvent("warn", "rag_cache_write_failed", { error: err.message });
          }
        }

        await incrementCounter(env, "metrics:cache_misses");
        return jsonResponse(
          { ...ragPayload, meta: { ...ragPayload.meta, cache: "miss" } },
          200, corsHeaders
        );
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
          maxOutputTokens: 4096
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
        max_tokens: 4096
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
