import { CONFIG } from '../config.js';

// Lightweight hover tooltip system.
// Add data-tip="text" to any element to get a tooltip on hover.
// Also injects the global (i) button in the topbar.

const TIP_CONTENT = {
  'stat-visitors':   { label: 'Visitors Today', src: 'Synthetic model', detail: 'Estimated from day-of-week, weather favorability, public holidays, and a bell-curve hourly demand model. Will be replaced by real ticketing / footfall data in Phase 2.' },
  'stat-crowd':      { label: 'Crowd Risk', src: 'Synthetic model', detail: 'Derived from the Destination Health Score (0–100). Score < 50 → High, 50–74 → Moderate, ≥ 75 → Low.' },
  'stat-traffic':    { label: 'Traffic State', src: 'Synthetic model', detail: 'Inferred from Health Score + weekend/holiday flag. No live traffic feed yet — Google Routes API (billing required) can replace this in Phase 2.' },
  'stat-weather':    { label: 'Weather Impact', src: 'Open-Meteo API (live, free)', detail: 'Real current weather for the destination\'s coordinates, fetched from api.open-meteo.com — no API key required.' },
  'stat-peak':       { label: 'Peak Window', src: 'Synthetic model', detail: 'Hour with highest predicted visitors in the forecast curve, padded ±1 hour.' },
  'hero-score':      { label: 'Destination Health Score', src: 'Synthetic model (inputs: real weather + real holidays)', detail: 'Score = 100 − penalties for weekend, public holiday, pleasant weather, peak hour, and news events. Range 0–100. Higher = safer.' },
  'hero-badge':      { label: 'Risk Badge', src: 'Derived from Health Score', detail: 'Healthy ≥ 75 · Caution 50–74 · Risky < 50' },
  'hero-rec':        { label: 'Recommendation', src: 'Gemini API (if key set) or synthetic fallback', detail: 'When a Gemini API key is in config.js, a one-sentence action recommendation is generated. Otherwise a rule-based fallback is shown.' },
  'ctx-event':       { label: 'Event Context', src: 'Nager.Date (public holidays) + day-of-week', detail: 'National public holidays from date.nager.at, combined with weekend detection. Free, no key.' },
  'ctx-traffic':     { label: 'Traffic', src: 'Synthetic model', detail: 'Inferred. Phase 2 upgrade: Google Routes API traffic-aware routing (5,000 free calls/month but requires billing-enabled GCP).' },
  'ctx-weather':     { label: 'Weather', src: 'Open-Meteo API (live, free)', detail: 'Live weather code mapped to label. Open-Meteo is open-source, unlimited free non-commercial use, no key required.' },
  'ctx-inflow':      { label: 'Forecast Inflow %', src: 'Synthetic model', detail: 'Percentage above/below an average-weekday baseline, driven by weekend, holiday, weather, and hour factors.' },
  'forecast-chart':  { label: 'Visitor Forecast', src: 'Synthetic model (inputs: real weather + holidays)', detail: 'Hourly visitor estimate for 8 AM–8 PM today. Shape is a bell curve peaking ~2 PM, scaled by demand drivers. Not based on real headcounts.' },
  'hotspots-chart':  { label: 'Crowd Hotspots', src: 'Synthetic model + zone templates', detail: 'Zone names come from a destination-type template (hill-station, monument, beach, etc.). Intensity is driven by peak-hour factor + weather + random-seeded noise.' },
  'map-card':        { label: 'Map Intelligence', src: 'Leaflet + OpenStreetMap (free) + synthetic hotspot offsets', detail: 'Map tiles from openstreetmap.org — free, no key. Hotspot circles are offset synthetically around the destination centre; real CCTV-based zone coordinates can replace them.' },
  'advisories-card': { label: 'Live Advisories', src: 'Synthetic model', detail: 'Rule-based advisories generated from hotspot intensity + traffic state + risk level. Gemini API (optional) will upgrade these to natural-language text.' },
  'news-row':        { label: 'Local Signals', src: 'newsdata.io (free tier — 200 credits/day)', detail: 'Requires NEWSDATA_API_KEY in config.js. Searches recent news filtered by destination name + country=India.' },
};

let tipEl = null;

function ensureTipEl() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'tooltip-bubble';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function showTip(anchor, key) {
  const info = TIP_CONTENT[key];
  if (!info) return;
  const el = ensureTipEl();
  el.innerHTML = `
    <div class="tip-label">${escapeHtml(info.label)}</div>
    <div class="tip-src"><span class="tip-src-dot"></span>${escapeHtml(info.src)}</div>
    <div class="tip-detail">${escapeHtml(info.detail)}</div>
  `;
  el.hidden = false;
  positionTip(anchor);
}

function positionTip(anchor) {
  const el = ensureTipEl();
  const rect = anchor.getBoundingClientRect();
  const tipW = 280;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 8;

  if (left + tipW > window.innerWidth - 12) left = window.innerWidth - tipW - 12;
  if (left < 8) left = 8;

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.maxWidth = `${tipW}px`;
}

function hideTip() {
  const el = ensureTipEl();
  el.hidden = true;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const KEY_MAP = {
  'statVisitors':        'stat-visitors',
  'statCrowdRisk':       'stat-crowd',
  'statTraffic':         'stat-traffic',
  'statWeather':         'stat-weather',
  'statPeak':            'stat-peak',
  'heroScore':           'hero-score',
  'riskBadge':           'hero-badge',
  'heroRecommendation':  'hero-rec',
  'ctxEvent':            'ctx-event',
  'ctxTraffic':          'ctx-traffic',
  'ctxWeather':          'ctx-weather',
  'ctxInflow':           'ctx-inflow',
  'forecastChart':       'forecast-chart',
  'hotspotsChart':       'hotspots-chart',
};

const CLASS_MAP = {
  'map-card':        'map-card',
  'news-row':        'news-row',
};

export function initTooltips() {
  ensureTipEl();

  // Wire by element ID
  for (const [id, key] of Object.entries(KEY_MAP)) {
    const el = document.getElementById(id);
    if (!el) continue;
    // For chart canvases, attach badge to parent card-head title instead
    if (id === 'forecastChart' || id === 'hotspotsChart') {
      const cardHead = el.closest('.card')?.querySelector('.card-title');
      wireElement(cardHead || el, key);
    } else {
      wireElement(el, key);
    }
  }

  // Wire stat cards by their parent card (so icon + label + value all trigger)
  document.querySelectorAll('.stat-card').forEach((card) => {
    const label = card.querySelector('.stat-label')?.textContent?.trim().toLowerCase();
    let key = null;
    if (label?.includes('visitor')) key = 'stat-visitors';
    else if (label?.includes('crowd')) key = 'stat-crowd';
    else if (label?.includes('traffic')) key = 'stat-traffic';
    else if (label?.includes('weather')) key = 'stat-weather';
    else if (label?.includes('peak')) key = 'stat-peak';
    if (key) wireElement(card, key);
  });

  // Wire by card class
  for (const [cls, key] of Object.entries(CLASS_MAP)) {
    document.querySelectorAll(`.${cls}`).forEach((el) => {
      // For news-row, attach badge to the heading span so it's visible inline
      if (cls === 'news-row') {
        const head = el.querySelector('.news-head');
        wireElement(head || el, key);
      } else {
        wireElement(el, key);
      }
    });
  }

  // Hero left section
  const heroScore = document.querySelector('.hero-score');
  if (heroScore) wireElement(heroScore, 'hero-score');
  const badge = document.querySelector('.risk-badge');
  if (badge) wireElement(badge, 'hero-badge');
  const rec = document.querySelector('.hero-recommendation');
  if (rec) wireElement(rec, 'hero-rec');

  // Situation list items
  const sitItems = document.querySelectorAll('.situation-list li');
  sitItems.forEach((li) => {
    const key = li.querySelector('.situation-key')?.textContent?.trim().toLowerCase();
    if (key?.includes('event')) wireElement(li, 'ctx-event');
    else if (key?.includes('traffic')) wireElement(li, 'ctx-traffic');
    else if (key?.includes('weather')) wireElement(li, 'ctx-weather');
    else if (key?.includes('inflow')) wireElement(li, 'ctx-inflow');
  });

  // Inject the Data Sources (i) button into topbar actions
  injectInfoButton();
}

const INFO_SVG = `<svg class="tip-i-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

function wireElement(el, key) {
  if (!TIP_CONTENT[key]) return;
  if (el.dataset.tipWired) return;   // prevent double-wiring
  el.dataset.tipWired = '1';
  el.classList.add('has-tip');

  // Inject the inline (i) badge unless one already exists
  if (!el.querySelector('.tip-i-badge')) {
    const badge = document.createElement('span');
    badge.className = 'tip-i-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = INFO_SVG;
    el.appendChild(badge);
  }

  el.addEventListener('mouseenter', () => showTip(el, key));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('focusin', () => showTip(el, key));
  el.addEventListener('focusout', hideTip);
}

function injectInfoButton() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.getElementById('infoBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'infoBtn';
  btn.className = 'info-btn';
  btn.setAttribute('aria-label', 'Data sources info');
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  actions.insertBefore(btn, actions.firstChild);

  const panel = document.createElement('div');
  panel.id = 'infoPanel';
  panel.className = 'info-panel';
  panel.hidden = true;
  panel.innerHTML = buildInfoPanelHTML();

  document.body.appendChild(panel);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) positionPanel(btn, panel);
  });
  document.getElementById('infoPanelClose')?.addEventListener('click', () => { panel.hidden = true; });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
  });
}

function buildInfoPanelHTML() {
  const live    = `<span class="src-status src-live">&#9679; Live</span>`;
  const pending = `<span class="src-status src-pending">&#9679; Add key</span>`;
  const synth   = `<span class="src-status src-synth">&#9679; Synthetic</span>`;
  const always  = `<span class="src-status src-live">&#9679; Always on</span>`;

  const geminiOn   = CONFIG.GEMINI_API_KEY   ? live : pending;
  const newsdataOn = CONFIG.NEWSDATA_API_KEY ? live : pending;

  return `
    <div class="info-panel-head">
      <strong>Data Sources &amp; Status</strong>
      <button class="modal-close" id="infoPanelClose" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="info-panel-body">
      <p class="info-section-label">Always-on (no key needed)</p>
      <table class="src-table">
        <thead><tr><th>Signal</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Weather &amp; Forecast</td><td><a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></td><td>${always}</td></tr>
          <tr><td>Public Holidays</td><td><a href="https://date.nager.at" target="_blank" rel="noopener">Nager.Date</a></td><td>${always}</td></tr>
          <tr><td>Geocoding</td><td><a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener">Nominatim / OSM</a></td><td>${always}</td></tr>
          <tr><td>Map Tiles</td><td><a href="https://openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a></td><td>${always}</td></tr>
        </tbody>
      </table>

      <p class="info-section-label" style="margin-top:14px">Optional keys (free tiers)</p>
      <table class="src-table">
        <thead><tr><th>Signal</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>AI Advisories</td><td><a href="https://aistudio.google.com" target="_blank" rel="noopener">Gemini API</a></td><td>${geminiOn}</td></tr>
          <tr><td>News</td><td><a href="https://newsdata.io" target="_blank" rel="noopener">newsdata.io</a> <span class="src-note">200 req/day</span></td><td>${newsdataOn}</td></tr>
        </tbody>
      </table>

      <p class="info-section-label" style="margin-top:14px">Synthetic signals</p>
      <table class="src-table">
        <thead><tr><th>Signal</th><th>Inputs used</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Visitor count / crowd</td><td>Weather + holidays + day/hour</td><td>${synth}</td></tr>
          <tr><td>Traffic state</td><td>Health Score + weekend/holiday</td><td>${synth}</td></tr>
          <tr><td>Hotspot intensity</td><td>Demand model + zone template</td><td>${synth}</td></tr>
        </tbody>
      </table>

      <p class="info-note" style="margin-top:12px"><strong>Synthetic</strong> — not from live sensors. Reacts to real weather + holidays so the score moves realistically. Phase 2: replace with BestTime.app, ticketing feeds, or CCTV headcount.</p>
      <p class="info-note">Add keys in <code>config.js</code> to unlock live signals.</p>
    </div>
  `;
}

function positionPanel(btn, panel) {
  const rect = btn.getBoundingClientRect();
  const panelW = 380;
  panel.style.top  = `${rect.bottom + 8}px`;
  panel.style.left = `${Math.max(12, Math.min(rect.right - panelW, window.innerWidth - panelW - 12))}px`;
}
