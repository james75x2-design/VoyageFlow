/**
 * VoyageFlow Serverless Cloudflare Worker — AI Gateway Router
 * Format:    ES Module (required for env secrets access)
 * Primary:   Google Gemini API (gemini-2.5-flash)
 * Fallback:  Groq API — tries gpt-oss-120b first, then qwen3.6-27b
 *
 * GROQ FALLBACK ORDER (edit GROQ_FALLBACK_MODELS to reorder or remove either):
 *   1. openai/gpt-oss-120b   — higher quality, reasoning-capable, Groq's primary recommendation
 *   2. qwen/qwen3.6-27b      — fast, strong structured output, good secondary option
 */

// ─── Groq Fallback Model Chain ────────────────────────────────────────────────
// To switch to Qwen-first: swap the order below.
// To use only one model: remove the other entry from the array.
const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b"
];

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `# Role
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
1. **Dynamic Year Context:** The current date is Thursday, July 2, 2026 (Year: 2026). If the user states a date without a year (e.g., "August 1st"), evaluate it against the current date:
   - If the date is still in the future for this year (2026), use 2026.
   - If the date has already passed for this year (before July 2, 2026), assume they mean the upcoming occurrence in the next year (2027).
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

// ─── ES Module Export (required for env.GEMINI_API_KEY / env.GROQ_API_KEY) ────
export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST requests allowed" }), {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    try {
      const { messages } = await request.json();
      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "Missing or invalid messages array parameter" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      let rawContent = null;
      let usedModel = null;
      const failureLogs = [];

      // ── Attempt 1: Gemini primary ──────────────────────────────────────────
      try {
        rawContent = await callGemini(messages, env);
        usedModel = "gemini-2.5-flash";
      } catch (geminiError) {
        console.warn("[VoyageFlow] Gemini failed, triggering Groq fallback chain. Reason:", geminiError.message);
        failureLogs.push(`Gemini: ${geminiError.message}`);

        // ── Attempt 2+: Groq fallback chain (tries each model in order) ─────
        for (const model of GROQ_FALLBACK_MODELS) {
          try {
            rawContent = await callGroq(messages, model, env);
            usedModel = model;
            console.info(`[VoyageFlow] Groq fallback succeeded on model: ${model}`);
            break;
          } catch (groqError) {
            console.warn(`[VoyageFlow] Groq model ${model} failed:`, groqError.message);
            failureLogs.push(`Groq (${model}): ${groqError.message}`);
          }
        }
      }

      // ── Success ────────────────────────────────────────────────────────────
      if (rawContent) {
        return new Response(JSON.stringify({
          reply: rawContent,
          meta: { model: usedModel }
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // ── All engines failed ─────────────────────────────────────────────────
      return new Response(JSON.stringify({
        error: "All AI routing providers failed to respond.",
        logs: failureLogs.join(" | ")
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
  }
};

// ─── Primary Engine: Google Gemini ────────────────────────────────────────────
async function callGemini(messages, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Configuration missing: GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: messages,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500
      }
    })
  });

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
async function callGroq(messages, model, env) {
  if (!env.GROQ_API_KEY) {
    throw new Error("Configuration missing: GROQ_API_KEY");
  }

  const promptPayload = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(msg => ({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.parts[0].text
    }))
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq Error on ${model} (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from Groq model: ${model}`);
  return text;
}
