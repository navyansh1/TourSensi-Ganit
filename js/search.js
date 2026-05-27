// Fuzzy autocomplete for Indian destinations. Local index first (Fuse.js), Nominatim fallback for misses.

import { geocode } from './api/geocode.js';

let places = [];
let fuse = null;
let activeIdx = -1;
let currentResults = [];
let onPick = null;

async function loadPlaces() {
  if (places.length) return;
  try {
    const res = await fetch('data/india-places.json');
    places = await res.json();
    fuse = new Fuse(places, {
      keys: [{ name: 'name', weight: 0.6 }, { name: 'aliases', weight: 0.3 }, { name: 'state', weight: 0.1 }],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  } catch (e) {
    console.warn('[search] failed to load places', e);
  }
}

function fmtPlace(p) {
  return { label: `${p.name}, ${p.state}`, name: p.name, state: p.state, country: 'India', lat: p.lat, lon: p.lon, type: p.type };
}

function renderDropdown(dropdown, items, options = {}) {
  if (!items.length) {
    dropdown.innerHTML = options.empty
      ? `<div class="dd-empty">${options.empty}</div>`
      : `<div class="dd-empty">No matches</div>`;
    dropdown.hidden = false;
    return;
  }
  dropdown.innerHTML = items.map((p, i) => `
    <div class="dd-item" role="option" data-idx="${i}" aria-selected="${i === activeIdx}">
      <span class="dd-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>
      <span class="dd-name">${escapeHtml(p.name)}</span>
      <span class="dd-meta">${escapeHtml(p.state || p.country || '')}</span>
    </div>`).join('');
  dropdown.hidden = false;

  dropdown.querySelectorAll('.dd-item').forEach((el) => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const idx = Number(el.getAttribute('data-idx'));
      pick(currentResults[idx]);
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function pick(p) {
  if (!p) return;
  const input = document.getElementById('placeSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (input) input.value = p.label;
  if (dropdown) { dropdown.hidden = true; dropdown.innerHTML = ''; }
  onPick?.(p);
}

async function liveSearch(q, dropdown) {
  renderDropdown(dropdown, [], { empty: 'Searching live…' });
  const hit = await geocode(q);
  if (!hit) {
    renderDropdown(dropdown, [], { empty: 'No matches. Try a different spelling.' });
    return;
  }
  const formatted = [{
    label: `${hit.name}${hit.state ? ', ' + hit.state : ''}`,
    name: hit.name,
    state: hit.state,
    country: hit.country || '',
    lat: hit.lat,
    lon: hit.lon,
    type: 'destination',
  }];
  currentResults = formatted;
  activeIdx = 0;
  renderDropdown(dropdown, formatted);
}

export async function initSearch({ onSelect, defaultPlace }) {
  onPick = onSelect;
  await loadPlaces();

  const input = document.getElementById('placeSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  // Boot with default selection (deterministic — not "hardcoded data", just a sensible start).
  if (defaultPlace) {
    const seed = places.find((p) => p.name === defaultPlace) || places[0];
    if (seed) {
      const formatted = fmtPlace(seed);
      input.value = formatted.label;
      onSelect(formatted);
    }
  }

  let debounce;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(debounce);
    if (!q) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }

    debounce = setTimeout(async () => {
      if (!fuse) return;
      const local = fuse.search(q).slice(0, 8).map((r) => fmtPlace(r.item));
      currentResults = local;
      activeIdx = local.length ? 0 : -1;
      if (local.length) {
        renderDropdown(dropdown, local);
      } else {
        await liveSearch(q, dropdown);
      }
    }, 140);
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(currentResults.length - 1, activeIdx + 1);
      renderDropdown(dropdown, currentResults);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      renderDropdown(dropdown, currentResults);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = currentResults[activeIdx] || currentResults[0];
      pick(sel);
    } else if (e.key === 'Escape') {
      dropdown.hidden = true;
    }
  });

  input.addEventListener('focus', () => {
    if (currentResults.length) { dropdown.hidden = false; }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('searchWrap').contains(e.target)) {
      dropdown.hidden = true;
    }
  });
}
