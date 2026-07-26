// VoyageFlow Transit Normalizer (Phase 3 skeleton)
// Converts MCP/Transitland/route-tool outputs into a stable internal shape.

export function normalizeTransitItems(raw) {
  const items = extractItems(raw);
  return items.map(normalizeOne).filter(Boolean);
}

export function normalizeOne(item) {
  if (!item || typeof item !== 'object') return null;

  const origin = item.origin || item.from || item.source || item.start || item.start_name;
  const destination = item.destination || item.to || item.target || item.end || item.end_name;
  if (!origin || !destination) return null;

  const distanceKm = firstNumber(item.distance_km, item.distanceKm, metersToKm(item.distance_m), item.distance);
  const transitMin = firstNumber(item.transit_min, item.duration_min, item.durationMin, secondsToMin(item.duration_s), secondsToMin(item.duration), item.time_min);
  const frequencyMin = firstNumber(item.frequency_min, item.headway_min, item.headwayMin, item.average_headway_min);

  return {
    origin: String(origin),
    destination: String(destination),
    distance_km: distanceKm,
    transit_min: transitMin,
    frequency_min: frequencyMin,
    mode: String(item.mode || item.route_type || item.transport_mode || 'unknown'),
    transfers: firstNumber(item.transfers, item.transfer_count),
    source: String(item.source || item.provider || 'mcp'),
    confidence: classifyConfidence(distanceKm, transitMin),
    raw: item
  };
}

export function summarizeTransitEvidence(items) {
  const normalized = normalizeTransitItems(items);
  if (normalized.length === 0) {
    return 'No reliable transit evidence was available; use qualitative geography guidance.';
  }
  return normalized.map(x => {
    const parts = [`${x.origin} -> ${x.destination}`];
    if (x.distance_km != null) parts.push(`${x.distance_km} km`);
    if (x.transit_min != null) parts.push(`${x.transit_min} min`);
    if (x.frequency_min != null) parts.push(`every ${x.frequency_min} min`);
    if (x.mode && x.mode !== 'unknown') parts.push(x.mode);
    return `- ${parts.join(' | ')}`;
  }).join('\n');
}

function extractItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.routes)) return raw.routes;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.content)) {
    return raw.content.flatMap(c => {
      if (typeof c?.text === 'string') {
        try { return JSON.parse(c.text); } catch { return []; }
      }
      return c;
    });
  }
  return [raw];
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return Number(n.toFixed(2));
  }
  return null;
}

function metersToKm(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / 1000 : null;
}

function secondsToMin(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / 60 : null;
}

function classifyConfidence(distanceKm, transitMin) {
  if (distanceKm != null && transitMin != null) return 'high';
  if (distanceKm != null || transitMin != null) return 'medium';
  return 'low';
}
