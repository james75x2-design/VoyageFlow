// DEPLOYMENT STEPS:
// 1. Go to https://workers.cloudflare.com and create a free account
// 2. Create a new Worker and paste this code
// 3. Go to Settings > Variables > Add variable:
//    Name: GROQ_API_KEY  Value: your-groq-api-key
// 4. Save and deploy — Cloudflare gives you a free .workers.dev URL
// 5. Copy that URL and paste it into index.html as WORKER_URL

const DEFAULT_MAX_COMPLETION_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;
const ENABLE_MODEL_DISCOVERY = true;
const ENABLE_DEBUG_LOGS = true;
const MAX_FALLBACK_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 15000;

// PRIMARY CHAT / GENERAL / REASONING MODELS
const CHAT_MODEL_PRIORITY = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
  'groq/compound',
  'groq/compound-mini'
];

// SPECIALIZED / UTILITY MODELS
const SPECIALIZED_MODELS = [
  'openai/gpt-oss-safeguard-20b',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
  'whisper-large-v3',
  'whisper-large-v3-turbo',
  'canopylabs/orpheus-v1-english',
  'canopylabs/orpheus-arabic-saudi'
];

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Worker setup configuration error: GROQ_API_KEY environment variable is missing.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    try {
      const body = await request.json();
      
      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(
          JSON.stringify({ error: 'Invalid payload error: "messages" parameter array is required.' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      const userProfile = body.userProfile || {};
      const result = await generateReplyWithFallback(body.messages, userProfile, env.GROQ_API_KEY);
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (err) {
      if (ENABLE_DEBUG_LOGS) console.error('[FATAL WORKER ERROR]:', err);
      return new Response(
        JSON.stringify({ error: err.message || 'An internal system error occurred inside the VoyageFlow backend.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }
};

function getGroqHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

function buildSystemPrompt(userProfile) {
  let personalizedContext = '';
  if (userProfile && userProfile.lastDestination) {
    personalizedContext = `\n[USER COOKIE MEMORY]
- The user is returning to research.
- Last researched destination: "${userProfile.lastDestination}"
- Last known departure point: "${userProfile.lastOrigin || 'Singapore'}"
- Naturally suggest ideas extending this trip or comparing options!`;
  }

  return `You are VoyageFlow, a world-class AI travel agent and destination expert available to everyone for free. You serve all traveller types — budget backpackers, families, couples, luxury travellers, solo adventurers, and business professionals.

Your job is to help users:
1. Plan complete trips — flights, hotels, itineraries, budgets, packing lists, visa requirements, best travel times.
2. Discover destinations — personalised recommendations based on mood, budget, interests, travel style, or time of year.
3. Build detailed day-by-day itineraries with real, specific suggestions (not generic advice).
4. Compare options — budget vs luxury, multiple destinations, travel seasons.
5. Answer any travel question with current, accurate information.

Behaviour rules:
- If the user has not provided origin, destination, dates, budget, or travel party size — ask for the missing details before planning. Ask naturally, not like a form.
- Structure all responses clearly with headings, bullet points, and sections. Responses should feel like a professional travel brief, not a wall of text.
- Be warm, enthusiastic, and knowledgeable — like a trusted friend who happens to be a world-class travel expert.
- Use emojis sparingly but effectively to make responses feel alive and engaging.
- Always recommend travel insurance as part of any complete trip plan — frame it as essential, not optional.
- When comparing destinations or options, use a simple comparison table.
- Ground all pricing, visa rules, travel advisories, and availability in realistic current travel estimates — never guess wild figures.
- At the end of every response that mentions a destination or bookable product, you MUST add a clearly labelled section on a new line containing this exact tag format populated with your calculated, estimated pricing numbers for budget vs premium flights and hotels:
[AFFILIATE_LINKS: destination='{destination}' origin='{origin}' cheap_flight='{budget_flight_price_usd}' premium_flight='{premium_flight_price_usd}' cheap_carrier='{budget_airline_name}' premium_carrier='{premium_airline_name}' cheap_hotel='{budget_hotel_nightly_price_usd}' luxury_hotel='{luxury_hotel_nightly_price_usd}']

Instructions for the tag parameters:
- Replace {destination} and {origin} with actual values from context (e.g., destination='Bali' origin='Singapore').
- Estimates must be integers representable in USD (e.g., cheap_flight='120' premium_flight='450' cheap_hotel='40' luxury_hotel='280').
- Estimate realistic airline names (e.g., cheap_carrier='AirAsia' premium_carrier='Singapore Airlines').
- Do not wrap this tag block in any markdown code blocks, backticks, or other formatting symbols. Keep it on its own plain line. ${personalizedContext}`;
}

async function getAvailableGroqModels(apiKey) {
  if (!ENABLE_MODEL_DISCOVERY) return [];
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: getGroqHeaders(apiKey),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data && Array.isArray(data.data)) {
      return data.data.map(m => m.id);
    }
  } catch (err) {
    if (ENABLE_DEBUG_LOGS) console.warn('[MODEL DISCOVERY FAILURE]: Failed fetching available Groq model catalog. Falling back to default list.', err);
  }
  return [];
}

function classifyModelCapability(modelId) {
  if (SPECIALIZED_MODELS.includes(modelId)) {
    return 'specialized';
  }
  return 'chat';
}

function getChatModelCandidates(discoveredModels) {
  if (discoveredModels.length === 0) {
    return [...CHAT_MODEL_PRIORITY];
  }
  const validCandidates = CHAT_MODEL_PRIORITY.filter(model => discoveredModels.includes(model));
  if (validCandidates.length === 0) {
    if (ENABLE_DEBUG_LOGS) console.warn('[ROUTING ADVISORY]: Discovered models had no intersection with priority registry. Reverting to basic prioritized list.');
    return [...CHAT_MODEL_PRIORITY];
  }
  return validCandidates;
}

async function callGroqChatCompletion(model, systemPrompt, formattedMessages, maxTokens, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...formattedMessages
    ],
    temperature: DEFAULT_TEMPERATURE,
    max_completion_tokens: maxTokens
  };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: getGroqHeaders(apiKey),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function parseErrorBody(response) {
  try {
    return response.json();
  } catch (e) {
    return { error: { message: 'Could not parse JSON error payload.' } };
  }
}

function shouldRetryWithFallback(status, errorDetail) {
  const errMsg = (errorDetail?.error?.message || '').toLowerCase();
  if (status === 429 || status === 503 || status === 502 || status === 500) {
    return true;
  }
  if (status === 400) {
    if (errMsg.includes('token') || errMsg.includes('context') || errMsg.includes('rate limit') || errMsg.includes('overloaded') || errMsg.includes('capacity') || errMsg.includes('not found')) {
      return true;
    }
  }
  return false;
}

async function generateReplyWithFallback(messages, userProfile, apiKey) {
  const systemPrompt = buildSystemPrompt(userProfile);
  
  const formattedMessages = messages.map(msg => {
    const text = msg.parts ? msg.parts.map(p => p.text).join('\n') : (msg.content || '');
    const role = msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user';
    return { role, content: text };
  });

  const discoveredModels = await getAvailableGroqModels(apiKey);
  const candidates = getChatModelCandidates(discoveredModels);
  
  if (ENABLE_DEBUG_LOGS) {
    console.log('[VoyageFlow Routing]: Found candidates:', candidates);
  }

  let attempt = 0;
  let attemptedModels = [];
  let currentMaxTokens = DEFAULT_MAX_COMPLETION_TOKENS;

  for (const model of candidates) {
    if (attempt >= MAX_FALLBACK_ATTEMPTS) {
      break;
    }
    
    attempt++;
    attemptedModels.push(model);
    
    if (ENABLE_DEBUG_LOGS) {
      console.log(`[VoyageFlow Attempt #${attempt}]: Requesting chat completion from model: ${model}`);
    }

    try {
      const response = await callGroqChatCompletion(model, systemPrompt, formattedMessages, currentMaxTokens, apiKey);
      
      if (response.ok) {
        const data = await response.json();
        const reply = normalizeGroqResponse(data);
        
        return {
          reply: reply,
          meta: {
            provider: 'groq',
            modelUsed: model,
            attemptedModels: attemptedModels,
            fallbackCount: attempt - 1
          }
        };
      }

      const errorDetail = await parseErrorBody(response);
      if (ENABLE_DEBUG_LOGS) {
        console.warn(`[VoyageFlow Failure Model: ${model} | HTTP Status: ${response.status}]:`, errorDetail);
      }

      if (shouldRetryWithFallback(response.status, errorDetail)) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const delayMs = parseInt(retryAfter) * 1000;
          if (delayMs > 0 && delayMs <= 3000) {
            if (ENABLE_DEBUG_LOGS) console.log(`[Rate Limit Recovery]: Sleeping for ${delayMs}ms specified by header.`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        
        const lowerCaseMsg = (errorDetail?.error?.message || '').toLowerCase();
        if (lowerCaseMsg.includes('context_length') || lowerCaseMsg.includes('max_tokens') || lowerCaseMsg.includes('maximum context')) {
          currentMaxTokens = Math.max(512, Math.floor(currentMaxTokens / 2));
        }
        continue; 
      } else {
        throw new Error(`Groq API Configuration Error (${response.status}): ${errorDetail?.error?.message || 'Unknown API Exception'}`);
      }

    } catch (err) {
      if (ENABLE_DEBUG_LOGS) {
        console.warn(`[Error caught during execution on ${model}]:`, err.message || err);
      }
      if (attemptedModels.length >= candidates.length) {
        throw new Error(`All available Groq chat completion endpoints failed. Last trace: ${err.message || err}`);
      }
    }
  }

  throw new Error('Fallback mechanism depleted candidates without generating a valid travel response.');
}

function normalizeGroqResponse(data) {
  if (data && data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content || '';
  }
  throw new Error('API returned successfully but response schema was unrecognizable.');
}
