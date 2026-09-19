# Phase 0 hosting — running Atlas AI live for $0

This is the path from "the code works locally" to "there is a public URL I can put in front
of a user" without spending money. It exists because `.github/workflows/deploy-api.yml`
targets **AWS ECR + ECS Fargate**, which costs roughly $70–150/month before a single user
arrives. That is the right _production_ target and the wrong _first_ target.

> ⚠️ **Read the caveat in §6 before showing this to anyone who might press SOS.**
> Atlas is a safety product. A free tier that sleeps is a demo platform, not a launch
> platform.

**Free-tier terms change often.** Everything below was accurate as of September 2026. Verify
each provider's current pricing page before you rely on it — several of these have tightened
their free tiers in the last two years.

---

## 1. What Atlas actually needs at runtime

| Requirement                    | Why                                                        | Can it be free?              |
| ------------------------------ | ---------------------------------------------------------- | ---------------------------- |
| PostgreSQL                     | Prisma, ~80 models, all persistent state                   | ✅ Yes                       |
| Redis                          | Socket.IO fan-out across API instances + `presence:*` keys | ⚠️ Avoidable on one instance |
| One **always-on** Node process | REST + WebSocket server                                    | ⚠️ See §6                    |
| Static hosting                 | Expo web export, admin console                             | ✅ Yes                       |
| SMS delivery                   | SOS to contacts                                            | ❌ No free substitute        |
| Push delivery                  | Notifications                                              | ✅ FCM is free               |
| Email delivery                 | SOS/notification fallback                                  | ✅ Generous free tier        |

The two hard problems are **Redis** and **always-on websockets**. Both are addressed below.

---

## 2. Removing Redis from the critical path

`@socket.io/redis-adapter` exists for one reason: when you run **several** API processes, a
socket connected to process A must receive events published by process B. On a free tier you
run **one** process, so the adapter buys you nothing and costs you a second paid-or-capped
service.

Set:

```dotenv
REDIS_OPTIONAL=true
```

What that flag does (all of it, deliberately small):

- `main.ts` skips `RedisIoAdapter` and uses Socket.IO's in-memory adapter. Logs at `log`
  level instead of emitting a scary production warning.
- `/v1/health/ready` reports `redis: "disabled"` instead of failing readiness.
- Nothing else changes. Presence tracking in `locations.service.ts` and
  `locations.gateway.ts` **already** wrapped every Redis call in `try/catch` with graceful
  degradation, so `isOnline` simply reports `false` when Redis is absent.

**Hard rule: `numInstances` must stay at 1 while `REDIS_OPTIONAL=true`.** Two instances with
in-memory adapters will each see only their own sockets, and location updates and presence
will silently diverge. `render.yaml` pins this.

If you later want Redis on a free tier anyway, **Upstash** offers ~256 MB and roughly 500k
commands/month. Budget carefully: the Socket.IO adapter publishes on every location emit, so
a chatty client burns that allowance fast. Throttle `LiveLocation` writes to one update per
N seconds per user regardless — it also cuts Postgres load.

---

## 3. The $0 stack

| Component             | Provider                    | Free allowance (verify)                        | Notes                                                                                               |
| --------------------- | --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **PostgreSQL**        | **Neon**                    | ~0.5 GB/project, ~100–190 CU-hours/mo, no card | Scale-to-zero; cold-starts after idle. Prisma connects over `DATABASE_URL` with `?sslmode=require`. |
| PostgreSQL (alt)      | Supabase                    | 500 MB, 2 projects                             | **Pauses after ~1 week idle** — worse for a demo you show occasionally.                             |
| **API + websockets**  | **Northflank** free Sandbox | 2 services that do **not** sleep               | Best fit, but wants a card for verification.                                                        |
| API (no card)         | **Render** free web service | 750 instance-hours/mo, 512 MB                  | **Sleeps after ~15 min idle**, ~1 min cold start. `render.yaml` in this repo targets it.            |
| API (alt)             | Koyeb                       | 1 service, scale-to-zero, no expiry            | Between the two.                                                                                    |
| **Mobile web export** | Cloudflare Pages / Netlify  | Genuinely free static hosting                  | `expo export --platform web`                                                                        |
| **Admin console**     | —                           | —                                              | Needs same-origin `/v1` proxy; defer to Phase 1. See §5.                                            |
| Push                  | Firebase Cloud Messaging    | Free                                           |                                                                                                     |
| Email                 | Resend                      | Free tier                                      |                                                                                                     |
| SMS                   | Twilio                      | ❌ Metered                                     | Budget for it, or launch without SMS SOS.                                                           |

**Avoid Fly.io for Phase 0** — it ended its free tier for new accounts in late 2024; new
signups get a ~2 VM-hour trial.

### Recommended combination

**Northflank (never sleeps) + Neon** if you can add a card for verification.
**Render + Neon** if you cannot. Accept the cold start and warn users.

---

## 4. Deploying the API

`render.yaml` is a complete Render Blueprint. It reuses `infra/Dockerfile.api`, so there is
exactly one build definition — the same image CI builds and AWS ECS will run in Phase 2.

```bash
# 1. Create a Neon project, copy its pooled connection string.
# 2. Generate three DIFFERENT secrets:
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"   # REFRESH_TOKEN_PEPPER
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))" # FIELD_ENCRYPTION_KEY
```

3. In Render: **New → Blueprint → select this repo**. Fill the `sync: false` variables.
4. Add your deployed web origin to `CORS_ORIGINS`. `main.ts` enforces an exact-match origin
   allow-list, so a missing origin fails closed rather than open.
5. Deploy. Check `https://<your-app>/v1/health/live` and `/v1/health/ready`.
6. Run migrations against the Neon database once from your machine (the container also runs
   `prisma migrate deploy` on boot):

```bash
DATABASE_URL="<neon-connection-string>" npm run prisma:deploy --workspace @atlas/api
```

> Neon's free tier suspends at the compute-hour cap rather than throttling. If the API
> suddenly cannot reach the database, check the Neon console first.

### Pointing the mobile app at it

`EXPO_PUBLIC_*` values are baked in at **build time**, not read at runtime:

```dotenv
EXPO_PUBLIC_API_URL=https://<your-app>.onrender.com/v1
EXPO_PUBLIC_SOCKET_URL=https://<your-app>.onrender.com
EXPO_PUBLIC_DEMO_MODE=true
```

Then `npm run build --workspace @atlas/mobile` and deploy `apps/mobile/dist` to Cloudflare
Pages or Netlify.

---

## 5. The admin console — defer it

`apps/admin` calls the API via a **relative** `/v1` path, and its `.env.example` says it
expects a reverse proxy so admin and API share an origin. That is exactly what
`infra/nginx/nginx.conf` provides locally.

Static hosts do not give you that for free, so for Phase 0 either:

- **Skip the admin console** and use `/v1/docs` (Swagger) for operations, or
- Serve the built admin assets from the API behind nginx in Phase 1, or
- Change `apps/admin/src/api.ts` to an absolute `VITE_API_BASE_URL` and add the admin origin
  to `CORS_ORIGINS`. This is a small change, but it is a _behaviour_ change — do it
  deliberately, not as a deployment hack.

---

## 6. The honest caveat: websockets on a sleeping tier

Render's free tier spins down after ~15 minutes idle and cold-starts in roughly a minute.
Northflank's does not sleep. Koyeb scale-to-zero wakes on demand.

For `SosAlert`, `EmergencyContact`, `LiveLocation` and `CallSafetySession`, a one-minute
cold start means: **someone presses SOS and nothing happens for up to 60 seconds.**

So treat the phases as what they are:

| Phase | Cost      | Honest purpose                                                                                                                                  |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | $0        | Public demo, portfolio piece, user interviews, investor traction. Label the SOS flow as simulated — `docs/BEGINNER_GUIDE.md` already does this. |
| **1** | ~$5–15/mo | One always-on small VM + managed Postgres. **The moment a real person depends on SOS, you are here.** Do not skip it.                           |
| **2** | Scaled    | The existing AWS ECS pipeline, unchanged.                                                                                                       |

Keep `deploy-api.yml`. It is an asset for later, not dead weight now.

Two mitigations that make Phase 0 far more survivable:

1. **An uptime pinger** (any free cron service hitting `/v1/health/live` every 10 minutes)
   keeps a sleeping instance warm. Crude, effective, and honest about what it is.
2. **Throttle location writes.** Free Postgres compute-hours and free Redis commands are both
   consumed by location emits. Batch to one persisted update per N seconds per user.

---

## 7. Cost lines that stay after Phase 0

These have no free substitute and should appear in any budget you show an investor:

- **Twilio** — SMS SOS delivery. The only genuinely unavoidable paid line if SMS matters.
- **Mapbox** — mobile map tiles beyond the free allowance. `components/map/MapFallback.tsx`
  provides a keyless fallback, and the geo proxy (§8) reduces reliance further.
- **OpenAI** — Assistant LLM responses. The deterministic intent parser in
  `modules/ai/intent-parser.ts` handles common queries without it, so this scales with
  ambition, not with users.
- **Apple Developer Program** — $99/year, unavoidable for an iOS release.
- **Google Play** — $25 one-off.

---

## 8. Reducing cost with free public geo data

Routing, geocoding and weather can all come from keyless public providers behind a hardened
in-API proxy — no commercial mapping spend. See
`apps/api/src/modules/geo-proxy/README.md` for the design and the provider etiquette rules
that keep Atlas from being blocked by the public instances it relies on.
