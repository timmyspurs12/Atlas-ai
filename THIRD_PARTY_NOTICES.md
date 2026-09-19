# Third-party notices

This file records third-party code, patterns and data that Atlas AI depends on or draws
inspiration from, and the obligations that come with each.

Atlas AI itself is **UNLICENSED** (all rights reserved). Nothing here transfers rights to
the Atlas codebase; these notices exist because the _incorporated_ material has its own
terms.

---

## 1. Incorporated software

### Runtime dependencies

All runtime and development dependencies are declared in the workspace `package.json`
files and pinned by `package-lock.json`. Licences are audited in CI. Notable ones:

| Package                                       | Licence          | Used for                       |
| --------------------------------------------- | ---------------- | ------------------------------ |
| NestJS (`@nestjs/*`)                          | MIT              | API framework                  |
| Prisma (`prisma`, `@prisma/client`)           | Apache-2.0       | ORM and migrations             |
| Socket.io, `@socket.io/redis-adapter`         | MIT              | Realtime transport and fan-out |
| `ioredis`                                     | MIT              | Redis client                   |
| `zod`, `class-validator`, `class-transformer` | MIT              | Schema and DTO validation      |
| `argon2`, `jose`, `passport*`                 | MIT / Apache-2.0 | Password hashing and tokens    |
| `helmet`, `compression`, `@nestjs/throttler`  | MIT              | HTTP hardening                 |
| Expo / React Native                           | MIT              | Mobile client                  |
| `@rnmapbox/maps`                              | MIT (SDK)        | Mobile map rendering           |
| React, Vite                                   | MIT              | Admin console                  |

### No vendored third-party source trees

Atlas AI does **not** vendor any external project's source code. Where an external project
informed a design, the design was re-implemented in TypeScript against this repository's
conventions. See §2.

---

## 2. Design inspiration: God's Eye View

**Project:** [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu
**Licence:** MIT (source code only — see §2.2)
**Relationship to Atlas:** inspiration for design patterns only. **No code was copied and no
data was copied.**

### 2.1 What was taken (ideas and public endpoints)

| Taken                                                                                                                                                                                                                                                                                      | How it appears in Atlas                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| The concept of proxying **keyless public geo providers** server-side instead of paying for commercial mapping APIs                                                                                                                                                                         | `apps/api/src/modules/geo-proxy/` — routing, geocoding and weather behind one hardened proxy |
| **Proxy hardening discipline**: upstream host allow-list, redirect rejection, resolved-IP validation, response bounding, timeouts, in-flight coalescing, cache with serve-stale, failure backoff, per-client rate limits, a daily request-budget governor, and an identifying `User-Agent` | `apps/api/src/modules/geo-proxy/domain/upstream.policy.ts` and `geo-cache.service.ts`        |
| The **"works with no API keys"** onboarding stance and the README structure that communicates it                                                                                                                                                                                           | `README.md`                                                                                  |
| Free data providers themselves — OSRM (FOSSGIS), Nominatim/Photon, Open-Meteo — which are public services, not God's Eye View property                                                                                                                                                     | Listed in §3 with their own terms                                                            |

### 2.2 What was deliberately NOT taken

God's Eye View's MIT licence covers **source code only**. Its bundled datasets are
explicitly carved out and are **not** MIT — including material licensed **CC BY-NC-SA 3.0**
(TeleGeography submarine cables) and **CC BY-NC 4.0** (Bhote Koshi event imagery and derived
coordinates), plus **ODbL 1.0** extracts.

Atlas AI is a commercial product. Accordingly, **none** of the following were copied:

- `src/data/` — bundled datasets, including all non-commercial material
- `public/events/`, `public/models/` — third-party imagery and 3D model assets
- Any CesiumJS globe, GLSL sensor shader, HUD, CCTV, ADS-B, AIS or satellite-tracking code
- The OSINT/surveillance presentation layer generally, which conflicts with Atlas's
  privacy-first positioning

If any of these are ever added, this file must be updated and the non-commercial licence
terms resolved **before** merge.

### 2.3 MIT attribution

In accordance with the MIT licence, the following notice applies to the God's Eye View
project whose patterns informed §2.1:

> MIT License — Copyright (c) 2026 Bilawal Sidhu
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software
> without restriction, including without limitation the rights to use, copy, modify, merge,
> publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
> to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
> INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
> PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
> FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
> DEALINGS IN THE SOFTWARE.

---

## 3. Live data providers used at runtime

Atlas calls these public services through the geo proxy. They are **not** stored in this
repository, and each keeps its own terms.

| Provider                                        | Used for                                    | Terms                                                                                                               | Required attribution                                                        |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **OSRM** (public instances run by FOSSGIS e.V.) | Turn-by-turn routing, distance and duration | OSM data under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); intended for fair interactive use        | "© OpenStreetMap contributors" — must be shown wherever routes are rendered |
| **Nominatim** (OpenStreetMap)                   | Forward/reverse geocoding fallback          | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); **max 1 request/second**, no bulk/systematic queries    | "© OpenStreetMap contributors"                                              |
| **Photon** (komoot)                             | Geocoding primary                           | Apache-2.0 software; OSM data under ODbL                                                                            | "© OpenStreetMap contributors"                                              |
| **Open-Meteo**                                  | Current weather for trip and safety context | Free for non-commercial use; commercial use requires a paid plan — **check current terms before commercial launch** | "Weather data by Open-Meteo.com"                                            |

### Provider etiquette (enforced in code, not just documented)

Abusing free public instances gets Atlas — and everyone else — blocked. The geo proxy
therefore enforces:

1. A hard **allow-list** of upstream hosts. A client can never make the proxy fetch an
   arbitrary URL.
2. **No redirect following** to unvalidated hosts; resolved addresses must be globally
   routable (private, loopback, link-local, reserved and documentation ranges rejected).
3. **1 request/second** serialisation for Nominatim.
4. **Response bounds** — size cap, timeout, and coordinate/leg limits.
5. **Caching with serve-stale** and **in-flight coalescing** so one popular route costs one
   upstream call.
6. A **daily request budget** per provider, after which the proxy degrades rather than
   exhausting a free quota.
7. An **identifying `User-Agent`** with a contact URL, as OSM's usage policy requires.

---

## 4. Adding new third-party material

Before merging any external code or data:

1. **Identify the licence.** If it is not permissive (MIT, BSD, Apache-2.0, ISC), stop.
2. **Separate code from data.** A permissive code licence says nothing about bundled
   datasets, imagery or models.
3. **Reject non-commercial licences** (`*-NC`, custom research licences). Atlas is
   commercial. OpenSky's non-commercial research licence is a common trap in this space.
4. **Check share-alike obligations** (ODbL, CC-SA). If you redistribute derived data, the
   share-alike terms may reach your own dataset.
5. **Prefer re-implementing a pattern over vendoring a dependency.** Patterns are not
   copyrightable in the same way code is, and you avoid inheriting someone else's build
   system, Node engine constraints and release cadence.
6. **Record it here** with provider, licence, obligation and expiry date if time-limited.
