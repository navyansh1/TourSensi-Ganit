// Boot + orchestration.

import { CONFIG } from '../config.js';
import { state, setState } from './state.js';
import { initUI, formatAdvisoryHtml, showToast } from './ui.js';
import { initCharts } from './charts.js';
import { initMap } from './map.js';
import { initSearch } from './search.js';
import { initTooltips } from './tooltip.js';
import { getRole, initRole, updatePublicTip } from './role.js';
import { fetchWeather } from './api/weather.js';
import { fetchTodayHoliday } from './api/holidays.js';
import { fetchNews } from './api/news.js';
import { fetchWikiSummary } from './api/wikipedia.js';
import { generate, generateDetailed, recommendationPrompt, publicAdvisoryPrompt, hotspotsPrompt } from './api/gemini.js';
import { computeIntelligence } from './model/crowd-score.js';
import { injectIcons } from './icons.js';
import {
  approvePendingAdvisory,
  loadAdvisoryWorkflow,
  publishApprovedAdvisory,
  queuePendingAdvisory,
  rejectPendingAdvisory,
  subscribeToAdvisoryWorkflow,
} from './advisory-store.js';

let lastPlace = null;
let lastModelOutput = null;
let modalMode = 'gov';
let modalDraft = null;

function showSearchLoadingModal() {
  const modal = document.getElementById('searchLoadingModal');
  const bar = document.getElementById('loadingProgressBar');
  if (!modal) return;

  // Reset steps
  const steps = modal.querySelectorAll('.loading-step');
  steps.forEach(s => {
    s.className = 'loading-step is-pending';
  });

  // Set the first three as loading (Weather, Holiday, Wiki run first)
  document.getElementById('stepWeather').className = 'loading-step is-loading';
  document.getElementById('stepHoliday').className = 'loading-step is-loading';
  document.getElementById('stepWiki').className = 'loading-step is-loading';

  if (bar) bar.style.width = '10%';

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function updateSearchLoadingStep(stepId, status) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.className = `loading-step ${status}`;
}

function updateLoadingProgress(completedCount) {
  const bar = document.getElementById('loadingProgressBar');
  if (!bar) return;
  const percentages = [10, 28, 46, 64, 82, 100];
  bar.style.width = `${percentages[completedCount]}%`;
}

function hideSearchLoadingModal() {
  const modal = document.getElementById('searchLoadingModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

async function selectPlace(place) {
  lastPlace = place;
  showSearchLoadingModal();
  let completed = 0;

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
    wiki: { extract: '', image: null, description: '' },
    aqi: null,
  });

  const wrap = (promise, stepId) => {
    return promise
      .then((res) => {
        updateSearchLoadingStep(stepId, 'is-complete');
        completed++;
        updateLoadingProgress(completed);
        return res;
      })
      .catch((err) => {
        console.warn(`${stepId} error`, err);
        updateSearchLoadingStep(stepId, 'is-complete');
        completed++;
        updateLoadingProgress(completed);
        return null;
      });
  };

  // Fetch weather, holidays, and Wikipedia summary in parallel
  const weatherPromise = wrap(fetchWeather(place.lat, place.lon), 'stepWeather');
  const holidayPromise = wrap(fetchTodayHoliday(), 'stepHoliday');
  const wikiPromise = wrap(fetchWikiSummary(place.name), 'stepWiki');

  const [weather, holiday, wiki] = await Promise.all([weatherPromise, holidayPromise, wikiPromise]);

  const model = computeIntelligence({
    weather,
    isHoliday: holiday?.isHoliday || false,
    holidayName: holiday?.name || '',
    placeType: place.type || 'destination',
    placeName: place.name || place.label || '',
  });
  lastModelOutput = model;

  setState({
    weather,
    isHoliday: holiday?.isHoliday || false,
    holidayName: holiday?.name || '',
    score: model.score,
    risk: model.risk,
    recommendation: model.recommendation,
    situation: model.situation,
    stats: model.stats,
    forecast: model.forecast,
    hotspots: model.hotspots,
    advisories: model.advisories,
    wiki: wiki || { extract: '', image: null, description: '' },
  });

  updatePublicTip();

  // Set next steps to loading
  updateSearchLoadingStep('stepNews', 'is-loading');
  updateSearchLoadingStep('stepGemini', 'is-loading');

  const newsPromise = wrap(loadNews(place), 'stepNews');
  const geminiPromise = wrap(
    Promise.all([
      enhanceRecommendation(place, weather, holiday, model),
      enhanceHotspots(place, model)
    ]),
    'stepGemini'
  );

  await Promise.all([newsPromise, geminiPromise]);

  // Small delay for visual checklist completion and progress bar fill
  await new Promise((resolve) => setTimeout(resolve, 400));
  hideSearchLoadingModal();
}

async function loadNews(place) {
  const items = await fetchNews({
    apiKey: CONFIG.NEWSDATA_API_KEY,
    gnewsKey: CONFIG.GNEWS_API_KEY,
    nytKey: CONFIG.NYT_API_KEY,
    query: place.name,
    fallbackQuery: place.state ? `${place.state} tourism` : undefined,
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
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    hour: now.getHours(),
    weather: weather?.label || 'Unknown',
    holiday: holiday.isHoliday ? holiday.name : '',
    hotspots: model.hotspots.slice(0, 3).map((h) => h.name),
    traffic: model.stats.traffic,
    peak: model.stats.peak,
  };
  const result = await generateDetailed({
    apiKey: CONFIG.GEMINI_API_KEY,
    model: CONFIG.GEMINI_MODEL,
    prompt: recommendationPrompt(ctx),
    temperature: 0.6,
    maxTokens: 1024,
  });
  if (result.text) {
    setState({ recommendation: result.text.replace(/^"|"$/g, '') });
    return;
  }
  console.warn('Gemini recommendation failed:', result.error, result.modelTried);
}

async function enhanceHotspots(place, model) {
  if (!CONFIG.GEMINI_API_KEY) return;
  const text = await generate({
    apiKey: CONFIG.GEMINI_API_KEY,
    model: CONFIG.GEMINI_MODEL,
    prompt: hotspotsPrompt({ placeLabel: place.label, placeType: place.type || 'destination' }),
    temperature: 0.4,
    maxTokens: 1024,
  });
  if (!text) return;
  let names;
  try {
    const clean = text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
    names = JSON.parse(clean);
  } catch {
    return;
  }
  if (!Array.isArray(names) || names.length < 3) return;
  const existingHotspots = model.hotspots;
  const merged = names.slice(0, existingHotspots.length).map((name, i) => ({
    name: String(name).slice(0, 30),
    intensity: existingHotspots[i]?.intensity ?? 50,
  }));
  setState({ hotspots: merged });
}

function generateFallbackPublicAdvisory(ctx) {
  const hotspotsStr = ctx.hotspots && ctx.hotspots.length 
    ? `near the main zones (${ctx.hotspots.slice(0, 2).map(h => h.split(' (')[0]).join(' and ')})` 
    : 'in the main sightseeing areas';
    
  return `Visitor advisory for ${ctx.placeLabel}. The current safety score is assessed at ${ctx.score}/100 with a ${ctx.risk.toLowerCase()} status. Under the current ${ctx.weather.toLowerCase()} weather conditions, we expect traffic flow to remain ${ctx.traffic.toLowerCase()}. Peak visitor hours are projected around ${ctx.peak}, which may lead to crowd buildup ${hotspotsStr}. Visitors are advised to plan arrival during off-peak hours and follow all safety signs. Security and guidance staff are deployed across the destination to assist you.`;
}

function isCompleteAdvisory(text) {
  const value = String(text || '').replace(/[`"']/g, '').trim();
  if (!value) return false;
  if (value.length < 60) return false; // Less strict length check
  return /[.!?]\s*$/.test(value);      // Ends with sentence punctuation
}

async function generatePublicAdvisory(ctx) {
  const basePrompt = publicAdvisoryPrompt(ctx);
  const attempts = [
    basePrompt,
    `${basePrompt}\n\nImportant: Return exactly one complete paragraph of 4 full sentences. Do not stop mid-sentence.`,
  ];

  let lastResult = { text: null, error: 'Gemini request failed.' };
  for (let i = 0; i < attempts.length; i++) {
    const prompt = attempts[i];
    const result = await generateDetailed({
      apiKey: CONFIG.GEMINI_API_KEY,
      model: CONFIG.GEMINI_MODEL,
      prompt,
      temperature: 0.65,
      maxTokens: 2048,
    });
    
    console.log(`[gemini] Attempt ${i + 1} response:`, result.text);
    
    if (result.text && isCompleteAdvisory(result.text)) return result;
    lastResult = result.text ? { ...result, error: 'Gemini returned an incomplete advisory.' } : result;
  }
  return lastResult;
}

async function syncAdvisoryWorkflow(workflowPromise) {
  let workflow;
  if (workflowPromise && typeof workflowPromise.then === 'function') {
    workflow = await workflowPromise;
  } else {
    workflow = workflowPromise || await loadAdvisoryWorkflow();
  }
  setState({ advisoryWorkflow: workflow });
}

function buildAdvisoryDraft(text) {
  return {
    text: String(text || '').trim(),
    placeLabel: lastPlace?.label || state.place?.label || 'Destination',
    risk: lastModelOutput?.risk?.label || state.risk?.label || 'Moderate',
    requestedBy: modalMode,
    submittedAt: new Date().toISOString(),
  };
}

function wirePendingAdvisoryActions() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-advisory-action]');
    if (!button) return;

    const action = button.getAttribute('data-advisory-action');
    const id = button.getAttribute('data-advisory-id');
    if (!id) return;

    if (action === 'approve') {
      syncAdvisoryWorkflow(approvePendingAdvisory(id));
      showToast('Advisory approved and published!');
      return;
    }
    if (action === 'reject') {
      syncAdvisoryWorkflow(rejectPendingAdvisory(id));
      showToast('Advisory rejected and removed.');
    }
  });
}

function wireAdvisoryModal() {
  const govBtn = document.getElementById('generateAdvisoryBtn');
  const publicBtn = document.getElementById('requestAdvisoryBtn');
  const modal = document.getElementById('advisoryModal');
  const body = document.getElementById('advisoryModalBody');
  const copy = document.getElementById('copyAdvisoryBtn');
  const regen = document.getElementById('regenerateAdvisoryBtn');
  const submit = document.getElementById('submitAdvisoryBtn');
  const title = document.getElementById('advisoryModalTitle');
  if (!govBtn || !publicBtn || !modal || !body || !copy || !regen || !submit || !title) return;

  const openModal = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    modalDraft = null;
  };

  function setModalMode(role) {
    modalMode = role;
    title.textContent = role === 'gov' ? 'Publish Public Advisory' : 'Request Public Advisory';
    submit.textContent = role === 'gov' ? 'Publish To Website' : 'Submit For Review';
  }

  function setLoading(isLoading) {
    regen.disabled = isLoading;
    submit.disabled = isLoading || !modalDraft;
    copy.disabled = isLoading;
  }

  async function generateAdvisory() {
    modalDraft = null;
    setLoading(true);
    body.innerHTML = `<p class="muted">Generating advisory...</p>`;

    const place = lastPlace;
    const model = lastModelOutput;
    if (!place || !model) {
      body.innerHTML = `<p class="muted">Select a destination first.</p>`;
      setLoading(false);
      return;
    }

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

    let advisoryText = '';
    let isSyntheticFallback = false;

    if (CONFIG.GEMINI_API_KEY) {
      const result = await generatePublicAdvisory(ctx);
      if (result.text && isCompleteAdvisory(result.text)) {
        advisoryText = result.text;
      } else {
        console.warn('Gemini advisory incomplete or rate-limited. Falling back to template.', result.error);
        advisoryText = generateFallbackPublicAdvisory(ctx);
        isSyntheticFallback = true;
      }
    } else {
      advisoryText = generateFallbackPublicAdvisory(ctx);
      isSyntheticFallback = true;
    }

    modalDraft = buildAdvisoryDraft(advisoryText);
    
    let html = formatAdvisoryHtml(advisoryText);
    if (isSyntheticFallback) {
      html += `<p class="muted" style="font-size:11px;margin-top:12px;border-top:1px dashed var(--border);padding-top:8px">ℹ️ Generated using safety rules (Gemini API unavailable or rate-limited).</p>`;
    }
    body.innerHTML = html;
    setLoading(false);
  }

  govBtn.addEventListener('click', async () => {
    setModalMode('gov');
    openModal();
    await generateAdvisory();
  });

  publicBtn.addEventListener('click', async () => {
    setModalMode('public');
    openModal();
    await generateAdvisory();
  });

  submit.addEventListener('click', () => {
    if (!modalDraft?.text) return;

    if (modalMode === 'gov') {
      syncAdvisoryWorkflow(publishApprovedAdvisory(modalDraft));
      closeModal();
      showToast('Advisory published successfully!');
    } else {
      syncAdvisoryWorkflow(queuePendingAdvisory(modalDraft));
      closeModal();
      showToast('Advisory submitted for review!');
    }
  });

  modal.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  regen.addEventListener('click', generateAdvisory);
  copy.addEventListener('click', async () => {
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
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wireThemeToggle() {
  const btn = document.getElementById('themeToggle');
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
    icon.innerHTML = '';
    injectIcons(btn);
  }
}

function wireChartToggle() {
  const toggleCrowd = document.getElementById('toggleCrowd');
  const toggleWeather = document.getElementById('toggleWeather');
  const forecastTitle = document.getElementById('forecastTitle');
  const forecastSub = document.getElementById('forecastSub');
  const dataSourcePill = document.getElementById('dataSourcePill');
  if (!toggleCrowd || !toggleWeather) return;

  toggleCrowd.addEventListener('click', () => {
    toggleCrowd.classList.add('toggle-btn--active');
    toggleWeather.classList.remove('toggle-btn--active');
    if (forecastTitle) forecastTitle.textContent = 'Visitor Forecast & Risk Trend';
    if (forecastSub) forecastSub.textContent = 'Forecast using ticket sales, holidays, day/time, weather and historical patterns.';
    if (dataSourcePill) {
      dataSourcePill.textContent = 'Synthetic Data';
      dataSourcePill.style.background = '#f1f5f9';
      dataSourcePill.style.color = 'var(--text-muted)';
    }
    setState({ forecastMode: 'crowd' });
  });

  toggleWeather.addEventListener('click', () => {
    toggleWeather.classList.add('toggle-btn--active');
    toggleCrowd.classList.remove('toggle-btn--active');
    if (forecastTitle) forecastTitle.textContent = 'Weather & Precipitation Forecast';
    if (forecastSub) forecastSub.textContent = 'Live hourly temperature and rain probability forecast from Open-Meteo API.';
    if (dataSourcePill) {
      dataSourcePill.textContent = 'Live Data';
      dataSourcePill.style.background = '#e0f2fe';
      dataSourcePill.style.color = '#0369a1';
    }
    setState({ forecastMode: 'weather' });
  });
}

async function boot() {
  wireThemeToggle();
  subscribeToAdvisoryWorkflow((workflow) => {
    setState({ advisoryWorkflow: workflow });
  });
  initUI();
  initCharts();
  initMap();
  initRole();
  wireAdvisoryModal();
  wirePendingAdvisoryActions();
  wireChartToggle();
  await initSearch({
    onSelect: selectPlace,
    defaultPlace: CONFIG.DEFAULT_PLACE || 'Kodaikanal',
  });
  setTimeout(initTooltips, 50);
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => console.error('boot failed', e));
});
