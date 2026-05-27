# TourSensi — Destination Intelligence Command Center

A web app that predicts crowd buildup at Indian tourist destinations (hill stations, monuments, pilgrimage sites) so authorities can act *before* a stampede or overcrowding event. Combines real weather, public holidays, day/time patterns, local news, and a transparent synthetic crowd model into a single **Destination Health Score** with AI-generated advisories.

**Live demo:** *(add Vercel URL once deployed)*

---

## How to run the project (every teammate, first time)

> Pre-req: any recent Python (3.8+) or Node 16+. Nothing else to install — TourSensi is plain HTML/CSS/JS with CDN libraries, **no build step**.

```bash
# 1. clone
git clone https://github.com/navyansh1/TourSensi-Ganit.git
cd TourSensi-Ganit

# 2. create your local config (this file is .gitignored — never commit it)
cp config.example.js config.js
# then open config.js in an editor and paste your own keys:
#   - GEMINI_API_KEY    (https://aistudio.google.com/apikey)
#   - NEWSDATA_API_KEY  (https://newsdata.io)
# Both are optional — the app runs without them, just with reduced features.

# 3. serve it (ES modules need an HTTP server — file:// will NOT work)
python -m http.server 5173
# OR
npx serve .

# 4. open http://localhost:5173
```

> Opening `index.html` directly by double-clicking will fail silently — the JS modules require an HTTP server.

---

## How to make changes (teammate workflow)

We use a simple feature-branch flow. **Never commit directly to `main`.**

```bash
# 1. always start from the latest main
git checkout main
git pull origin main

# 2. create a branch for your work
git checkout -b feature/your-thing
# branch name examples:
#   feature/voice-input
#   fix/map-overlap
#   docs/readme-update

# 3. make changes, test in browser
# ... edit files ...

# 4. commit (small, focused commits are better than one giant one)
git add <files-you-changed>     # avoid `git add .` so you don't sneak in config.js
git commit -m "Add voice input to search bar"

# 5. push your branch to GitHub
git push -u origin feature/your-thing

# 6. open a Pull Request on GitHub:
#    - Go to https://github.com/navyansh1/TourSensi-Ganit
#    - Click "Compare & pull request"
#    - Describe what changed + why
#    - Request review from a teammate
```

### Merging into `main`

1. Get at least one approval on the PR.
2. Resolve any merge conflicts locally (`git pull origin main` on your branch, fix conflicts, push again).
3. On the PR page, click **Squash and merge** (keeps `main` history clean).
4. Delete the branch after merging.
5. Locally: `git checkout main && git pull` to get the new state.

### Keeping your branch up to date with `main`

If `main` has moved while you were working:

```bash
git checkout main
git pull origin main
git checkout feature/your-thing
git merge main          # resolve any conflicts, commit
git push
```

---

## What's done

### Core dashboard
- **Place search** — Fuse.js fuzzy autocomplete over ~100 curated Indian destinations; falls back to Nominatim live geocoding for anything not in the local list.
- **Hero card** — Destination Health Score (0–100), risk badge (Low/Moderate/High) with always-visible legend, one-line recommendation, current situation panel (event, traffic, weather, forecast inflow).
- **Live weather panel** — 10 metrics (temp, feels-like, humidity, wind, UV, visibility, sunrise/sunset, daily high/low, rain) from Open-Meteo. Free, no API key.
- **Stat cards row** — Visitors Today, Crowd Risk, Traffic State, Weather Impact, Peak Window.
- **Visitor forecast chart** — Bell-curve per destination (peak hour shifts per city based on a place-name hash, ±1.5h variance).
- **Crowd Hotspots bar chart** — Color-coded by risk tier (red/amber/green). Zone names from Gemini when key is set; falls back to type-based templates otherwise.
- **Map intelligence** — Leaflet + OpenStreetMap, risk-colored circles for hotspots.
- **Live Advisories** — Rule-based advisory cards keyed off score, traffic, and top hotspot intensity.
- **Generate Public Advisory** — Gemini-powered modal that produces a 4-sentence official advisory (gov-only).
- **News strip** — newsdata.io (when key set). Color-coded source badges per provider.

### UX polish
- **Role switcher** — Government / Institution (full dashboard + advisory button) vs Public View (hides advisory, shows visitor tip in plain language).
- **Dark mode** — Moon/sun toggle in topbar, preference saved to `localStorage`.
- **Data Sources panel** — (i) button in topbar opens a panel showing which APIs are Live / Add-key / Synthetic.
- **Hover tooltips** — Tiny (i) badges on every metric explaining where the number comes from.
- **Responsive layout** — Tablet (2-row topbar), mobile (single column, icon-only role buttons on tiny screens).
- **Sticky topbar** — Blurred backdrop, brand logo with gradient pin mark.

### Real data (no key needed)
- Open-Meteo — weather
- Nager.Date — Indian public holidays
- Nominatim / OSM — geocoding fallback
- OpenStreetMap — map tiles

### Real data (needs free key in `config.js`)
- Gemini API — AI advisories + AI hotspot zone names
- newsdata.io — recent local news (200 free calls/day)

---

## What's pending / Phase 2

### v1 polish
- **Loading states** — Currently shimmer skeletons; would be nice to show "Fetching weather…" etc. as plain text on slower connections.
- **Error states** — If Open-Meteo or Nominatim fails, fall back gracefully with a banner.
- **Mobile map zoom controls** — Sometimes feel cramped under the wrapped topbar.
- **Better empty news state** — Currently shows nothing — could suggest similar destinations.

### Real crowd data (the big one)
v1 synthesizes visitor counts because there's no free real-time API for them. Documented upgrade path:

| Tier | Source | Effort |
|---|---|---|
| 1 | BestTime.app API ($50–200/mo) | swap one file in `js/api/crowd.js` |
| 2 | Google Routes API (traffic as crowd proxy) | requires billing-enabled GCP |
| 3 | Partnership with ticket-issuance systems (TTD, ASI) | pilot agreement |
| 4 | CCTV + edge ML headcount (NVIDIA Metropolis, YOLOv8) | hardware + ops |
| 5 | Aggregated telco cell-tower density | enterprise contract |

All `js/api/*.js` modules return a normalized shape — swapping the synthetic source for any real source is a one-file change.

### Stretch goals
- **Auth + saved destinations** for tourism boards
- **SMS / WhatsApp advisory broadcast** — Twilio integration
- **Historical replay** — slider to see how the score moved across past days
- **Multi-language** — Hindi, Tamil, Telugu for public view

---

## How to deploy to Vercel

Yes, Vercel works great — TourSensi is pure static (HTML/CSS/JS, no server). Two ways:

### Option A — Connect the GitHub repo (recommended)

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New → Project**.
3. Import `navyansh1/TourSensi-Ganit`.
4. **Framework Preset:** "Other" (no build needed).
5. **Build Command:** *leave empty.*
6. **Output Directory:** *leave empty (Vercel will serve the root).*
7. **Environment Variables:** None needed (keys live in `config.js` which is **gitignored**, so it won't be in the repo). See "Key safety on Vercel" below.
8. Click **Deploy**.

Every push to `main` will auto-redeploy. PRs get their own preview URLs.

### Option B — One-time CLI deploy

```bash
npm i -g vercel
cd TourSensi-Ganit
vercel              # follow prompts; pick "Other" as framework
vercel --prod       # promote to production
```

### Key safety on Vercel

Because `config.js` is gitignored, the deployed site will have **empty keys** → Gemini advisories and news will silently no-op (the app still runs, just with synthetic recommendations).

**Two options to fix this:**

1. **Quick & dirty (demo only):** Locally rename `config.js` → `config.public.js`, commit it, deploy. Keys will be visible in the browser. *Only acceptable if you've restricted the keys in Google AI Studio + newsdata.io to the Vercel domain.*

2. **Proper (recommended past demo):** Move key-using calls to a Vercel **Serverless Function** (`/api/gemini.js`) that holds the keys in Vercel Environment Variables. Frontend calls `/api/gemini` instead of Google directly. ~20-line change.

Before deploying, always:
- Restrict the Gemini key in Google AI Studio → HTTP referrers → add your Vercel domain.
- Rotate any key that's been pasted into chat, Slack, screenshots, or emails.

---

## File layout

```
toursensi/
├── index.html              # shell — no hardcoded values, JS populates everything
├── style.css               # full design system, dark mode, responsive
├── config.example.js       # committed template — teammates copy to config.js
├── config.js               # YOUR keys (gitignored, never commit)
├── data/
│   └── india-places.json   # ~100 curated destinations for fuzzy search
├── js/
│   ├── main.js             # boot + orchestration
│   ├── state.js            # single source of truth, subscribe/setState
│   ├── ui.js               # data-bind renderer, news/weather/advisory render
│   ├── charts.js           # Chart.js — forecast line, hotspots bar
│   ├── map.js              # Leaflet — risk-colored hotspot circles
│   ├── search.js           # Fuse.js + Nominatim fallback
│   ├── role.js             # gov / public view switcher
│   ├── tooltip.js          # hover (i) badges + Data Sources panel
│   ├── icons.js            # Lucide-style inline SVGs
│   ├── api/
│   │   ├── weather.js      # Open-Meteo
│   │   ├── holidays.js     # Nager.Date
│   │   ├── news.js         # newsdata.io
│   │   └── gemini.js       # Gemini — advisories + hotspot names
│   └── model/
│       └── crowd-score.js  # transparent synthetic crowd model
└── README.md
```

---

## Conventions

- **No emoji in the UI** — all glyphs are inline Lucide SVGs from `js/icons.js`. To add an icon, copy its SVG path into the `ICONS` map there and use `data-icon="name"` in HTML.
- **No purple/violet accents** — palette is sky-blue (#0ea5e9) + amber/emerald/red for risk levels. Defined as CSS variables at the top of `style.css`.
- **No hardcoded data in HTML** — `index.html` is a shell; JS state populates all values via `data-bind` attributes.
- **No build step** — please don't add React/Vue/webpack/vite. Vanilla ES modules + CDN libraries only.

---

## Questions or stuck?

- Ping Navyansh on the team channel.
- For bugs, open a GitHub Issue — describe what you tried, what you expected, what you saw, browser + OS.
- Don't push directly to `main`; always go through a PR.
