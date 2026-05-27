// Role switcher: 'gov' (default) or 'public'.
// Public view hides the advisory generator and shows visitor-friendly tips instead.

import { state } from './state.js';
import { injectIcons } from './icons.js';

let currentRole = 'gov';

export function initRole() {
  const govBtn    = document.getElementById('roleGov');
  const publicBtn = document.getElementById('rolePublic');
  if (!govBtn || !publicBtn) return;

  govBtn.addEventListener('click',    () => setRole('gov'));
  publicBtn.addEventListener('click', () => setRole('public'));

  // Apply initial state
  setRole('gov');
}

export function getRole() { return currentRole; }

function setRole(role) {
  currentRole = role;
  document.body.dataset.role = role;

  // Toggle button active styles
  document.getElementById('roleGov')?.classList.toggle('role-btn--active', role === 'gov');
  document.getElementById('rolePublic')?.classList.toggle('role-btn--active', role === 'public');

  // Show/hide gov-only and public-only elements
  document.querySelectorAll('.gov-only').forEach((el)    => { el.hidden = role !== 'gov'; });
  document.querySelectorAll('.public-only').forEach((el) => { el.hidden = role !== 'public'; });

  const title = document.getElementById('advisoryCardTitle');
  const sub = document.getElementById('advisoryCardSub');
  if (title) {
    title.innerHTML = role === 'public'
      ? '<span data-icon="alert-triangle"></span> Visitor Advisory'
      : '<span data-icon="alert-triangle"></span> Advisory Center';
    injectIcons(title);
  }
  if (sub) {
    sub.textContent = role === 'public'
      ? 'A simple view of what visitors need to know right now.'
      : 'Generate, review, publish, and track advisories in one place.';
  }

  // Update the public tip body with current destination info
  if (role === 'public') updatePublicTip();
}

export function updatePublicTip() {
  const tip = document.getElementById('publicTipBody');
  if (!tip) return;
  const s = state;
  if (!s.place?.name) {
    tip.textContent = 'Select a destination to see crowd conditions and the best time to visit.';
    return;
  }
  const risk = s.risk?.level || 'moderate';
  const peak = s.stats?.peak || '—';
  const weather = s.stats?.weather || '—';
  const msgs = {
    low:      `${s.place.name} is currently calm. Weather: ${weather}. Best visiting window: ${peak}.`,
    moderate: `${s.place.name} is moderately busy today. Expect some queues around ${peak}. Weather: ${weather}.`,
    high:     `${s.place.name} is very crowded today. Avoid visiting between ${peak}. Consider an off-peak time or alternate entry. Weather: ${weather}.`,
  };
  tip.textContent = msgs[risk] || msgs.moderate;
}
