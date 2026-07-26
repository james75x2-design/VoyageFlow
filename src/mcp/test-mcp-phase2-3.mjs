import { createMcpClient, callMcpToolSafely, makeMockMcpTransport } from './mcp-client.mjs';
import { normalizeTransitItems, summarizeTransitEvidence } from './transit-normalizer.mjs';
import { sequenceDestinations, buildTransitPromptContext } from './itinerary-sequencer.mjs';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function testMcpClientHappyPath() {
  console.log('\nTEST 1 — MCP client happy path');
  const transport = makeMockMcpTransport(async (req) => {
    assert(req.jsonrpc === '2.0', 'JSON-RPC envelope sent');
    if (req.method === 'tools/list') return { tools: [{ name: 'get_transit_info' }] };
    if (req.method === 'tools/call') return { content: [{ type: 'text', text: JSON.stringify([{ origin: 'Gion', destination: 'Arashiyama', distance_km: 11, transit_min: 35 }]) }] };
    return { ok: true };
  });
  const client = createMcpClient({ endpoint: 'mock://mcp', fetchImpl: transport });
  const list = await client.listTools();
  assert(list.tools[0].name === 'get_transit_info', 'listTools returns tool');
  const call = await client.callTool('get_transit_info', { origin: 'Gion', destination: 'Arashiyama' });
  assert(Array.isArray(call.content), 'callTool returns content array');
}

async function testMcpClientErrorFallback() {
  console.log('\nTEST 2 — MCP client fallback on error');
  const transport = makeMockMcpTransport(async () => ({ __rpcError: true, error: { code: -32000, message: 'server down' } }));
  const client = createMcpClient({ endpoint: 'mock://mcp', fetchImpl: transport });
  const result = await callMcpToolSafely({ client, name: 'get_transit_info', args: {}, fallback: [] });
  assert(result.ok === false, 'safe wrapper marks error');
  assert(Array.isArray(result.result), 'safe wrapper returns fallback');
}

function testTransitNormalizerShapes() {
  console.log('\nTEST 3 — transit normalizer handles common shapes');
  const raw = {
    content: [{ type: 'text', text: JSON.stringify([
      { from: 'Gion', to: 'Fushimi Inari', distance_m: 5000, duration_s: 720, headway_min: 10, transport_mode: 'train' },
      { origin: 'Gion', destination: 'Arashiyama', distance_km: 11, transit_min: 35, frequency_min: 15, mode: 'train+walk' }
    ]) }]
  };
  const items = normalizeTransitItems(raw);
  assert(items.length === 2, 'normalizes two items');
  assert(items[0].distance_km === 5, 'meters -> km');
  assert(items[0].transit_min === 12, 'seconds -> minutes');
  assert(items[1].frequency_min === 15, 'frequency preserved');
  const summary = summarizeTransitEvidence(items);
  assert(summary.includes('Gion -> Arashiyama'), 'summary includes pair');
}

function testSequencerDistanceWave() {
  console.log('\nTEST 4 — sequencer builds distance wave + buffers');
  const evidence = normalizeTransitItems([
    { origin: 'Gion', destination: 'Higashiyama', distance_km: 1, transit_min: 8, mode: 'walk' },
    { origin: 'Gion', destination: 'Fushimi Inari', distance_km: 5, transit_min: 12, mode: 'train', frequency_min: 10 },
    { origin: 'Gion', destination: 'Arashiyama', distance_km: 11, transit_min: 35, mode: 'train+walk', frequency_min: 15 },
    { origin: 'Gion', destination: 'Kinkaku-ji', distance_km: 8, transit_min: 40, mode: 'bus', frequency_min: 20 }
  ]);
  const seq = sequenceDestinations({
    base: 'Gion',
    candidates: ['Higashiyama', 'Fushimi Inari', 'Arashiyama', 'Kinkaku-ji'],
    transitItems: evidence,
    tripDays: 5
  });
  assert(seq.arrival_buffer.name === 'Higashiyama', `arrival buffer near base (${seq.arrival_buffer?.name})`);
  assert(seq.departure_buffer.name === 'Fushimi Inari', `departure buffer avoids far/bus-heavy (${seq.departure_buffer?.name})`);
  assert(seq.middle_days[0].name === 'Kinkaku-ji' || seq.middle_days[0].name === 'Arashiyama', 'middle starts with a far/transit-heavy place');
  assert(seq.warnings.some(w => w.includes('middle of the stay')), 'warns far sites should be mid-stay');
}

function testPromptContext() {
  console.log('\nTEST 5 — prompt context generation');
  const seq = sequenceDestinations({
    base: 'Gion',
    candidates: ['Higashiyama', 'Arashiyama'],
    transitItems: normalizeTransitItems([
      { origin: 'Gion', destination: 'Higashiyama', distance_km: 1, transit_min: 8 },
      { origin: 'Gion', destination: 'Arashiyama', distance_km: 11, transit_min: 35 }
    ])
  });
  const context = buildTransitPromptContext(seq);
  assert(context.includes('Transit-aware sequencing evidence'), 'context has heading');
  assert(context.includes('Arashiyama'), 'context includes destination');
  assert(context.includes('arrival/departure'), 'context includes behavior instruction');
}

async function run() {
  console.log('═══ VoyageFlow MCP Phase 2/3 — Adapter + Sequencer Tests ═══');
  await testMcpClientHappyPath();
  await testMcpClientErrorFallback();
  testTransitNormalizerShapes();
  testSequencerDistanceWave();
  testPromptContext();
  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
