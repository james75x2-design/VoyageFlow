// scripts/build-worker-chunks.mjs
// Rebuilds data/index/worker-chunks.js from data/index/chunks.jsonl
// so the Cloudflare Worker can retrieve without filesystem access.
import fs from "fs/promises";

const CHUNKS_IN = "data/index/chunks.jsonl";
const CHUNKS_OUT = "data/index/worker-chunks.js";

const raw = await fs.readFile(CHUNKS_IN, "utf8");
const chunks = raw.split("\n").filter(Boolean).map(JSON.parse).map(c => ({
  chunk_id: c.chunk_id,
  section: c.section,
  source_path: c.source_path,
  text: c.text
}));

const body =
  "// Auto-generated from chunks.jsonl. Do not edit by hand.\n" +
  "// Regenerate with: node scripts/build-worker-chunks.mjs\n" +
  "export const TRAVEL_CHUNKS = " + JSON.stringify(chunks, null, 2) + ";\n";

await fs.writeFile(CHUNKS_OUT, body);
console.log(`Wrote ${CHUNKS_OUT} with ${chunks.length} chunks.`);
