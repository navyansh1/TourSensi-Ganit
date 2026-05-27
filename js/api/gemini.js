// Gemini API — direct fetch from browser. Key is per-domain restricted in Google AI Studio
// to prevent reuse if scraped. No-op (returns null) if key missing — caller falls back to synthetic.

const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

const DEFAULT_MODEL = 'gemini-2.0-flash';

export async function generate({ apiKey, model = DEFAULT_MODEL, prompt, system, temperature = 0.7, maxTokens = 512 }) {
  if (!apiKey) return null;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  let res;
  try {
    res = await fetch(ENDPOINT(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn('[gemini] network error', e);
    return null;
  }
  if (!res.ok) {
    console.warn('[gemini] non-OK', res.status, await safeText(res));
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n').trim();
  return text || null;
}

async function safeText(res) { try { return await res.text(); } catch { return ''; } }

// Convenience builders ----------------------------------------------------

export function recommendationPrompt(ctx) {
  return `You are a public-safety advisor for tourism authorities in India.

Destination: ${ctx.placeLabel}
Destination type: ${ctx.placeType}
Health score: ${ctx.score}/100 (${ctx.risk})
Day: ${ctx.day} (${ctx.isWeekend ? 'weekend' : 'weekday'})
Hour: ${ctx.hour}:00
Weather: ${ctx.weather}
Public holiday: ${ctx.holiday || 'none'}
Top hotspots: ${ctx.hotspots.join(', ')}
Traffic state: ${ctx.traffic}
Peak window: ${ctx.peak}

Write ONE single sentence (max 22 words) for the operations team — concrete action(s) to take in the next 2 hours. No preamble, no markdown.`;
}

export function hotspotsPrompt(ctx) {
  return `List the 5 most visited crowd hotspot zones at ${ctx.placeLabel} (${ctx.placeType}) in India.
Return ONLY a JSON array of 5 strings — the zone names. No explanation, no markdown, no extra text.
Example: ["Main Entrance","Inner Sanctum","Parking","Food Court","Exit Road"]
Real popular zones for this specific place only. Keep names short (2–4 words).`;
}

export function publicAdvisoryPrompt(ctx) {
  return `You are issuing an official public advisory from the tourism department.

Destination: ${ctx.placeLabel}
Risk level: ${ctx.risk}
Crowd score: ${ctx.score}/100
Top hotspots: ${ctx.hotspots.join(', ')}
Weather: ${ctx.weather}
Public holiday: ${ctx.holiday || 'none'}
Peak window: ${ctx.peak}
Traffic state: ${ctx.traffic}

Write a 4-sentence advisory to the general public (visitors / pilgrims / tourists). Tone: calm, factual, actionable. Cover:
1. Current conditions in one sentence.
2. What visitors should expect (queues, parking, weather impact).
3. Concrete suggestions (best time to visit, alternate routes / gates, what to bring).
4. A reassuring closing line about safety arrangements.

No markdown, no bullet points, no headings. Plain prose only.`;
}
