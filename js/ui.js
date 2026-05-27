// Reads bindings (data-bind="path.to.value") from state and writes them to the DOM.
// Also renders the advisory list and news strip.

import { state, subscribe } from './state.js';
import { injectIcons } from './icons.js';
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
    list.innerHTML = `
      <li class="advisory advisory--low">
        <div class="advisory-meta">
          <span class="meta-pill">System</span>
          <span>Waiting for destination</span>
        </div>
        <div class="advisory-title">Standing by</div>
        <div class="advisory-body">No advisories yet - pick a destination to generate live signals.</div>
      </li>`;
    return;
  }

  const ordered = [...state.advisories].sort((a, b) => {
    const at = new Date(a.generatedAt || 0).getTime();
    const bt = new Date(b.generatedAt || 0).getTime();
    return bt - at;
  });

  list.innerHTML = ordered.map((a) => {
    const cls = a.level === 'high' ? 'advisory--high' : a.level === 'low' ? 'advisory--low' : 'advisory--mod';
    return `
      <li class="advisory ${cls}">
        <div class="advisory-meta">
          <span class="meta-pill">${escapeHtml(a.source || 'System')}</span>
          <span>${escapeHtml(formatDate(a.generatedAt))}</span>
          <span>${escapeHtml(relativeTime(a.generatedAt))}</span>
        </div>
        <div class="advisory-title">${escapeHtml(a.title)}</div>
        <div class="advisory-body">${escapeHtml(a.body)}</div>
      </li>`;
  }).join('');
}

function renderPublishedAdvisory() {
  const root = document.getElementById('publishedAdvisory');
  if (!root) return;

  const approved = state.advisoryWorkflow?.approved;
  if (!approved?.text) {
    root.classList.add('is-empty');
    root.innerHTML = 'No public advisory has been published yet. Government users can publish one directly, or approve a public request below.';
    return;
  }

  root.classList.remove('is-empty');
  root.innerHTML = `
    <div class="published-advisory-meta">
      <span class="meta-pill">${escapeHtml(approved.placeLabel || 'Destination')}</span>
      <span class="meta-pill">Risk: ${escapeHtml(approved.risk || 'Moderate')}</span>
      <span class="meta-pill">Source: ${escapeHtml(labelRole(approved.requestedBy))}</span>
      <span>Published ${escapeHtml(formatDate(approved.publishedAt))}</span>
    </div>
    <div class="published-advisory-text">${escapeHtml(approved.text)}</div>
  `;
}

function renderPendingAdvisories() {
  const root = document.getElementById('pendingAdvisoryList');
  if (!root) return;

  const pending = [...(state.advisoryWorkflow?.pending || [])].sort((a, b) => {
    const at = new Date(a.submittedAt || 0).getTime();
    const bt = new Date(b.submittedAt || 0).getTime();
    return bt - at;
  });

  if (!pending.length) {
    root.innerHTML = '<div class="pending-advisory-empty">No public requests are waiting for approval.</div>';
    return;
  }

  root.innerHTML = pending.map((item) => `
    <article class="pending-advisory-card">
      <div class="pending-advisory-head">
        <div>
          <div class="pending-advisory-title">${escapeHtml(item.placeLabel || 'Destination advisory')}</div>
          <div class="pending-advisory-meta">
            <span class="meta-pill">${escapeHtml(labelRole(item.requestedBy))}</span>
            <span class="meta-pill">Risk: ${escapeHtml(item.risk || 'Moderate')}</span>
            <span>${escapeHtml(formatDate(item.submittedAt))}</span>
          </div>
        </div>
      </div>
      <div class="pending-advisory-text">${escapeHtml(item.text)}</div>
      <div class="pending-advisory-actions">
        <button class="btn btn-primary btn-sm" type="button" data-advisory-action="approve" data-advisory-id="${escapeAttr(item.id)}">Approve</button>
        <button class="btn btn-ghost btn-sm btn-danger" type="button" data-advisory-action="reject" data-advisory-id="${escapeAttr(item.id)}">Reject</button>
      </div>
    </article>
  `).join('');
}

function renderNews() {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;

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
      ${n.description ? `<div class="news-desc">${escapeHtml(n.description.slice(0, 100))}...</div>` : ''}
      <span class="news-read-more">Read more -></span>
    </a>`;
  }).join('');
}

function renderWeather() {
  const w = state.weather;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '-'; };

  if (!w) {
    ['weatherTempHero', 'wxCondition', 'wxHumidity', 'wxWind', 'wxPrecip', 'wxCloud', 'wxUV', 'wxVis', 'wxHighLow', 'wxRainDay', 'wxSun'].forEach((id) => set(id, '-'));
    const icon = document.getElementById('weatherIcon');
    if (icon) icon.textContent = '';
    const feels = document.querySelector('#weatherPanel .temp-feels span');
    if (feels) feels.textContent = '-';
    return;
  }

  const icon = document.getElementById('weatherIcon');
  if (icon) icon.textContent = w.icon || '';

  set('weatherTempHero', w.temperatureC != null ? w.temperatureC : '-');

  const feelsEl = document.querySelector('#weatherPanel .temp-feels span');
  if (feelsEl) feelsEl.textContent = w.feelsLikeC != null ? w.feelsLikeC : '-';

  set('wxCondition', w.label);
  set('wxHumidity', w.humidity != null ? `${w.humidity}%` : '-');
  set('wxWind', w.windKph != null ? `${w.windKph} km/h ${w.windDir || ''}`.trim() : '-');
  set('wxPrecip', w.precipitationMm != null ? `${w.precipitationMm} mm` : '-');
  set('wxCloud', w.cloudCover != null ? `${w.cloudCover}%` : '-');
  set('wxUV', w.uvIndex != null ? `${w.uvIndex} (${uvLabel(w.uvIndex)})` : '-');
  set('wxVis', w.visibilityKm != null ? `${w.visibilityKm} km` : '-');
  set('wxHighLow', (w.highC != null && w.lowC != null) ? `${w.highC}° / ${w.lowC}°C` : '-');
  set('wxRainDay', w.precipDayMm != null ? `${w.precipDayMm} mm` : '-');
  set('wxSun', (w.sunrise && w.sunset) ? `${w.sunrise} / ${w.sunset}` : '-');
}

function uvLabel(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function relativeTime(d) {
  if (!d) return '';
  const diffMs = Date.now() - new Date(d).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '';
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day ago`;
}

function labelRole(role) {
  return role === 'public' ? 'Public request' : 'Government draft';
}

export function initUI() {
  injectIcons(document);
  subscribe(() => {
    bindAll();
    renderAdvisories();
    renderPublishedAdvisory();
    renderPendingAdvisories();
    renderNews();
    renderWeather();
    injectIcons(document);
  });
}
