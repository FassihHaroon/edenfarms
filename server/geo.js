// Delivery areas and address lookup.
// Areas are circles (centre + radius in km) set in the admin panel.
// Place names come from OpenStreetMap's Nominatim service, called from the server so
// we can cache answers and stay within its usage policy (max 1 request per second).

const EARTH_KM = 6371;
const rad = d => (d * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

// The zone a point falls in, or null if we don't deliver there.
export function zoneFor(point, zones) {
  for (const z of zones || []) {
    if (distanceKm(point, { lat: z.lat, lng: z.lng }) <= z.radius_km) return z;
  }
  return null;
}

// Rough box around Qatar, to reject nonsense coordinates early.
export const inQatar = p => p.lat > 24.4 && p.lat < 26.3 && p.lng > 50.6 && p.lng < 51.8;

/* ---------- Nominatim (OpenStreetMap) ---------- */
const BASE = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const enabled = () => process.env.GEOCODER !== 'off';
const UA = 'EdenFarmShop/1.0 (info@edenfarm.qa)';
const cache = new Map();
const CACHE_MAX = 3000;
let queue = Promise.resolve();
let last = 0;

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

// One request at a time, at least 1.1 s apart.
function throttled(url) {
  const run = queue.then(async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    return res.json();
  });
  queue = run.catch(() => {});
  return run;
}

const areaOf = a => a?.suburb || a?.neighbourhood || a?.quarter || a?.city_district || a?.residential || a?.town || a?.village || a?.city || '';

export async function reverseGeocode(lat, lng, lang = 'en') {
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}:${lang}`;
  if (cache.has(key)) return cache.get(key);
  if (!enabled()) return { area: '', label: '' };
  try {
    const j = await throttled(`${BASE}/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lng}&accept-language=${lang}`);
    const a = j.address || {};
    const area = areaOf(a);
    const label = [a.road, area, a.city && a.city !== area ? a.city : ''].filter(Boolean).join(', ') || j.display_name || '';
    return remember(key, { area, label });
  } catch {
    return { area: '', label: '' };
  }
}

export async function searchPlaces(q, lang = 'en') {
  const key = `s:${q.toLowerCase()}:${lang}`;
  if (cache.has(key)) return cache.get(key);
  if (!enabled()) return [];
  try {
    const j = await throttled(`${BASE}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=qa&accept-language=${lang}&q=${encodeURIComponent(q)}`);
    return remember(key, j.map(r => ({
      label: r.display_name.split(',').slice(0, 3).join(',').trim(),
      area: areaOf(r.address),
      lat: Number(r.lat),
      lng: Number(r.lon),
    })));
  } catch {
    return [];
  }
}
