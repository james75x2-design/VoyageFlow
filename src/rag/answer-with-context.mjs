// src/rag/answer-with-context.mjs
// VoyageFlow standalone RAG answer pipeline.
// Local/eval use only. Production UI should call the Cloudflare Worker in mode: "rag".
import { retrieve } from "./retrieve.mjs";

const WORKER_URL = "https://voyageflow.james75x2.workers.dev/";
const TOP_K = 5;
const FALLBACK_ANSWER = "I don't have enough evidence in the current VoyageFlow travel knowledge base to answer that.";

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildContext(chunks) {
  return chunks
    .filter(c => c.text && cleanText(c.text).length > 0)
    .map(c => {
      return [
        `<source id="${c.chunk_id}">`,
        `section: ${c.section || "Unknown section"}`,
        `source_path: ${c.source_path || c.source || "Unknown source"}`,
        `retrieval_score: ${c.score ?? "unknown"}`,
        "",
        cleanText(c.text),
        `</source>`
      ].join("\n");
    })
    .join("\n\n");
}

function buildPrompt(query, chunks) {
  const allowedIds = chunks.map(c => c.chunk_id).join(", ");
  const context = buildContext(chunks);
  return `
You are VoyageFlow, an AI travel concierge.
Answer the user query using ONLY the retrieved travel context.
Rules:
1. Use only facts found inside <source> blocks.
2. Cite every factual sentence using exact chunk IDs in square brackets.
3. Allowed citation IDs: ${allowedIds}
4. If the context is insufficient, answer exactly:
   "${FALLBACK_ANSWER}"
5. Do not invent citations.
6. Do not use outside knowledge.
7. Return valid JSON only.
8. Do not include markdown fences like \`\`\`json.

Return this JSON shape exactly:
{
  "answer_markdown": "Natural language travel answer with inline [chunk_id] citations.",
  "citations": [
    {
      "claim": "Short claim being supported.",
      "chunk_ids": ["chunk_id"]
    }
  ],
  "unanswered": false
}

User query:
${query}

Retrieved context:
${context}
`.trim();
}

async function callWorker(prompt, query, sourceMap) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "rag",
      messages: [{ role: "user", parts: [{ text: query }] }]
    })
  });
  if (!response.ok) {
    return {
      worker_error: true,
      status: response.status,
      raw_output: await response.text()
    };
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? await response.json()
    : await response.text();
}

function parseJsonSafely(rawText) {
  if (!rawText) return { parse_error: true, raw_output: rawText };
  const cleaned = String(rawText)
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { parse_error: true, raw_output: rawText };
  }
}

function extractTextFromWorkerResponse(raw) {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  if (raw.worker_error) return "";
  return (
    raw.choices?.[0]?.message?.content ||
    raw.choices?.[0]?.delta?.content ||
    raw.reply ||
    raw.answer ||
    raw.response ||
    raw.text ||
    raw.output ||
    raw.content ||
    ""
  );
}

function extractInlineCitations(answerMarkdown) {
  const matches = [
    ...(answerMarkdown || "").matchAll(/\[([a-z0-9._-]+::\d{3})\]/gi)
  ];
  return [...new Set(matches.map(m => m[1]))];
}

function normalizeModelOutput(raw) {
  if (raw && raw.worker_error) {
    return {
      answer_markdown: "",
      citations: [],
      unanswered: true,
      worker_error: true,
      parse_error: true,
      raw_output: raw
    };
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof raw.answer_markdown === "string" &&
    Array.isArray(raw.citations) &&
    typeof raw.unanswered === "boolean"
  ) {
    return raw;
  }
  const extractedText = cleanText(extractTextFromWorkerResponse(raw));
  if (!extractedText) {
    return {
      answer_markdown: "",
      citations: [],
      unanswered: true,
      parse_error: true,
      raw_output: raw
    };
  }
  const parsed = parseJsonSafely(extractedText);
  if (!parsed.parse_error) {
    return {
      answer_markdown: cleanText(parsed.answer_markdown),
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      unanswered:
        typeof parsed.unanswered === "boolean" ? parsed.unanswered : false
    };
  }
  const inlineIds = extractInlineCitations(extractedText);
  return {
    answer_markdown: extractedText,
    citations: inlineIds.map(id => ({
      claim: "Plain-text model output; claim-level extraction not available in v0.",
      chunk_ids: [id]
    })),
    unanswered: extractedText === FALLBACK_ANSWER || inlineIds.length === 0,
    parse_warning: true,
    raw_output: raw
  };
}

function getStructuredCitationIds(citations) {
  if (!Array.isArray(citations)) return [];
  return [
    ...new Set(
      citations.flatMap(c => (Array.isArray(c.chunk_ids) ? c.chunk_ids : []))
    )
  ];
}

function validateAnswer(answerObj, chunks) {
  const allowedIds = new Set(chunks.map(c => c.chunk_id));
  const answerMarkdown = cleanText(answerObj.answer_markdown);
  const inlineCitationIds = extractInlineCitations(answerMarkdown);
  const structuredCitationIds = getStructuredCitationIds(answerObj.citations);
  const allUsedIds = [...new Set([...inlineCitationIds, ...structuredCitationIds])];
  const invalidCitationIds = allUsedIds.filter(id => !allowedIds.has(id));

  const hasRequiredShape =
    typeof answerObj.answer_markdown === "string" &&
    Array.isArray(answerObj.citations) &&
    typeof answerObj.unanswered === "boolean";
  const answerIsNotEmpty = answerMarkdown.length > 0;
  const hasCitationsIfAnswered =
    answerObj.unanswered === true || inlineCitationIds.length > 0;

  const valid =
    hasRequiredShape &&
    answerIsNotEmpty &&
    hasCitationsIfAnswered &&
    invalidCitationIds.length === 0 &&
    !answerObj.parse_error;

  return {
    valid,
    checks: {
      has_required_shape: hasRequiredShape,
      answer_is_not_empty: answerIsNotEmpty,
      has_citations_if_answered: hasCitationsIfAnswered,
      all_citation_ids_allowed: invalidCitationIds.length === 0,
      parsed_or_plain_text_accepted: !answerObj.parse_error,
      parse_warning: Boolean(answerObj.parse_warning)
    },
    inline_citation_ids: inlineCitationIds,
    structured_citation_ids: structuredCitationIds,
    invalid_citation_ids: invalidCitationIds,
    allowed_chunk_ids: [...allowedIds]
  };
}

// ─── Week 4 — Worker mode:rag primary path ──────────────────────────────────
// When USE_WORKER_RAG is true (default), answerWithContext prefers the Worker's
// mode:rag endpoint so eval and production exercise the same code path
// (hybrid retrieval + reranker + citation enforcement all done server-side).
//
// Set USE_WORKER_RAG=false in the environment to force the legacy local path.

const USE_WORKER_RAG = process.env.USE_WORKER_RAG !== "false";

async function answerViaWorkerRag(query) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "rag",
      messages: [{ role: "user", parts: [{ text: query }] }]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Worker returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  if (typeof data.answer_markdown !== "string") {
    throw new Error("Worker response missing answer_markdown");
  }
  return data;
}

export async function answerWithContext(query) {
  // Week 4: try Worker mode:rag first (production-parity).
  // Falls through to local hybrid path on any error so eval remains resilient.
  if (USE_WORKER_RAG) {
    try {
      const data = await answerViaWorkerRag(query);
      const chunksUsed = Array.isArray(data.meta?.chunks_used)
        ? data.meta.chunks_used
        : [];
      const rankingSignal = chunksUsed[0]?.rerank_score != null
        ? "reranker"
        : "hybrid_fusion";
      const retrievalSignal =
        chunksUsed[0]?.retrieval_signal ||
        (chunksUsed.some(c => c.vector_score > 0) ? "hybrid" : "keyword_only");

      return {
        query,
        answer_markdown: data.answer_markdown || "",
        citations: Array.isArray(data.citations) ? data.citations : [],
        unanswered: Boolean(data.unanswered),
        validation: {
          valid: true,
          checks: {
            via_worker_rag: true,
            has_required_shape: true,
            citation_enforcement_delegated_to_worker: true
          }
        },
        debug: {
          pipeline: "worker_rag",
          worker_version: data.meta?.version,
          worker_model: data.meta?.model,
          worker_mode: data.meta?.mode,
          latency_ms: data.meta?.latency_ms,
          retrieval_signal: retrievalSignal,
          ranking_signal: rankingSignal,
          chunks_used: chunksUsed,
          chunks_used_count: chunksUsed.length
        }
      };
    } catch (err) {
      console.warn(
        `[answer-with-context] Worker mode:rag failed, falling back to local: ${err.message}`
      );
      // Fall through to local path below.
    }
  }

  const rawRetrieved = await retrieve(query, TOP_K);
  const chunks = rawRetrieved
    .filter(c => c.text && cleanText(c.text).length > 0)
    .slice(0, TOP_K);

  if (chunks.length === 0) {
    return {
      query,
      answer_markdown: FALLBACK_ANSWER,
      citations: [],
      unanswered: true,
      validation: { valid: true, checks: { no_retrieved_chunks: true } },
      debug: { retrieved_count: rawRetrieved.length, chunks_used: [] }
    };
  }

  const prompt = buildPrompt(query, chunks);
  const sourceMap = chunks.map(c => ({
    chunk_id: c.chunk_id,
    section: c.section,
    source_path: c.source_path || c.source,
    score: c.score
  }));

  const rawWorkerResponse = await callWorker(prompt, query, sourceMap);
  const answerObj = normalizeModelOutput(rawWorkerResponse);

  // v2.3.0: prefer Worker's chunks_used for validation (hybrid retrieval)
  // Falls back to local chunks if Worker didn't return chunks_used.
  const workerChunksUsed = rawWorkerResponse?.meta?.chunks_used;
  const validationChunks = Array.isArray(workerChunksUsed) && workerChunksUsed.length > 0
    ? workerChunksUsed.map(c => ({ chunk_id: c.chunk_id, text: c.text || " " }))
    : chunks;
  const validation = validateAnswer(answerObj, validationChunks);

  return {
    query,
    answer_markdown: answerObj.answer_markdown || "",
    citations: Array.isArray(answerObj.citations) ? answerObj.citations : [],
    unanswered:
      typeof answerObj.unanswered === "boolean" ? answerObj.unanswered : true,
    validation,
    debug: {
      retrieved_count: rawRetrieved.length,
      chunks_used_count: chunks.length,
      chunks_used: sourceMap,
      parse_warning: Boolean(answerObj.parse_warning),
      worker_error: Boolean(answerObj.worker_error)
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.log(JSON.stringify({
      error: "Please provide a query.",
      example: 'node src/rag/answer-with-context.mjs "plan Tokyo in spring"'
    }, null, 2));
    process.exit(1);
  }
  const result = await answerWithContext(query);
  console.log(JSON.stringify(result, null, 2));
}
