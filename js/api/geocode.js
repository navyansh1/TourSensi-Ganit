// Free geocoding via Nominatim (OpenStreetMap). 1 req/sec, needs User-Agent (browser sends one).
// Returns { lat, lon, displayName, name, state, country } or null.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocode(query) {
  if (!query || !query.trim()) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'in');  // bias toward India

  let res;
  try {
    res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
  } catch (e) {
    console.warn('[geocode] network error', e);
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return geocodeAnywhere(query);
  }

  const item = data[0];
  return {
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    displayName: item.display_name,
    name: item.address?.city || item.address?.town || item.address?.village || item.address?.state || item.name || query,
    state: item.address?.state || '',
    country: item.address?.country || 'India',
  };
}

async function geocodeAnywhere(query) {
  // Fallback without country bias (for non-Indian places). User will see a banner.
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0];
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name,
      name: item.address?.city || item.address?.town || item.address?.village || item.address?.state || item.name || query,
      state: item.address?.state || '',
      country: item.address?.country || '',
    };
  } catch {
    return null;
  }
}
