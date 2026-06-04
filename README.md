# TourSensi - Destination Intelligence Command Center

A web app that predicts crowd buildup at Indian tourist destinations so authorities can act before overcrowding or safety incidents. It combines real weather, public holidays, local news, and a transparent synthetic crowd model into a single **Destination Health Score** with AI-generated advisories.

**Live demo:** add Vercel URL once deployed

---

## How to run the project

Pre-req: any recent Python (3.8+) or Node 16+. The project is plain HTML/CSS/JS with no build step.

```bash
# 1. clone
git clone https://github.com/navyansh1/TourSensi-Ganit.git
cd TourSensi-Ganit

# 2. create local config
cp config.example.js config.js

# 3. fill in keys in config.js  (see "What to put in config.js" below)

# 4. serve the project
python -m http.server 5173
# OR
npx serve .

# 5. open
http://localhost:5173
```

Opening `index.html` directly in the browser will not work because the app uses ES modules.

---

## What to put in config.js

`config.js` is the only file teammates need to touch. Copy `config.example.js` to `config.js` and fill in:

| Key | Where to get it | Required? |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey — restrict to your domain | Optional — enables AI advisories |
| `GEMINI_MODEL` | Leave as `gemini-2.0-flash` or change to `gemini-2.5-flash` | Optional |
| `NEWSDATA_API_KEY` | https://newsdata.io — free tier: 200 credits/day | Optional — enables news strip |
| `GNEWS_API_KEY` | https://gnews.io — free tier: 100 calls/day | Optional |
| `NYT_API_KEY` | https://developer.nytimes.com — free | Optional |
| `DEFAULT_PLACE` | Any Indian destination name, e.g. `"Kodaikanal"` | Optional — sets startup location |

The app works fully without any keys; Gemini features fall back to a synthetic recommendation and news is hidden.

> **Note:** `config.js` is NOT gitignored — it ships to Vercel with blank key strings. Never paste a real key into `config.example.js`.

---

## Teammate workflow

We use a simple feature-branch flow. Never commit directly to `main`.

```bash
git checkout main
git pull origin main
git checkout -b feature/your-thing

# make changes

git add <files-you-changed>
git commit -m "Describe your change"
git push -u origin feature/your-thing
```

Avoid casually committing `config.js` if it contains real keys.

---

## What the app does now

### Core dashboard
- Place search with Fuse.js over curated Indian destinations, plus Nominatim/OSM geocoding fallback for any query not in the curated list.
- Hero card with Destination Health Score, risk badge, recommendation, and current situation. Shows a beautiful **Wikipedia Cover Photo** of the destination with glassmorphism gradient overlay when available.
- **Quick Facts Card** displays a factual summary of the chosen destination fetched dynamically from Wikipedia REST API.
- Risk legend: `Healthy >= 75`, `Caution 50-74`, `Risky < 50`.
- Live weather panel using Open-Meteo, now including **Air Quality Index (AQI)** and **PM2.5 / PM10** measurements. Shows clear warning labels if the weather API fails.
- **Interactive Forecast Chart:** Support for toggling the main trend graph between the **Synthetic Crowd Forecast** and a **Real-Time Hourly Weather Forecast** (plotting Temperature and Rain Probability side-by-side).
- Map intelligence using Leaflet + OpenStreetMap with risk-colored hotspot markers.
- Live advisory timeline generated from synthetic signals. Hides internal operational jargon (like staff briefings) in Public mode and labels source as "System Update" for credibility.
- **Tourism-Focused News & State-Level Fallback:** Fetches real news and filters client-side for tourism-relevant keywords. Automatically falls back to regional state-level tourism news (e.g., `[State] tourism`) for smaller towns with empty local feeds.
- Data Sources panel (click the (i) button in the topbar) with live/pending/synthetic status per signal.
- Hover tooltips on every stat card, chart, and section explain what each signal is and where it comes from.

### Gemini features
- Gemini-powered one-sentence recommendation for the operations team.
- Gemini-powered hotspot zone naming (replaces generic zone templates per destination).
- Gemini-powered public advisory generation via modal.
- Model fallback: tries `gemini-2.5-flash` then `gemini-2.0-flash` automatically.
- Surfaces real API error messages instead of a generic fallback string.
- Advisory generation retries once with a stricter prompt if Gemini returns an incomplete paragraph.

### Advisory workflow
- **Location-Specific Advisories:** Both approved advisories and pending review queues are filtered by and stored specific to the selected destination (no longer shared globally).
- Published public advisory is shown directly on the dashboard for all users when the corresponding location is active.
- Public users can request an advisory (queued for government review for that specific location).
- Government users can generate and publish directly from the modal.
- Government users see a pending queue with approve/reject actions filtered for the current active destination.
- Advisory timeline is ordered newest to oldest with timestamps and relative time labels.
- Older synthetic advisories have staggered synthetic timestamps so the timeline reads like a real feed.
- Advisory content area is scrollable.
- Advisory storage uses Firebase Realtime Database with an automatic local fallback (stored under `localStorage`). Includes dynamic migration to support transitioning from the old single-advisory format to the new multi-advisory list format.

### UX
- Government / Public role switcher in the topbar; each role shows different panels.
- Dark mode toggle with `localStorage` persistence.
- Responsive layout for tablet and mobile.
- Sticky topbar with no scroll gap above it.
- Default page rendering scaled to ~90% on desktop via CSS zoom.
- Lucide-style inline SVG icons throughout — no emoji.
- All values in the UI are data-driven; the HTML is a shell with `data-bind` attributes.

---

## File layout

```text
toursensi/
├── index.html
├── style.css
├── config.example.js
├── config.js              # not gitignored; fill in keys here
├── data/
│   └── india-places.json  # curated destination list for Fuse.js search
├── js/
│   ├── advisory-store.js  # localStorage advisory workflow (load/save/approve/reject)
│   ├── main.js            # boot + orchestration
│   ├── state.js           # single source of truth; setState + subscribe
│   ├── ui.js              # data-bind renderer, advisory/news/weather renderers
│   ├── charts.js          # Chart.js wiring (forecast line + hotspots bar)
│   ├── map.js             # Leaflet map init + hotspot markers
│   ├── search.js          # Fuse.js search + Nominatim fallback
│   ├── role.js            # gov/public role switcher
│   ├── tooltip.js         # hover tooltips + Data Sources panel
│   ├── icons.js           # inline SVG icon injector (data-icon attribute)
│   ├── api/
│   │   ├── weather.js     # Open-Meteo fetch
│   │   ├── holidays.js    # Nager.Date fetch
│   │   ├── news.js        # newsdata.io / GNews / NYT fetch
│   │   ├── geocode.js     # Nominatim geocoding (India-biased + global fallback)
│   │   └── gemini.js      # Gemini API with model fallback + prompt builders
│   └── model/
│       └── crowd-score.js # synthetic crowd model (weather + holidays + day/hour)
└── README.md
```

---

## Real data sources

### No key needed
- Open-Meteo — weather (temperature, humidity, wind, UV, precip, sunrise/sunset)
- Nager.Date — Indian public holidays
- Nominatim / OSM — geocoding fallback for destinations not in the curated list
- OpenStreetMap — map tiles

### Optional keys (free tiers)
- Gemini API — AI advisories, hotspot naming, recommendation enhancement
- newsdata.io — recent local news (200 req/day free)
- GNews — news fallback (100 calls/day free)
- NYT — news fallback (free)

---

## Advisory storage

The advisory workflow uses **Firebase Realtime Database** as the primary storage medium, allowing advisories to be synchronized in real-time across different browsers, devices, and sessions. 

- **Real-Time Synchronization:** Updates made by government officials (approvals/rejections) or requests submitted by public users propagate to all active clients immediately.
- **Local Fallback:** If the Firebase database is inaccessible or fails to load, it automatically falls back to browser `localStorage` under the key `toursensi_advisory_workflow_v1`.
- **Current storage module:** [advisory-store.js](file:///c:/Users/NavyanshKothari/GenAI/Toursensi/js/advisory-store.js)

---

## What is still pending

### v1 polish
- Better loading/error banners for slow or failing APIs
- Better empty news state
- Mobile map control polish

### Recommended next technical step
- Move Gemini calls behind a small server-side proxy before sharing the app broadly

### Future upgrades
- Shared auth and destination saving
- SMS / WhatsApp advisory broadcast
- Historical replay
- Multi-language support
- Real shared advisory database (replace localStorage)

---

## Deployment recommendation

### Best option: Vercel

Vercel is the recommended deployment target for this app.

Why:
- Works great for the current no-build static frontend
- Can later add serverless API routes without changing the frontend stack
- Easiest path for hiding Gemini keys properly

### GitHub Pages vs Vercel

- GitHub Pages: only suitable for a fully static demo with no secrets and no shared advisory backend
- Vercel: better for real sharing because it supports static hosting now and serverless routes later

Recommendation: use **Vercel**, not GitHub Pages, if you plan to share with seniors.

---

## Key safety

Do not rely on a hardcoded Gemini key in browser code for a real deployment.

If the key is in `config.js` and shipped to the client:
- users can inspect it
- others can reuse it
- you may need to rotate it after demos

### Safer options

1. Demo-only approach
   Use `config.js` with a restricted Gemini key (restrict to your Vercel domain in Google AI Studio) and rotate it after the demo.

2. Recommended approach
   Move Gemini calls to a Vercel serverless function such as `/api/gemini.js` and store the key in Vercel Environment Variables.

3. Recommended shared workflow setup
   Keep the frontend static, add a Vercel Gemini proxy, and store advisory workflow data in Supabase.

Before deploying:
- Restrict the Gemini key in Google AI Studio to your allowed referrers/domains
- Rotate any key that has been pasted into chats, screenshots, or emails

---

## How to deploy to Vercel

### Option A - connect the GitHub repo

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New -> Project**.
3. Import `navyansh1/TourSensi-Ganit`.
4. Framework preset: **Other**
5. Build command: leave empty
6. Output directory: leave empty
7. Add environment variables later if you move Gemini server-side
8. Click **Deploy**

### Option B - CLI

```bash
npm i -g vercel
cd TourSensi-Ganit
vercel
vercel --prod
```

---

## Conventions

- No emoji in the UI — inline SVG icons only
- No purple/violet accents — sky-blue + amber + emerald palette
- No hardcoded data in HTML — all values populated by JS state bindings
- No build step
- Keep the stack simple first
- Use `localStorage` for advisory workflow until cross-device sharing is actually needed

---

## Questions or stuck?

- Ping Navyansh on the team channel
- Open a GitHub Issue with browser, OS, expected behavior, and actual behavior
- Don't push directly to `main`; always use a PR
