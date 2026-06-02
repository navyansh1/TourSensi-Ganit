// Open-Meteo — free, no API key. Returns full weather detail for the dashboard.

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CODE_TO_LABEL = {
  0:  { label: 'Clear Sky',           icon: '☀',  favorability: 1.0 },
  1:  { label: 'Mostly Clear',        icon: '🌤', favorability: 0.95 },
  2:  { label: 'Partly Cloudy',       icon: '⛅', favorability: 0.85 },
  3:  { label: 'Cloudy',              icon: '☁',  favorability: 0.75 },
  45: { label: 'Foggy',               icon: '🌫', favorability: 0.5 },
  48: { label: 'Icy Fog',             icon: '🌫', favorability: 0.45 },
  51: { label: 'Light Drizzle',       icon: '🌦', favorability: 0.45 },
  53: { label: 'Drizzle',             icon: '🌦', favorability: 0.4 },
  55: { label: 'Heavy Drizzle',       icon: '🌧', favorability: 0.3 },
  61: { label: 'Light Rain',          icon: '🌧', favorability: 0.35 },
  63: { label: 'Rain',                icon: '🌧', favorability: 0.25 },
  65: { label: 'Heavy Rain',          icon: '🌧', favorability: 0.1 },
  71: { label: 'Light Snow',          icon: '🌨', favorability: 0.3 },
  73: { label: 'Snow',                icon: '❄',  favorability: 0.2 },
  75: { label: 'Heavy Snow',          icon: '❄',  favorability: 0.1 },
  80: { label: 'Light Showers',       icon: '🌦', favorability: 0.35 },
  81: { label: 'Showers',             icon: '🌧', favorability: 0.25 },
  82: { label: 'Heavy Showers',       icon: '🌧', favorability: 0.15 },
  95: { label: 'Thunderstorm',        icon: '⛈',  favorability: 0.1 },
  96: { label: 'Thunderstorm + Hail', icon: '⛈',  favorability: 0.05 },
  99: { label: 'Severe Thunderstorm', icon: '⛈',  favorability: 0.05 },
};

export async function fetchWeather(lat, lon) {
  if (lat == null || lon == null) return null;
  const url = new URL(ENDPOINT);
  url.searchParams.set('latitude',  String(lat));
  url.searchParams.set('longitude', String(lon));
  
  // Current observations
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'precipitation',
    'cloud_cover',
    'uv_index',
    'visibility',
  ].join(','));
  
  // Daily high/low for today
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,sunrise,sunset');
  // Hourly forecast for graph toggle
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability');
  
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  try {
    // Fetch weather and AQI in parallel
    const [res, aqi] = await Promise.all([
      fetch(url.toString()),
      fetchAQI(lat, lon)
    ]);

    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current || {};
    const d = data.daily   || {};
    const h = data.hourly  || {};
    const meta = CODE_TO_LABEL[c.weather_code] || { label: 'Unknown', icon: '?', favorability: 0.6 };

    const hourlyTemps = h.temperature_2m ? h.temperature_2m.slice(8, 21) : [];
    const hourlyPrecip = h.precipitation_probability ? h.precipitation_probability.slice(8, 21) : [];

    return {
      // Used by crowd-score model
      label:          meta.label,
      favorability:   meta.favorability,
      sub:            tourismLabel(meta.favorability, c.temperature_2m),

      // Full detail for the weather panel
      icon:              meta.icon,
      temperatureC:      round1(c.temperature_2m),
      feelsLikeC:        round1(c.apparent_temperature),
      humidity:          c.relative_humidity_2m,        // %
      windKph:           round1(c.wind_speed_10m),
      windDir:           compassDir(c.wind_direction_10m),
      precipitationMm:   round1(c.precipitation),
      cloudCover:        c.cloud_cover,                 // %
      uvIndex:           round1(c.uv_index),
      visibilityKm:      c.visibility != null ? round1(c.visibility / 1000) : null,
      highC:             round1(d.temperature_2m_max?.[0]),
      lowC:              round1(d.temperature_2m_min?.[0]),
      precipDayMm:       round1(d.precipitation_sum?.[0]),
      uvIndexMax:        round1(d.uv_index_max?.[0]),
      sunrise:           fmtTime(d.sunrise?.[0]),
      sunset:            fmtTime(d.sunset?.[0]),

      // Hourly values (8 AM to 8 PM)
      hourly: {
        hours: Array.from({ length: 13 }, (_, i) => i + 8),
        temperature: hourlyTemps.map(round1),
        precipitation: hourlyPrecip.map(Math.round),
      },

      // Air Quality data
      aqi: aqi,
    };
  } catch (e) {
    console.warn('[weather] fetch failed', e);
    return null;
  }
}

async function fetchAQI(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current || {};
    return {
      usAqi: cur.us_aqi,
      pm25: cur.pm2_5,
      pm10: cur.pm10,
      label: aqiLabel(cur.us_aqi),
    };
  } catch (e) {
    console.warn('[aqi] fetch failed', e);
    return null;
  }
}

function aqiLabel(aqi) {
  if (aqi == null) return 'Unknown';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function tourismLabel(fav, temp) {
  if (fav >= 0.85 && temp != null && temp >= 15 && temp <= 28) return 'Tourism-friendly';
  if (fav >= 0.7) return 'Pleasant';
  if (fav >= 0.45) return 'Mixed';
  return 'Adverse';
}

function round1(v) { return v != null ? Math.round(v * 10) / 10 : null; }

function compassDir(deg) {
  if (deg == null) return '';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}
