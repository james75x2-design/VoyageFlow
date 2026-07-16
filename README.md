# VoyageFlow — AI Travel Concierge ✈️

**A free, zero-friction AI travel concierge — no sign-up, instant itineraries, a ready-to-book desk for flights/hotels/tours/insurance, and a grounded RAG mode for factual Q&A with visible citations.**

<p>
  <img src="https://img.shields.io/badge/status-live-brightgreen" alt="Status">
  <img src="https://img.shields.io/badge/worker-v2.2.0-blue" alt="Worker Version">
  <img src="https://img.shields.io/badge/RAG-100%25%20eval-brightgreen" alt="RAG Eval">
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
- [🧠 RAG Mode (v2.2.0)](#-rag-mode-v220)
- [🤖 AI Backend — Dual-Engine Routing](#-ai-backend--dual-engine-routing-v220)
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

As of **v2.2.0**, VoyageFlow is a **two-mode AI travel assistant**:

- **✈️ Plan a trip** — the original itinerary planner + Booking Desk.
- **❓ Ask VoyageFlow** — factual Q&A grounded in a curated travel knowledge base with visible citations, prompt-injection defense, and out-of-scope refusal.

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

### 4. RAG Mode — Grounded Q&A with Citations *(v2.2.0)*

Toggle to **❓ Ask VoyageFlow** to ask factual questions about the product itself. Every answer is grounded in the travel knowledge base and shows a **Sources** strip with the exact chunk IDs used.

<img src="https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/screenshots/04-rag-mode-citations.png" alt="RAG mode answer with Sources strip">

---

## 🏗️ Architecture

![Architecture diagram](https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/architecture.png)

**Text version (for accessibility / terminal readers):**

```text
┌─────────────────────┐        ┌─────────────────────────────┐        ┌──────────────────┐
│  index.html         │        │  Cloudflare Worker (v2.2.0) │        │  Google Gemini   │
│  (GitHub Pages)     │  POST  │  voyageflow_backend_        │  API   │  gemini-2.5-flash│
│  Vanilla JS + CSS   │ ─────▶ │  worker.js                  │ ─────▶ │  (Primary)       │
│                     │        │                             │        └──────────────────┘
│  • Mode toggle      │        │  ┌─── mode: "chat" ───┐     │                 │
│  • Chat UI          │        │  │ itinerary + JSON   │     │        Fallback │ on error /
│  • Cookie memory    │        │  └────────────────────┘     │                 │ rate-limit
│  • Booking desk     │        │  ┌─── mode: "rag" ────┐     │                 ▼
│  • Sources strip    │  JSON  │  │ retrieve top-5     │     │        ┌──────────────────┐
│  • Suggestion chips │ ◀───── │  │ citation-enforced  │     │  API   │  Groq            │
└─────────────────────┘        │  │ prompt             │     │ ─────▶ │  gpt-oss-120b →  │
                               │  └────────────────────┘     │        │  llama-3.3-70b   │
                               │                             │        └──────────────────┘
                               │  Embedded chunks:           │
                               │  data/index/worker-chunks.js│
                               │                             │
                               │  • CORS allowlist           │
                               │  • Payload validation       │
                               │  • Dynamic date injection   │
                               │  • Timeout protection       │
                               │  • Structured logging       │
                               │  • Latency + version meta   │
                               │  • /health endpoint         │
                               └─────────────────────────────┘
```

**Data flow — Chat mode**

1. User sends a message from `index.html` (toggle set to **Plan a trip**).
2. Frontend POSTs `{ messages }` to the Cloudflare Worker.
3. Worker validates payload, injects today's date into the system prompt, tries Gemini first, falls back through the Groq chain on failure.
4. Response returns as JSON with `reply` + `meta` (model, worker version, latency).
5. Frontend parses the embedded booking JSON block and renders a Premium Travel Booking Desk.

**Data flow — RAG mode**

1. User sends a message from `index.html` (toggle set to **Ask VoyageFlow**).
2. Frontend POSTs `{ mode: "rag", messages }` to the Worker.
3. Worker retrieves the top-5 relevant chunks from the embedded travel knowledge base via keyword scoring.
4. Worker builds a citation-enforcing prompt with the retrieved context and calls Gemini (with Groq fallback).
5. Worker post-processes the LLM output — parses the RAG JSON, filters any hallucinated citation IDs against the retrieved set, and returns `{ answer_markdown, citations, unanswered, meta }`.
6. Frontend strips inline `[chunk_id]` markers for clean prose and renders a **Sources** strip below the answer.

---

## ✨ Features

- **Two-mode UI** — toggle between **Plan a trip** (chat/booking) and **Ask VoyageFlow** (RAG Q&A).
- **Conversational trip planning** — the assistant asks for missing details (destination, dates, party size) instead of guessing.
- **Luxury day-by-day itineraries** — written in a premium travel-curator voice before any booking data is generated.
- **Premium Travel Booking Desk** — auto-generated card with deep links to:
  - 🏨 **Booking.com** — pre-filled with check-in/out dates, adult/room counts, and child ages
  - ✈️ **Google Flights** — pre-filled with an NLP-style query for destination, dates, and travelers
  - 🎟️ **GetYourGuide** — search results for real tours and activities
  - 🛡️ **VisitorsCoverage** — travel insurance, destination-aware
- **Grounded factual Q&A** — RAG mode returns answers with visible citations, refuses out-of-scope questions, and defends against prompt injection.
- **Dual-engine AI routing** — Gemini primary; on error or rate-limit, the worker silently retries through a Groq fallback chain.
- **IATA-aware flight routing** — Maldives → MLE, Bali → DPS, Hawaii → HNL, Ibiza → IBZ to avoid Google Flights map-view fallback.
- **Cookie-based memory** — remembers the user's last destination and personalizes the welcome screen and suggestion chips.
- **Dynamic seasonal suggestions** — Tokyo Spring, Paris Summer, Bali Escape, etc., with date ranges auto-computed from today's date.
- **Secure backend** — API keys live only in encrypted Cloudflare Worker secrets, never shipped to the browser.

---

## 🧠 RAG Mode (v2.2.0)

VoyageFlow supports two interaction modes via a toggle in the UI:

### ✈️ Plan a trip (chat mode)
The original itinerary planner — describe your trip, and VoyageFlow generates a bespoke day-by-day guide plus a Booking Demand Card with pre-filled search URLs for hotels, flights, and experiences.

### ❓ Ask VoyageFlow (RAG mode)
Ask factual questions about VoyageFlow itself — booking policies, verification guidance, destination coverage. Answers are grounded in a curated travel knowledge base with visible citations.

**How it works:**

- **12 chunks embedded in the Cloudflare Worker** — no external vector database, sub-100 KiB bundle.
- **Keyword-scored retrieval** — top-5 chunks passed to the LLM.
- **Citation enforcement** — hallucinated chunk IDs filtered against the retrieved set before response.
- **Prompt injection defense** — verified in eval `vf-eval-006`.
- **Out-of-scope refusal** — verified in evals `vf-eval-008` through `vf-eval-010`.
- **Fallback answer** — when no relevant chunks are retrieved, the Worker short-circuits with a graceful "not enough evidence" response (no LLM call).

**Evaluation baseline:**

| Metric | Result |
|---|---|
| Retrieval pass rate | **10/10** |
| Answer pass rate | **10/10** |
| Overall | **100%** |

**Run the eval harness yourself:**

```bash
node evals/eval.mjs
```

Output writes to `evals/eval-report.json` with per-test retrieval + answer scoring, latency, and citation validation.

**Rebuild the embedded knowledge base after editing `data/kb/*.md`:**

```bash
node src/rag/ingest-and-chunk.mjs
node scripts/build-worker-chunks.mjs
npx wrangler deploy
```

---

## 🤖 AI Backend — Dual-Engine Routing (v2.2.0)

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
    "version": "2.2.0",
    "latency_ms": 842
  }
}
```

**Worker capabilities (v2.2.0):**

- **`mode: "rag"` branch** — retrieves 12 embedded travel chunks, builds citation-enforcing prompt, filters hallucinated citations
- Reuses same keyword-scoring logic as local `src/rag/retrieve.mjs` so eval and production stay aligned
- CORS allowlist (locked to GitHub Pages + localhost dev + Codespaces preview URLs)
- Payload validation (message count + text length limits)
- Dynamic date injection (system prompt is rebuilt per request)
- Upstream timeouts (25s AbortController on Gemini + Groq)
- Rate-limit surfacing (429 bubbles up to the frontend)
- Structured JSON logging (severity-aware for Cloudflare log search, tagged with `mode`)
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
  "version": "2.2.0",
  "timestamp": "2026-07-15T21:17:34.000Z"
}
```

### `POST /` — Chat mode (default)

Main conversational endpoint. Accepts a `messages` array in Gemini format. When `mode` is omitted or not `"rag"`, the Worker runs the original itinerary/booking flow.

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
    "version": "2.2.0",
    "latency_ms": 842
  }
}
```

### `POST /` — RAG mode

Set `mode: "rag"` in the body to route through the retrieval-augmented pipeline.

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "rag",
    "messages": [
      {
        "role": "user",
        "parts": [{ "text": "What booking links can VoyageFlow generate?" }]
      }
    ]
  }'
```

Success response (200):

```json
{
  "answer_markdown": "VoyageFlow generates structured booking links for hotels and flights [voyageflow-overview::001]…",
  "citations": [
    {
      "claim": "VoyageFlow generates structured booking links for hotels and flights.",
      "chunk_ids": ["voyageflow-overview::001"]
    }
  ],
  "unanswered": false,
  "meta": {
    "mode": "rag",
    "model": "gemini-2.5-flash",
    "version": "2.2.0",
    "latency_ms": 3237,
    "chunks_used": [
      { "chunk_id": "voyageflow-overview::001", "section": "What Is VoyageFlow?", "score": 15 }
    ]
  }
}
```

When no relevant chunks are retrieved (or the LLM lacks evidence), the Worker returns `unanswered: true` with the fallback answer and an empty `citations` array.

### Error responses

| Status | Meaning |
|---|---|
| `400` | Malformed payload (missing/invalid messages array, missing query in RAG mode) |
| `404` | Unknown path |
| `405` | Wrong HTTP method |
| `429` | Rate limited by upstream provider |
| `502` | All AI providers failed |

**Payload limits:**
- Max 30 messages per conversation
- Max 8,000 characters per message

**CORS:** Locked to GitHub Pages + localhost + Codespaces preview origins. Update `ALLOWED_ORIGINS` in the worker if you fork.

---

## 🏗️ Repository Structure

```text
VoyageFlow/
├── index.html                          # Frontend — single-file static web client with mode toggle
├── voyageflow_backend_worker.js        # Cloudflare Worker — Gemini + Groq gateway + mode:rag (v2.2.0)
├── wrangler.toml                       # Wrangler CLI deploy configuration
├── package.json                        # Node deps (Wrangler dev dependency)
├── README.md                           # This file
├── LICENSE                             # MIT
├── data/
│   ├── kb/                             # Curated travel knowledge base (Markdown source)
│   │   ├── voyageflow-overview.md
│   │   ├── tokyo-spring-guide.md
│   │   └── booking-policies.md
│   └── index/
│       ├── chunks.jsonl                # Chunked KB with metadata (from ingestion)
│       ├── raw_docs.jsonl              # Raw doc catalog (hashes, char counts)
│       └── worker-chunks.js            # Chunks embedded as an ES module for the Worker
├── src/rag/
│   ├── ingest-and-chunk.mjs            # Reads data/kb/*, chunks it, writes to data/index/
│   ├── retrieve.mjs                    # Keyword-scoring retriever (also CLI)
│   └── answer-with-context.mjs         # Local RAG pipeline (calls Worker's mode:rag endpoint)
├── evals/
│   ├── eval-data.json                  # 10 test cases (answerable, prompt-injection, out-of-scope)
│   ├── eval.mjs                        # Evaluation harness (retrieval + answer scoring)
│   └── eval-report.json                # Latest run output
├── scripts/
│   └── build-worker-chunks.mjs         # Regenerates data/index/worker-chunks.js from chunks.jsonl
└── docs/
    ├── screenshots/                    # Product screenshots
    └── architecture.png                # Architecture diagram
```

Deployed via **GitHub Pages** from the `main` branch. Backend runs on **Cloudflare Workers** at `voyageflow.james75x2.workers.dev` via **Wrangler CLI**.

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

If you cloned the repo, Wrangler is already listed in `package.json` as a dev dependency:

```bash
npm install
npx wrangler login
```

Then run the worker locally with hot reload on `http://localhost:8787`:

```bash
npx wrangler dev
```

You can test it directly with curl:

```bash
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"mode":"rag","messages":[{"role":"user","parts":[{"text":"What booking links can VoyageFlow generate?"}]}]}'
```

### Run the RAG evaluation harness

```bash
node evals/eval.mjs
```

Output prints per-test results and writes a full report to `evals/eval-report.json`.

### Rebuild the embedded knowledge base

After editing files under `data/kb/`:

```bash
node src/rag/ingest-and-chunk.mjs
node scripts/build-worker-chunks.mjs
```

Then redeploy:

```bash
npx wrangler deploy
```

---

## ⚡ Deployment Guide

### Step 1 — Deploy the Cloudflare Worker Backend

**Option A — Wrangler CLI (recommended)**

1. Install Wrangler as a dev dependency: `npm install --save-dev wrangler`
2. Authenticate: `npx wrangler login` (or `export CLOUDFLARE_API_TOKEN=<your-token>`)
3. Push API keys as secrets:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put GROQ_API_KEY
   ```
4. Deploy: `npx wrangler deploy`
5. Verify: `curl https://<your-worker>.workers.dev/health`

**Option B — Cloudflare Dashboard**

1. Sign up at [cloudflare.com](https://workers.cloudflare.com) (free tier is more than enough).
2. Create a new Worker (e.g. `voyageflow`).
3. Paste the contents of `voyageflow_backend_worker.js` into the Worker editor.
   > **Note:** The Dashboard editor is single-file only. Since v2.2.0 imports `TRAVEL_CHUNKS` from `data/index/worker-chunks.js`, you'll need to inline that import for Dashboard deploys, or use Wrangler CLI (recommended).
4. Add secrets under **Settings → Variables and Secrets**:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
   - `GROQ_API_KEY` — from [Groq Console](https://console.groq.com)
5. **Save and Deploy**.

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
- **RAG citation enforcement** — hallucinated chunk IDs are filtered against the retrieved set before every response, blocking the model from inventing sources.
- **Prompt injection defense** — verified in eval harness (`vf-eval-006`).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Backend | Cloudflare Workers (ES Module) |
| Deploy | Wrangler CLI + `wrangler.toml` |
| AI Primary | Google Gemini 2.5 Flash |
| AI Fallback | Groq (gpt-oss-120b → llama-3.3-70b-versatile) |
| RAG Retrieval | Keyword scoring (embedded chunks, no external vector DB) |
| Eval Harness | Node.js — retrieval + answer scoring, per-test JSON reports |
| Hosting | GitHub Pages (frontend) + Cloudflare Workers (backend) |
| Memory | HTTP cookies (client-side, last destination only) |
| Booking Partners | Booking.com, Google Flights, GetYourGuide, VisitorsCoverage |

---

## 🗺️ Roadmap

**Completed**
- [x] Screenshots + architecture diagram in `docs/`
- [x] Evaluation harness for retrieval + answer quality (10 test cases, 100% baseline)
- [x] RAG mode with citation enforcement (v2.2.0)
- [x] Two-mode UI (Plan / Ask) with mode toggle
- [x] Wrangler CLI deploy pipeline

**In progress / upcoming**
- [ ] Hybrid retrieval — vector similarity + keyword score fusion
- [ ] Cross-encoder reranker over top-20 candidates
- [ ] Intent classifier — auto-route between chat and RAG modes
- [ ] Real-time flight prices via Duffel or Kiwi.com Tequila API
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
| **v2.2.0** | **RAG mode** (`mode: "rag"` branch), embedded travel knowledge base (12 chunks), citation enforcement, prompt-injection defense, out-of-scope refusal, Wrangler CLI deploy migration, 100% eval pass rate baseline |
| **v2.1.1** | Proper log severity levels, trailing-slash tolerance on `/health`, stricter GET routing |
| **v2.1.0** | `/health` endpoint, latency + version metadata, CORS allowlist, payload limits, structured logging |
| **v2.0.0** | Real Groq model IDs, dynamic date injection, message-shape validation, upstream timeouts, rate-limit surfacing |
| **v1.0.0** | Initial dual-engine router (Gemini primary + Groq fallback) |

---

## 👤 About

**James Earl C. Felipe**
AI Solutions Designer · Enterprise IT Applications Specialist

Focused on AI agent development, workflow automation, and enterprise support platforms. VoyageFlow is part of a broader portfolio exploring conversational AI, retrieval-augmented generation, evaluation harnesses, and multi-provider LLM routing.

🔗 https://linkedin.com/in/james-earl-felipe-13359665 · 📧 james75x2@gmail.com

---

## 📄 License

MIT License — Copyright (c) 2026 James Earl C. Felipe.

Free to use, modify, and share with attribution.

See ./LICENSE for the full text.

---

*© 2026 James Earl C. Felipe. Built with Cloudflare Workers, Gemini, and Groq. Designed for travellers.*
