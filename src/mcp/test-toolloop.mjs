import { runToolLoop } from './tool-loop.mjs';
import { TOOL_DEFS, executeTool } from './tools.mjs';
import {
  toolsForGroq, messagesForGroq, parseGroqResponse,
  toolsForGemini, contentsForGemini, parseGeminiResponse
} from './adapters.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function test1_loopExecutesToolThenFinal() {
  console.log('\nTEST 1 — loop: tool call -> execute -> final answer');
  let round = 0;
  const callModel = async (messages, tools) => {
    round++;
    if (round === 1) {
      return { type: 'tool_calls', calls: [{ id: 'c1', name: 'get_transit_info', args: { origin: 'Gion', destination: 'Arashiyama' } }] };
    }
    const toolMsg = messages.find(m => m.role === 'tool');
    const parsed = JSON.parse(toolMsg.content);
    return { type: 'final', text: `Arashiyama is ${parsed.distance_km}km away (${parsed.transit_min} min).` };
  };

  const res = await runToolLoop({
    messages: [{ role: 'user', content: 'How far is Arashiyama from Gion?' }],
    tools: TOOL_DEFS,
    callModel,
    executeTool
  });

  assert(res.rounds === 2, `used 2 rounds (got ${res.rounds})`);
  assert(res.toolCalls.length === 1, `executed 1 tool call (got ${res.toolCalls.length})`);
  assert(res.toolCalls[0].result.distance_km === 11, 'stub returned 11km');
  assert(res.finalText.includes('11km') && res.finalText.includes('35 min'), `final answer used tool data: "${res.finalText}"`);
}

async function test2_noToolNeeded() {
  console.log('\nTEST 2 — loop: model answers without tools');
  const callModel = async () => ({ type: 'final', text: 'Hello! Where would you like to go?' });
  const res = await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: TOOL_DEFS, callModel, executeTool });
  assert(res.rounds === 1, `used 1 round (got ${res.rounds})`);
  assert(res.toolCalls.length === 0, `no tools executed (got ${res.toolCalls.length})`);
  assert(res.finalText.startsWith('Hello'), 'returned direct answer');
}

async function test3_multipleToolCalls() {
  console.log('\nTEST 3 — loop: two tool calls in a single turn');
  let round = 0;
  const callModel = async () => {
    round++;
    if (round === 1) {
      return { type: 'tool_calls', calls: [
        { id: 'a', name: 'get_transit_info', args: { origin: 'Gion', destination: 'Fushimi Inari' } },
        { id: 'b', name: 'get_transit_info', args: { origin: 'Gion', destination: 'Kinkaku-ji' } }
      ] };
    }
    return { type: 'final', text: 'done' };
  };
  const res = await runToolLoop({ messages: [{ role: 'user', content: 'compare distances' }], tools: TOOL_DEFS, callModel, executeTool });
  assert(res.toolCalls.length === 2, `executed 2 tools (got ${res.toolCalls.length})`);
  assert(res.toolCalls[0].result.transit_min === 12, 'Fushimi = 12 min');
  assert(res.toolCalls[1].result.mode === 'bus', 'Kinkaku-ji = bus');
}

async function test4_maxRoundsCap() {
  console.log('\nTEST 4 — loop: infinite tool-calling is capped');
  const callModel = async () => ({ type: 'tool_calls', calls: [{ id: 'x', name: 'get_transit_info', args: { origin: 'A', destination: 'B' } }] });
  const res = await runToolLoop({ messages: [{ role: 'user', content: 'loop forever' }], tools: TOOL_DEFS, callModel, executeTool, maxRounds: 3 });
  assert(res.error === 'max_rounds_exceeded', 'hit the safety cap');
  assert(res.rounds === 3, `stopped at 3 rounds (got ${res.rounds})`);
}

async function test5_toolErrorHandled() {
  console.log('\nTEST 5 — loop: tool error is caught and fed back');
  let round = 0;
  const callModel = async (messages) => {
    round++;
    if (round === 1) return { type: 'tool_calls', calls: [{ id: 'e', name: 'nonexistent_tool', args: {} }] };
    const parsed = JSON.parse(messages.find(m => m.role === 'tool').content);
    return { type: 'final', text: parsed.error ? 'handled error' : 'no error seen' };
  };
  const res = await runToolLoop({ messages: [{ role: 'user', content: 'trigger error' }], tools: TOOL_DEFS, callModel, executeTool });
  assert(res.toolCalls[0].result.error?.includes('Unknown tool'), 'error captured in result');
  assert(res.finalText === 'handled error', 'loop recovered and continued');
}

async function test6_groqAdapter() {
  console.log('\nTEST 6 — Groq adapter format');
  const gTools = toolsForGroq(TOOL_DEFS);
  assert(gTools[0].type === 'function', 'Groq tool has type=function');
  assert(gTools[0].function.name === 'get_transit_info', 'Groq tool name preserved');

  const parsed = parseGroqResponse({ choices: [{ message: { tool_calls: [
    { id: 't1', function: { name: 'get_transit_info', arguments: '{"origin":"Gion","destination":"Arashiyama"}' } }
  ] } }] });
  assert(parsed.type === 'tool_calls', 'parsed Groq tool_calls turn');
  assert(parsed.calls[0].args.destination === 'Arashiyama', 'parsed Groq JSON args');

  const finalParsed = parseGroqResponse({ choices: [{ message: { content: 'final answer' } }] });
  assert(finalParsed.type === 'final' && finalParsed.text === 'final answer', 'parsed Groq final turn');

  const msgs = messagesForGroq(
    [{ role: 'user', content: 'hi' }, { role: 'tool', tool_call_id: 't1', name: 'get_transit_info', content: '{"distance_km":11}' }],
    'SYSTEM'
  );
  assert(msgs[0].role === 'system' && msgs[0].content === 'SYSTEM', 'Groq system prompt injected');
  assert(msgs[2].role === 'tool' && msgs[2].tool_call_id === 't1', 'Groq tool message mapped');
}

async function test7_geminiAdapter() {
  console.log('\nTEST 7 — Gemini adapter format');
  const gTools = toolsForGemini(TOOL_DEFS);
  assert(Array.isArray(gTools[0].functionDeclarations), 'Gemini functionDeclarations present');
  assert(gTools[0].functionDeclarations[0].name === 'get_transit_info', 'Gemini tool name preserved');

  const parsed = parseGeminiResponse({ candidates: [{ content: { parts: [
    { functionCall: { name: 'get_transit_info', args: { origin: 'Gion', destination: 'Arashiyama' } } }
  ] } }] });
  assert(parsed.type === 'tool_calls', 'parsed Gemini functionCall turn');
  assert(parsed.calls[0].args.origin === 'Gion', 'parsed Gemini args');

  const finalParsed = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'final ' }, { text: 'answer' }] } }] });
  assert(finalParsed.type === 'final' && finalParsed.text === 'final answer', 'parsed Gemini final (joined parts)');

  const contents = contentsForGemini([
    { role: 'user', content: 'hi' },
    { role: 'tool', tool_call_id: 't1', name: 'get_transit_info', content: '{"distance_km":11}' }
  ]);
  assert(contents[1].parts[0].functionResponse.name === 'get_transit_info', 'Gemini functionResponse mapped');
}

async function test8_fullLoopWithGeminiAdapter() {
  console.log('\nTEST 8 — full loop via Gemini adapter (mocked network)');
  let round = 0;
  const fakeGeminiHttp = () => {
    round++;
    if (round === 1) {
      return { candidates: [{ content: { parts: [
        { functionCall: { name: 'get_transit_info', args: { origin: 'Gion', destination: 'Arashiyama' } } }
      ] } }] };
    }
    return { candidates: [{ content: { parts: [{ text: 'Arashiyama is the farthest — schedule it mid-trip.' }] } }] };
  };
  const callModel = async (messages) => parseGeminiResponse(fakeGeminiHttp(contentsForGemini(messages)));
  const res = await runToolLoop({ messages: [{ role: 'user', content: 'Where should Arashiyama go?' }], tools: TOOL_DEFS, callModel, executeTool });
  assert(res.rounds === 2, `2 rounds (got ${res.rounds})`);
  assert(res.toolCalls[0].result.distance_km === 11, 'tool ran via full adapter path');
  assert(res.finalText.includes('farthest'), 'final answer produced');
}

const tests = [test1_loopExecutesToolThenFinal, test2_noToolNeeded, test3_multipleToolCalls, test4_maxRoundsCap, test5_toolErrorHandled, test6_groqAdapter, test7_geminiAdapter, test8_fullLoopWithGeminiAdapter];

console.log('═══ VoyageFlow MCP Phase 1 — Tool Loop Test Suite ═══');
for (const t of tests) await t();
console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
process.exit(failed === 0 ? 0 : 1);
