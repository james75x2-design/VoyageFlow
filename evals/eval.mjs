// evals/eval.mjs
// VoyageFlow RAG evaluation harness.
import fs from "fs/promises";
import { retrieve } from "../src/rag/retrieve.mjs";
import { answerWithContext } from "../src/rag/answer-with-context.mjs";

const EVAL_DATA_PATH = "evals/eval-data.json";
const REPORT_PATH = "evals/eval-report.json";
const TOP_K = 5;

function unique(values) {
  return [...new Set(values)];
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function extractInlineCitations(answerMarkdown) {
  const matches = [
    ...(answerMarkdown || "").matchAll(/\[([a-z0-9._-]+::\d{3})\]/gi)
  ];
  return unique(matches.map(m => m[1]));
}

function getStructuredCitationIds(citations) {
  if (!Array.isArray(citations)) return [];
  return unique(
    citations.flatMap(c => (Array.isArray(c.chunk_ids) ? c.chunk_ids : []))
  );
}

function containsAll(actualIds, expectedIds) {
  return expectedIds.every(id => actualIds.includes(id));
}

async function loadEvalData() {
  const raw = await fs.readFile(EVAL_DATA_PATH, "utf8");
  return JSON.parse(raw);
}

function evaluateRetrieval(testCase, retrievedChunks) {
  const retrievedIds = retrievedChunks.map(c => c.chunk_id);
  const expectedIds = testCase.expected_chunk_ids || [];
  const pass =
    expectedIds.length === 0 ? true : containsAll(retrievedIds, expectedIds);
  return {
    pass,
    expected_chunk_ids: expectedIds,
    retrieved_chunk_ids: retrievedIds
  };
}

function evaluateAnswer(testCase, answerResult) {
  const expectedCitationIds = testCase.expected_citation_ids || [];
  const expectUnanswered = Boolean(testCase.expect_unanswered);
  const inlineCitationIds = extractInlineCitations(answerResult.answer_markdown);
  const structuredCitationIds = getStructuredCitationIds(answerResult.citations);
  const actualCitationIds = unique([...inlineCitationIds, ...structuredCitationIds]);

  const unansweredMatches =
    Boolean(answerResult.unanswered) === expectUnanswered;
  const validationValid = Boolean(answerResult.validation?.valid);

  const citationPass =
    expectedCitationIds.length === 0
      ? expectUnanswered
        ? actualCitationIds.length === 0
        : actualCitationIds.length > 0 || validationValid
      : containsAll(actualCitationIds, expectedCitationIds);

  const pass =
    unansweredMatches &&
    (expectUnanswered ? true : validationValid) &&
    citationPass;

  return {
    pass,
    expected_citation_ids: expectedCitationIds,
    actual_citation_ids: actualCitationIds,
    unanswered_expected: expectUnanswered,
    unanswered_actual: Boolean(answerResult.unanswered),
    validation_valid: validationValid,
    answer_preview: (answerResult.answer_markdown || "").slice(0, 260)
  };
}

async function runOne(testCase) {
  const retrievedChunks = (await retrieve(testCase.query, TOP_K)).slice(0, TOP_K);
  const answerResult = await answerWithContext(testCase.query);
  const retrieval = evaluateRetrieval(testCase, retrievedChunks);
  const answer = evaluateAnswer(testCase, answerResult);
  return {
    id: testCase.id,
    query: testCase.query,
    pass: retrieval.pass && answer.pass,
    retrieval,
    answer
  };
}

function printResult(result) {
  console.log("");
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.id}: ${result.query}`);
  console.log(`   Retrieval: ${result.retrieval.pass ? "PASS" : "FAIL"}`);
  console.log(`   Expected chunks: ${JSON.stringify(result.retrieval.expected_chunk_ids)}`);
  console.log(`   Retrieved chunks: ${JSON.stringify(result.retrieval.retrieved_chunk_ids)}`);
  console.log(`   Answer: ${result.answer.pass ? "PASS" : "FAIL"}`);
  console.log(`   Expected citations: ${JSON.stringify(result.answer.expected_citation_ids)}`);
  console.log(`   Actual citations: ${JSON.stringify(result.answer.actual_citation_ids)}`);
  console.log(`   Unanswered expected/actual: ${result.answer.unanswered_expected}/${result.answer.unanswered_actual}`);
  console.log(`   Validation valid: ${result.answer.validation_valid}`);
  console.log(`   Answer preview: ${result.answer.answer_preview}`);
}

async function main() {
  console.log("VoyageFlow RAG Evaluation Harness");
  console.log("=================================");
  const testCases = await loadEvalData();
  const results = [];

  for (const testCase of testCases) {
    // Rate-limit guard: pause between requests to avoid Gemini/Groq bursts
    if (results.length > 0) await new Promise(r => setTimeout(r, 3000));
    const result = await runOne(testCase);
    results.push(result);
    printResult(result);
  }

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const retrievalPassed = results.filter(r => r.retrieval.pass).length;
  const answerPassed = results.filter(r => r.answer.pass).length;

  const report = {
    generated_at: new Date().toISOString(),
    total,
    passed,
    failed: total - passed,
    retrieval_passed: retrievalPassed,
    answer_passed: answerPassed,
    retrieval_pass_rate: percent(retrievalPassed, total),
    answer_pass_rate: percent(answerPassed, total),
    overall_pass_rate: percent(passed, total),
    results
  };

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Total tests: ${total}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Retrieval passed: ${retrievalPassed}/${total} (${report.retrieval_pass_rate}%)`);
  console.log(`Answer passed: ${answerPassed}/${total} (${report.answer_pass_rate}%)`);
  console.log(`Overall pass rate: ${report.overall_pass_rate}%`);

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log("");
  console.log(`Wrote ${REPORT_PATH}`);
  if (report.failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error("Evaluation harness failed:");
  console.error(err);
  process.exit(1);
});