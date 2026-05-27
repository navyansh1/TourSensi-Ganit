// Boot + orchestration.

import { CONFIG } from '../config.js';
import { state, setState } from './state.js';
import { initUI } from './ui.js';
import { initCharts } from './charts.js';
import { initMap } from './map.js';
import { initSearch } from './search.js';
import { initTooltips } from './tooltip.js';
import { initRole, updatePublicTip } from './role.js';
import { fetchWeather } from './api/weather.js';
import { fetchTodayHoliday } from './api/holidays.js';
import { fetchNews } from './api/news.js';
import { generate, recommendationPrompt, publicAdvisoryPrompt, hotspotsPrompt } from './api/gemini.js';
import { computeIntelligence } from './model/crowd-score.js';
import { injectIcons } from './icons.js';

let lastPlace = null;
let lastModelOutput = null;

async function selectPlace(place) {
  lastPlace = place;
  setState({
    place: {
      label: place.label,
      name: place.name,
      state: place.state || '',
      country: place.country || 'India',
      lat: place.lat,
      lon: place.lon,
      type: place.type || 'destination',
    },
    score: { value: '', raw: null },
    advisories: [],
    news: [],
    _newsLoaded: false,
  });

  const [weather, holiday] = await Promise.all([
    fetchWeather(place.lat, place.lon),
    fetchTodayHoliday(),
  ]);

  const model = computeIntelligence({
    weather,
    isHoliday: holiday.isHoliday,
    holidayName: holiday.name,
    placeType: place.type || 'destination',
    placeName: place.name || place.label || '',
  });
  lastModelOutput = model;

  setState({
    weather,
    isHoliday: holiday.isHoliday,
    holidayName: holiday.name,
    score: model.score,
    risk: model.risk,
    recommendation: model.recommendation,
    situation: model.situation,
    stats: model.stats,
    forecast: model.forecast,
    hotspots: model.hotspots,
    advisories: model.advisories,
  });

  updatePublicTip();

  // Fire-and-forget enhancements: live news + AI recommendation + AI hotspots.
  loadNews(place).catch((e) => console.warn('news error', e));
  enhanceRecommendation(place, weather, holiday, model).catch((e) => console.warn('gemini error', e));
  enhanceHotspots(place, model).catch((e) => console.warn('gemini hotspots error', e));
}

async function loadNews(place) {
  const items = await fetchNews({
    apiKey:    CONFIG.NEWSDATA_API_KEY,
    gnewsKey:  CONFIG.GNEWS_API_KEY,
    nytKey:    CONFIG.NYT_API_KEY,
    query: place.name,
    country: place.country?.toLowerCase() === 'india' ? 'in' : undefined,
    max: 6,
  });
  setState({ news: items, _newsLoaded: true });
}

async function enhanceRecommendation(place, weather, holiday, model) {
  if (!CONFIG.GEMINI_API_KEY) return;
  const now = new Date();
  const ctx = {
    placeLabel: place.label,
    placeType: place.type || 'destination',
    score: model.score.value,
    risk: model.risk.label,
    day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()],
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    hour: now.getHours(),
    weather: weather?.label || 'Unknown',
    holiday: holiday.isHoliday ? holiday.name : '',
    hotspots: model.hotspots.slice(0, 3).map((h) => h.name),
    traffic: model.stats.traffic,
    peak: model.stats.peak,
  };
  const text = await generate({
    apiKey: CONFIG.GEMINI_API_KEY,
    model: CONFIG.GEMINI_MODEL,
    prompt: recommendationPrompt(ctx),
    temperature: 0.6,
    maxTokens: 80,
  });
  if (text) setState({ recommendation: text.replace(/^"|"$/g, '') });
}

async function enhanceHotspots(place, model) {
  if (!CONFIG.GEMINI_API_KEY) return;
  const text = await generate({
    apiKey: CONFIG.GEMINI_API_KEY,
    model: CONFIG.GEMINI_MODEL,
    prompt: hotspotsPrompt({ placeLabel: place.label, placeType: place.type || 'destination' }),
    temperature: 0.4,
    maxTokens: 120,
  });
  if (!text) return;
  let names;
  try {
    // Strip any markdown fences Gemini might add
    const clean = text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
    names = JSON.parse(clean);
  } catch {
    return;
  }
  if (!Array.isArray(names) || names.length < 3) return;
  // Keep the existing intensity values but swap in real zone names from Gemini
  const existingHotspots = model.hotspots;
  const merged = names.slice(0, existingHotspots.length).map((name, i) => ({
    name: String(name).slice(0, 30),
    intensity: existingHotspots[i]?.intensity ?? 50,
  }));
  setState({ hotspots: merged });
}

function wireAdvisoryModal() {
  const btn = document.getElementById('generateAdvisoryBtn');
  const modal = document.getElementById('advisoryModal');
  const body = document.getElementById('advisoryModalBody');
  const copy = document.getElementById('copyAdvisoryBtn');
  const regen = document.getElementById('regenerateAdvisoryBtn');
  if (!btn || !modal) return;

  const openModal = () => { modal.hidden = false; document.body.style.overflow = 'hidden'; };
  const closeModal = () => { modal.hidden = true; document.body.style.overflow = ''; };

  modal.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  async function generateAdvisory() {
    body.innerHTML = `<p class="muted">Generating advisory…</p>`;
    const place = lastPlace;
    const model = lastModelOutput;
    if (!place || !model) {
      body.innerHTML = `<p class="muted">Select a destination first.</p>`;
      return;
    }
    if (!CONFIG.GEMINI_API_KEY) {
      body.innerHTML = `<p>${escapeHtml(model.recommendation)}</p><p class="muted">Add a Gemini API key in config.js to generate a richer public advisory.</p>`;
      return;
    }
    const now = new Date();
    const ctx = {
      placeLabel: place.label,
      risk: model.risk.label,
      score: model.score.value,
      hotspots: model.hotspots.slice(0, 4).map((h) => `${h.name} (${h.intensity}%)`),
      weather: state.weather?.label || 'Unknown',
      holiday: state.isHoliday ? state.holidayName : '',
      peak: model.stats.peak,
      traffic: model.stats.traffic,
    };
    const text = await generate({
      apiKey: CONFIG.GEMINI_API_KEY,
      model: CONFIG.GEMINI_MODEL,
      prompt: publicAdvisoryPrompt(ctx),
      temperature: 0.65,
      maxTokens: 320,
    });
    if (!text) {
      body.innerHTML = `<p>${escapeHtml(model.recommendation)}</p><p class="muted">Gemini request failed — showing fallback recommendation.</p>`;
      return;
    }
    body.innerHTML = text.split(/\n+/).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('');
  }

  btn.addEventListener('click', async () => {
    openModal();
    await generateAdvisory();
  });
  regen?.addEventListener('click', generateAdvisory);
  copy?.addEventListener('click', async () => {
    const text = body.innerText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    } catch {
      copy.textContent = 'Copy failed';
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    }
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function wireThemeToggle() {
  const btn  = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  if (!btn || !icon) return;

  const saved = localStorage.getItem('theme');
  if (saved === 'dark') applyTheme('dark');

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    icon.setAttribute('data-icon', theme === 'dark' ? 'sun' : 'moon');
    icon.innerHTML = '';          // clear old SVG so injectIcons re-renders it
    injectIcons(btn);
  }
}

async function boot() {
  wireThemeToggle();
  initUI();
  initCharts();
  initMap();
  initRole();
  wireAdvisoryModal();
  await initSearch({
    onSelect: selectPlace,
    defaultPlace: CONFIG.DEFAULT_PLACE || 'Kodaikanal',
  });
  // Init tooltips after first render so all elements exist in DOM.
  setTimeout(initTooltips, 50);
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => console.error('boot failed', e));
});
