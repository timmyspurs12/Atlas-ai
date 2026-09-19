# Running Atlas AI in GitHub Codespaces

Codespaces is the cheapest way to get Atlas running with **real network access**, which is the
one thing a restricted sandbox cannot give you. On a personal GitHub Free account it costs
nothing: **120 core-hours and 15 GB-month of storage per month**. At the 2-core machine size
that is roughly **60 hours a month**.

Two things make it worth setting up:

1. **It unblocks the free geo providers.** The whole `geo-proxy` module runs on keyless public
   services (Photon, Nominatim, OSRM, Open-Meteo). They cannot be verified without outbound
   HTTPS. See the caveat below about what the timing numbers do and do not prove.
2. **It unblocks Prisma.** `prisma generate` downloads engine binaries at install time. In a
   network-restricted environment that fails, which cascades into typecheck errors and three
   test files that cannot even load. In Codespaces it just works, so you finally get a clean
   `tsc` and a fully green suite.

---

## 1. Create the Codespace

On GitHub, open the repo → **Code** → **Codespaces** → **Create codespace on main**.

Before you do, set two things once and forget them:

- **Settings → Billing → Spending limits → set Codespaces to `$0`.** This is the important one.
  With a $0 spending limit, Codespaces simply stops when your free quota runs out instead of
  charging you. There is no scenario where you get an unexpected bill.
- **Default region.** Pick one and keep it (see the latency caveat in §5).

The repo ships a `.devcontainer/`, so Codespaces uses it automatically: Node 22, Postgres 17.5
and Redis 8.2 as sibling containers, and the ports pre-forwarded.

> If the repo is ever transferred to an **organisation**, the free quota disappears —
> organisations are billed from the first core-hour. Keep it on your personal account.

## 2. Wait for the bootstrap

`postCreateCommand` runs `.devcontainer/bootstrap.sh`, which:

| Step            | Command                                      | Notes                                                        |
| --------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Generate env    | `node scripts/codespace-env.mjs`             | Fresh random secrets; rewrites hosts and browser-facing URLs |
| Install         | `npm ci`                                     | Downloads Prisma engines — needs egress                      |
| Build contracts | `npm run build --workspace @atlas/contracts` | Required before any typecheck or test                        |
| Prisma client   | `npm run db:generate`                        |                                                              |
| Migrations      | `npm run db:deploy`                          | `migrate deploy`, non-interactive                            |

Every step is tolerant: if one fails you still get a working editor plus a yellow warning
explaining what to run by hand. First run takes a few minutes, mostly `npm ci`.

## 3. Run the geo smoke test

This is the fastest way to learn something real. **No database, no auth, no server needed** —
so it works even if the bootstrap had problems:

```bash
cd apps/api
npm run test:geo-smoke
```

It makes about a dozen polite requests to the four providers, pushes each live response
through the real production parsers, and prints a report ending with the literal SMS text a
contact would receive. Read `apps/api/src/modules/geo-proxy/README.md` for what each line
means.

## 4. Run the full stack

```bash
npm run db:seed      # optional sample data
npm run dev:api      # API on port 4000
```

Codespaces auto-forwards 4000, 8081, 19006 and 4173. Open the **Ports** panel to get the URLs.

For the mobile app, `expo start` needs a tunnel because the dev machine is remote:

```bash
cd apps/mobile && npx expo start --tunnel
```

Run that directly rather than via `npm run dev:mobile -- --tunnel`: forwarding a flag through
two nested `npm run` levels is unreliable, and Expo will silently start without the tunnel.

`scripts/codespace-env.mjs` writes **three** env files, including `apps/mobile/.env.local` —
Expo loads env from the mobile app's own directory, not the repo root, so the browser-facing
`EXPO_PUBLIC_API_URL` has to be rewritten there as well. All three are gitignored.

### Sharing a demo

Forwarded ports are **private to your GitHub account** by default — anyone opening the URL is
shown a GitHub login. To share a demo, right-click the port in the Ports panel →
**Port Visibility** → **Public**.

Remember what that exposes: a public URL to a development API holding seeded data, with no
rate limiting beyond the app's own throttles. Fine for showing someone a flow; not a
production deployment. Set it back to private when you are done. `scripts/codespace-env.mjs`
already adds the forwarded mobile and admin origins to `CORS_ORIGINS`, so a public preview
will not fail on CORS.

## 5. ⚠️ What the timing numbers do and do not prove

**Photon and the public OSRM instances are hosted on Hetzner in Germany.** Your Codespace is
not in Germany (unless you chose it), and — far more importantly — **your actual users are in
Nigeria**, reaching a German server over mobile networks.

So the latency the smoke test reports is an **optimistic floor**, not a prediction:

| Measured from                  | Typical round trip to Hetzner DE                |
| ------------------------------ | ----------------------------------------------- |
| Codespace in Frankfurt         | ~5–20 ms                                        |
| Codespace in US East           | ~80–100 ms                                      |
| A phone on MTN/Airtel in Lagos | often 180–300 ms, and much worse when congested |

Add TLS handshake (1–2 extra round trips) and provider processing time on top.

**What the Codespace run genuinely proves:** the providers answer, the URLs and query strings
are right, the parsers accept real payloads, and OSM has usable place-name coverage for the
Nigerian coordinates you care about. Those are correctness questions and they are worth a lot.

**What it cannot prove:** that reverse geocoding completes inside `GEO_EMERGENCY_TIMEOUT_MS`
(default 2000 ms) for a real user on a real Nigerian mobile connection. Above that ceiling the
SOS silently drops the place description and sends the old link-only wording — so a feature
that "works" in Codespaces can still be invisible in production.

Two ways to get a trustworthy number:

- **Choose a distant region deliberately.** Create the Codespace in, say, `Southeast Asia` or
  `South America`. The added round trip makes the measurement a closer proxy for a bad
  connection than a European Codespace would.
- **Measure on a real device.** The only ground truth. Open the API's
  `GET /v1/geo/places/reverse` from a phone on mobile data (not Wi-Fi) a few times and watch
  the response times.

If your measurements come in near or above the ceiling, raise `GEO_EMERGENCY_TIMEOUT_MS`. It is
an env var precisely so you can tune it without a code change. The trade-off is real but
bounded: the alert row is committed **before** the lookup is awaited, so a longer ceiling
delays the SMS by at most that amount and can never prevent the alert from existing. Going
from 2 s to 4 s costs two seconds of delay and may be the difference between an alert that
names the place and one that does not.

## 6. Not burning your quota

- **Use the 2-core machine.** 120 core-hours ÷ 2 = 60 hours. The 4-core size halves that to
  30 hours, and this project does not need it.
- **Stop the Codespace when you step away.** Codespaces auto-stop after 30 minutes idle, but
  stopping manually is free insurance.
- **Delete it when finished.** Storage accrues for as long as a Codespace _exists_, even
  stopped. Default retention is 30 days — lower it under Settings → Codespaces.
- **A custom devcontainer image costs storage.** This repo pins
  `mcr.microsoft.com/devcontainers/typescript-node:22`, which is not GitHub's default image, so
  it counts against your 15 GB-month. It is pinned deliberately: the repo requires Node
  ≥ 22.12 and the default image's Node version is not guaranteed to satisfy that.
- **Check usage** at github.com/settings/billing → Codespaces.

## 7. Troubleshooting

| Symptom                                                                                 | Fix                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` fails on Prisma engine download                                                | Retry — transient. Or `npm ci --ignore-scripts` then `npm run db:generate`                                                                                    |
| `tsc` shows hundreds of errors about Prisma types                                       | The client was never generated: `npm run db:generate`                                                                                                         |
| Tests fail to _load_ in `sharing-policy`, `transit-intent`, `transit-publication` specs | Same cause — missing generated Prisma client                                                                                                                  |
| Cannot find module `@atlas/contracts`                                                   | `npm run build --workspace @atlas/contracts`                                                                                                                  |
| `ECONNREFUSED postgres:5432`                                                            | The compose service is still starting. Wait, then `npm run db:deploy`                                                                                         |
| Mobile web loads but every API call fails                                               | `EXPO_PUBLIC_API_URL` is still `localhost`. Re-run `node scripts/codespace-env.mjs --force` from _inside_ the Codespace so it picks up the forwarded hostname |
| API calls fail with a CORS error on a public preview                                    | Same fix — regenerate env so the forwarded origin is in `CORS_ORIGINS`                                                                                        |
| Smoke test fails with `fetch failed`                                                    | No egress, or a DNS/proxy problem. Confirm with `curl -I https://photon.komoot.io`                                                                            |
| Smoke test fails only on the rural Borno point                                          | Expected. Coverage gaps are real and the SOS path degrades correctly                                                                                          |
| Vitest runs stale code after you edit a spec                                            | `rm -rf apps/api/node_modules/.vite`                                                                                                                          |

Regenerating env files is always safe: `node scripts/codespace-env.mjs --force` writes fresh
secrets. Doing so invalidates existing sessions, so you will need to sign in again.
