// News fetching — newsdata.io (primary), GNews and NYT (if keys set).
// No Guardian fallback. If no key is available, returns empty.

const NEWSDATA_ENDPOINT = 'https://newsdata.io/api/1/news';
const GNEWS_ENDPOINT    = 'https://gnews.io/api/v4/search';
const NYT_ENDPOINT      = 'https://api.nytimes.com/svc/search/v2/articlesearch.json';

export const SOURCE_META = {
  newsdata: { label: 'newsdata.io', color: '#0ea5e9' },
  gnews:    { label: 'GNews',       color: '#f59e0b' },
  nyt:      { label: 'NY Times',    color: '#ef4444' },
};

const TOURISM_KEYWORDS = [
  'tourist', 'tourism', 'travel', 'crowd', 'traffic', 'weather', 'rain', 'snow', 'monument', 
  'temple', 'shrine', 'beach', 'resort', 'visit', 'visitor', 'festival', 'highway', 'route', 
  'police', 'alert', 'advisory', 'hill', 'station', 'safari', 'park', 'pilgrim', 'devotee',
  'flight', 'train', 'bus', 'congest', 'closure', 'lockdown', 'avalanche', 'landslide'
];

function filterTourismNews(articles) {
  if (!Array.isArray(articles)) return [];
  return articles.filter(art => {
    const title = (art.title || '').toLowerCase();
    const desc = (art.description || '').toLowerCase();
    return TOURISM_KEYWORDS.some(kw => title.includes(kw) || desc.includes(kw));
  });
}

export async function fetchNews({ apiKey, gnewsKey, nytKey, query, fallbackQuery, country = 'in', max = 6 }) {
  if (!query?.trim()) return [];

  const fetchers = [];
  if (apiKey)   fetchers.push(fetchNewsdataIo({ apiKey, query, country, max }));
  if (gnewsKey) fetchers.push(fetchGNews({ gnewsKey, query, country, max }));
  if (nytKey)   fetchers.push(fetchNYT({ nytKey, query, max }));

  let all = [];
  if (fetchers.length) {
    const batches = await Promise.allSettled(fetchers);
    all = batches.flatMap((b) => b.status === 'fulfilled' ? b.value : []);
  }

  // Filter for tourism relevance
  let filtered = filterTourismNews(dedup(all));

  // If we have fewer than 2 relevant articles, query state-level fallback (e.g. "Goa tourism")
  if (filtered.length < 2 && fallbackQuery?.trim()) {
    const fbFetchers = [];
    if (apiKey)   fbFetchers.push(fetchNewsdataIo({ apiKey, query: fallbackQuery, country, max }));
    if (gnewsKey) fbFetchers.push(fetchGNews({ gnewsKey, query: fallbackQuery, country, max }));
    if (nytKey)   fbFetchers.push(fetchNYT({ nytKey, query: fallbackQuery, max }));

    if (fbFetchers.length) {
      try {
        const fbBatches = await Promise.allSettled(fbFetchers);
        const fbAll = fbBatches.flatMap((b) => b.status === 'fulfilled' ? b.value : []);
        const fbFiltered = filterTourismNews(dedup(fbAll));
        filtered = dedup([...filtered, ...fbFiltered]);
      } catch (e) {
        console.warn('[news] fallback fetch failed', e);
      }
    }
  }

  return filtered.slice(0, max);
}

async function fetchNewsdataIo({ apiKey, query, country, max }) {
  const url = new URL(NEWSDATA_ENDPOINT);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('country', country);
  url.searchParams.set('language', 'en');
  url.searchParams.set('size', String(max));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.slice(0, max).map((n) => ({
      title: n.title,
      source: SOURCE_META.newsdata.label,
      sourceKey: 'newsdata',
      url: n.link,
      publishedAt: n.pubDate,
      description: n.description || '',
    }));
  } catch (e) {
    console.warn('[news] newsdata.io error', e);
    return [];
  }
}

async function fetchGNews({ gnewsKey, query, country, max }) {
  const url = new URL(GNEWS_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('token', gnewsKey);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('country', country === 'in' ? 'in' : 'us');
  url.searchParams.set('max', String(max));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.articles)) return [];
    return data.articles.slice(0, max).map((n) => ({
      title: n.title,
      source: n.source?.name || SOURCE_META.gnews.label,
      sourceKey: 'gnews',
      url: n.url,
      publishedAt: n.publishedAt,
      description: n.description || '',
      image: n.image || '',
    }));
  } catch (e) {
    console.warn('[news] gnews error', e);
    return [];
  }
}

async function fetchNYT({ nytKey, query, max }) {
  const url = new URL(NYT_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('api-key', nytKey);
  url.searchParams.set('sort', 'newest');
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const docs = data?.response?.docs;
    if (!Array.isArray(docs)) return [];
    return docs.slice(0, max).map((n) => ({
      title: n.headline?.main || '',
      source: SOURCE_META.nyt.label,
      sourceKey: 'nyt',
      url: n.web_url,
      publishedAt: n.pub_date,
      description: n.lead_paragraph || '',
    })).filter((n) => n.title);
  } catch (e) {
    console.warn('[news] nyt error', e);
    return [];
  }
}

function dedup(items) {
  const seen = new Set();
  return items.filter((n) => {
    const key = n.title.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
