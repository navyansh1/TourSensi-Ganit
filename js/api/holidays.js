// Nager.Date — free public-holiday API, no key, CORS-friendly.
// Returns { isHoliday, name } for a given date (default: today).

const ENDPOINT_YEAR = (year) => `https://date.nager.at/api/v3/PublicHolidays/${year}/IN`;

let cache = { year: null, data: null };

export async function fetchTodayHoliday(now = new Date()) {
  const year = now.getFullYear();
  const data = await fetchYear(year);
  if (!data) return { isHoliday: false, name: '' };

  const todayIso = now.toISOString().slice(0, 10);
  const match = data.find((h) => h.date === todayIso);
  return match ? { isHoliday: true, name: match.localName || match.name } : { isHoliday: false, name: '' };
}

async function fetchYear(year) {
  if (cache.year === year && cache.data) return cache.data;
  try {
    const res = await fetch(ENDPOINT_YEAR(year));
    if (!res.ok) return null;
    const data = await res.json();
    cache = { year, data };
    return data;
  } catch (e) {
    console.warn('[holidays] fetch failed', e);
    return null;
  }
}
