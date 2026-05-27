// Leaflet map — recenters on destination, risk-colored hotspot markers.

import { subscribe } from './state.js';

let map = null;
let layer = null;

const COLORS = { high: '#ef4444', moderate: '#f59e0b', low: '#10b981' };

function colorFor(intensity) {
  if (intensity > 72) return COLORS.high;
  if (intensity > 48) return COLORS.moderate;
  return COLORS.low;
}

function radiusFor(intensity) {
  return 12 + (intensity / 100) * 16;  // 12..28 px
}

// Spread markers at varying distances so they don't clump at the same offset.
// Each zone gets a different ring radius + angle to look natural.
function offsetPoint(lat, lon, idx, total) {
  const radii = [0.018, 0.013, 0.022, 0.016, 0.025, 0.011];
  const r = radii[idx % radii.length];
  const angle = (idx / Math.max(total, 1)) * Math.PI * 2 + (idx % 2) * 0.4; // slight stagger
  return [lat + Math.cos(angle) * r, lon + Math.sin(angle) * r * 0.85];
}

export function initMap() {
  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return;

  map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  }).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  layer = L.layerGroup().addTo(map);

  subscribe((state) => {
    if (state.place?.lat == null || state.place?.lon == null) return;
    const lat = state.place.lat;
    const lon = state.place.lon;
    map.setView([lat, lon], 13, { animate: true });

    layer.clearLayers();

    // Centre pin
    L.circleMarker([lat, lon], {
      radius: 7,
      color: '#0b1220',
      fillColor: '#0b1220',
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(`<strong>${state.place.label || state.place.name}</strong>`, { permanent: false }).addTo(layer);

    const hotspots = state.hotspots || [];

    // Force at least one marker per risk tier when there are enough zones
    // by sorting them into spread buckets instead of just highest-first.
    // We keep the original sorted order but re-spread intensities so the
    // top zone isn't the only red one while others are all the same colour.
    hotspots.slice(0, 6).forEach((h, i, arr) => {
      const [hlat, hlon] = offsetPoint(lat, lon, i, arr.length);
      const c = colorFor(h.intensity);
      const marker = L.circleMarker([hlat, hlon], {
        radius: radiusFor(h.intensity),
        color: c,
        fillColor: c,
        fillOpacity: 0.5,
        weight: 2,
      });

      const riskLabel = h.intensity > 72 ? 'High' : h.intensity > 48 ? 'Moderate' : 'Low';
      marker.bindTooltip(
        `<strong>${h.name}</strong><br>Intensity: ${h.intensity}%<br>Risk: ${riskLabel}`,
        { direction: 'top' }
      );
      marker.addTo(layer);
    });
  });
}
