// VoyageFlow — Deterministic transit prefetch (Week 7.3c).
// Worker extracts {base, destinations} from the itinerary request, fetches
// get_transit_info for EACH destination ONCE (before the provider fallback
// chain), and returns a TRANSIT FACTS block to inject into systemPrompt.
// This eliminates: (a) model tool-call unreliability, (b) the fallback-refetch
// subrequest explosion (each provider was re-running the whole tool loop).

export function parseExtraction(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  const first = s.indexOf("{"), last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  s = s.slice(first, last + 1);
  let o; try { o = JSON.parse(s); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const base = typeof o.base === "string" && o.base.trim() ? o.base.trim() : null;
  const destinations = Array.isArray(o.destinations)
    ? [...new Set(o.destinations.filter(d => typeof d === "string" && d.trim()).map(d => d.trim()))].slice(0, 8)
    : [];
  if (!base || destinations.length === 0) return null;
  return { base, destinations };
}

// Fetch transit for each destination ONCE, via the worker's executeTool.
// executeTool signature (confirmed): executeTool("get_transit_info",
//   { origin: <string>, destination: <string> }, { env }) -> toContract shape.
export async function prefetchTransit(base, destinations, executeTool, env) {
  const out = [];
  for (const dest of destinations) {
    let r;
    try {
      r = await executeTool("get_transit_info", { origin: base, destination: dest }, { env });
    } catch (e) {
      r = { source: "error", error: String(e && e.message ? e.message : e) };
    }
    out.push({ dest, r: r || { source: "error" } });
  }
  return out;
}

// Build a compact, HONEST facts block from toContract-shaped results.
// toContract fields: distance_km, transit_min, mode, frequency_min, walkable,
//   walk_min, recommend_walk, sparse_service, source.
export function buildTransitFacts(base, prefetched) {
  const lines = [
    `TRANSIT FACTS — real data from ${base}. Use ONLY these values; never invent distances, times, or frequencies. Cite them in the itinerary (e.g. "~20 min by bus", "walkable ~15 min", "buses ~every 30 min, allow for waiting").`,
  ];
  for (const { dest, r } of prefetched) {
    const src = r && r.source;
    if (!r || src === "error" || src === "none") {
      lines.push(`- ${dest}: no reliable transit data — sequence by geography; do NOT state specific times or frequencies.`);
      continue;
    }
    const parts = [];
    if (r.distance_km != null) parts.push(`~${r.distance_km} km`);
    if (r.transit_min != null) parts.push(`~${r.transit_min} min by ${r.mode || "transit"}`);
    if (r.recommend_walk) parts.push(`WALKABLE (~${r.walk_min ?? "?"} min on foot — suggest walking instead of transit)`);
    if (r.frequency_min != null) parts.push(`service ~every ${r.frequency_min} min`);
    if (r.sparse_service === true) parts.push(`SPARSE SERVICE — WARN the traveller service is infrequent, tell them to allow waiting time, and give this destination its own lighter day`);
    if (src === "stub") parts.push(`(timing approximate — fallback source)`);
    lines.push(`- ${dest}: ${parts.length ? parts.join("; ") : "limited data"}`);
  }
  return lines.join("\n");
}

// Planner prompt — returns strict JSON only.
export const PLANNER_PROMPT =
  "Extract the travel base (accommodation area) and the destinations the user " +
  "wants to visit from their message. Return STRICT JSON only — no prose, no code " +
  'fences — exactly: {"base":"<area>","destinations":["<d1>","<d2>"]}. Include the ' +
  "city with each (e.g. 'Kinkaku-ji, Kyoto'). If no base is stated, use the city " +
  'center. If no destinations are named, return {"base":"","destinations":[]}.';
