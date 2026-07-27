const KEY = process.env.TRANSITLAND_API_KEY;
if (!KEY) { console.log("ERR: TRANSITLAND_API_KEY not in env"); process.exit(1); }
const BASE = "https://transit.land/api/v2/rest";
const H = { headers: { apikey: KEY } };
const svcDate = new Date().toISOString().slice(0, 10);
async function tl(p){const r=await fetch(BASE+p,H);if(!r.ok)throw new Error("HTTP "+r.status+" on "+p);return r.json();}
async function nearest(lat,lon){const j=await tl(`/stops?lat=${lat}&lon=${lon}&radius=1000&limit=5`);const s=(j.stops||[])[0];if(!s)return null;const[slon,slat]=(s.geometry&&s.geometry.coordinates)||[lon,lat];const rt=(s.route_stops||[]).map(x=>x.route&&x.route.route_type).find(t=>t!==undefined);return{name:s.stop_name||s.onestop_id,id:s.onestop_id,lat:+slat,lon:+slon,route_type:rt};}
(async()=>{try{
  const gion=await nearest(35.0037,135.7788);
  const arashi=await nearest(35.0094,135.6772);
  console.log("GION  stop:",gion);
  console.log("ARASHI stop:",arashi);
  const path=`/stops/${encodeURIComponent(gion.id)}/departures?service_date=${svcDate}&start_time=08:00:00&end_time=10:00:00&include_geometry=false&include_alerts=false&limit=100`;
  const dj=await tl(path);
  const sa=dj.stops||[];let deps=[];
  if(sa.length&&Array.isArray(sa[0].departures))deps=sa[0].departures;
  else if(Array.isArray(dj.departures))deps=dj.departures;
  console.log("--- DEPARTURES SHAPE CHECK ---");
  console.log("top-level keys:",Object.keys(dj));
  if(sa[0])console.log("stop[0] keys:",Object.keys(sa[0]));
  console.log("departures found:",deps.length);
  if(deps[0])console.log("sample departure keys:",Object.keys(deps[0]));
  if(deps[0])console.log("sample departure:",JSON.stringify(deps[0]).slice(0,300));
  console.log("computed headway (min):",deps.length?Math.round(120/deps.length):null);
}catch(e){console.log("ERR:",e.message);}})();
