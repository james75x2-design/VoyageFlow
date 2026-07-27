// Week 7.2 LIVE integration test — geocode LIVE (MOTIS) + Transitland LIVE.
// Run in Codespace where TRANSITLAND_API_KEY is in env.
import { executeTool } from "./src/mcp/tools.mjs";

const ctx = { env: { TRANSITLAND_API_KEY: process.env.TRANSITLAND_API_KEY } };
if (!ctx.env.TRANSITLAND_API_KEY) {
  console.log("ERR: TRANSITLAND_API_KEY not in env");
  process.exit(1);
}

const pairs = [
  ["Gion, Kyoto", "Arashiyama, Kyoto"],
  ["Gion, Kyoto", "Kinkaku-ji, Kyoto"],
  ["Gion, Kyoto", "Fushimi Inari, Kyoto"],
  ["Times Square, New York", "Central Park, New York"], // proves "all destinations"
];

for (const [o, d] of pairs) {
  try {
    const r = await executeTool("get_transit_info", { origin: o, destination: d }, ctx);
    console.log(`\n${o}  ->  ${d}`);
    console.log(`  source=${r.source}  distance_km=${r.distance_km}  transit_min=${r.transit_min}  mode=${r.mode}  frequency_min=${r.frequency_min ?? "n/a"}`);
    if (r.note) console.log(`  note: ${r.note}`);
  } catch (e) {
    console.log(`\n${o} -> ${d}  ERR: ${e.message}`);
  }
}
console.log("\n--- done ---");
