// Single source of truth. Everything in the UI reads from here.
// Initially populated by `bootDefault()`; replaced as real APIs land.

const listeners = new Set();

export const state = {
  place: { label: '', name: '', state: '', country: 'India', lat: null, lon: null, type: 'destination' },
  score: { value: null, raw: null },
  risk: { level: null, label: '', badgeClass: '' },
  recommendation: '',
  situation: { event: '', traffic: '', weather: '', inflow: '' },
  stats: { visitors: '', visitorsDelta: '', crowdRisk: '', traffic: '', weather: '', weatherSub: '', peak: '' },
  forecast: { hours: [], visitors: [] },
  hotspots: [],                  // [{ name, intensity, lat?, lon? }]
  advisories: [],                // [{ level, title, body }]
  advisoryWorkflow: {
    approved: null,              // { id, text, placeLabel, risk, requestedBy, submittedAt, publishedAt }
    pending: [],                 // [{ id, text, placeLabel, risk, requestedBy, submittedAt }]
  },
  news: [],                      // [{ title, source, url, publishedAt }]
  _newsLoaded: false,
  weather: null,                 // raw weather object
  isHoliday: false,
  holidayName: '',
  footer: { label: 'TourSensi · v0.1 — synthetic crowd model + real weather/holidays' },
  meta: { lastUpdated: null, source: 'synthetic' },
};

export function setState(patch) {
  deepMerge(state, patch);
  state.meta.lastUpdated = Date.now();
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}
