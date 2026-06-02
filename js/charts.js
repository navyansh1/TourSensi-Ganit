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
    data: { labels: [], datasets: [] },
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

function updateForecastChart(state, forecastEl) {
  const c = ensureForecast(forecastEl);
  const mode = state.forecastMode || 'crowd';

  if (mode === 'crowd') {
    c.data.labels = state.forecast.hours.map(fmtHour);
    c.data.datasets = [{
      label: 'Estimated Visitors',
      data: state.forecast.visitors,
      borderColor: COLORS.line,
      backgroundColor: COLORS.lineFill,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      yAxisID: 'y',
    }];
    
    c.options.scales = {
      x: { ticks: { color: COLORS.text, font: { family: 'Inter' } }, grid: { color: COLORS.grid, drawBorder: false } },
      y: { 
        type: 'linear',
        display: true, 
        position: 'left', 
        ticks: { color: COLORS.text, font: { family: 'Inter' }, callback: (v) => Number(v).toLocaleString() }, 
        grid: { color: COLORS.grid, drawBorder: false, borderDash: [3, 3] }, 
        beginAtZero: true 
      },
      yRain: { display: false }
    };
  } else {
    const w = state.weather;
    const hours = w?.hourly?.hours || state.forecast.hours || [];
    const temp = w?.hourly?.temperature || Array(hours.length).fill(0);
    const rain = w?.hourly?.precipitation || Array(hours.length).fill(0);

    c.data.labels = hours.map(fmtHour);
    c.data.datasets = [
      {
        label: 'Temperature (°C)',
        data: temp,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        type: 'line',
        yAxisID: 'y',
      },
      {
        label: 'Rain Probability (%)',
        data: rain,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.25)',
        fill: true,
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 14,
        type: 'bar',
        yAxisID: 'yRain',
      }
    ];

    c.options.scales = {
      x: { ticks: { color: COLORS.text, font: { family: 'Inter' } }, grid: { color: COLORS.grid, drawBorder: false } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Temperature (°C)', color: COLORS.text, font: { family: 'Inter', size: 10, weight: 'bold' } },
        ticks: { color: COLORS.text, font: { family: 'Inter' } },
        grid: { color: COLORS.grid, drawBorder: false, borderDash: [3, 3] },
        beginAtZero: false
      },
      yRain: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Rain Probability (%)', color: COLORS.text, font: { family: 'Inter', size: 10, weight: 'bold' } },
        ticks: { color: COLORS.text, font: { family: 'Inter' } },
        grid: { drawOnChartArea: false },
        min: 0,
        max: 100
      }
    };
  }

  c.options.plugins = {
    legend: { 
      display: mode === 'weather', 
      position: 'top',
      align: 'end',
      labels: { 
        boxWidth: 12, 
        font: { family: 'Inter', size: 10, weight: '500' },
        color: COLORS.text
      } 
    },
    tooltip: { mode: 'index', intersect: false }
  };

  c.update('none');
}

export function initCharts() {
  const forecastEl = document.getElementById('forecastChart');
  const hotspotsEl = document.getElementById('hotspotsChart');
  const hotspotsTitleEl = document.getElementById('hotspotsTitle');
  if (!forecastEl || !hotspotsEl || typeof Chart === 'undefined') return;

  subscribe((state) => {
    if (hotspotsTitleEl) {
      const placeLabel = state.place?.label ? ` - ${state.place.label}` : '';
      hotspotsTitleEl.textContent = `Crowd Hotspots${placeLabel}`;
    }
    
    if (state.forecast?.hours?.length) {
      updateForecastChart(state, forecastEl);
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
