/**
 * VoyageFlow Serverless Cloudflare Worker — AI Gateway Router (v2.1.1)
 * Format:    ES Module (required for env secrets access)
 * Primary:   Google Gemini API (gemini-2.5-flash)
 * Fallback:  Groq API — tries gpt-oss-120b first, then llama-3.3-70b-versatile
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
const WORKER_VERSION = "2.1.1";
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
  "http://localhost:3000"
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
    try {
      const body = await request.json();
      messages = body?.messages;
      validateMessages(messages);
    } catch (err) {
      logEvent("warn", "validation_failed", { error: err.message });
      return jsonResponse({ error: `Bad request: ${err.message}` }, 400, corsHeaders);
    }

    const systemPrompt = buildSystemPrompt();

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
      logEvent("info", "request_succeeded", { model: usedModel, latency_ms: latencyMs });

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
