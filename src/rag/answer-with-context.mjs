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

export async function answerWithContext(query) {
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
  const validation = validateAnswer(answerObj, chunks);

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
