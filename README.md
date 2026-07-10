# VoyageFlow — AI Travel Concierge ✈️

**A free, zero-friction AI travel concierge — no sign-up, instant itineraries, and a ready-to-book desk for flights, hotels, tours, and insurance.**

<p>
  <img src="https://img.shields.io/badge/status-live-brightgreen" alt="Status">
  <img src="https://img.shields.io/badge/worker-v2.1.1-blue" alt="Worker Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/backend-Cloudflare%20Workers-orange" alt="Backend">
  <img src="https://img.shields.io/badge/AI-Gemini%20%2B%20Groq-purple" alt="AI Stack">
  <img src="https://img.shields.io/badge/frontend-GitHub%20Pages-lightgrey" alt="Frontend">
</p>

---

## 📚 Table of Contents

- [What Is VoyageFlow?](#what-is-voyageflow)
- [🚀 Live Demo](#-live-demo)
- [🖼️ Screenshots](#️-screenshots)
- [🏗️ Architecture](#️-architecture)
- [✨ Features](#-features)
- [🤖 AI Backend — Dual-Engine Routing](#-ai-backend--dual-engine-routing-v211)
- [📡 API Reference](#-api-reference)
- [🏗️ Repository Structure](#️-repository-structure)
- [💻 Local Development](#-local-development)
- [⚡ Deployment Guide](#-deployment-guide)
- [🔒 Security & Privacy](#-security--privacy)
- [🛠️ Tech Stack](#️-tech-stack)
- [🗺️ Roadmap](#️-roadmap)
- [📈 Worker Version History](#-worker-version-history)
- [👤 About](#-about)
- [📄 License](#-license)

---

## What Is VoyageFlow?

VoyageFlow turns a normal conversation into a complete travel plan. Tell it where you want to go, when, and who's joining — it responds with a personalized, day-by-day itinerary written in a luxury-concierge voice, then generates a structured booking desk with deep links to search flights, hotels, tours, and insurance already pre-filled with the traveler's dates, destination, and party size.

No sign-up. No API key required from the user. Just start planning.

---

## 🚀 Live Demo

👉 **https://james75x2-design.github.io/VoyageFlow/**

Backend health check: https://voyageflow.james75x2.workers.dev/health

---

## 🖼️ Screenshots

### 1. Personalized Welcome (Cookie Memory)

VoyageFlow remembers your last destination and welcomes you back with a resumed context.

<img src="https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/screenshots/01-welcome-personalized.png" alt="VoyageFlow personalized welcome screen">

---

### 2. AI-Generated Day-by-Day Itinerary

Written in a luxury travel-curator voice, structured by day, with contextual highlights before any booking data is shown.

<img src="https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/screenshots/02-itinerary-day-by-day.png" alt="AI-generated day-by-day itinerary">

---

### 3. Premium Travel Booking Desk

Auto-generated from a structured JSON block emitted by the AI. Deep links are pre-filled with destination, dates, and party size — one click to search hotels, flights, experiences, or insurance.

<img src="https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/screenshots/03-booking-desk-prefilled.png" alt="Premium Travel Booking Desk with pre-filled links">

---

## 🏗️ Architecture

```text
┌─────────────────────┐        ┌────────────────────────────┐        ┌──────────────────┐
│  index.html         │        │  Cloudflare Worker (v2.1.1)│        │  Google Gemini   │
│  (GitHub Pages)     │  POST  │  voyageflow_backend_       │  API   │  gemini-2.5-flash│
│  Vanilla JS + CSS   │ ─────▶ │  worker.js                 │ ─────▶ │  (Primary)       │
│                     │        │  • CORS allowlist          │        └──────────────────┘
│  • Chat UI          │        │  • Payload validation      │                 │
│  • Cookie memory    │        │  • Dynamic date injection  │        Fallback │ on error /
│  • Booking desk     │        │  • Timeout protection      │                 │ rate-limit
│  • Suggestion chips │  JSON  │  • Structured logging      │                 ▼
│                     │ ◀───── │  • Latency + version meta  │        ┌──────────────────┐
└─────────────────────┘        │  • /health endpoint        │  API   │  Groq            │
                               └────────────────────────────┘ ─────▶ │  gpt-oss-120b →  │
                                                                     │  llama-3.3-70b   │
                                                                     └──────────────────┘
```

**Data flow**

1. User sends a message from `index.html`.
2. Frontend POSTs the conversation history to the Cloudflare Worker.
3. Worker validates payload, injects today's date into the system prompt, tries Gemini first, falls back through the Groq chain on failure.
4. Response is returned as JSON with `reply` + `meta` (model used, worker version, latency).
5. Frontend parses the embedded booking JSON block and renders a Premium Travel Booking Desk with pre-filled deep links.

---

## ✨ Features

- **Conversational trip planning** — the assistant asks for missing details (destination, dates, party size) instead of guessing.
- **Luxury day-by-day itineraries** — written in a premium travel-curator voice before any booking data is generated.
- **Premium Travel Booking Desk** — auto-generated card with deep links to:
  - 🏨 **Booking.com** — pre-filled with check-in/out dates, adult/room counts, and child ages
  - ✈️ **Google Flights** — pre-filled with an NLP-style query for destination, dates, and travelers
  - 🎟️ **GetYourGuide** — search results for real tours and activities
  - 🛡️ **VisitorsCoverage** — travel insurance, destination-aware
- **Dual-engine AI routing** — Gemini primary; on error or rate-limit, the worker silently retries through a Groq fallback chain.
- **IATA-aware flight routing** — Maldives → MLE, Bali → DPS, Hawaii → HNL, Ibiza → IBZ to avoid Google Flights map-view fallback.
- **Cookie-based memory** — remembers the user's last destination and personalizes the welcome screen and suggestion chips.
- **Dynamic seasonal suggestions** — Tokyo Spring, Paris Summer, Bali Escape, etc., with date ranges auto-computed from today's date.
- **Secure backend** — API keys live only in encrypted Cloudflare Worker secrets, never shipped to the browser.

---

## 🤖 AI Backend — Dual-Engine Routing (v2.1.1)

The Cloudflare Worker is a hardened ES-Module gateway with the following behavior:

| Layer | Provider | Model | Role |
|---|---|---|---|
| Primary | Google Gemini | `gemini-2.5-flash` | Fast, large-context reasoning for itinerary + structured extraction |
| Fallback 1 | Groq | `openai/gpt-oss-120b` | Reasoning-capable, high-quality structured output |
| Fallback 2 | Groq | `llama-3.3-70b-versatile` | Fast and reliable structured output |

Fallback order is controlled by the `GROQ_FALLBACK_MODELS` array in `voyageflow_backend_worker.js`. Reorder or swap entries there without touching the rest of the code. Every successful response includes a `meta` block identifying which model answered:

```json
{
  "reply": "…luxury itinerary + JSON block…",
  "meta": {
    "model": "gemini-2.5-flash",
    "version": "2.1.1",
    "latency_ms": 842
  }
}
```

**Worker capabilities (v2.1.1):**

- CORS allowlist (locked to GitHub Pages + localhost dev)
- Payload validation (message count + text length limits)
- Dynamic date injection (system prompt is rebuilt per request)
- Upstream timeouts (25s AbortController on Gemini + Groq)
- Rate-limit surfacing (429 bubbles up to the frontend)
- Structured JSON logging (severity-aware for Cloudflare log search)
- `/health` endpoint (uptime-monitor friendly, trailing-slash tolerant)
- Version + latency metrics on every response

---

## 📡 API Reference

The Cloudflare Worker exposes 2 endpoints:

### `GET /health`

Returns the worker's operational status. Useful for uptime monitors.

```bash
curl https://voyageflow.james75x2.workers.dev/health
```

Response:

```json
{
  "status": "ok",
  "service": "voyageflow-worker",
  "version": "2.1.1",
  "timestamp": "2026-07-08T09:12:08.000Z"
}
```

### `POST /`

Main conversational endpoint. Accepts a `messages` array in Gemini format.

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "parts": [{ "text": "Plan a 5-day trip to Tokyo for 2 adults in December." }]
      }
    ]
  }'
```

Success response (200):

```json
{
  "reply": "…luxury itinerary + embedded JSON booking block…",
  "meta": {
    "model": "gemini-2.5-flash",
    "version": "2.1.1",
    "latency_ms": 842
  }
}
```

Error responses:

| Status | Meaning |
|---|---|
| `400` | Malformed payload (missing/invalid messages array) |
| `404` | Unknown path |
| `405` | Wrong HTTP method |
| `429` | Rate limited by upstream provider |
| `502` | All AI providers failed |

**Payload limits:**
- Max 30 messages per conversation
- Max 8,000 characters per message

**CORS:** Locked to GitHub Pages + localhost origins. Update `ALLOWED_ORIGINS` in the worker if you fork.

---

## 🏗️ Repository Structure

```text
VoyageFlow/
├── index.html                      # Frontend — single-file static web client
├── voyageflow_backend_worker.js    # Cloudflare Worker — Gemini + Groq gateway (v2.1.1)
├── README.md                       # This file
├── LICENSE                         # MIT
└── docs/
    └── screenshots/                # Product screenshots (welcome, itinerary, booking desk)
```

Deployed via **GitHub Pages** from the `main` branch. Backend runs on **Cloudflare Workers** at `voyageflow.james75x2.workers.dev`.

---

## 💻 Local Development

### Test the frontend locally

The frontend is a single static HTML file. To run locally:

```bash
# Clone the repo
git clone https://github.com/james75x2-design/VoyageFlow.git
cd VoyageFlow

# Serve with any static server (Python example)
python -m http.server 5500

# Or with VS Code Live Server extension (right-click index.html → Open with Live Server)
```

Then open `http://localhost:5500` in your browser.

**Note:** The frontend expects a live Cloudflare Worker URL in the `WORKER_URL` constant near the top of the `<script>` block. Point it to your own worker for local testing.

### Test the worker locally with Wrangler

Install Cloudflare's official CLI:

```bash
npm install -g wrangler
wrangler login
```

Create a minimal `wrangler.toml` at repo root:

```toml
name = "voyageflow-dev"
main = "voyageflow_backend_worker.js"
compatibility_date = "2026-01-01"

[vars]
# Use `wrangler secret put GEMINI_API_KEY` and `wrangler secret put GROQ_API_KEY` for real dev
```

Then:

```bash
wrangler dev
```

The worker runs on `http://localhost:8787` and can be tested with `curl` locally.

---

## ⚡ Deployment Guide

### Step 1 — Deploy the Cloudflare Worker Backend

1. Sign up at [cloudflare.com](https://workers.cloudflare.com) (free tier is more than enough).
2. Create a new Worker (e.g. `voyageflow`).
3. Paste the contents of `voyageflow_backend_worker.js` into the Worker editor.
4. Add secrets under **Settings → Variables and Secrets**:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
   - `GROQ_API_KEY` — from [Groq Console](https://console.groq.com)
5. **Save and Deploy**.
6. Copy your `.workers.dev` URL and verify:

```bash
curl https://<your-worker>.workers.dev/health
```

### Step 2 — Configure the Frontend

Open `index.html` and update the worker URL near the top of the `<script>` block:

```javascript
const WORKER_URL = 'https://your-worker-subdomain.workers.dev/';
```

Also update the CORS allowlist in the worker (`ALLOWED_ORIGINS`) to include your GitHub Pages URL if you fork this project.

### Step 3 — Deploy the Frontend

Push to `main`. GitHub Pages picks up changes automatically.

To enable Pages the first time: **Repo Settings → Pages → Source → Deploy from a branch → main / root**.

### Step 4 — Configure Affiliate / Partner IDs *(Optional)*

To earn commissions from bookings, open the frontend's `createBookingDemandCard()` function and replace the placeholder IDs:

- `BOOKING_AID` — [Booking.com Affiliate Partner Hub](https://partners.booking.com)
- `GYG_PARTNER_ID` — [GetYourGuide Partner Program](https://partner.getyourguide.com)
- `VISITORS_COVERAGE_ID` — [VisitorsCoverage Partners](https://www.visitorscoverage.com)

---

## 🔒 Security & Privacy

- API keys are stored as encrypted Cloudflare Worker secrets and accessed only via `env`.
- Keys are never exposed to the frontend or visible in browser source.
- All AI calls are proxied through the Cloudflare Worker.
- No user conversation data is stored server-side. Cookies only store the last destination string, locally on the user's device.
- CORS is locked to an origin allowlist (not `*`), preventing arbitrary sites from abusing the worker.
- Payload size limits protect against abuse of paid model tiers.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Backend | Cloudflare Workers (ES Module) |
| AI Primary | Google Gemini 2.5 Flash |
| AI Fallback | Groq (gpt-oss-120b → llama-3.3-70b-versatile) |
| Hosting | GitHub Pages (frontend) + Cloudflare Workers (backend) |
| Memory | HTTP cookies (client-side, last destination only) |
| Booking Partners | Booking.com, Google Flights, GetYourGuide, VisitorsCoverage |

---

## 🗺️ Roadmap

- [x] Screenshots + architecture diagram in `docs/`
- [ ] Evaluation harness (`HARNESS.md`) for measuring itinerary quality
- [ ] Multi-city trip planning support
- [ ] Saved itineraries / trip history (via localStorage)
- [ ] Currency conversion in the booking desk
- [ ] Broader IATA-code map for country-level destinations
- [ ] Streaming responses for faster perceived latency
- [ ] Response caching in Cloudflare KV for repeated prompts

---

## 📈 Worker Version History

| Version | Highlights |
|---|---|
| **v2.1.1** | Proper log severity levels, trailing-slash tolerance on `/health`, stricter GET routing |
| **v2.1.0** | `/health` endpoint, latency + version metadata, CORS allowlist, payload limits, structured logging |
| **v2.0.0** | Real Groq model IDs, dynamic date injection, message-shape validation, upstream timeouts, rate-limit surfacing |
| **v1.0.0** | Initial dual-engine router (Gemini primary + Groq fallback) |

---

## 👤 About

**James Earl C. Felipe**
AI Solutions Designer · Enterprise IT Applications Specialist

Focused on AI agent development, workflow automation, and enterprise support platforms. VoyageFlow is part of a broader portfolio exploring conversational AI, evaluation harnesses, and multi-provider LLM routing.

🔗 https://linkedin.com/in/james-earl-felipe-13359665 · 📧 james75x2@gmail.com

---

## 📄 License

MIT License — Copyright (c) 2026 James Earl C. Felipe.

Free to use, modify, and share with attribution.

See ./LICENSE for the full text.

---

*© 2026 James Earl C. Felipe. Built with Cloudflare Workers, Gemini, and Groq. Designed for travellers.*
