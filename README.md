<div align="center">

# Atlas AI

### Privacy-first real-time location sharing and safety.

Share where you are with the people you choose, at the precision you choose, for the time you choose — and revoke it instantly.

**No active consent means no location access.** That is not a slogan; it is enforced in the data layer and proven by an audit trail.

[![CI](https://github.com/timmyspurs12/Atlas-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/timmyspurs12/Atlas-ai/actions/workflows/ci.yml)

**[Why this exists](#-why-this-exists) · [What it does](#-what-it-does) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Deployment](#-deployment) · [Keys & costs](#-api-keys--costs)**

</div>

---

## 🌍 Why this exists

Most location apps treat your position as their product. Atlas treats it as yours.

Every share is explicit, time-boxed and precision-limited. Coordinates are encrypted at rest at the field level, never written to application logs, and every access — grant, read, revoke — lands in an append-only audit trail. When you stop sharing, delivery stops immediately, not at the end of a session.

The safety features are built on the same rule. An SOS alert reaches the contacts _you_ nominated, with the accuracy _you_ allowed, and nothing more.

---

## 🎛️ What it does

**Location & presence**

- 🛰️ **Consent-based live sharing** — per-recipient, with start/end times and an exact or approximate precision tier.
- 📍 **Privacy-aware precision** — approximate mode applies a stable per-viewer offset, so two people cannot triangulate you by comparing notes.
- ⏱️ **Instant revocation** — access stops the moment consent is withdrawn.
- 🧭 **Trips** — journeys with recorded track points, status and source.

**Safety**

- 🆘 **SOS alerts** — fan-out to nominated emergency contacts across push, SMS and email.
- 🗺️ **Named location in the alert itself** — the SMS says _"near Gamboru Market, Maiduguri"_
  rather than only carrying a link, because a recipient with a flat battery, poor data or a
  feature phone still needs to know **where**. Resolved best-effort from free OpenStreetMap
  data; if it cannot be resolved in time the alert sends without it, never because of it.
- 📞 **Call safety sessions** — consented participants, session events and location snapshots during a call.
- 🗺️ **Geofences** — places with entry/exit events and per-fence state.

**People & messaging**

- 👥 **Friends** — requests, acceptance, blocks.
- 💬 **Chat** — direct and group conversations, attachments, delivery receipts, over WebSockets.
- 🔔 **Notifications** — per-channel preferences and delivery tracking.

**Transit & routing**

- 🚌 **Transit journeys** — places, routes, stops, segments, service windows, fare bands and disruptions.
- 🗣️ **Natural-language journey intent** — "how do I get to X" resolved against published transit data.
- 🧪 **Coverage governance** — collection status, review workflow and publication policy per area.

**Assistant & platform**

- 🤖 **Atlas Assistant** — natural-language queries over your own data ("Where is Sarah?"), with a deterministic local intent parser and an optional LLM behind it.
- 🧾 **Audit & compliance** — severity-rated audit log, verification challenges, device and session tracking.
- 💳 **Subscriptions** — plans, statuses and entitlements.
- 🛠️ **Admin console** — React SPA for route editing and transit operations.

---

## ⚡ Quick start

**Start with no API keys.** Set `EXPO_PUBLIC_DEMO_MODE=true` and the mobile app runs a fully interactive demo with simulated people, places and alerts. Nothing is tracked and no provider is called.

You need **Node.js 22.12+** and **Docker** (for PostgreSQL and Redis).

### ☁️ No local setup? Use GitHub Codespaces (free)

The repo ships a `.devcontainer/`, so opening it in Codespaces gives you Node 22, Postgres and
Redis with **nothing installed locally** — and, unlike a restricted sandbox, real outbound
network access so the keyless geo providers and `prisma generate` both work.

**Code** → **Codespaces** → **Create codespace on main**, then:

```bash
cd apps/api && npm run test:geo-smoke   # verifies the free geo providers, no DB or auth needed
```

GitHub Free includes **120 core-hours and 15 GB-month per month** (≈ 60 hours at the 2-core
size). Set your Codespaces **spending limit to `$0`** in Settings → Billing so it stops rather
than bills when the quota runs out.

Read **[`docs/codespaces.md`](docs/codespaces.md)** first — it covers sharing a demo via port
visibility, not burning your quota, and an important caveat: Photon and OSRM are hosted in
Germany, so latency measured from a Codespace is an _optimistic floor_, not what a user on a
Nigerian mobile network will actually see.

### Local setup

```bash
git clone https://github.com/timmyspurs12/Atlas-ai.git
cd Atlas-ai
npm ci
```

Configure the API and mobile environment:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env.local
```

Generate three _different_ secrets and paste them into `apps/api/.env` as `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER` and `FIELD_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Start the data services, then create and seed the database:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run db:generate
npm run prisma:deploy --workspace @atlas/api
npm run db:seed
```

Run the API and the mobile app:

```bash
npm run dev:api      # terminal 1 → http://localhost:4000/v1/docs
npm run dev:mobile   # terminal 2 → press "w" for web
```

Or start both together:

```bash
npm run dev
```

**Seeded demo login:** `maya@demo.atlas` / `AtlasDemo2026!` — local demo data only.

Health endpoints: [`/v1/health/live`](http://localhost:4000/v1/health/live) and [`/v1/health/ready`](http://localhost:4000/v1/health/ready).
Interactive API docs: [`/v1/docs`](http://localhost:4000/v1/docs).

> A step-by-step walkthrough with pass/fail checkpoints is in **[docs/BEGINNER_GUIDE.md](docs/BEGINNER_GUIDE.md)**. Read that first if this is your first time running the project.

### The first five minutes

1. Open the mobile preview and choose **Explore the interactive demo**.
2. Home → select Sarah, John and Leo on the map.
3. Tap **Share my location** and read every consent option before confirming.
4. Ask the Assistant: `Where is Sarah?`
5. Open **SOS** — in demo mode the alert is simulated.

---

## 🧱 Architecture

A TypeScript npm-workspaces monorepo.

| Workspace            | Stack                                                              | Purpose                                                   |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `apps/api`           | NestJS 11 · Prisma 7 · PostgreSQL 17 · Redis 8 · Socket.io 4 · Zod | REST + WebSocket backend, domain policies, audit          |
| `apps/mobile`        | Expo · React Native · Redux Toolkit · RN Mapbox                    | iOS / Android / web client                                |
| `apps/admin`         | React 19 · Vite 7                                                  | Internal operations console                               |
| `packages/contracts` | TypeScript · Zod                                                   | Shared request/response types consumed by API and clients |

```
Atlas-ai/
├── apps/
│   ├── api/          # NestJS backend
│   │   ├── prisma/   # ~80 models: users, shares, trips, SOS, transit, call safety
│   │   └── src/
│   │       ├── common/       # auth guards, encryption, audit, geo utilities
│   │       ├── database/     # Prisma + Redis services
│   │       ├── modules/      # one folder per domain
│   │       └── realtime/     # Socket.io + Redis adapter
│   ├── mobile/       # Expo app, feature-foldered
│   └── admin/        # React operations console
├── packages/contracts/  # shared typed contracts
├── infra/               # Dockerfile, docker-compose, nginx
├── deliverables/        # transit & call-safety data-integrity SQL
├── docs/                # guides, security exceptions, assessments
└── scripts/             # dev runner, dependency audit
```

Domain logic is deliberately separated from I/O — see `modules/transit/domain/`, `modules/locations/sharing-policy.ts` and `modules/call-safety/domain/`. Those files are pure and unit-tested, which is why the policy layer can be reasoned about without a database.

---

## ✅ Quality gates

Run these before every commit:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build --workspace @atlas/api
```

Coverage thresholds are enforced at **70% lines / 70% functions / 60% branches**. ESLint runs with `--max-warnings=0`. Dependency advisories are audited in CI via `scripts/audit-ci.mjs`; the only permitted exceptions are narrow, time-limited and documented in **[docs/SECURITY_EXCEPTIONS.md](docs/SECURITY_EXCEPTIONS.md)**.

---

## 🚀 Deployment

Three tiers, in the order you should use them:

| Phase              | Cost      | Where                                                                                              | Use it for                                  |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **0 — Traction**   | **$0**    | Neon (Postgres) + Upstash (Redis) + Render/Northflank/Koyeb (API) + Cloudflare Pages (admin & web) | Public demo, portfolio, user interviews     |
| **1 — Real users** | ~$5–15/mo | One always-on small VM + managed Postgres                                                          | The first time a real person depends on SOS |
| **2 — Production** | Scaled    | AWS ECR + ECS Fargate — already wired in `.github/workflows/deploy-api.yml`                        | Launch                                      |

Full Phase 0 walkthrough, including the websocket cold-start caveat and how to survive a free-tier quota: **[docs/free-tier-hosting.md](docs/free-tier-hosting.md)**.

> ⚠️ **Atlas is a safety product.** A sleeping free tier can cold-start in ~60 seconds. That is fine for a demo and **not** acceptable for someone pressing SOS. Do not launch to real users on Phase 0.

`infra/docker-compose.yml` runs the full stack locally (Postgres, Redis, API, nginx) and is the reference topology for Phase 1.

---

## 🔑 API keys & costs

🟢 **Not required** · 🟡 **Free tier** · 🔴 **Metered, budget for it**

Every integration is behind an adapter that stays **disabled until configured**. The app runs with none of them.

|     | Key                                      | Enables                                    | Notes                                                                                                 |
| --- | ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 🟢  | —                                        | **Demo mode**                              | `EXPO_PUBLIC_DEMO_MODE=true`. Full interactive product, no providers called.                          |
| 🟡  | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`        | Photorealistic mobile map tiles            | Free allowance, then metered. A keyless fallback ships in `components/map/MapFallback.tsx`.           |
| 🟢  | —                                        | **Geo data** (routing, geocoding, weather) | Served through the in-API geo proxy from keyless public providers — see [Attribution](#-attribution). |
| 🔴  | `OPENAI_API_KEY`                         | Atlas Assistant LLM responses              | A deterministic local intent parser handles common queries without it.                                |
| 🔴  | `TWILIO_*`                               | SOS SMS delivery                           | **No free substitute.** Budget for this if SMS matters.                                               |
| 🟡  | `RESEND_API_KEY`                         | SOS / notification email                   | Generous free tier.                                                                                   |
| 🟢  | `FCM_*`                                  | Android/iOS push                           | Free.                                                                                                 |
| 🟢  | `GOOGLE_CLIENT_ID(S)`, `APPLE_CLIENT_ID` | Social sign-in                             | Free.                                                                                                 |
| 🟡  | `SENTRY_DSN`                             | Error reporting                            | Free tier.                                                                                            |

---

## 📎 Attribution

Atlas uses free public geodata services. Their terms apply and their credits must stay visible wherever derived data is shown:

- Routing © **OpenStreetMap** contributors, via the public **OSRM** instances operated by **FOSSGIS e.V.** — [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Geocoding © **OpenStreetMap** contributors, via **Nominatim** / **Photon**
- Weather © **Open-Meteo**
- Map data and imagery where used © **OpenStreetMap** contributors

Full details, licence carve-outs and the rules for taking third-party code into this repo: **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)**.

---

## 📄 Licence

Atlas AI is **UNLICENSED** — all rights reserved. It is not open source. If you want to build on it, talk to the maintainer.

Third-party code and data incorporated into this repository remain under their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<div align="center">

**The product's most important rule:** no active consent, no location access.

</div>
