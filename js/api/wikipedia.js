// Wikipedia API — fetch page summary and cover photo.
// No key required, CORS-friendly.

export async function fetchWikiSummary(placeName) {
  if (!placeName?.trim()) return null;

  // 1. Try fetching directly by name
  let data = await getSummary(placeName);
  if (data) return data;

  // 2. If direct fetch fails, search Wikipedia and try the top hit
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName)}&utf8=&format=json&origin=*`;
    const res = await fetch(searchUrl);
    if (!res.ok) return null;
    
    const searchData = await res.json();
    const topHit = searchData?.query?.search?.[0];
    if (topHit?.title) {
      return await getSummary(topHit.title);
    }
  } catch (e) {
    console.warn('[wikipedia] search failed', e);
  }

  return null;
}

async function getSummary(title) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.type === 'disambiguation') {
      // Disambiguation pages are not helpful summaries
      return null;
    }

    return {
      title: data.title,
      extract: data.extract || '',
      description: data.description || '',
      image: data.originalimage?.source || data.thumbnail?.source || null,
      pageUrl: data.content_urls?.desktop?.page || null,
    };
  } catch (e) {
    console.warn('[wikipedia] summary fetch failed for', title, e);
    return null;
  }
}
