// src/rag/retrieve.mjs
import fs from "fs/promises";

const CHUNKS_PATH = "data/index/chunks.jsonl";

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function scoreChunk(queryTokens, text) {
  const chunkTokens = tokenize(text);
  const set = new Set(chunkTokens);

  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 2;
    if (text.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

async function loadChunks() {
  const raw = await fs.readFile(CHUNKS_PATH, "utf8");
  return raw.split("\n").filter(Boolean).map(JSON.parse);
}

export async function retrieve(query, topK = 5) {
  const chunks = await loadChunks();
  const queryTokens = tokenize(query);

  return chunks
    .map(c => ({
      chunk_id: c.chunk_id,
      section: c.section,
      source: c.source_path,
      text: c.text,
      score: scoreChunk(queryTokens, c.text),
      preview: c.text.slice(0, 150)
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// CLI usage — only runs when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ");
  if (query) {
    const results = await retrieve(query);
    console.log(JSON.stringify(results, null, 2));
  }
}