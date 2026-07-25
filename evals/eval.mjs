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

  // Week 4: _retrieval_optional flag — for semantic queries where the "correct"
  // chunk match is a judgment call. Grade the answer, not the exact chunks.
  if (testCase._retrieval_optional && answer.pass) {
    retrieval.pass = true;
    retrieval.optional_override = true;
  }

  const overallPass = retrieval.pass && answer.pass;

  // Week 4: extract pipeline signals from answer-with-context debug output.
  const debug = answerResult.debug || {};
  const pipeline = debug.pipeline || "local_hybrid";
  const retrievalSignal = debug.retrieval_signal || "unknown";
  const rankingSignal = debug.ranking_signal || "n/a";
  const workerVersion = debug.worker_version || null;
  const workerModel = debug.worker_model || null;
  const workerLatencyMs = debug.latency_ms ?? null;

  // Week 4: categorize failures so reports say WHY, not just IF.
  //   retrieval_fail        - expected chunks missing from retrieved set
  //   generation_fail       - retrieval OK, but no answer text produced
  //   grounding_fail        - answered but citations wrong OR claims uncited
  //   unanswered_mismatch   - answered/unanswered flag didn't match expectation
  //   pass                  - all checks green
  let failureCategory = "pass";
  if (!overallPass) {
    if (!retrieval.pass) {
      failureCategory = "retrieval_fail";
    } else if ((answerResult.answer_markdown || "").trim().length === 0) {
      failureCategory = "generation_fail";
    } else if (answer.unanswered_actual !== answer.unanswered_expected) {
      failureCategory = "unanswered_mismatch";
    } else {
      failureCategory = "grounding_fail";
    }
  }

  return {
    id: testCase.id,
    query: testCase.query,
    pass: overallPass,
    failure_category: failureCategory,
    pipeline,
    retrieval_signal: retrievalSignal,
    ranking_signal: rankingSignal,
    worker_version: workerVersion,
    worker_model: workerModel,
    worker_latency_ms: workerLatencyMs,
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

  // Week 4: failure category breakdown.
  const categoryCounts = results.reduce((acc, r) => {
    acc[r.failure_category] = (acc[r.failure_category] || 0) + 1;
    return acc;
  }, {});
  const categoryOrder = ["pass", "retrieval_fail", "generation_fail", "grounding_fail", "unanswered_mismatch"];
  console.log("");
  console.log("Failure Categories");
  console.log("------------------");
  for (const cat of categoryOrder) {
    if (categoryCounts[cat]) {
      console.log(`  ${cat}: ${categoryCounts[cat]}`);
    }
  }

  // Week 4: pipeline usage breakdown (worker_rag vs local_hybrid).
  const pipelineCounts = results.reduce((acc, r) => {
    const key = r.pipeline || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log("");
  console.log("Pipelines Used");
  console.log("--------------");
  for (const [p, count] of Object.entries(pipelineCounts)) {
    console.log(`  ${p}: ${count}`);
  }

  // Week 4: retrieval + ranking signal breakdowns.
  const retrievalSignalCounts = results.reduce((acc, r) => {
    const key = r.retrieval_signal || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const rankingSignalCounts = results.reduce((acc, r) => {
    const key = r.ranking_signal || "n/a";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log("");
  console.log("Retrieval Signals");
  console.log("-----------------");
  for (const [sig, count] of Object.entries(retrievalSignalCounts)) {
    console.log(`  ${sig}: ${count}`);
  }
  console.log("");
  console.log("Ranking Signals");
  console.log("---------------");
  for (const [sig, count] of Object.entries(rankingSignalCounts)) {
    console.log(`  ${sig}: ${count}`);
  }

  // Week 4: attach breakdowns to persisted report.
  report.failure_categories = categoryCounts;
  report.pipelines_used = pipelineCounts;
  report.retrieval_signals = retrievalSignalCounts;
  report.ranking_signals = rankingSignalCounts;

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