# Assessment: Can `gods-eye-view` be merged into Atlas AI?

**Repo reviewed:** https://github.com/bilawalsidhu/gods-eye-view (MIT, 37.7k stars, last commit Sep 2026)
**Assessed against:** this repo at `ea5c498` (216 source files, ~80 Prisma models)
**Date:** 2026-09-18

---

## 1. Verdict

**Do not merge the repositories. Do harvest three specific things from it.**

Merging is technically possible and strategically wrong. But "is there any usefulness
at all?" — yes, and the usefulness is not the globe. It is the project's **free-data
playbook** and its **proxy/caching discipline**, both of which attack the exact problem
you stopped on: cost.

Critically, **God's Eye View does not solve your blocker.** It is a browser app that runs
on the developer's own machine. It has no answer for "I cannot afford to host Postgres +
Redis + a websocket API." Section 5 does.

---

## 2. Why a merge is the wrong move

| Dimension   | Atlas AI                                      | God's Eye View                                  | Compatible?                               |
| ----------- | --------------------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Language    | TypeScript (strict)                           | Vanilla JavaScript (ESM)                        | No — 12.4 MB of untyped JS                |
| API stack   | NestJS 11 + Prisma 7 + Socket.io              | Vite middleware plugins, no framework           | No shared runtime                         |
| Node engine | `>=22.12.0`                                   | `>=24.14.0 <25 \|\| >=26 <27`                   | **Direct conflict** — GEV rejects Node 22 |
| Frontend    | Expo / React Native + Vite admin              | CesiumJS single-page globe                      | No component model in common              |
| Domain      | Privacy-first, consent-gated location sharing | Public-signal OSINT ("spy satellite simulator") | **Positioning conflict**                  |
| Velocity    | 1 merge commit on `main`                      | 420 commits, 626 PRs in weeks                   | You would inherit a firehose              |

### The positioning conflict is the real blocker

Atlas sells _consent, precision tiers, field encryption, audit logs_. GEV sells _"no place
left behind"_ — a forbidden-cockpit aesthetic over live cameras, license-plate readers and
military installations. Putting GEV's globe inside a product whose promise is
"we minimise what anyone can see about you" undermines the one asset you have that GEV
does not: **trust**. A reviewer, an investor or an app-store assessor who sees both in one
repo will conclude you have not decided what the product is.

### The data licence is a trap if you copy files wholesale

GEV's **code** is MIT. Its **bundled data is not**, and the LICENSE says so explicitly:

- `src/data/local_data/telegeography_submarine_cables/` — **CC BY-NC-SA 3.0, non-commercial**
- `public/events/bhote-koshi-2026/` + `src/data/bhoteKoshiFloodPath.js` — **CC BY-NC 4.0, non-commercial**
- OSM/Open Infrastructure Map extracts — **ODbL 1.0**, attribution + share-alike

Atlas is `UNLICENSED` and clearly intended to be commercial (it has `SubscriptionPlan`,
`Subscription`, Stripe-shaped models). Copying GEV's `src/data/` tree in would plant
non-commercial assets in a commercial product. **Never copy their data directories.**

---

## 3. What to harvest (ranked by value per hour of work)

### 🥇 A. The free/keyless data-source playbook — directly cuts your running cost

Atlas currently makes **zero** outbound calls to any mapping, routing, geocoding, weather
or transit data provider (verified: the only external URLs in `apps/api/src` are Google/
Apple OAuth, Twilio and Resend). Your transit module is entirely manual — `TransitDataSourceType`
is `FIELD_SURVEY | GOVERNMENT_AGENCY | TRANSPORT_OPERATOR | UNION_PARTNER | INTERNAL_RESEARCH`,
and the importer is CSV. That is the slowest, most expensive way to build a transit product.

GEV proves these are available for **$0**, with real working integration code:

| Capability                 | GEV source                                                                                                                                                  | Cost                 | Relevance to Atlas                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| Real-time transit vehicles | `server/providers/transit.js`, `src/sources/transitService.js` — 7 live GTFS-Realtime regions (MBTA, Ontario 511, Fintraffic, DriveBC, TxDOT, Tallinn, NSW) | Free, operator feeds | **Highest.** Turns your manual transit module live without a commercial API        |
| Routing / directions       | `server/providers/` → `/api/route` proxying FOSSGIS OSRM (car/bike/foot)                                                                                    | Keyless              | Replaces paid Directions APIs in `features/routes`                                 |
| Geocoding                  | `/api/geocode` → Nominatim, with Photon and Google as tiered fallbacks                                                                                      | Keyless              | Place search for geofences and the assistant                                       |
| Bike share                 | `server/providers/gbfs.js`                                                                                                                                  | Free                 | Multi-modal trip legs                                                              |
| Weather                    | `/api/weather-effects`, Open-Meteo                                                                                                                          | Keyless              | Trip/safety context, disruption messaging                                          |
| Satellite basemap imagery  | Esri World Imagery (default when no key)                                                                                                                    | Keyless              | `apps/mobile/src/components/map/MapSurface.web.tsx` fallback — reduces Mapbox load |
| Terrain heights            | `/api/terrain/heights` → Re:Earth quantized-mesh                                                                                                            | Keyless              | Only if you ever do elevation-aware routing                                        |
| Road geometry              | `server/providers/overpass.js` → OSM Overpass                                                                                                               | Keyless              | Coverage polygons for `TransitCoverage`                                            |
| Traffic flow               | `server/providers/traffic.js` → TomTom BYOK, 200k free tiles/mo, with a **daily tile-budget governor**                                                      | Free tier            | Congestion-aware trip ETAs                                                         |

Your paid dependencies that this reduces: **Mapbox** (`@rnmapbox/maps` + `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`),
any future Directions/Geocoding spend, and the manual cost of surveying transit data by hand.

Note `OpenAI`, `Twilio`, `FCM` and `Resend` have **no free equivalent** here — SOS delivery
stays a paid line item. Budget for that honestly rather than hoping.

### 🥈 B. The server-side proxy pattern — this is what makes a free tier survivable

This is the single most transferable engineering asset in GEV, and it is a _pattern_, not
code you paste. From `DATA_SOURCES.md`, every provider proxy does:

1. **Allow-list of upstream hosts** — a client can never hand the proxy an arbitrary URL (their CCTV design note is explicit about this). Prevents your API becoming an open SSRF relay.
2. **Reject redirects, validate all resolved IPs as globally routable**, exclude reserved/documentation ranges, pin TLS to the validated address.
3. **Bound the response** — size caps (8 MB), timeouts (12 s), coordinate-count caps, per-leg distance caps (600 km / 2 500 km total).
4. **Coalesce identical in-flight requests** and cache (5–10 min), with **serve-stale** during outages and **failure backoff**.
5. **Rate-limit per client** (60/min, 200/min total) and **serialise** providers with a 1 req/s policy (Nominatim).
6. **Daily budget governor** — `TOMTOM_DAILY_TILE_BUDGET`, a hard application-level ceiling so a free quota cannot be exhausted by one bad client.
7. **Send an identifying `User-Agent`/`Referer`** — the etiquette that keeps free public instances from blocking you.

Atlas already has `@nestjs/throttler` and a Redis service, so this lands naturally as a
`GeoProxyModule` in `apps/api/src/modules/`. On a free tier with a hard monthly quota,
items 4 and 6 are the difference between "demo survives a Product Hunt spike" and
"demo dies in an hour." **Port the pattern, write it in TypeScript yourself.**

### 🥉 C. The zero-cost demo and distribution playbook

GEV hit #1 on GitHub Trending and 37.7k stars. You have a comparable-quality codebase and
**no `README.md` at the repo root**. The transferable moves:

- **"Start without API keys."** Your `EXPO_PUBLIC_DEMO_MODE=true` already does this — say so in the first line of a README, the way GEV does.
- **`npm run doctor`** — a setup doctor that reports Node/npm readiness and which providers are configured _without printing secret values_. Cheap to write, removes most onboarding friction.
- **One-click install** (their Pinokio launcher) — the Expo web export + a hosted preview link is your equivalent.
- **State-in-URL share links** — GEV serialises camera, style, layers and _the tracked target_ into a URL, so "a live target is a handoff, not a bookmark." That is exactly the mechanic for Atlas's live-location sharing and SOS handoff to a trusted contact. You have `LocationShare` and `LiveLocation` models; a share token in a deep link is a small feature with outsized demo impact.
- **The README's own structure** — Why this exists → What it does → Quick Start → What's live → Keys & Costs. Copy the _shape_, not the content.

---

## 4. Rules if you take anything

1. **MIT code:** permitted to copy and modify, but you must keep the copyright notice and
   permission notice with any substantial portion. Add a `THIRD_PARTY_NOTICES.md`.
2. **Never copy `src/data/`, `public/events/`, or `public/models/`** — non-commercial and
   third-party data, incompatible with a commercial Atlas.
3. **Prefer re-implementation over vendoring.** The proxy pattern, the free-provider list and
   the GTFS-Realtime approach are ideas and public endpoints; write them in your own
   TypeScript. You get the benefit with no licence entanglement and no 12 MB of untyped JS.
4. **Respect the upstream etiquette** — rate limits, identifying User-Agent, 1 req/s for
   Nominatim, no bulk queries. Free public instances ban abusers, and you would be
   burning a resource the whole ecosystem shares.
5. **Attribution is required for ODbL data** (OSM/Overpass/OSRM). Show "© OpenStreetMap
   contributors" wherever you render derived geometry or routes.

---

## 5. The actual blocker: hosting Atlas for $0

Your `deploy-api.yml` targets **AWS ECR + ECS Fargate**. That is a production-grade path and
a _bad_ first path for a project with no revenue — ECS tasks, a load balancer, RDS and
ElastiCache run roughly $70–150/month before a single user arrives. This, not the missing
globe, is why you stopped.

What Atlas needs at runtime: Postgres, Redis (Socket.io adapter), one always-on Node
process that speaks websockets, and a static/web build for the mobile preview and admin.

A $0 stack that fits (verify current terms before committing — free tiers change often):

| Component            | Free option                    | Known limits                                                                                                                       |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Postgres             | **Neon**                       | 0.5 GB/project, ~100–190 CU-hours/mo, scale-to-zero, no card. Prisma works over `DATABASE_URL`.                                    |
| Postgres (alt)       | **Supabase**                   | 500 MB, 2 projects, pauses after 1 week idle.                                                                                      |
| Redis                | **Upstash**                    | 256 MB, ~500k commands/mo. **Watch this** — the Socket.io Redis adapter publishes on every location update; budget your emit rate. |
| API + websockets     | **Northflank** free Sandbox    | 2 services that do not sleep — best fit, but wants a card for verification.                                                        |
| API (no card)        | **Render** free web service    | 750 instance-hours/mo, 512 MB, **sleeps after ~15 min idle**, ~1 min cold start.                                                   |
| API (alt)            | **Koyeb**                      | 1 free service, scale-to-zero, no expiry.                                                                                          |
| Admin SPA + Expo web | **Cloudflare Pages / Netlify** | Genuinely free static hosting.                                                                                                     |
| Mobile               | **Expo Go / EAS dev build**    | No store fee needed for testing.                                                                                                   |

### The honest caveat about websockets

Atlas is a **safety product**. `SosAlert`, `EmergencyContact`, `LiveLocation` and
`CallSafetySession` imply that when someone presses SOS, something must be listening. A
sleeping free tier with a ~60 second cold start is **acceptable for a demo, a portfolio
piece and early user interviews — and unacceptable for real people relying on it.**

So treat the $0 stack as the _traction_ phase, not the product:

- **Phase 0 ($0):** Neon + Upstash + Northflank/Render + Cloudflare Pages. Ship the demo.
  Keep `DEMO_MODE` prominent and label the SOS flow as simulated, exactly as
  `docs/BEGINNER_GUIDE.md` already does.
- **Phase 1 (~$5–15/mo):** one always-on small VM plus managed Postgres. This is where you
  go when a real user depends on SOS. Do not skip it for launch.
- **Phase 2:** your existing AWS ECS pipeline, unchanged and already written. Keep
  `deploy-api.yml` — it is an asset for later, not dead weight now.

Two cheap changes that materially extend Phase 0:

- **Throttle and coalesce `LiveLocation` writes.** Free Redis caps and Postgres CU-hours are
  both consumed by location emits. Batch to one update per N seconds per user.
- **Make Redis optional in single-instance mode.** `@socket.io/redis-adapter` is only needed
  to fan out across multiple API instances. On one small box, the in-memory adapter works and
  removes Upstash from the critical path entirely. Gate it on an env flag.

---

## 6. Recommended next step

In order of value-per-hour, with implementation status as of 2026-09-18:

1. ✅ **DONE — root `README.md`.** Built on GEV's structure (Why this exists → What it does →
   Quick start → Architecture → Deployment → Keys & costs). See also
   `THIRD_PARTY_NOTICES.md`, which records the MIT attribution and the licence carve-outs.
2. ✅ **DONE — Phase 0 hosting.** `render.yaml` (reuses `infra/Dockerfile.api`, so there is
   still exactly one build definition) plus `docs/free-tier-hosting.md`. Added
   `REDIS_OPTIONAL`, which removes Redis from the critical path on a single instance —
   `main.ts` skips the Socket.IO fan-out adapter and `/health/ready` reports
   `redis: "disabled"`. Default is `false`, so existing behaviour is unchanged. The
   presence-tracking call sites in `locations.service.ts` and `locations.gateway.ts` were
   already fully wrapped in `try/catch` with graceful degradation, which is why this was a
   four-line-per-file change rather than a refactor.
3. ✅ **DONE — `GeoProxyModule`, and it is consumed.** `apps/api/src/modules/geo-proxy/`,
   implementing §3A and §3B: OSRM routing, Photon→Nominatim geocoding, Open-Meteo weather,
   behind a hardened proxy (host allow-list, DNS validation + socket pinning, no redirects,
   bounded responses, coalescing cache with serve-stale and backoff, per-provider daily
   budget, Nominatim serialised to 1 req/s, identifying User-Agent). Read
   `apps/api/src/modules/geo-proxy/README.md`.

   **Wired into the SOS path**, which is where the free data earns its keep. An SOS SMS
   previously read _"SOS from Maya. View their time-limited Atlas safety link: \<url\>"_ — a
   recipient who could not open the link learned nothing about **where**. It now names the
   place: _"SOS from Maya. Near Gamboru Market, Maiduguri, Borno. View…"_. The emergency path
   gets its own rules (`reverseForEmergency`): Photon instead of the rate-limited Nominatim
   serialiser, budget and backoff bypassed via `critical: true`, a 2 s ceiling instead of
   12 s, an outer hard timeout in `SosLocationService`, and a start _before_ the DB
   transaction so the lookup overlaps with database work. If any of it fails, the alert sends
   **byte-identical to the old wording** — pinned by a regression test.

4. ⚠️ **RECONSIDER — "wire one live GTFS-Realtime region".** This recommendation was weaker
   than it first looked, and the reason only became clear while reading the schema.
   GEV's seven live regions are MBTA, Ontario 511, Fintraffic, DriveBC, TxDOT, Tallinn and
   Live Traffic NSW — **none of them are in Nigeria or West Africa**. Meanwhile Atlas's
   `TransitDataSourceType` is `FIELD_SURVEY | GOVERNMENT_AGENCY | TRANSPORT_OPERATOR |
UNION_PARTNER | INTERNAL_RESEARCH`, which describes exactly the kind of informal transit
   network that often publishes _no_ GTFS-Realtime feed at all.
   So the honest question is not "how do I wire up GTFS-RT" but **"does a feed exist for the
   cities Atlas actually serves?"** If the answer is no, this item is not a cost saving — it
   is a data-collection project, and Atlas's existing manual CSV + review workflow is
   already the right tool for it. Answer that question before writing code.
5. ⏸️ **DEFERRED — a Cesium globe.** If it is ever built: in `apps/admin` or as a standalone
   marketing demo, **never in the consumer privacy surface.** An ops wall showing live
   transit coverage is defensible; a surveillance aesthetic inside a consent-based safety
   app is not.

### Not verified

Outbound network access to OSRM, Photon, Nominatim and Open-Meteo was unavailable in the
environment where the geo proxy was written (DNS resolved; TLS was refused), and
`prisma generate` could not download its engine binary. Consequences:

- Provider request URLs and response parsing were built from documented API shapes and
  tested against **recorded fixtures**, not live responses. Run the smoke test in
  `apps/api/src/modules/geo-proxy/README.md` before relying on it.
- The repo's 337 pre-existing `tsc` errors and 3 failing test-file loads are all cascades
  from the missing generated Prisma client. They are environmental, not regressions: the
  error count and the set of failing files are identical before and after these changes.

---

### Bottom line

Inserting the repository: no. Extracting its free-data sources, its proxy hardening
discipline, and its demo-and-distribution playbook: yes, and it is directly aimed at the
cost problem that stopped you. The globe itself is the least useful part of it for Atlas.
