# Geo proxy module

Keyless public geo data — routing, geocoding and weather — served through the Atlas API so
the product does not depend on paid commercial mapping providers.

The design discipline is adapted from the **God's Eye View** project (MIT, code only). No
code or data was copied; see [`THIRD_PARTY_NOTICES.md`](../../../../../THIRD_PARTY_NOTICES.md).

---

## Endpoints

All routes are under `/v1/geo` and **all require authentication**.

| Method | Path                                           | Purpose                                        | Rate limit |
| ------ | ---------------------------------------------- | ---------------------------------------------- | ---------- |
| `POST` | `/v1/geo/routes/plan`                          | Road / cycle / foot route via public OSRM      | 30/min     |
| `GET`  | `/v1/geo/places/search?query=`                 | Forward geocode via Photon, Nominatim fallback | 30/min     |
| `GET`  | `/v1/geo/places/reverse?latitude=&longitude=`  | Reverse geocode via Nominatim                  | 30/min     |
| `GET`  | `/v1/geo/weather/current?latitude=&longitude=` | Current conditions via Open-Meteo              | 60/min     |

Every successful response carries `attribution` (an ODbL obligation) and `dataState`, which
is `"stale"` when the value came from cache after an upstream failure. **Clients must not
render a stale value as live.**

Error mapping is deliberate so clients retry the right things:

| HTTP status | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `400`       | Client input was invalid (`kind: 'invalid'`)                                   |
| `404`       | Nothing matched — a real answer, not an outage (`kind: 'not_found'`)           |
| `503`       | Upstream unavailable, budget exhausted, or proxy disabled (`kind: 'upstream'`) |

---

## Design rules

These are the properties that make a free tier survivable and keep Atlas from becoming an
abuse vector. They are enforced in code and covered by tests, not left to convention.

### 1. A client can never choose the destination

The DTOs expose coordinates, a query string and a profile name — **never a URL, host or
path**. Every upstream base URL comes from operator configuration
(`GEO_PROXY_*_BASE_URL`). That single omission is the difference between a proxy and an open
SSRF relay, and it must not be "improved" by accepting a target from the request.

### 2. Resolved addresses are validated and pinned

`upstream-http.service.ts` resolves DNS itself, requires **every** returned address to be
globally routable, then pins the socket to one validated address while passing the real
hostname as TLS SNI and the `Host` header.

Resolving again inside the TLS stack is what DNS rebinding exploits; pinning closes that
window. `domain/upstream.policy.ts` blocks loopback, private, link-local (including
**169.254.169.254**, the cloud metadata endpoint), CGNAT, multicast, reserved,
documentation and benchmark ranges — plus IPv6 transition addresses (IPv4-mapped, NAT64,
6to4, Teredo) that would otherwise smuggle a blocked IPv4 inside an innocent-looking IPv6
literal.

### 3. Redirects are never followed

A `3xx` is a failure, not a new destination. Following one would let an allow-listed host
point Atlas at somewhere that was never validated.

### 4. Requests and responses are bounded

Timeout 12 s, response cap 8 MB (256 KB for weather, 1 MB for geocoding), at most 12
coordinates, no leg over 600 km, no route over 2 500 km. Bounds protect the provider's free
instance as much as they protect Atlas.

### 5. One upstream call per burst

`GeoCacheService` coalesces identical in-flight requests, caches in 0.1° cells (~11 km) so a
city's worth of near-identical queries collapse into one call, serves stale values during
outages, backs off per key after failures, and enforces a per-provider daily budget. When
the budget is spent the proxy **degrades to cache** rather than exhausting a free quota.

The cache is in-memory on purpose: Phase 0 runs a single API instance
(`REDIS_OPTIONAL=true`, see [`docs/free-tier-hosting.md`](../../../../../docs/free-tier-hosting.md)),
so a shared cache would add a capped dependency for no benefit. It is bounded at 5 000
entries with oldest-first eviction — a 512 MB free instance must not leak.

### 6. Nominatim is serialised to 1 request/second

`RateSerialiser` is a promise chain, not a mutex, and it survives task rejection. The limit
is global to Nominatim rather than per user, so there is exactly one instance per process.
Photon is tried first precisely because it has no such limit.

### 7. Provider etiquette

An identifying `User-Agent` with a contact URL is required by OpenStreetMap's usage policy
and is sent on every request. Keep it accurate — `GEO_PROXY_USER_AGENT` is the value public
instance operators see in their logs.

---

## Configuration

| Variable                        | Default                                                        | Notes                                                     |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `GEO_PROXY_ENABLED`             | `true`                                                         | When false, all endpoints return 503.                     |
| `GEO_PROXY_USER_AGENT`          | `AtlasAI/0.1 (+https://github.com/timmyspurs12/Atlas-ai)`      | **Set a real contact URL before production.**             |
| `GEO_PROXY_DAILY_BUDGET`        | `2000`                                                         | Per provider, per UTC day. `0` disables the provider.     |
| `GEO_PROXY_OSRM_CAR_BASE_URL`   | `https://routing.openstreetmap.de/routed-car/route/v1/driving` | A complete route prefix ending in the OSRM profile token. |
| `GEO_PROXY_OSRM_BIKE_BASE_URL`  | `https://routing.openstreetmap.de/routed-bike/route/v1/bike`   |                                                           |
| `GEO_PROXY_OSRM_FOOT_BASE_URL`  | `https://routing.openstreetmap.de/routed-foot/route/v1/foot`   |                                                           |
| `GEO_PROXY_PHOTON_BASE_URL`     | `https://photon.komoot.io`                                     |                                                           |
| `GEO_PROXY_NOMINATIM_BASE_URL`  | `https://nominatim.openstreetmap.org`                          | Point at your own instance at scale.                      |
| `GEO_PROXY_OPEN_METEO_BASE_URL` | `https://api.open-meteo.com`                                   |                                                           |

**The OSRM profile token depends on how the instance was compiled.** `driving`, `bike` and
`foot` are the tokens the public FOSSGIS instances use, but a self-hosted OSRM may differ.
Keeping the whole prefix in configuration means an operator can correct it — or switch to
their own OSRM — without a code change.

---

## Attribution obligations (ODbL)

Routing and geocoding derive from OpenStreetMap, which is **ODbL 1.0**: attribution is
required, and share-alike applies to derived _databases_.

- Show `© OpenStreetMap contributors` wherever a route or place is rendered in the client.
- The `attribution` field on every response exists so clients can do this without
  hardcoding strings.
- Weather responses carry `Weather data by Open-Meteo.com`.

---

## ⚠️ Commercial licensing

**Open-Meteo's free tier is for non-commercial use.** Atlas has `Subscription` and
`SubscriptionPlan` models, so a commercial launch requires a paid Open-Meteo plan or a
different provider. This is tracked in
[`THIRD_PARTY_NOTICES.md`](../../../../../THIRD_PARTY_NOTICES.md).

Public OSRM and Nominatim instances are intended for _fair interactive use_. At real scale,
self-host both — that is what the base URL variables are for.

---

## Verification status

| Check                                                    | Result                                              |
| -------------------------------------------------------- | --------------------------------------------------- |
| Unit tests (policy, cache, parsers, SOS copy)            | **82 passing here, 117 including `modules/safety`** |
| `tsc --noEmit`                                           | **No new errors** against the pre-existing baseline |
| ESLint (`--max-warnings=0`, type-aware)                  | **Clean**                                           |
| Prettier                                                 | **Clean**                                           |
| **Live calls to OSRM / Photon / Nominatim / Open-Meteo** | **NOT VERIFIED**                                    |

The last row matters. The environment where this module was written had no outbound network
access to those providers (DNS resolved; TLS connections were refused), so request URLs and
response parsing were built from the providers' documented API shapes and tested against
recorded fixture payloads — **not against live responses**.

Before relying on this module, run a smoke test from a machine with normal egress:

```bash
npm run dev:api
# authenticate, then:
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST http://localhost:4000/v1/geo/routes/plan \
  -d '{"coordinates":[{"latitude":11.8464,"longitude":13.1603},{"latitude":11.6544,"longitude":13.4139}],"profile":"driving"}'

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/v1/geo/places/search?query=Maiduguri"

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/v1/geo/weather/current?latitude=11.8464&longitude=13.1603"
```

If OSRM returns an error, the most likely cause is the profile token — check
`GEO_PROXY_OSRM_*_BASE_URL` against the instance you are using.

---

## Layout

```
geo-proxy/
├── domain/
│   ├── upstream.policy.ts        # pure: SSRF classification, allow-list, bounds, budget, cache cells
│   └── upstream.policy.spec.ts   # 29 tests
├── providers/
│   ├── routing.provider.ts       # OSRM
│   ├── routing.provider.spec.ts  # 10 tests
│   ├── geocoding.provider.ts     # Photon -> Nominatim, with rate serialiser
│   ├── geocoding.provider.spec.ts# 14 tests
│   ├── weather.provider.ts       # Open-Meteo, WMO codes, safety severity
│   └── weather.provider.spec.ts  # 12 tests
├── upstream-http.service.ts      # DNS resolution, address validation, pinning, bounds
├── geo-cache.service.ts          # coalescing, TTL, serve-stale, backoff, budget, eviction
├── geo-cache.service.spec.ts     # 13 tests
├── geo-proxy.dto.ts              # client inputs — deliberately URL-free
├── geo-proxy.controller.ts
├── geo-proxy.module.ts
└── README.md
```

Domain logic is pure and network-free, matching the convention used in
`modules/transit/domain/` and `modules/locations/sharing-policy.ts`.

---

## Who consumes this today

**The SOS path** (`modules/safety/`) — see below. This is the module's reason to exist: it
turns free public geodata into something a frightened person can act on.

### The emergency path has different rules

`GeocodingProvider.reverseForEmergency()` exists alongside the ordinary `reverse()`, and
differs deliberately:

|                 | Ordinary `reverse()`            | `reverseForEmergency()`              |
| --------------- | ------------------------------- | ------------------------------------ |
| Provider        | Nominatim (1 req/s, serialised) | **Photon** (no such rule)            |
| Queueing        | Waits behind other geocodes     | **Never queues**                     |
| Daily budget    | Enforced                        | **Bypassed** (`critical: true`)      |
| Failure backoff | Enforced                        | **Bypassed**                         |
| Timeout         | 12 s                            | **2 s** (`GEO_EMERGENCY_TIMEOUT_MS`) |

The reasoning: a cost governor protects against runaway spend, but it must never become the
reason an emergency lookup is refused. Going through the Nominatim serialiser could otherwise
add _seconds_ to an SOS while ordinary place searches queued ahead of it.

Two safeguards keep that bypass from being abusable:

- Critical resolves still use the cache and still coalesce, so repeated identical lookups
  remain a single upstream call.
- A failed critical lookup does **not** record a backoff against the key, so it cannot poison
  ordinary traffic either.

`SosLocationService.describe()` wraps all of this with an outer hard timeout and a catch-all.
Its contract is that it **never throws and never blocks past the ceiling** — every failure
mode resolves to `null` and the alert is sent without a place description. The outer bound
matters because DNS resolution happens _before_ the HTTP timeout starts, and `dns.resolve`
has no default timeout of its own.

The lookup is started **before** the SOS database transaction so it overlaps with database
work instead of adding to it, and awaited only after the alert row is committed — a slow
geocoder can never prevent the alert from existing.

---

## Using it from other modules

The providers are exported from `GeoProxyModule`, so trips, transit, safety and the
assistant can inject them directly rather than calling the HTTP surface:

```ts
constructor(private readonly routing: RoutingProvider) {}

const result = await this.routing.route([origin, destination], 'driving');
if (!result.ok) {
  // result.kind distinguishes 'invalid' | 'upstream' | 'not_found'
}
```
