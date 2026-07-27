// VoyageFlow MCP — Tool registry.
// Week 7.2: get_transit_info now backed by real Transitland data.
//   Flow: geocode (MOTIS/Transitous, keyless) -> Transitland stops+departures
//   Fallback chain: Transitland -> STUB_TRANSIT table -> honest null (never fabricates)
//   Tiers: distance REAL | frequency REAL | duration ESTIMATE (labeled)

import { getTransitInfo } from "../../transit.mjs";

// MOTIS/Transitous requires a descriptive User-Agent (app + version + contact).
// TODO: set a real contact address before shipping publicly.
const MOTIS_GEOCODE = "https://api.transitous.org/api/v1/geocode";
const MOTIS_UA =
  "VoyageFlow/0.1 (+https://github.com/james75x2-design/VoyageFlow)";

// Region-aware plausibility guard.
// This tool is for two places in the same region (day-trip sequencing). An
// ambiguous name can geocode to the wrong place (e.g. a "Central Park" ~470km
// away, yet still in the same STATE as Times Square). A flat distance cap is
// blunt, so we pick the cap from how specifically the two share administrative
// geography (MOTIS returns an `areas` list with OSM adminLevels):
//   adminLevel 2=country, 4=state/prefecture/canton, 6=county/district, 7-8=city/ward.
// Sharing a county/district or finer (level >= 6) is strong "same region"
// evidence; sharing only a large state (level 4) is weak, so we fall back to
// proximity. This admits border-adjacent / cross-city / cross-border-but-close
// pairs while still rejecting a wrong-region geocode.
const REGION_MIN_LEVEL = 6;       // adminLevel >= this counts as a real regional match
const CAP_SAME_REGION_KM = 150;   // generous: sprawling metros (Greater Tokyo, LA...)
const CAP_NO_REGION_KM = 80;      // proximity only: keeps border-adjacency, drops wrong-region

// Country (adminLevel 2) name for a place, lowercased, or null.
function countryOf(areas) {
  const c = (areas || []).find((a) => Number(a.adminLevel) === 2 && a.name);
  return c ? String(c.name).toLowerCase() : null;
}

// True if origin/destination share an admin area at level >= minLevel (by name)
// AND are in the same country. The same-country gate prevents false positives
// on common region names (e.g. "Washington County" exists in ~30 US states,
// and identical county/district names recur across countries). If either
// country is unknown we do NOT block on it (distance cap still backstops).
function sharesRegion(areasA, areasB, minLevel = REGION_MIN_LEVEL) {
  const ca = countryOf(areasA);
  const cb = countryOf(areasB);
  if (ca && cb && ca !== cb) return false; // different countries -> not same region
  const specific = (areas) => new Set(
    (areas || [])
      .filter((a) => Number(a.adminLevel) >= minLevel && a.name)
      .map((a) => String(a.name).toLowerCase())
  );
  const A = specific(areasA);
  const B = specific(areasB);
  for (const name of A) if (B.has(name)) return true;
  return false;
}

// Region-aware plausibility check for the straight-line distance between places.
function isPlausibleSameRegion(areasA, areasB, distanceKm) {
  if (distanceKm == null) return false;
  const cap = sharesRegion(areasA, areasB) ? CAP_SAME_REGION_KM : CAP_NO_REGION_KM;
  return distanceKm <= cap;
}

export const TOOL_DEFS = [
  {
    name: 'get_transit_info',
    description:
      'Get approximate travel distance and public-transit time between two named places in the same city/region. Use this when sequencing day-trips by distance so the itinerary minimizes backtracking.',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: "Start place, e.g. 'Gion, Kyoto' or the accommodation area" },
        destination: { type: 'string', description: "End place, e.g. 'Arashiyama, Kyoto'" }
      },
      required: ['origin', 'destination']
    }
  }
];

// Fallback table (previous Phase-1 stub). Acts as the heuristic layer when
// Transitland has no data or is unavailable. NOT a fabrication: clearly source-tagged.
const STUB_TRANSIT = {
  'gion|arashiyama': { distance_km: 11, transit_min: 35, mode: 'train+walk' },
  'gion|fushimi inari': { distance_km: 5, transit_min: 12, mode: 'train' },
  'gion|kinkaku-ji': { distance_km: 8, transit_min: 40, mode: 'bus' },
  'gion|higashiyama': { distance_km: 1, transit_min: 8, mode: 'walk' }
};

function key(a, b) {
  return `${String(a).toLowerCase().trim()}|${String(b).toLowerCase().trim()}`;
}

function simplify(place) {
  return String(place || '').toLowerCase().split(',')[0].trim();
}

// Geocode a free-text place to { lat, lon } via MOTIS. Returns null on failure.
async function geocode(place) {
  const r = await fetch(MOTIS_GEOCODE + "?text=" + encodeURIComponent(place), {
    headers: { "User-Agent": MOTIS_UA }
  });
  if (!r.ok) throw new Error("geocode HTTP " + r.status);
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [];
  const p = arr.find((x) => x.lat && x.lon) || arr[0];
  if (!p || p.lat == null || p.lon == null) return null;
  return { lat: Number(p.lat), lon: Number(p.lon), areas: p.areas || [] };
}

// Walking layer. GTFS/transit feeds never contain a "walk" mode, so short hops
// would otherwise be reported as bus/rail even when walking is clearly better.
// We add a LABELED walking estimate from straight-line distance (detour-adjusted)
// plus a recommendation comparing walking against transit + expected wait.
const WALK_KMH = 4.0;              // effective speed on straight-line distance (accounts for street detours)
const WALK_MAX_KM = 2.0;           // at/under this (~30 min), walking is a realistic option
const WALK_REPORT_KM = 3.0;        // include a walk estimate up to here (beyond is absurd)
const TRANSIT_OVERHEAD_MIN = 10;   // real transit friction our ride estimate ignores:
                                   // walk-to-stop + board + walk-from-stop. Added when
                                   // comparing vs walking so short hops correctly favor walking.
const WALK_TOLERANCE_MIN = 8;      // walking has no wait/transfer/platform stress, so recommend
                                   // it even when a few minutes slower than transit. Recommend
                                   // walking if walk_min <= transitTotal + this tolerance.

// Returns additive walking fields for a given distance (+ optional transit comparison).
function walkFields(distanceKm, transitMin, frequencyMin) {
  if (distanceKm == null) {
    return { walkable: false, walk_min: null, walk_confidence: 'none', recommend_walk: false };
  }
  const walk_min = distanceKm <= WALK_REPORT_KM
    ? Math.max(1, Math.round((distanceKm / WALK_KMH) * 60))
    : null;
  const walkable = distanceKm <= WALK_MAX_KM;
  // Door-to-door transit ~= ride + ~half the headway (expected wait) + fixed
  // access/egress overhead (walk-to-stop, board, walk-from-stop). Default wait
  // 8 min if headway unknown. This makes short hops correctly favor walking.
  const wait = frequencyMin != null ? frequencyMin / 2 : 8;
  const transitTotal = transitMin != null ? transitMin + wait + TRANSIT_OVERHEAD_MIN : Infinity;
  // Recommend walking if it's faster OR within a small tolerance (no wait/transfer stress).
  const recommend_walk = walkable && walk_min != null && walk_min <= transitTotal + WALK_TOLERANCE_MIN;
  return {
    walkable,
    walk_min,                                        // ESTIMATE (labeled), minutes on foot
    walk_confidence: walk_min != null ? 'estimate' : 'none',
    recommend_walk                                   // true when walking beats transit+wait for a short hop
  };
}

// Map a successful getTransitInfo result to the tool's stable output contract.
function toContract(args, r) {
  const mode = (r.duration_basis || "transit").split(" ")[0];
  const w = walkFields(r.distance, r.duration, r.frequency);
  return {
    origin: args.origin,
    destination: args.destination,
    distance_km: r.distance,          // REAL (haversine)
    transit_min: r.duration,          // ESTIMATE (labeled below)
    mode,                             // transit mode from dominant departures route_type
    frequency_min: r.frequency,       // REAL avg headway (may be null)
    walkable: w.walkable,             // short enough to walk (<= 2 km)
    walk_min: w.walk_min,             // ESTIMATE minutes on foot (null if > 3 km)
    recommend_walk: w.recommend_walk, // walking beats transit+wait for this hop
    confidence: {
      distance: r.distance_confidence,
      duration: r.duration_confidence,   // 'estimate'
      frequency: r.frequency_confidence,
      walk: w.walk_confidence
    },
    source: 'transitland',
    note: `distance=real; duration=${r.duration_confidence} (${r.duration_basis}); frequency=${r.frequency_confidence} (${r.frequency_sample}); walk=${w.walk_confidence}${w.walk_min != null ? ` (~${w.walk_min} min on foot)` : ''}${w.recommend_walk ? ', walking recommended for this short hop' : ''}. ${r.attribution}`
  };
}

export async function executeTool(name, args, ctx = {}) {
  if (name === 'get_transit_info') {
    const apikey = ctx && ctx.env && ctx.env.TRANSITLAND_API_KEY;

    // --- Tier 1: Transitland (needs key + successful geocode of both places) ---
    if (apikey) {
      try {
        const [o, d] = await Promise.all([geocode(args.origin), geocode(args.destination)]);
        if (o && d) {
          const r = await getTransitInfo(
            { origin: { ...o, name: args.origin }, destination: { ...d, name: args.destination } },
            { apikey }
          );
          // Emit only plausible same-region results; reject geocode mismatches
          // using a region-aware cap (shared county/district -> generous;
          // otherwise proximity-only). See isPlausibleSameRegion above.
          if (r.status === 'ok' && isPlausibleSameRegion(o.areas, d.areas, r.distance)) {
            return toContract(args, r);
          }
          // not ok, or implausible for a same-region day trip -> fall through
        }
      } catch (_e) {
        // network/geocode failure -> fall through, never fabricate
      }
    }

    // --- Tier 2: STUB_TRANSIT fallback table (source-tagged) ---
    const origin = simplify(args.origin);
    const destination = simplify(args.destination);
    const hit = STUB_TRANSIT[key(origin, destination)] || STUB_TRANSIT[key(destination, origin)];
    if (hit) {
      const w = walkFields(hit.distance_km, hit.transit_min, null);
      return {
        origin: args.origin, destination: args.destination, ...hit,
        walkable: w.walkable, walk_min: w.walk_min, recommend_walk: w.recommend_walk,
        source: 'stub'
      };
    }

    // --- Tier 3: honest null (no data anywhere) ---
    return {
      origin: args.origin,
      destination: args.destination,
      distance_km: null,
      transit_min: null,
      mode: 'unknown',
      source: 'none',
      note: 'No transit data from Transitland and no fallback entry. Sequence without transit evidence.'
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}
