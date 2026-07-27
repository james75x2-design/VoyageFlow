// Step (b): FULL pipeline coverage probe — run in Codespace with real key.
// Uses the actual executeTool (geocode -> Transitland -> guard -> fallback).
import { executeTool } from "./src/mcp/tools.mjs";

const ctx = { env: { TRANSITLAND_API_KEY: process.env.TRANSITLAND_API_KEY } };
if (!ctx.env.TRANSITLAND_API_KEY) {
  console.log("ERR: TRANSITLAND_API_KEY not in env");
  process.exit(1);
}

// Diverse global same-region day-trip pairs + a couple of ambiguity traps.
const PAIRS = [
  ["Shibuya, Tokyo", "Asakusa, Tokyo"],
  ["Westminster, London", "Camden, London"],
  ["Marina Bay, Singapore", "Chinatown, Singapore"],
  ["Circular Quay, Sydney", "Bondi Beach, Sydney"],
  ["Intramuros, Manila", "Makati, Manila"],
  ["Sagrada Familia, Barcelona", "Park Guell, Barcelona"],
  ["Gion, Kyoto", "Arashiyama, Kyoto"],            // known-good baseline
  ["Times Square, New York", "Central Park, New York"], // trap -> expect none
];

let realCount = 0, stubCount = 0, noneCount = 0;
for (const [o, d] of PAIRS) {
  // gentle pacing: MOTIS /plan-class limits + Transitland free tier
  await new Promise((r) => setTimeout(r, 400));
  try {
    const r = await executeTool("get_transit_info", { origin: o, destination: d }, ctx);
    if (r.source === "transitland") realCount++;
    else if (r.source === "stub") stubCount++;
    else noneCount++;
    const dist = r.distance_km != null ? `${r.distance_km}km` : "—";
    const freq = r.frequency_min != null ? `${r.frequency_min}min` : "n/a";
    console.log(`\n${o}  ->  ${d}`);
    console.log(`  source=${r.source}  dist=${dist}  transit_min=${r.transit_min ?? "—"}  mode=${r.mode}  freq=${freq}`);
  } catch (e) {
    noneCount++;
    console.log(`\n${o} -> ${d}  ERR: ${e.message}`);
  }
}
console.log(`\n--- coverage summary: transitland=${realCount}  stub=${stubCount}  none=${noneCount} ---`);
