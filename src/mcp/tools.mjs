// VoyageFlow MCP Phase 1 — Tool registry with deterministic stub tool.
// Phase 2 replaces the stub body with MCP/Transitland-backed data.

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

export async function executeTool(name, args, ctx = {}) {
  if (name === 'get_transit_info') {
    const origin = simplify(args.origin);
    const destination = simplify(args.destination);
    const hit = STUB_TRANSIT[key(origin, destination)] || STUB_TRANSIT[key(destination, origin)];

    if (hit) {
      return { origin: args.origin, destination: args.destination, ...hit, source: 'stub' };
    }

    return {
      origin: args.origin,
      destination: args.destination,
      distance_km: null,
      transit_min: null,
      mode: 'unknown',
      source: 'stub',
      note: 'No stub entry; Phase 2 will query a live transit source.'
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}
