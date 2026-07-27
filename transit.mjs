const TL_BASE = "https://transit.land/api/v2/rest";
const MODE_SPEED_KMH = { 0: 20, 1: 32, 2: 45, 3: 18, 4: 25, default: 22 };
const MODE_NAME = { 0: "tram", 1: "subway", 2: "rail", 3: "bus", 4: "ferry" };

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function tlGet(path, apikey) {
  const res = await fetch(TL_BASE + path, { headers: { apikey } });
  if (res.status === 401) throw new Error("Transitland 401 — invalid/missing API key");
  if (res.status === 429) throw new Error("Transitland 429 — rate limited");
  if (!res.ok) throw new Error("Transitland HTTP " + res.status);
  return res.json();
}

async function nearestStop({ lat, lon }, apikey, radius = 1000) {
  const j = await tlGet(`/stops?lat=${lat}&lon=${lon}&radius=${radius}&limit=5`, apikey);
  const stops = (j && j.stops) || [];
  if (stops.length === 0) return null;
  const s = stops.find((x) => x.geometry && Array.isArray(x.geometry.coordinates)) || stops[0];
  const [slon, slat] = (s.geometry && s.geometry.coordinates) || [lon, lat];
  const rt = (s.route_stops || [])
    .map((rs) => rs.route && rs.route.route_type)
    .find((t) => t !== undefined);
  return { name: s.stop_name || s.onestop_id, id: s.onestop_id,
    lat: Number(slat), lon: Number(slon), route_type: rt };
}

async function stopFrequency(stopId, apikey, serviceDate, startHHMM = "08:00:00", endHHMM = "10:00:00") {
  const path = `/stops/${encodeURIComponent(stopId)}/departures` +
    `?service_date=${serviceDate}&start_time=${startHHMM}&end_time=${endHHMM}` +
    `&include_geometry=false&include_alerts=false&limit=100`;
  const j = await tlGet(path, apikey);
  const stopsArr = (j && j.stops) || [];
  let deps = [];
  if (stopsArr.length && Array.isArray(stopsArr[0].departures)) deps = stopsArr[0].departures;
  else if (Array.isArray(j.departures)) deps = j.departures;
  const count = deps.length;
  const headway = count > 0 ? Math.round(120 / count) : null;
  const rtCounts = {};
  for (const d of deps) {
    const rt = d && d.trip && d.trip.route && d.trip.route.route_type;
    if (rt !== undefined && rt !== null) rtCounts[rt] = (rtCounts[rt] || 0) + 1;
  }
  let route_type = null;
  const entries = Object.entries(rtCounts);
  if (entries.length) route_type = Number(entries.sort((a, b) => b[1] - a[1])[0][0]);
  return { count, headway_min: headway, route_type };
}

async function getTransitInfo(args, ctx) {
  const { origin, destination } = args;
  const apikey = ctx && ctx.apikey;
  if (!apikey) return { status: "error", source: "transitland", error: "missing apikey" };
  const serviceDate = (ctx && ctx.serviceDate) || new Date().toISOString().slice(0, 10);
  try {
    const [oStop, dStop] = await Promise.all([
      nearestStop(origin, apikey), nearestStop(destination, apikey),
    ]);
    if (!oStop || !dStop) {
      return { status: "no_coverage", source: "transitland",
        origin: (origin && origin.name) || null,
        destination: (destination && destination.name) || null,
        distance: null, duration: null, frequency: null,
        note: "No transit stops near one/both endpoints. Caller should fall back " +
              "(KV cache -> Week 6.2 geography heuristic)." };
    }
    const distanceKm = +haversineKm(oStop, dStop).toFixed(1);
    const freq = await stopFrequency(oStop.id, apikey, serviceDate);
    const rt = oStop.route_type ?? freq.route_type;
    const speed = MODE_SPEED_KMH[rt] ?? MODE_SPEED_KMH.default;
    const durationMin = Math.max(1, Math.round((distanceKm / speed) * 60));
    return { status: "ok", source: "transitland",
      origin: oStop.name, destination: dStop.name,
      origin_stop_id: oStop.id, destination_stop_id: dStop.id,
      distance: distanceKm, distance_confidence: "real",
      duration: durationMin, duration_confidence: "estimate",
      duration_basis: (MODE_NAME[rt] || "transit") + ` @ ${speed} km/h straight-line`,
      frequency: freq.headway_min,
      frequency_confidence: freq.count > 0 ? "real" : "none",
      frequency_sample: `${freq.count} departures 08:00–10:00 on ${serviceDate}`,
      attribution: "Transitland (Interline Technologies)" };
  } catch (e) {
    return { status: "error", source: "transitland", error: e.message,
      note: "Caller should fall back (KV cache -> geography heuristic)." };
  }
}

export { getTransitInfo, haversineKm, nearestStop, stopFrequency };
