# VoyageFlow — AI Travel Concierge ✈️

**A free, zero-friction AI travel concierge — no sign-up, instant itineraries, a ready-to-book desk for flights/hotels/tours/insurance, and a grounded RAG mode with cross-encoder reranking for factual Q&A.**

<p>
  <img src="https://img.shields.io/badge/status-live-brightgreen" alt="Status">
  <img src="https://img.shields.io/badge/worker-v2.4.0-blue" alt="Worker Version">
  <img src="https://img.shields.io/badge/RAG-hybrid%20+%20reranker-brightgreen" alt="RAG">
  <img src="https://img.shields.io/badge/eval-100%25%20pass-brightgreen" alt="Eval">
  <img src="https://img.shields.io/badge/parity-worker%20mode%3Arag-brightgreen" alt="Parity">
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
- [🧠 RAG Mode (v2.2.0 → v2.4.0)](#-rag-mode-v220--v240)
- [🎯 Cross-encoder Reranker (v2.4.0)](#-cross-encoder-reranker-v240)
- [📊 Evaluation](#-evaluation)
- [🤖 AI Backend — Dual-Engine Routing](#-ai-backend--dual-engine-routing-v240)
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

As of **v2.4.0**, VoyageFlow is a **two-mode AI travel assistant with production-grade RAG**:

- **✈️ Plan a trip** — the original itinerary planner + Booking Desk.
- **❓ Ask VoyageFlow** — factual Q&A grounded in a curated travel knowledge base with hybrid retrieval + cross-encoder reranking, visible citations, prompt-injection defense, and scoped out-of-scope refusal.

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

**Data flow — Chat mode**

1. User sends a message from `index.html` (toggle set to **Plan a trip**).
2. Frontend POSTs `{ messages }` to the Cloudflare Worker.
3. Worker validates payload, injects today's date into the system prompt, tries Gemini first, falls back through the Groq chain on failure.
4. Response returns as JSON with `reply` + `meta` (model, worker version, latency).
5. Frontend parses the embedded booking JSON block and renders a Premium Travel Booking Desk.

**Data flow — RAG mode (v2.4.0)**

1. User sends a message from `index.html` (toggle set to **Ask VoyageFlow**).
2. Frontend POSTs `{ mode: "rag", messages }` to the Worker.
3. Worker runs **hybrid retrieval** — keyword + vector cosine similarity against 12 embedded travel chunks — and returns top-20 candidates.
4. Worker runs **cross-encoder reranker** (`@cf/baai/bge-reranker-base`) to rescore candidates and pick the top-5.
5. Citation-enforced prompt sent to Gemini (with Groq fallback).
6. Response normalized into `{ answer_markdown, citations, unanswered, meta }`.
7. UI strips inline `[chunk_id]` markers, renders "Sources:" strip below.

**Data flow — Eval harness (production-parity)**

1. `evals/eval.mjs` iterates test cases from `evals/eval-data.json`.
2. Each test calls `answerWithContext(query)` — same entry point production uses.
3. `answerWithContext` sends `{ mode: "rag", messages }` to the live Worker.
4. Response includes `retrieval_signal` + `ranking_signal` + `chunks_used` with `rerank_score`.
5. Eval captures pass/fail + failure category + which code path each test exercised.

---

## ✨ Features

- **Two-mode UI** — toggle between **Plan a trip** (chat/booking) and **Ask VoyageFlow** (RAG Q&A).
- **Conversational trip planning** — the assistant asks for missing details instead of guessing.
- **Luxury day-by-day itineraries** — written in a premium travel-curator voice.
- **Premium Travel Booking Desk** — auto-generated card with deep links to Booking.com, Google Flights, GetYourGuide, VisitorsCoverage.
- **Grounded factual Q&A (v2.2.0+)** — RAG mode returns answers with visible citations, refuses out-of-scope questions, and defends against prompt injection.
- **Cross-encoder reranker (v2.4.0)** — refines top-20 hybrid candidates to top-5 for higher answer quality.
- **Eval-to-production parity (v2.4.0)** — eval harness exercises the exact Worker code path production users hit.
- **Pipeline telemetry** — eval reports show which pipeline, retrieval signal, and ranking signal each test used.
- **Dual-engine AI routing** — Gemini primary; on error or rate-limit, silently retries through Groq fallback chain.
- **IATA-aware flight routing** — Maldives → MLE, Bali → DPS, Hawaii → HNL, Ibiza → IBZ.
- **Cookie-based memory** — remembers last destination and personalizes welcome + suggestions.
- **Dynamic seasonal suggestions** — Tokyo Spring, Paris Summer, Bali Escape, etc.
- **Secure backend** — API keys live only in encrypted Cloudflare Worker secrets.

---

## 🧠 RAG Mode (v2.2.0 → v2.4.0)

VoyageFlow supports two interaction modes via a toggle in the UI:

### ✈️ Plan a trip (chat mode)
The original itinerary planner — describe your trip, and VoyageFlow generates a bespoke day-by-day guide plus a Booking Demand Card with pre-filled search URLs for hotels, flights, and experiences.

### ❓ Ask VoyageFlow (RAG mode)
Ask factual questions about VoyageFlow itself — booking policies, verification guidance, destination coverage. Answers are grounded in a curated travel knowledge base with visible citations.

**How it works (v2.4.0):**

- **12 chunks embedded in the Cloudflare Worker** — no external vector database, sub-100 KiB bundle.
- **Hybrid retrieval** — keyword scoring + vector cosine similarity via `@cf/baai/bge-small-en-v1.5`, fused 0.5/0.5.
- **Cross-encoder reranker** — `@cf/baai/bge-reranker-base` refines top-20 hybrid candidates to top-5 for LLM context.
- **Citation enforcement** — hallucinated chunk IDs filtered against the retrieved set before response.
- **Prompt injection defense** — verified in eval `vf-eval-006`.
- **Out-of-scope refusal** — verified in evals `vf-eval-008` through `vf-eval-010`.
- **Fallback answer** — when no relevant chunks are retrieved, the Worker short-circuits with a graceful "not enough evidence" response.
- **Graceful fallbacks** — vector → keyword-only, reranker → hybrid_fusion, if either AI call fails.

---

## 🎯 Cross-encoder Reranker (v2.4.0)

**What changed in Week 4:**

Before v2.4.0, RAG mode used hybrid retrieval alone — top-5 chunks by weighted keyword + vector score fusion. Week 4 adds a **cross-encoder reranker pass** on top:

```
Query
  ↓
Hybrid retrieval → top-20 candidate pool
  ↓
@cf/baai/bge-reranker-base → rescore candidates against query
  ↓
Top-5 (reranker order) → LLM prompt with citation enforcement
  ↓
Response with rerank_score in chunks_used, ranking_signal in meta
```

**Two Cloudflare Workers AI models running natively:**

| Model | Purpose |
|---|---|
| `@cf/baai/bge-small-en-v1.5` | 384-dim query + chunk embeddings |
| `@cf/baai/bge-reranker-base` | Cross-encoder rerank scoring |

**Graceful fallback ladder:**
- If embedding call fails → falls back to keyword-only retrieval
- If reranker call fails → falls back to hybrid fusion ranking (skips rerank)
- If Worker unreachable → local pipeline falls back to keyword-only + Worker chat mode

Each fallback is tagged in structured logs (`retrieval_signal`, `ranking_signal`) so regressions surface immediately in eval reports.

---

## 📊 Evaluation

**100% pass rate** on the local eval harness (15 test cases including semantic queries, prompt injection, and out-of-scope refusal):

| Metric | Week 2 baseline | Week 3 (hybrid) | Week 4 (reranker) |
|---|---|---|---|
| Total tests | 15 | 15 | 15 |
| Passed | 12 | 13 | **15** |
| Retrieval passed | 13 | 13 | **15** |
| Answer passed | 14 | 15 | **15** |
| Overall pass rate | 80% | 87% | **100%** (+20pp) |

### Week 4 telemetry (all 15 tests)

```
Pipelines Used
--------------
  worker_rag: 15

Retrieval Signals
-----------------
  hybrid: 15

Ranking Signals
---------------
  reranker: 15

Failure Categories
------------------
  pass: 15
```

**Every single test exercises the full production pipeline** (hybrid retrieval → top-20 → reranker → top-5 → LLM) and passes.

### Run the eval harness yourself

```bash
node evals/eval.mjs
```

Output writes to `evals/eval-report.json` with per-test retrieval + answer scoring, latency, citation validation, pipeline/signal tags, and failure category.

**Force local hybrid path** (for A/B testing or when the Worker is unreachable):

```bash
USE_WORKER_RAG=false node evals/eval.mjs
```

**Rebuild the embedded knowledge base after editing `data/kb/*.md`:**

```bash
node src/rag/ingest-and-chunk.mjs
node scripts/embed-chunks.mjs
node scripts/build-worker-chunks.mjs
npx wrangler deploy
```

Reports archived: `eval-report-week2-baseline.json`, `eval-report-week3-hybrid.json`, `eval-report-pre-week4-baseline.json`, `eval-report-week4-reranker.json`.

---

## 🤖 AI Backend — Dual-Engine Routing (v2.4.0)

The Cloudflare Worker is a hardened ES-Module gateway with the following behavior:

| Layer | Provider | Model | Role |
|---|---|---|---|
| Primary | Google Gemini | `gemini-2.5-flash` | Fast, large-context reasoning for itinerary + structured extraction |
| Fallback 1 | Groq | `openai/gpt-oss-120b` | Reasoning-capable, high-quality structured output |
| Fallback 2 | Groq | `llama-3.3-70b-versatile` | Fast and reliable structured output |

Fallback order is controlled by the `GROQ_FALLBACK_MODELS` array in `voyageflow_backend_worker.js`. Every successful response includes a `meta` block:

```json
{
  "reply": "…luxury itinerary + JSON block…",
  "meta": {
    "model": "gemini-2.5-flash",
    "version": "2.4.0",
    "latency_ms": 842
  }
}
```

**Worker capabilities (v2.4.0):**

- **`mode: "rag"` branch** — retrieves 12 embedded chunks, hybrid retrieval, cross-encoder reranker, citation-enforcing prompt
- **Reranker pipeline** — top-20 candidates → `@cf/baai/bge-reranker-base` → top-5 for LLM
- **Rich telemetry in response** — `chunks_used` includes `keyword_score`, `vector_score`, `rerank_score`, `retrieval_signal`; `meta` includes `ranking_signal` + `retrieval_signal`
- **Structured logs** tag `retrieval_signal` and `ranking_signal`
- CORS allowlist (locked to GitHub Pages + localhost dev + Codespaces preview URLs)
- Payload validation (message count + text length limits)
- Dynamic date injection (system prompt is rebuilt per request)
- Upstream timeouts (25s AbortController on Gemini + Groq)
- Rate-limit surfacing (429 bubbles up to the frontend)
- `/health` endpoint (uptime-monitor friendly, trailing-slash tolerant)
- Version + latency metrics on every response

---

## 📡 API Reference

The Cloudflare Worker exposes 2 endpoints:

### `GET /health`

Returns the worker's operational status.

```bash
curl https://voyageflow.james75x2.workers.dev/health
```

Response:
```json
{
  "status": "ok",
  "service": "voyageflow-worker",
  "version": "2.4.0",
  "timestamp": "2026-07-23T05:30:20.249Z"
}
```

### `POST /` — Chat mode (default)

Main conversational endpoint. When `mode` is omitted or not `"rag"`, the Worker runs the original itinerary/booking flow.

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "parts": [{"text": "Plan a 5-day trip to Tokyo for 2 adults in December."}]}
    ]
  }'
```

Success response (200):
```json
{
  "reply": "…luxury itinerary + embedded JSON booking block…",
  "meta": { "model": "gemini-2.5-flash", "version": "2.4.0", "latency_ms": 842 }
}
```

### `POST /` — RAG mode *(v2.4.0)*

Set `mode: "rag"` to route through hybrid retrieval + reranker + citation-enforced generation.

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "rag",
    "messages": [
      {"role": "user", "parts": [{"text": "What booking links can VoyageFlow generate?"}]}
    ]
  }'
```

Success response (200) *(v2.4.0 — includes reranker fields)*:
```json
{
  "answer_markdown": "VoyageFlow generates structured booking links... [voyageflow-overview::003]",
  "citations": [
    { "claim": "...", "chunk_ids": ["voyageflow-overview::003"] }
  ],
  "unanswered": false,
  "meta": {
    "mode": "rag",
    "model": "gemini-2.5-flash",
    "version": "2.4.0",
    "latency_ms": 5060,
    "ranking_signal": "reranker",
    "retrieval_signal": "hybrid",
    "chunks_used": [
      {
        "chunk_id": "booking-policies::001",
        "section": "What VoyageFlow Can Guarantee",
        "score": 0.9434,
        "keyword_score": 16,
        "vector_score": 0.7631,
        "rerank_score": 0.9992,
        "retrieval_signal": "hybrid"
      }
    ]
  }
}
```

### Error responses

| Status | Meaning |
|---|---|
| `400` | Malformed payload |
| `404` | Unknown path |
| `405` | Wrong HTTP method |
| `429` | Rate limited by upstream provider |
| `502` | All AI providers failed |

**Payload limits:** Max 30 messages per conversation, max 8,000 characters per message.

**CORS:** Locked to GitHub Pages + localhost + Codespaces preview origins.

---

## 🏗️ Repository Structure

```text
VoyageFlow/
├── index.html                          # Frontend — React app with mode toggle
├── voyageflow_backend_worker.js        # Cloudflare Worker v2.4.0
├── wrangler.toml                       # Wrangler CLI config with [ai] binding
├── package.json                        # Node deps (Wrangler dev)
├── README.md                           # This file
├── LICENSE                             # MIT
├── data/
│   ├── kb/                             # Curated travel knowledge base (Markdown)
│   └── index/
│       ├── chunks.jsonl                # Chunked KB with metadata
│       ├── raw_docs.jsonl              # Raw doc catalog
│       └── worker-chunks.js            # Chunks + embeddings inlined for Worker
├── src/rag/
│   ├── ingest-and-chunk.mjs            # KB ingestion
│   ├── retrieve.mjs                    # Keyword retriever (local dev)
│   └── answer-with-context.mjs         # Worker mode:rag primary, local fallback
├── evals/
│   ├── eval-data.json                  # 15 test cases (semantic + injection + OOS)
│   ├── eval.mjs                        # Eval harness with failure categorization
│   └── eval-report*.json               # Archived reports per week
├── scripts/
│   ├── embed-chunks.mjs                # Batch-generate embeddings via Cloudflare AI
│   └── build-worker-chunks.mjs         # Rebuild worker-chunks.js
└── docs/
    ├── screenshots/                    # Product screenshots
    └── architecture.png                # Architecture diagram
```

Deployed via **GitHub Pages** from `main`. Backend runs on **Cloudflare Workers** at `voyageflow.james75x2.workers.dev` via **Wrangler CLI**.

---

## 💻 Local Development

### Test the frontend locally

```bash
git clone https://github.com/james75x2-design/VoyageFlow.git
cd VoyageFlow
python -m http.server 5500
```

Then open `http://localhost:5500`.

### Test the worker locally with Wrangler

```bash
npm install
npx wrangler login
npx wrangler dev
```

Worker runs on `http://localhost:8787`.

### Run the RAG evaluation harness

```bash
node evals/eval.mjs
```

Output prints per-test results + pipeline/signal breakdowns and writes a full report to `evals/eval-report.json`.

### Rebuild the embedded knowledge base

```bash
node src/rag/ingest-and-chunk.mjs
node scripts/embed-chunks.mjs
node scripts/build-worker-chunks.mjs
npx wrangler deploy
```

---

## ⚡ Deployment Guide

### Step 1 — Deploy the Cloudflare Worker

**Wrangler CLI (recommended):**

```bash
npm install --save-dev wrangler
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # from https://aistudio.google.com
npx wrangler secret put GROQ_API_KEY     # from https://console.groq.com
npx wrangler deploy
```

Verify:
```bash
curl https://<your-worker>.workers.dev/health
```

### Step 2 — Configure the Frontend

Update the `WORKER_URL` constant near the top of `<script>` in `index.html`:

```javascript
const WORKER_URL = 'https://your-worker-subdomain.workers.dev/';
```

Also update `ALLOWED_ORIGINS` in the worker.

### Step 3 — Deploy the Frontend

Push to `main`. GitHub Pages picks up changes automatically.

### Step 4 — Configure Affiliate / Partner IDs *(Optional)*

Open `createBookingDemandCard()` in `index.html` and replace placeholder IDs:

- `BOOKING_AID` — [Booking.com Affiliate Partner Hub](https://partners.booking.com)
- `GYG_PARTNER_ID` — [GetYourGuide Partner Program](https://partner.getyourguide.com)
- `VISITORS_COVERAGE_ID` — [VisitorsCoverage Partners](https://www.visitorscoverage.com)

---

## 🔒 Security & Privacy

- API keys stored as encrypted Cloudflare Worker secrets; never exposed to the frontend.
- All AI calls proxied through the Cloudflare Worker.
- No user conversation data stored server-side. Cookies only store the last destination string, locally.
- CORS locked to an origin allowlist (not `*`).
- Payload size limits protect against abuse.
- **RAG citation enforcement** — hallucinated chunk IDs filtered against retrieved set.
- **Prompt injection defense** — verified in eval `vf-eval-006`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Backend | Cloudflare Workers (ES Module) |
| Deploy | Wrangler CLI + `wrangler.toml` |
| AI Primary | Google Gemini 2.5 Flash |
| AI Fallback | Groq (gpt-oss-120b → llama-3.3-70b-versatile) |
| RAG Retrieval | Hybrid (keyword + vector cosine similarity) with cross-encoder reranker |
| Embedding Model | `@cf/baai/bge-small-en-v1.5` (384-dim, Cloudflare Workers AI) |
| Reranker Model | `@cf/baai/bge-reranker-base` (Cloudflare Workers AI) |
| Eval Harness | Node.js — per-test scoring + failure categorization + pipeline telemetry |
| Hosting | GitHub Pages (frontend) + Cloudflare Workers (backend) |
| Memory | HTTP cookies (client-side, last destination only) |
| Booking Partners | Booking.com, Google Flights, GetYourGuide, VisitorsCoverage |

---

## 🗺️ Roadmap

**Completed**
- [x] Screenshots + architecture diagram in `docs/`
- [x] Evaluation harness for retrieval + answer quality
- [x] RAG mode with citation enforcement (v2.2.0)
- [x] Two-mode UI (Plan / Ask) with mode toggle (v2.2.0)
- [x] Wrangler CLI deploy pipeline
- [x] **Hybrid retrieval — keyword + vector fusion (v2.3.0, Week 3)**
- [x] **Cross-encoder reranker — `@cf/baai/bge-reranker-base` (v2.4.0, Week 4)**
- [x] **Eval-to-production parity — pipeline + signal telemetry (v2.4.0, Week 4)**
- [x] **Failure categorization — retrieval / generation / grounding / unanswered_mismatch (v2.4.0, Week 4)**

**In progress / upcoming**
- [ ] Intent classifier — auto-route between chat and RAG based on query
- [ ] Real-time flight prices via Duffel or Kiwi.com Tequila API
- [ ] Multi-city trip planning support
- [ ] Saved itineraries / trip history (via localStorage)
- [ ] Currency conversion in the booking desk
- [ ] Broader IATA-code map for country-level destinations
- [ ] Streaming responses for faster perceived latency
- [ ] Response caching in Cloudflare KV for repeated prompts
- [ ] MCP integration for enterprise workflow connectivity

---

## 📈 Worker Version History

| Version | Highlights |
|---|---|
| **v2.4.0** *(Week 4)* | **Cross-encoder reranker** (`@cf/baai/bge-reranker-base`) refines top-20 hybrid candidates to top-5. `chunks_used` includes `rerank_score` + `keyword_score` + `vector_score` + `retrieval_signal`. `meta` includes `ranking_signal` + `retrieval_signal`. Graceful fallback to hybrid_fusion if reranker fails. `answer-with-context.mjs` prefers Worker `mode:rag` (backward compatible via `USE_WORKER_RAG=false`). `eval.mjs` reports `pipelines_used`, `retrieval_signals`, `ranking_signals`, `failure_categories`. **100% eval pass rate.** |
| **v2.3.0** *(Week 3)* | **Hybrid search** — Cloudflare Workers AI binding, pre-computed 384-dim embeddings for 12 chunks, keyword + vector fusion with normalized scores. Graceful fallback to keyword-only if AI binding call fails. |
| **v2.2.0** | **RAG mode** (`mode: "rag"` branch) with embedded 12 travel chunks, citation enforcement, prompt-injection defense, out-of-scope refusal, Wrangler CLI deploy migration. |
| **v2.1.1** | Proper log severity levels, trailing-slash tolerance on `/health`, stricter GET routing |
| **v2.1.0** | `/health` endpoint, latency + version metadata, CORS allowlist, payload limits, structured logging |
| **v2.0.0** | Real Groq model IDs, dynamic date injection, message-shape validation, upstream timeouts, rate-limit surfacing |
| **v1.0.0** | Initial dual-engine router (Gemini primary + Groq fallback) |

### Week-by-week RAG evolution

| Week | Ship | Impact |
|---|---|---|
| **Week 3** — Hybrid search | Keyword + vector fusion via Cloudflare AI embeddings | 80% → 87% eval pass rate |
| **Week 4** — Reranker + eval parity | Cross-encoder reranker on top-20 candidates + full pipeline telemetry + failure categorization | 87% → **100%** eval pass rate (+20pp arc from Week 2 baseline) |

---

## 🔗 Related Projects

**WriCoRe — Write · Code · Research** *(Live)*
A dual-engine AI workspace with three specialized agents (Writing, Coding, Research) and grounded RAG on the Research Agent. Same architecture pattern as VoyageFlow: hybrid retrieval (`@cf/baai/bge-small-en-v1.5`) + cross-encoder reranker (`@cf/baai/bge-reranker-base`) on Cloudflare Workers. 100% eval pass rate with failure categorization and pipeline telemetry. Cross-project code reuse validated.
🔗 [Try WriCoRe Live](https://james75x2-design.github.io/wricore-workspace/)

**AGAD — Assisted Generation of Approval Documents** *(In Development)*
An AI-powered tool helping Filipino patients and their families navigate hospital LOA and insurance approval processes.

---

## 👤 About

**James Earl C. Felipe**
AI Solutions Designer · Enterprise IT Applications Specialist

Focused on AI agent development, workflow automation, and enterprise support platforms. VoyageFlow is part of a broader portfolio exploring conversational AI, retrieval-augmented generation, cross-encoder reranking, evaluation harnesses with failure categorization, and multi-provider LLM routing.

🔗 https://linkedin.com/in/james-earl-felipe-13359665 · 📧 james75x2@gmail.com

---

## 📄 License

MIT License — Copyright (c) 2026 James Earl C. Felipe.

Free to use, modify, and share with attribution.

See ./LICENSE for the full text.

---

*© 2026 James Earl C. Felipe. Built with Cloudflare Workers, Gemini, and Groq. Designed for travellers.*
