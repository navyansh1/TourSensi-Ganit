// Reads bindings (data-bind="path.to.value") from state and writes them to the DOM.
// Also renders the advisory list and news strip.

import { state, subscribe } from './state.js';
import { injectIcons, icon } from './icons.js';
import { SOURCE_META } from './api/news.js';

const SOURCE_COLORS = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.color])
);

const RISK_CLASS = { low: 'risk-low', moderate: 'risk-moderate', high: 'risk-high' };

function get(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function bindAll() {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const path = el.getAttribute('data-bind');
    const val = get(state, path);
    el.textContent = (val ?? '') === '' ? '' : String(val);
  });

  document.querySelectorAll('[data-bind-class]').forEach((el) => {
    const path = el.getAttribute('data-bind-class');
    const val = get(state, path);
    const allRisk = Object.values(RISK_CLASS);
    el.classList.remove(...allRisk);
    if (val) el.classList.add(val);
  });
}

function renderAdvisories() {
  const list = document.getElementById('advisoryList');
  if (!list) return;
  if (!state.advisories.length) {
    list.innerHTML = `<li class="advisory advisory--low"><div class="advisory-title">Standing by</div><div class="advisory-body">No advisories yet — pick a destination to generate live signals.</div></li>`;
    return;
  }
  list.innerHTML = state.advisories.map((a) => {
    const cls = a.level === 'high' ? 'advisory--high' : a.level === 'low' ? 'advisory--low' : 'advisory--mod';
    return `<li class="advisory ${cls}">
      <div class="advisory-title">${escapeHtml(a.title)}</div>
      <div class="advisory-body">${escapeHtml(a.body)}</div>
    </li>`;
  }).join('');
}

function renderNews() {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;

  // Show skeleton while a place is selected but news hasn't arrived yet
  if (state.place.lat && !state.news.length && !state._newsLoaded) {
    grid.innerHTML = Array(3).fill(`
      <article class="news-card news-placeholder">
        <span class="news-meta news-skeleton-line" style="width:80px"></span>
        <div class="news-title news-skeleton-line" style="width:100%"></div>
        <div class="news-title news-skeleton-line" style="width:70%"></div>
      </article>`).join('');
    return;
  }

  if (!state.news.length) {
    grid.innerHTML = Array(3).fill(`
      <article class="news-card news-placeholder">
        <span class="news-meta">No news found</span>
        <div class="news-title">No recent news for this destination. Try a more popular city.</div>
      </article>`).join('');
    return;
  }

  grid.innerHTML = state.news.slice(0, 6).map((n) => {
    const href = n.url ? `href="${escapeAttr(n.url)}" target="_blank" rel="noopener"` : '';
    const srcColor = SOURCE_COLORS[n.sourceKey] || '#64748b';
    const date = formatDate(n.publishedAt);
    return `<a class="news-card" ${href} style="text-decoration:none">
      <div class="news-card-top">
        <span class="news-source-badge" style="background:${srcColor}20;color:${srcColor}">${escapeHtml(n.source || '')}</span>
        ${date ? `<span class="news-date">${escapeHtml(date)}</span>` : ''}
      </div>
      <div class="news-title">${escapeHtml(n.title)}</div>
      ${n.description ? `<div class="news-desc">${escapeHtml(n.description.slice(0,100))}…</div>` : ''}
      <span class="news-read-more">Read more →</span>
    </a>`;
  }).join('');
}

function renderWeather() {
  const w = state.weather;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val ?? '—'; };

  if (!w) {
    ['weatherTempHero','wxCondition','wxHumidity','wxWind','wxPrecip','wxCloud','wxUV','wxVis','wxHighLow','wxRainDay','wxSun'].forEach((id) => set(id, '—'));
    const icon = document.getElementById('weatherIcon'); if (icon) icon.textContent = '';
    const feels = document.querySelector('#weatherPanel .temp-feels span'); if (feels) feels.textContent = '—';
    return;
  }

  const icon = document.getElementById('weatherIcon');
  if (icon) icon.textContent = w.icon || '';

  set('weatherTempHero', w.temperatureC != null ? w.temperatureC : '—');

  const feelsEl = document.querySelector('#weatherPanel .temp-feels span');
  if (feelsEl) feelsEl.textContent = w.feelsLikeC != null ? w.feelsLikeC : '—';

  set('wxCondition',  w.label);
  set('wxHumidity',   w.humidity != null ? `${w.humidity}%` : '—');
  set('wxWind',       w.windKph != null ? `${w.windKph} km/h ${w.windDir || ''}`.trim() : '—');
  set('wxPrecip',     w.precipitationMm != null ? `${w.precipitationMm} mm` : '—');
  set('wxCloud',      w.cloudCover != null ? `${w.cloudCover}%` : '—');
  set('wxUV',         w.uvIndex != null ? `${w.uvIndex} (${uvLabel(w.uvIndex)})` : '—');
  set('wxVis',        w.visibilityKm != null ? `${w.visibilityKm} km` : '—');
  set('wxHighLow',    (w.highC != null && w.lowC != null) ? `${w.highC}° / ${w.lowC}°C` : '—');
  set('wxRainDay',    w.precipDayMm != null ? `${w.precipDayMm} mm` : '—');
  set('wxSun',        (w.sunrise && w.sunset) ? `${w.sunrise} / ${w.sunset}` : '—');
}

function uvLabel(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ''; }
}

export function initUI() {
  injectIcons(document);
  subscribe(() => {
    bindAll();
    renderAdvisories();
    renderNews();
    renderWeather();
    injectIcons(document);
  });
}
