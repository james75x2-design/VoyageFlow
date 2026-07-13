// src/rag/ingest-and-chunk.mjs
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const KB_DIR = "data/kb";
const OUT_DIR = "data/index";
const RAW_OUT = path.join(OUT_DIR, "raw_docs.jsonl");
const CHUNKS_OUT = path.join(OUT_DIR, "chunks.jsonl");

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function cleanText(text, filePath) {
  let cleaned = text.replace(/\r\n/g, "\n");

  if (filePath.endsWith(".html")) {
    cleaned = cleaned
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");
  }

  return cleaned
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTitle(text, filePath) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return path.basename(filePath);
}

function splitIntoSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = { heading: "Introduction", lines: [] };

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match && current.lines.length > 0) {
      sections.push(current);
      current = { heading: match[2].trim(), lines: [line] };
    } else if (match) {
      current.heading = match[2].trim();
      current.lines.push(line);
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.length > 0) sections.push(current);
  return sections;
}

function chunkText(sectionText, maxChars = 900, overlapChars = 120) {
  const chunks = [];
  let start = 0;

  while (start < sectionText.length) {
    const end = Math.min(start + maxChars, sectionText.length);
    const chunk = sectionText.slice(start, end).trim();

    if (chunk.length > 80) {
      chunks.push({ text: chunk, char_start: start, char_end: end });
    }

    if (end === sectionText.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const files = await fs.readdir(KB_DIR);
  const sourceFiles = files.filter(file =>
    [".md", ".txt", ".html"].includes(path.extname(file).toLowerCase())
  );

  if (sourceFiles.length === 0) {
    throw new Error("No .md, .txt, or .html files found in data/kb");
  }

  const rawDocs = [];
  const chunks = [];

  for (const file of sourceFiles) {
    const sourcePath = path.join(KB_DIR, file);
    const raw = await fs.readFile(sourcePath, "utf8");
    const text = cleanText(raw, sourcePath);
    const docId = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-");

    rawDocs.push({
      doc_id: docId,
      source_path: sourcePath,
      title: getTitle(text, sourcePath),
      text_hash: hashText(text),
      char_count: text.length
    });

    const sections = splitIntoSections(text);
    let chunkCounter = 1;

    for (const section of sections) {
      const sectionText = section.lines.join("\n").trim();
      const sectionChunks = chunkText(sectionText);

      for (const part of sectionChunks) {
        chunks.push({
          chunk_id: `${docId}::${String(chunkCounter).padStart(3, "0")}`,
          doc_id: docId,
          source_path: sourcePath,
          section: section.heading,
          char_start: part.char_start,
          char_end: part.char_end,
          content_hash: hashText(part.text),
          text: part.text
        });
        chunkCounter++;
      }
    }
  }

  await fs.writeFile(RAW_OUT, rawDocs.map(x => JSON.stringify(x)).join("\n") + "\n");
  await fs.writeFile(CHUNKS_OUT, chunks.map(x => JSON.stringify(x)).join("\n") + "\n");

  console.log(`Indexed ${rawDocs.length} docs into ${chunks.length} chunks.`);
  console.log(`Wrote ${RAW_OUT}`);
  console.log(`Wrote ${CHUNKS_OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});