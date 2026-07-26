// VoyageFlow Itinerary Sequencer (Phase 3 skeleton)
// Uses normalized transit evidence to suggest arrival/departure buffers and a
// distance-wave middle order. Pure logic; no network calls.

export function sequenceDestinations({ base, candidates, transitItems, tripDays = null }) {
  const evidence = indexEvidence(transitItems);
  const scored = candidates.map(name => scoreCandidate(base, name, evidence));

  const near = scored.filter(x => x.category === 'near').sort(byEaseAsc);
  const medium = scored.filter(x => x.category === 'medium').sort(byDistanceDesc);
  const far = scored.filter(x => x.category === 'far').sort(byDistanceDesc);
  const unknown = scored.filter(x => x.category === 'unknown').sort((a, b) => a.name.localeCompare(b.name));

  const arrivalBuffer = pickFirst(near) || pickFirst(medium) || pickFirst(unknown) || null;
  const departureBuffer = pickDepartureBuffer(scored, arrivalBuffer);

  const middlePool = scored
    .filter(x => x.name !== arrivalBuffer?.name && x.name !== departureBuffer?.name)
    .sort((a, b) => {
      // Farthest / longest first, but send unknowns to the end.
      if (a.category === 'unknown' && b.category !== 'unknown') return 1;
      if (b.category === 'unknown' && a.category !== 'unknown') return -1;
      return compareCompositeDesc(a, b);
    });

  return {
    base,
    trip_days: tripDays,
    arrival_buffer: arrivalBuffer,
    middle_days: middlePool,
    departure_buffer: departureBuffer,
    warnings: buildWarnings(scored, departureBuffer),
    evidence_used: scored.filter(x => x.evidence).length
  };
}

export function buildTransitPromptContext(sequence) {
  const lines = [];
  lines.push('Transit-aware sequencing evidence:');
  if (sequence.arrival_buffer) {
    lines.push(`- Arrival buffer candidate: ${describe(sequence.arrival_buffer)}`);
  }
  for (const item of sequence.middle_days) {
    lines.push(`- Middle-day candidate: ${describe(item)}`);
  }
  if (sequence.departure_buffer) {
    lines.push(`- Departure buffer candidate: ${describe(sequence.departure_buffer)}`);
  }
  for (const warning of sequence.warnings || []) lines.push(`- Warning: ${warning}`);
  lines.push('Use this evidence to keep arrival/departure days light and schedule farthest or transit-heavy day trips in the middle of the stay.');
  return lines.join('\n');
}

function scoreCandidate(base, name, evidenceIndex) {
  const evidence = evidenceIndex.get(pairKey(base, name)) || evidenceIndex.get(pairKey(name, base)) || null;
  const distance = evidence?.distance_km ?? null;
  const minutes = evidence?.transit_min ?? null;
  const frequency = evidence?.frequency_min ?? null;
  const composite = (distance ?? 0) * 2 + (minutes ?? 0) / 10 + (frequency ?? 0) / 30;

  let category = 'unknown';
  if (distance != null || minutes != null) {
    const d = distance ?? 0;
    const t = minutes ?? 0;
    if (d <= 2 || t <= 15) category = 'near';
    else if (d >= 8 || t >= 35) category = 'far';
    else category = 'medium';
  }

  return { name, distance_km: distance, transit_min: minutes, frequency_min: frequency, mode: evidence?.mode || 'unknown', category, composite: Number(composite.toFixed(2)), evidence };
}

function indexEvidence(items = []) {
  const m = new Map();
  for (const item of items) {
    if (!item?.origin || !item?.destination) continue;
    m.set(pairKey(item.origin, item.destination), item);
  }
  return m;
}

function pairKey(a, b) {
  return `${norm(a)}|${norm(b)}`;
}

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function pickFirst(arr) {
  return arr.length > 0 ? arr[0] : null;
}

function pickDepartureBuffer(scored, arrivalBuffer) {
  const candidates = scored
    .filter(x => x.name !== arrivalBuffer?.name)
    .filter(x => x.category === 'near' || (x.transit_min != null && x.transit_min <= 20))
    .sort(byEaseAsc);
  if (candidates.length > 0) return candidates[0];

  const nonFar = scored
    .filter(x => x.name !== arrivalBuffer?.name && x.category !== 'far')
    .sort(byEaseAsc);
  return nonFar[0] || null;
}

function byEaseAsc(a, b) {
  return (a.transit_min ?? 999) - (b.transit_min ?? 999) || (a.distance_km ?? 999) - (b.distance_km ?? 999);
}

function byDistanceDesc(a, b) {
  return compareCompositeDesc(a, b);
}

function compareCompositeDesc(a, b) {
  return b.composite - a.composite || (b.distance_km ?? 0) - (a.distance_km ?? 0) || a.name.localeCompare(b.name);
}

function buildWarnings(scored, departureBuffer) {
  const warnings = [];
  if (departureBuffer && departureBuffer.category === 'far') {
    warnings.push(`${departureBuffer.name} is transit-heavy; avoid using it as a departure buffer if possible.`);
  }
  for (const item of scored) {
    if (item.category === 'far' && item.transit_min != null && item.transit_min >= 35) {
      warnings.push(`${item.name} appears far or transit-heavy (${item.transit_min} min); schedule it in the middle of the stay.`);
    }
  }
  return [...new Set(warnings)];
}

function describe(x) {
  const bits = [x.name, x.category];
  if (x.distance_km != null) bits.push(`${x.distance_km} km`);
  if (x.transit_min != null) bits.push(`${x.transit_min} min`);
  if (x.frequency_min != null) bits.push(`every ${x.frequency_min} min`);
  return bits.join(' | ');
}
