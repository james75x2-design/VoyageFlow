# VoyageFlow — AI Travel Concierge ✈️
**A free, zero-friction AI travel concierge — no sign-up, instant itineraries, and a ready-to-book desk for flights, hotels, tours, and insurance.**

![Status](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-green) ![Powered by Gemini + Groq](https://img.shields.io/badge/powered%20by-Gemini%20%2B%20Groq-orange)

---

## What Is VoyageFlow?

VoyageFlow turns a normal conversation into a complete travel plan: a personalized, day-by-day itinerary written in a luxury-concierge voice, followed by a structured booking summary with direct links to search flights, hotels, tours, and insurance — all pre-filled with the traveler's exact dates, destination, and party size.

No sign-up. No API key required from the user. Just start planning.

---

## 🚀 Live Demo

👉 **[Try VoyageFlow Live](https://your-live-link-here)**
*(update once the GitHub Pages URL is finalized)*

---

## ✨ Features

- **Conversational trip planning** — the assistant asks for missing details (destination, dates, party size) instead of guessing
- **Day-by-day itineraries** — written in a premium travel-curator voice before any booking data is generated
- **Premium Travel Booking Desk** — auto-generated card with deep links to:
  - 🏨 **Booking.com** (hotels) — pre-filled with check-in/out dates, adult/room counts, and child ages
  - ✈️ **Google Flights** — pre-filled with an NLP-style query for origin, destination, dates, and travelers
  - 🎟️ **GetYourGuide** — embedded live widget showing real tours and activities for the destination
  - 🛡️ **VisitorsCoverage** — travel insurance, destination-aware
- **Dual-engine AI routing** — Gemini is primary; if it fails or rate-limits, the worker silently retries on Groq
- **Cookie-based memory** — remembers the user's last destination across sessions to personalize suggested prompts
- **Secure backend** — API keys live only in Cloudflare Worker secrets, never shipped to the browser

---

## 🏗️ Repository Structure

```
wricore-workspace/
├── voyageflow_frontend_client.html   # Frontend — single-file static web client
├── voyageflow_backend_worker.js      # Cloudflare Worker — Gemini + Groq gateway with fallback
├── README.md                         # This file
└── .gitignore
```

> Deployed via GitHub Pages, pointed directly at the `gemini-and-groq-apis` branch (repo: `james75x2-design/wricore-workspace`).

---

## 🤖 AI Backend — Dual-Engine Routing

VoyageFlow's Cloudflare Worker (ES Module format) tries Gemini first and falls back to Groq only if Gemini fails:

1. **Primary — Gemini (`gemini-2.5-flash`)**: fast, large-context reasoning for itinerary generation and structured data extraction
2. **Fallback — Groq (`openai/gpt-oss-120b`)**: kicks in automatically on Gemini errors or rate limits; reasoning-capable, high-quality structured output
3. **Secondary fallback — Groq (`qwen/qwen3.6-27b`)**: activates if `gpt-oss-120b` also fails; fast and reliable for structured JSON

The fallback order is controlled by the `GROQ_FALLBACK_MODELS` array at the top of `voyageflow_backend_worker.js` — reorder or swap models there without touching anything else. The worker logs which engine answered each request so you can monitor fallback frequency in the Cloudflare dashboard.

> **Note:** the ES Module format (`export default { fetch(request, env) }`) is required — legacy Service Worker syntax doesn't expose secrets correctly through `env`.

---

## ⚡ Deployment Guide

### Step 1 — Deploy the Cloudflare Worker Backend

1. Sign up free at [cloudflare.com](https://workers.cloudflare.com)
2. Create a new Worker (e.g. `voyageflow-api`)
3. Paste the contents of `voyageflow_backend_worker.js` into the Worker editor
4. Go to **Settings → Variables and Secrets → Add Variable** and add both:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
   - `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com)
5. Save and Deploy
6. Copy your `.workers.dev` URL

### Step 2 — Configure the Frontend

1. Open `voyageflow_frontend_client.html`
2. Find `const WORKER_URL = 'https://your-worker-subdomain.workers.dev'`
3. Replace with your live Cloudflare Worker URL

### Step 3 — Deploy the Frontend

GitHub Pages is set to serve directly from the `gemini-and-groq-apis` branch — no merge to `main` required. Push changes to that branch and Pages picks them up automatically.

### Step 4 — Configure Affiliate / Partner IDs *(Optional)*

To earn commissions from bookings, open the frontend's `createBookingDemandCard()` function and replace the placeholder IDs:

- `BOOKING_AID` — [Booking.com Affiliate Partner Hub](https://partners.booking.com)
- `GYG_PARTNER_ID` — [GetYourGuide Partner Program](https://partner.getyourguide.com)
- `VISITORS_COVERAGE_ID` — [VisitorsCoverage Partners](https://www.visitorscoverage.com)

---

## 🔒 Security

- API keys are stored as encrypted Cloudflare Worker secrets, accessed only via the `env` parameter
- Keys are never exposed to the frontend or visible in browser source
- All AI calls are proxied through the Cloudflare Worker
- No user conversation data is stored or logged server-side

---

## 🛠️ How It's Built

- **Frontend** — single-file HTML with vanilla JavaScript, no framework dependencies
- **Backend** — Cloudflare Worker (ES Module, serverless, generous free tier)
- **AI** — Gemini primary / Groq fallback, routed transparently to the user
- **Memory** — cookie-based client memory for returning users
- **Booking** — dynamically generated booking desk: Booking.com (hotels), Google Flights (flights), GetYourGuide embedded widget (experiences), VisitorsCoverage (insurance)

---

## 🗺️ Roadmap

- [ ] Mobile-responsive layout polish
- [ ] Multi-city trip planning support
- [ ] Saved itineraries / trip history
- [ ] Currency conversion
- [ ] Real IATA-code mapping for broad regions (Maldives → MLE, Bali → DPS, etc.) in the flight query builder

---

## 👤 About

**James Earl C. Felipe**
AI Solutions Designer | Enterprise IT Professional

🔗 [LinkedIn](https://linkedin.com/in/james-earl-felipe-13359665) · 📧 james75x2@gmail.com

---

## 📄 License

MIT License — Copyright (c) 2026 James Earl C. Felipe

Free to use, modify, and share with attribution.

---

*© 2026 James Earl C. Felipe. Built with Claude and Gemini. Designed for travellers.*
