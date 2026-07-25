# VoyageFlow — AI Travel Concierge ✈️

**A free, zero-friction AI travel concierge — no sign-up, instant itineraries, a ready-to-book desk for flights/hotels/tours/insurance, plus a grounded RAG mode with cross-encoder reranking, response caching, and automatic intent routing.**

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Worker](https://img.shields.io/badge/worker-v2.4.0-blue)
![RAG](https://img.shields.io/badge/RAG-hybrid%20%2B%20reranker-brightgreen)
![Eval](https://img.shields.io/badge/eval-100%25%20pass-brightgreen)
![Cache](https://img.shields.io/badge/cache-KV%20backed-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)
![Backend](https://img.shields.io/badge/backend-Cloudflare%20Workers-orange)
![AI](https://img.shields.io/badge/AI-Gemini%20%2B%20Groq-purple)
![Frontend](https://img.shields.io/badge/frontend-GitHub%20Pages-lightgrey)

---

## What Is VoyageFlow?

VoyageFlow turns a normal conversation into a complete travel plan. Tell it where you want to go, when, and who's joining — it responds with a personalized, day-by-day itinerary written in a luxury-concierge voice, then generates a structured booking desk with deep links to search flights, hotels, tours, and insurance already pre-filled with the traveler's dates, destination, and party size.

As of **v2.4.0 + Week 5.1**, VoyageFlow is a **two-mode AI travel assistant with production-grade RAG**:

- **✈️ Plan a trip** — the itinerary planner + Booking Desk.
- **❓ Ask VoyageFlow** — factual Q&A grounded in a curated travel knowledge base with hybrid retrieval + cross-encoder reranking, visible citations, response caching, and prompt-injection defense.

An **intent classifier** auto-routes between the two modes, and **KV caching + rate limiting + a `/metrics` endpoint** keep it fast, cheap, and observable in production. No sign-up. No API key required from the user.

---

## 🚀 Live Demo

👉 **https://james75x2-design.github.io/VoyageFlow/**

- Backend health: https://voyageflow.james75x2.workers.dev/health
- Cache metrics: https://voyageflow.james75x2.workers.dev/metrics

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

### 4. RAG Mode — Grounded Q&A with Citations + Auto-Routing

Toggle (or let the intent classifier auto-switch) to **❓ Ask VoyageFlow** for factual questions. Every answer is grounded in the travel knowledge base and shows a **Sources** strip with the exact chunk IDs used.

<img src="https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/screenshots/04-rag-mode-citations.png" alt="RAG mode answer with Sources strip">

---

## 🏗️ Architecture

![Architecture diagram](https://raw.githubusercontent.com/james75x2-design/VoyageFlow/main/docs/architecture.png)

**Data flow — Chat mode**

1. User sends a message (mode toggle on **Plan a trip**, or auto-routed by the intent classifier).
2. Frontend POSTs `{ messages }` to the Cloudflare Worker.
3. Worker enforces per-IP rate limit, injects today's date, tries Gemini first, falls back through the Groq chain on failure.
4. Response returns as JSON with `reply` + `meta` (model, version, latency).
5. Frontend parses the embedded booking JSON block and renders the Booking Desk.

**Data flow — RAG mode (v2.4.0 + Week 5.1)**

1. User sends a message (mode toggle on **Ask VoyageFlow**, or auto-routed).
2. Frontend POSTs `{ mode: "rag", messages }`.
3. Worker enforces rate limit, then checks the **KV cache** — a hit returns instantly (zero AI calls).
4. On miss: **hybrid retrieval** (keyword + vector) → top-20 candidates → **cross-encoder reranker** → top-5.
5. Citation-enforced prompt sent to Gemini (with Groq fallback).
6. Response normalized into `{ answer_markdown, citations, unanswered, meta }`, **written to KV cache** (if answered), and returned.
7. UI strips inline `[chunk_id]` markers, renders the "Sources:" strip.

---

## ✨ Features

- **Two-mode UI** — Plan a trip (chat/booking) and Ask VoyageFlow (RAG Q&A)
- **Intent classifier** — auto-routes between modes based on the query (no manual toggle needed)
- **Conversational trip planning** — asks for missing details instead of guessing
- **Luxury day-by-day itineraries** — premium travel-curator voice
- **Premium Booking Desk** — deep links to Booking.com, Google Flights, GetYourGuide, VisitorsCoverage
- **Grounded factual Q&A** — RAG with visible citations, out-of-scope refusal, prompt-injection defense
- **Cross-encoder reranker** — refines top-20 hybrid candidates to top-5
- **KV response caching** — repeat RAG queries return in ~100ms (zero AI calls)
- **Rate limiting** — per-IP sliding window protects AI budget
- **`/metrics` endpoint** — live cache hit-rate observability
- **Dual-engine AI routing** — Gemini primary; silent Groq fallback chain
- **IATA-aware flight routing** — Maldives → MLE, Bali → DPS, Hawaii → HNL, etc.
- **Cookie-based memory** — remembers last destination, personalizes welcome
- **Secure backend** — API keys only in encrypted Worker secrets

---

## 🧠 RAG Mode (v2.2.0 → v2.4.0)

### ✈️ Plan a trip (chat mode)
Describe your trip → VoyageFlow generates a bespoke day-by-day guide plus a Booking Demand Card with pre-filled search URLs.

### ❓ Ask VoyageFlow (RAG mode)
Ask factual questions about VoyageFlow itself — booking policies, verification guidance, destination coverage. Answers are grounded in a curated travel knowledge base with visible citations.

**How it works (v2.4.0):**

- **12 chunks embedded in the Worker** — no external vector DB
- **Hybrid retrieval** — keyword scoring + vector cosine similarity via `@cf/baai/bge-small-en-v1.5`, fused 0.5/0.5
- **Cross-encoder reranker** — `@cf/baai/bge-reranker-base` refines top-20 → top-5
- **Citation enforcement** — hallucinated chunk IDs filtered before response
- **Prompt-injection defense** — verified in eval `vf-eval-006`
- **Out-of-scope refusal** — verified in evals `vf-eval-008` … `vf-eval-010`
- **Graceful fallbacks** — vector → keyword-only, reranker → hybrid fusion

---

## 🎯 Cross-encoder Reranker (v2.4.0)

```
Query
  ↓
Hybrid retrieval → top-20 candidate pool
  ↓
@cf/baai/bge-reranker-base → rescore candidates
  ↓
Top-5 (reranker order) → LLM prompt with citation enforcement
  ↓
Response: rerank_score in chunks_used, ranking_signal in meta
```

**Two Cloudflare Workers AI models running natively:**

| Model | Purpose |
|---|---|
| `@cf/baai/bge-small-en-v1.5` | 384-dim query + chunk embeddings |
| `@cf/baai/bge-reranker-base` | Cross-encoder rerank scoring |

Structured logs tag `retrieval_signal` (`hybrid` / `keyword_only`) and `ranking_signal` (`reranker` / `hybrid_fusion`) so fallbacks surface immediately.

---

## 🧭 Intent Classifier (Week 5)

Auto-detects whether a query is "plan a trip" (chat/booking) or "ask a factual question" (RAG), so users don't have to manually toggle modes.

- **Regex-based heuristic** returning `rag` | `chat` | `null` (ambiguous)
- **Classify on-send** — runs once from the complete query at submit time (not mid-typing), avoiding jarring toggle flips and screen-reader noise
- **Manual lock** — clicking a toggle locks the choice; the classifier respects it
- **Auto-detect hint** — "🧭 Auto-detected: [mode]" shown when it switches

> Deliberately regex-only: VoyageFlow's two modes are lexically distinct enough that regex achieves high accuracy without the latency/cost of an LLM classification call. An LLM fallback tier could be added later if usage data shows a need.

**Verified (all 4 scenarios):** RAG auto-detect, chat auto-detect, manual override wins, ambiguous keeps current mode.

---

## ⚡ Response Caching + Rate Limiting + Metrics (Week 5.1)

Production hardening built on a shared KV-counter foundation.

### KV Response Caching
- Cache key: `rag:${KB_VERSION}:${sha256(query)}` — **KB-versioned** (rebuilding the KB orphans stale entries) and **hashed** (no truncation collisions)
- Only caches **answered, cited** responses (never refusals)
- 1-hour TTL; `meta.cache: "hit" | "miss"` for observability
- **Measured:** cache miss ~5s (full pipeline) → cache hit ~100ms (**~40x faster**)

### Rate Limiting
- Per-IP sliding window: **20 requests / 60s** → `429` when exceeded
- Protects Gemini/Groq calls + Cloudflare AI neuron budget
- **Verified:** requests beyond the limit correctly return `429`

### Cache Metrics
- `GET /metrics` → `cache_hits`, `cache_misses`, `total_rag_requests`, `cache_hit_rate`
- Counters increment on every RAG hit/miss via a shared `incrementCounter()` KV helper

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
Pipelines Used:     worker_rag: 15
Retrieval Signals:  hybrid: 15
Ranking Signals:    reranker: 15
Failure Categories: pass: 15
```

### Run the eval harness

```bash
node evals/eval.mjs
```

Writes `evals/eval-report.json` with per-test retrieval + answer scoring, latency, citation validation, pipeline/signal tags, and failure category.

**Force local hybrid path** (A/B or offline):

```bash
USE_WORKER_RAG=false node evals/eval.mjs
```

**Rebuild the embedded KB after editing `data/kb/*.md`:**

```bash
node src/rag/ingest-and-chunk.mjs
node scripts/embed-chunks.mjs
node scripts/build-worker-chunks.mjs
# then bump KB_VERSION in the worker and redeploy
npx wrangler deploy
```

---

## 🤖 AI Backend — Dual-Engine Routing (v2.4.0)

| Layer | Provider | Model | Role |
|---|---|---|---|
| Primary | Google Gemini | `gemini-2.5-flash` | Fast, large-context reasoning + structured extraction |
| Fallback 1 | Groq | `openai/gpt-oss-120b` | Reasoning-capable structured output |
| Fallback 2 | Groq | `llama-3.3-70b-versatile` | Fast, reliable structured output |

Every successful response includes a `meta` block (model, version, latency). RAG responses additionally include `mode`, `ranking_signal`, `retrieval_signal`, `cache`, and `chunks_used` with per-chunk `keyword_score` / `vector_score` / `rerank_score`.

**Worker capabilities (v2.4.0 + Week 5.1):**
- `mode: "rag"` branch — hybrid retrieval + reranker + citation-enforcing prompt
- KV response caching (KB-versioned, hashed keys, skips refusals)
- Per-IP rate limiting (20/60s)
- `/metrics` cache observability endpoint
- CORS allowlist, payload validation, 25s upstream timeouts, dynamic date injection
- `/health` endpoint, version + latency metadata

---

## 📡 API Reference

### `GET /health`

```bash
curl https://voyageflow.james75x2.workers.dev/health
```
```json
{ "status": "ok", "service": "voyageflow-worker", "version": "2.4.0", "timestamp": "..." }
```

### `GET /metrics` (Week 5.1)

```bash
curl https://voyageflow.james75x2.workers.dev/metrics
```
```json
{
  "service": "voyageflow-worker",
  "version": "2.4.0",
  "cache_hits": 42,
  "cache_misses": 18,
  "total_rag_requests": 60,
  "cache_hit_rate": 0.7,
  "timestamp": "..."
}
```

### `POST /` — Chat mode (default)

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","parts":[{"text":"Plan a 5-day trip to Tokyo for 2 adults in December."}]}]}'
```

### `POST /` — RAG mode (v2.4.0)

```bash
curl -X POST https://voyageflow.james75x2.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"mode":"rag","messages":[{"role":"user","parts":[{"text":"What booking links can VoyageFlow generate?"}]}]}'
```

RAG success response (200):
```json
{
  "answer_markdown": "VoyageFlow generates ... [voyageflow-overview::003]",
  "citations": [{ "claim": "...", "chunk_ids": ["voyageflow-overview::003"] }],
  "unanswered": false,
  "meta": {
    "mode": "rag",
    "model": "gemini-2.5-flash",
    "version": "2.4.0",
    "latency_ms": 5060,
    "cache": "miss",
    "ranking_signal": "reranker",
    "retrieval_signal": "hybrid",
    "chunks_used": [
      { "chunk_id": "booking-policies::001", "score": 0.9434, "keyword_score": 16, "vector_score": 0.7631, "rerank_score": 0.9992, "retrieval_signal": "hybrid" }
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
| `429` | Rate limit exceeded, or all providers rate-limited |
| `502` | All AI providers failed |

**Payload limits:** Max 30 messages, max 8,000 chars per message.
**Rate limit:** 20 requests / 60s per IP.
**CORS:** Locked to GitHub Pages + localhost origins.

---

## 🏗️ Repository Structure

```text
VoyageFlow/
├── index.html                          # Frontend — React app + mode toggle + intent classifier
├── voyageflow_backend_worker.js        # Cloudflare Worker v2.4.0 (RAG + cache + rate limit + metrics)
├── wrangler.toml                       # Wrangler config: [ai] binding + RAG_CACHE KV namespace
├── package.json
├── README.md                           # This file
├── LICENSE                             # MIT
├── data/
│   ├── kb/                             # Curated travel knowledge base (Markdown)
│   └── index/
│       ├── chunks.jsonl                # Chunked KB with metadata
│       ├── raw_docs.jsonl
│       └── worker-chunks.js            # Chunks + embeddings inlined for the Worker
├── src/rag/
│   ├── ingest-and-chunk.mjs            # KB ingestion
│   ├── retrieve.mjs                    # Keyword retriever (local dev)
│   └── answer-with-context.mjs         # Worker mode:rag primary, local fallback
├── evals/
│   ├── eval-data.json                  # 15 test cases
│   ├── eval.mjs                        # Eval harness w/ failure categorization + pipeline telemetry
│   └── eval-report*.json               # Archived reports per week
├── scripts/
│   ├── embed-chunks.mjs                # Batch-generate embeddings
│   └── build-worker-chunks.mjs         # Rebuild worker-chunks.js
└── docs/
    ├── screenshots/
    └── architecture.png
```

Deployed via **GitHub Pages** (frontend) + **Cloudflare Workers** via Wrangler CLI (backend).

---

## 💻 Local Development

**Frontend:**
```bash
git clone https://github.com/james75x2-design/VoyageFlow.git
cd VoyageFlow
python -m http.server 5500   # http://localhost:5500
```

**Worker (Wrangler dev):**
```bash
npm install
npx wrangler login
npx wrangler dev             # http://localhost:8787
```

**Eval harness:**
```bash
node evals/eval.mjs
```

---

## ⚡ Deployment Guide

### 1. Deploy the Worker (Wrangler CLI)
```bash
npm install --save-dev wrangler
npx wrangler login
npx wrangler kv namespace create RAG_CACHE   # bind id in wrangler.toml
npx wrangler secret put GEMINI_API_KEY       # from https://aistudio.google.com
npx wrangler secret put GROQ_API_KEY         # from https://console.groq.com
npx wrangler deploy
```
Verify: `curl https://<your-worker>.workers.dev/health`

### 2. Configure the frontend
Update `WORKER_URL` near the top of the `<script>` in `index.html`, and add your origin to `ALLOWED_ORIGINS` in the worker.

### 3. Deploy the frontend
Push to `main` — GitHub Pages picks up changes automatically.

### 4. (Optional) Affiliate IDs
Set `BOOKING_AID`, `GYG_PARTNER_ID`, `VISITORS_COVERAGE_ID` in `createBookingDemandCard()`.

---

## 🔒 Security & Privacy

- API keys in encrypted Cloudflare Worker secrets; never exposed to the frontend
- All AI calls proxied through the Worker
- No server-side user data; cookies only store the last destination locally
- CORS locked to an origin allowlist (not `*`)
- Payload size limits + **per-IP rate limiting** protect against abuse
- **RAG citation enforcement** — hallucinated chunk IDs filtered
- **Prompt-injection defense** — verified via eval `vf-eval-006`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no build step) |
| Backend | Cloudflare Workers (ES Module) |
| Deploy | Wrangler CLI + `wrangler.toml` |
| AI Primary | Google Gemini 2.5 Flash |
| AI Fallback | Groq (gpt-oss-120b → llama-3.3-70b-versatile) |
| RAG Retrieval | Hybrid (keyword + vector) + cross-encoder reranker |
| Embedding Model | `@cf/baai/bge-small-en-v1.5` (384-dim) |
| Reranker Model | `@cf/baai/bge-reranker-base` |
| Cache / Counters | Cloudflare KV (`RAG_CACHE`) |
| Eval Harness | Node.js — scoring + failure categorization + telemetry |
| Hosting | GitHub Pages + Cloudflare Workers |

---

## 🗺️ Roadmap

**Completed**
- [x] Screenshots + architecture diagram
- [x] Evaluation harness (retrieval + answer quality)
- [x] RAG mode with citation enforcement (v2.2.0)
- [x] Two-mode UI + mode toggle (v2.2.0)
- [x] Hybrid retrieval — keyword + vector fusion (v2.3.0, Week 3)
- [x] Cross-encoder reranker (v2.4.0, Week 4)
- [x] Eval-to-production parity + pipeline telemetry (Week 4)
- [x] Failure categorization (Week 4)
- [x] Intent classifier — auto mode routing (Week 5)
- [x] KV response caching (Week 5)
- [x] Cache hardening: KB-versioned + hashed keys, skip refusals (Week 5.1)
- [x] Per-IP rate limiting (Week 5.1)
- [x] `/metrics` cache observability endpoint (Week 5.1)

**Upcoming**
- [ ] Real-time flight prices via Kiwi.com Tequila / Duffel API
- [ ] Streaming responses for faster perceived latency on cache misses
- [ ] Hermetic eval mode for CI (mock Worker responses)
- [ ] Multi-city trip planning
- [ ] Saved itineraries / trip history (localStorage)
- [ ] Currency conversion in the booking desk
- [ ] KB expansion (e.g. travel-insurance chunk)
- [ ] MCP integration for enterprise workflow connectivity

---

## 📈 Worker Version History

| Version | Highlights |
|---|---|
| **v2.4.0** (Week 4 + 5 + 5.1) | Cross-encoder reranker (`@cf/baai/bge-reranker-base`) on top-20 hybrid candidates; `chunks_used` includes `rerank_score`. Eval-to-production parity + failure categorization + pipeline telemetry. Intent classifier auto-routing (classify-on-send, manual lock). KV response caching (KB-versioned SHA-256 keys, skips refusals, 1-hour TTL). Per-IP rate limiting (20/60s → 429). `/metrics` endpoint (cache hit-rate). 100% eval pass rate. |
| **v2.3.0** (Week 3) | Hybrid search — Cloudflare Workers AI binding, 384-dim embeddings for 12 chunks, keyword + vector fusion. Graceful fallback to keyword-only. |
| **v2.2.0** | RAG mode (`mode: "rag"`) with embedded chunks, citation enforcement, prompt-injection defense, out-of-scope refusal, Wrangler CLI migration. |
| **v2.1.1** | Proper log severity levels, trailing-slash tolerance on `/health`, stricter GET routing |
| **v2.1.0** | `/health` endpoint, latency + version metadata, CORS allowlist, payload limits, structured logging |
| **v2.0.0** | Real Groq model IDs, dynamic date injection, message validation, upstream timeouts, rate-limit surfacing |
| **v1.0.0** | Initial dual-engine router (Gemini primary + Groq fallback) |

---

## 🔗 Related Projects

**WriCoRe — Write · Code · Research** *(Live)*
A dual-engine AI workspace with three specialized agents and grounded RAG on the Research Agent. Same architecture pattern as VoyageFlow: hybrid retrieval (`@cf/baai/bge-small-en-v1.5`) + cross-encoder reranker (`@cf/baai/bge-reranker-base`) on Cloudflare Workers, 100% eval pass with failure categorization and pipeline telemetry. Cross-project code reuse validated.
🔗 [Try WriCoRe Live](https://james75x2-design.github.io/wricore-workspace/)

**AGAD — Assisted Generation of Approval Documents** *(In Development)*
An AI-powered tool helping Filipino patients and their families navigate hospital LOA and insurance approval processes.

---

## 👤 About

**James Earl C. Felipe**
AI Solutions Designer · Enterprise IT Applications Specialist

Focused on AI agent development, retrieval-augmented generation, cross-encoder reranking, evaluation harnesses with failure categorization, response caching, rate limiting, and multi-provider LLM routing.

🔗 https://linkedin.com/in/james-earl-felipe-13359665 · 📧 james75x2@gmail.com

---

## 📄 License

MIT License — Copyright (c) 2026 James Earl C. Felipe.
Free to use, modify, and share with attribution. See ./LICENSE for full text.

---

*© 2026 James Earl C. Felipe. Built with Cloudflare Workers, Gemini, and Groq. Designed for travellers.*
