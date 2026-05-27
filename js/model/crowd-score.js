// Transparent synthetic crowd model. Reacts to real weather + real holiday flag + day/hour.
// All numbers come from inputs — nothing hardcoded per destination.

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM .. 8 PM

export function computeIntelligence({ weather, isHoliday, holidayName, now = new Date(), placeType = 'destination', placeName = '' }) {
  const day = now.getDay();                   // 0=Sun..6=Sat
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;
  const fav = weather?.favorability ?? 0.7;

  const peakFactor = peakHourFactor(hour);
  const baseSeed = seedFromPlaceType(placeType);
  const placeHash = hashPlace(placeName);

  let score = 100;
  score -= 25 * (isWeekend ? 1 : 0);
  score -= 30 * (isHoliday ? 1 : 0);
  score -= 15 * fav;                          // pleasant weather = more crowd = lower score
  score -= 20 * peakFactor;
  score += deterministicNoise(now, 6) - 3;
  score = Math.max(8, Math.min(98, Math.round(score)));

  const risk = scoreToRisk(score);
  const inflowPct = round1(
    8 * (isWeekend ? 1.4 : 1) * (isHoliday ? 1.8 : 1) * (0.6 + fav * 0.8) + deterministicNoise(now, 4) - 2
  );

  // Hourly visitors curve — bell-shaped, peak hour varies per city (12–3 PM range), scaled by demand drivers.
  const demandScale = (isWeekend ? 1.35 : 1) * (isHoliday ? 1.7 : 1) * (0.55 + fav * 0.7);
  const visitorsBase = baseSeed.visitorsBase * demandScale;
  // Peak shifts ±1.5h based on place hash; skew makes early/late cities different
  const peakCenter = 14 + ((placeHash % 7) - 3) * 0.5;   // 11.5–16.5 range
  const peakSpread = 3.8 + (placeHash % 5) * 0.2;          // 3.8–4.6
  const peakSkew   = ((placeHash % 9) - 4) * 0.08;         // slight asymmetry
  const forecastHours = HOURS;
  const forecastVisitors = HOURS.map((h) => {
    const base = visitorsBase * skewedCurve(h, peakCenter, peakSpread, peakSkew);
    const noise = 0.92 + deterministicNoise(now, 10, h) / 100;
    return Math.max(0, Math.round(base * noise));
  });
  const visitorsToday = Math.round(forecastVisitors.reduce((a, b) => a + b, 0) * 0.45);

  // Hotspots — intensities spread across risk tiers so the map shows red/amber/green variety.
  // Base intensity driven by demand, then each zone gets a progressively lower lean so we
  // naturally get 1–2 high, 2 moderate, 1–2 low zones per destination.
  const demandMultiplier = (peakFactor + 0.35) * (0.7 + fav * 0.45);
  const hotspots = baseSeed.zones.map((name, i) => {
    const total = baseSeed.zones.length;
    // lean 0=first(most prominent) .. 1=last(quietest)
    const lean = i / Math.max(total - 1, 1);
    // Base spread: top zone ~85%, bottom zone ~30%, driven by demand
    const base = 85 - lean * 55;
    const driven = base * demandMultiplier;
    const noise = deterministicNoise(now, 7, i) - 3.5;
    const intensity = Math.max(15, Math.min(97, Math.round(driven + noise)));
    return { name, intensity };
  });

  const peak = peakWindowLabel(forecastHours, forecastVisitors);
  const trafficState = trafficStateFor(score, isHoliday, isWeekend);
  const eventContext = eventContextFor({ isHoliday, holidayName, isWeekend });
  const advisories = synthesizeAdvisories({ risk, hotspots, trafficState, peak, isHoliday });

  return {
    score: { value: score, raw: score },
    risk,
    situation: {
      event: eventContext,
      traffic: trafficState,
      weather: weather?.label || 'Unknown',
      inflow: `${inflowPct >= 0 ? '+' : ''}${inflowPct}%`,
    },
    stats: {
      visitors: visitorsToday.toLocaleString('en-IN'),
      visitorsDelta: `${inflowPct >= 0 ? '+' : ''}${inflowPct}%`,
      crowdRisk: risk.label.replace(' Risk', ''),
      traffic: trafficState,
      weather: weather?.label || 'Unknown',
      weatherSub: weather?.sub || '',
      peak,
    },
    forecast: { hours: forecastHours, visitors: forecastVisitors },
    hotspots,
    advisories,
    recommendation: recommendationFor({ risk, hotspots, peak, trafficState, isHoliday }),
  };
}

function peakHourFactor(h) {
  // Peak 12 PM - 4 PM
  if (h < 8 || h > 20) return 0;
  const center = 14;
  const spread = 4;
  return Math.max(0, 1 - Math.abs(h - center) / spread);
}

function skewedCurve(h, center, spread, skew) {
  const d = (h - center) / spread;
  // Skew: shift the bell slightly left or right depending on skew factor
  const adjusted = d - skew * d * d;
  return Math.exp(-adjusted * adjusted);
}

function hashPlace(name) {
  // Stable integer from place name — varies per city so each gets a distinct curve.
  let h = 0;
  const s = (name || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

function scoreToRisk(score) {
  if (score >= 75) return { level: 'low', label: 'Low Risk', badgeClass: 'risk-low' };
  if (score >= 50) return { level: 'moderate', label: 'Moderate Risk', badgeClass: 'risk-moderate' };
  return { level: 'high', label: 'High Risk', badgeClass: 'risk-high' };
}

function trafficStateFor(score, isHoliday, isWeekend) {
  if (score < 45 || (isHoliday && isWeekend)) return 'Heavy';
  if (score < 65 || isHoliday || isWeekend) return 'Moderate';
  return 'Light';
}

function eventContextFor({ isHoliday, holidayName, isWeekend }) {
  if (isHoliday && holidayName) return `Public Holiday — ${holidayName}`;
  if (isHoliday) return 'Public Holiday';
  if (isWeekend) return 'Weekend tourist surge';
  return 'Regular weekday';
}

function peakWindowLabel(hours, visitors) {
  let max = -1, idx = 0;
  visitors.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
  const start = hours[Math.max(0, idx - 1)];
  const end = hours[Math.min(hours.length - 1, idx + 1)];
  return `${fmtHour(start)}–${fmtHour(end)}`;
}

function fmtHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}

function recommendationFor({ risk, hotspots, peak, trafficState, isHoliday }) {
  const top = hotspots[0]?.name || 'main zone';
  const second = hotspots[1]?.name || 'secondary zone';
  if (risk.level === 'high') {
    return `Activate crowd-dispersal at ${top} and divert vehicles before ${peak.split('–')[0]}. Pre-position medical response near ${second}.`;
  }
  if (risk.level === 'moderate') {
    return `Monitor ${top} and ${second} between ${peak}. Keep alternate parking active and signage updated.`;
  }
  return `Conditions are calm. Routine staffing sufficient${isHoliday ? '; recheck mid-day as holiday traffic builds' : ''}.`;
}

function synthesizeAdvisories({ risk, hotspots, trafficState, peak, isHoliday }) {
  const out = [];
  const top = hotspots[0];
  if (top) {
    const level = top.intensity > 80 ? 'high' : top.intensity > 60 ? 'moderate' : 'low';
    out.push({
      level,
      title: top.intensity > 80 ? 'High crowd buildup' : 'Crowd buildup expected',
      body: `${top.name} projected at ${top.intensity}% intensity around ${peak}.`,
    });
  }
  if (trafficState !== 'Light') {
    out.push({
      level: trafficState === 'Heavy' ? 'high' : 'moderate',
      title: 'Vehicle inflow pressure',
      body: `Approach roads showing ${trafficState.toLowerCase()} congestion${isHoliday ? ' on holiday traffic' : ''}; activate alternate routes.`,
    });
  }
  out.push({
    level: risk.level === 'high' ? 'high' : 'low',
    title: 'Emergency readiness',
    body: risk.level === 'high'
      ? 'Pre-deploy medical, rescue and crowd-control teams to the top two hotspots before peak window.'
      : 'Routine medical and rescue staging is adequate. Refresh staff briefing before peak window.',
  });
  return out;
}

function seedFromPlaceType(type) {
  const t = (type || 'destination').toLowerCase();
  if (t.includes('monument') || t.includes('temple') || t.includes('fort') || t.includes('shrine')) {
    return {
      visitorsBase: 1400,
      zones: ['Main Entrance', 'Inner Sanctum / Courtyard', 'Exit Gate', 'Parking Lot', 'Approach Road'],
    };
  }
  if (t.includes('beach') || t.includes('coast')) {
    return {
      visitorsBase: 1200,
      zones: ['Main Beach', 'North Stretch', 'Promenade', 'Parking', 'Food Court'],
    };
  }
  if (t.includes('park') || t.includes('sanctuary')) {
    return {
      visitorsBase: 900,
      zones: ['Main Gate', 'Safari Bay', 'Viewing Tower', 'Picnic Area', 'Exit'],
    };
  }
  // hill-station / general
  return {
    visitorsBase: 1500,
    zones: ['Main Viewpoint', 'Lake / Garden', 'Market Area', 'Parking', 'Bus Stand'],
  };
}

function deterministicNoise(date, range = 5, salt = 0) {
  // Stable noise that varies by date+hour, so the score is reproducible during a session.
  const seed = (date.getFullYear() * 1000 + (date.getMonth() + 1) * 30 + date.getDate() + date.getHours() + salt * 17) % 997;
  return (seed / 997) * range;
}

function round1(n) { return Math.round(n * 10) / 10; }
