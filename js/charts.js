// Chart.js wiring — forecast line + hotspots bar. Reads from state on every update.

import { subscribe } from './state.js';

let forecastChart = null;
let hotspotsChart = null;

const COLORS = {
  line: '#0ea5e9',
  lineFill: 'rgba(14,165,233,0.12)',
  bar: '#0f172a',
  grid: '#e5e7eb',
  text: '#64748b',
};

const COMMON_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
};

function ensureForecast(ctx) {
  if (forecastChart) return forecastChart;
  forecastChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      data: [],
      borderColor: COLORS.line,
      backgroundColor: COLORS.lineFill,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    }]},
    options: {
      ...COMMON_OPTIONS,
      scales: {
        x: { ticks: { color: COLORS.text, font: { family: 'Inter' } }, grid: { color: COLORS.grid, drawBorder: false } },
        y: { ticks: { color: COLORS.text, font: { family: 'Inter' }, callback: (v) => Number(v).toLocaleString() }, grid: { color: COLORS.grid, drawBorder: false, borderDash: [3, 3] }, beginAtZero: true },
      },
    },
  });
  return forecastChart;
}

function intensityColor(v) {
  if (v > 72) return 'rgba(239,68,68,0.85)';   // red
  if (v > 48) return 'rgba(245,158,11,0.85)';   // amber
  return 'rgba(16,185,129,0.85)';                // green
}

function ensureHotspots(ctx) {
  if (hotspotsChart) return hotspotsChart;
  hotspotsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: [],
      borderRadius: 4,
      barThickness: 14,
    }]},
    options: {
      ...COMMON_OPTIONS,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: COLORS.text, font: { family: 'Inter' } }, grid: { color: COLORS.grid, drawBorder: false }, max: 100 },
        y: { ticks: { color: COLORS.text, font: { family: 'Inter' } }, grid: { display: false, drawBorder: false } },
      },
    },
  });
  return hotspotsChart;
}

function fmtHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}

export function initCharts() {
  const forecastEl = document.getElementById('forecastChart');
  const hotspotsEl = document.getElementById('hotspotsChart');
  if (!forecastEl || !hotspotsEl || typeof Chart === 'undefined') return;

  subscribe((state) => {
    if (state.forecast?.hours?.length) {
      const c = ensureForecast(forecastEl);
      c.data.labels = state.forecast.hours.map(fmtHour);
      c.data.datasets[0].data = state.forecast.visitors;
      c.update('none');
    }
    if (state.hotspots?.length) {
      const c = ensureHotspots(hotspotsEl);
      c.data.labels = state.hotspots.map((h) => h.name);
      c.data.datasets[0].data = state.hotspots.map((h) => h.intensity);
      c.data.datasets[0].backgroundColor = state.hotspots.map((h) => intensityColor(h.intensity));
      c.update('none');
    }
  });
}
