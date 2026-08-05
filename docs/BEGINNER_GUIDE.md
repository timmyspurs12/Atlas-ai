# Atlas AI — Beginner’s Next Steps

This guide takes you from “I have the source code” to a working local app. Complete one checkpoint at a time. Do **not** configure AWS, paid APIs, app stores, or production secrets until the local checkpoints work.

## Checkpoint 1 — Explore the demo first

1. Open the **Atlas AI mobile preview**.
2. Wait for the animated splash screen.
3. Choose **Explore the interactive demo**.
4. Try these flows:
   - Home → select Sarah, John, and Leo on the map.
   - Tap **Share my location** and review every consent option.
   - Open **Your people**, **Activity**, and **Atlas Assistant**.
   - Ask: `Where is Sarah?`
   - Open Settings → Places & geofences.
   - Open SOS, but remember that the preview uses a simulated demo alert.

The demo does not track a real device and does not need an API key.

**Checkpoint passed when:** you can reach all five bottom tabs and return to Home.

---

## Checkpoint 2 — Install beginner-friendly tools

Install these on your own computer:

1. **Git** — source control.
2. **Node.js 22 LTS** — JavaScript runtime. Confirm with:
   ```bash
   node --version
   ```
   It should show `v22` or newer.
3. **Docker Desktop** — runs PostgreSQL and Redis without manual database setup.
4. **Visual Studio Code** — recommended editor.
5. Optional later: Android Studio, or Xcode on macOS, for native builds.

Do not use Node 20 for production. Prisma 7 and Firebase Admin 14 require Node 22.

---

## Checkpoint 3 — Prepare the project

Open a terminal in the `atlas-ai` project folder.

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env.local
```

Generate three different local secrets:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Run that command three times. In `apps/api/.env`, replace:

- `JWT_ACCESS_SECRET`
- `REFRESH_TOKEN_PEPPER`
- `FIELD_ENCRYPTION_KEY`

Use a different generated value for each field. Never commit `.env` or `.env.local`.

**Checkpoint passed when:** `npm run typecheck` finishes without an error.

---

## Checkpoint 4 — Start PostgreSQL and Redis

Start only the data services first:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

Check them:

```bash
docker compose -f infra/docker-compose.yml ps
```

Both services should say `healthy`.

Create the database tables and demo data:

```bash
npm run db:generate
npm run prisma:deploy --workspace @atlas/api
npm run db:seed
```

Seeded demo login:

- Email: `maya@demo.atlas`
- Password: `AtlasDemo2026!`

This password is for local demo data only.

**Checkpoint passed when:** the migration and seed commands exit successfully.

---

## Checkpoint 5 — Start the API

In terminal window 1:

```bash
npm run dev:api
```

Open these URLs:

- Health: <http://localhost:4000/v1/health/live>
- API documentation: <http://localhost:4000/v1/docs>

Expected health response:

```json
{ "status": "ok" }
```

If the API cannot connect to PostgreSQL, confirm Docker is running and the `DATABASE_URL` in `apps/api/.env` uses `localhost:5432`.

---

## Checkpoint 6 — Start the mobile app

In terminal window 2:

```bash
npm run dev:mobile
```

Then:

- Press `w` for the web version.
- For a native device, use an Expo development build. Mapbox and background location require native configuration and are not fully supported by Expo Go.

For web development, keep these values in `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:4000/v1
EXPO_PUBLIC_SOCKET_URL=http://localhost:4000
EXPO_PUBLIC_DEMO_MODE=true
```

To test real API login rather than the interactive demo, choose **Sign in** and use the seeded credentials above.

### Testing on a physical phone

A phone cannot use your computer’s `localhost`. Replace `localhost` with your computer’s private LAN address, for example:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/v1
EXPO_PUBLIC_SOCKET_URL=http://192.168.1.20:4000
```

Your phone and computer must be on the same trusted Wi-Fi network. Restart Expo after changing environment values. Use HTTPS through a secure tunnel before testing outside your local network.

---

## Checkpoint 7 — Run the quality checks

Before every commit:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build --workspace @atlas/api
cd apps/mobile && npx expo-doctor && cd ../..
```

Expected result:

- ESLint: no errors.
- TypeScript: no errors.
- Unit tests: all pass.
- Expo Doctor: 20/20 checks pass.

---

## Your first real end-to-end test

Use two accounts on two devices or browser profiles:

1. Register account A and account B.
2. A sends B a friend request.
3. B accepts it.
4. A starts a 1-hour location share with B.
5. Confirm B receives updates.
6. B revokes access.
7. Confirm updates stop immediately.
8. Inspect the database audit event; coordinates must not appear in application logs.

This test proves the product’s most important rule: **no active consent means no location access**.

---

## Add external services only after local testing

Configure integrations in this order:

1. **Mapbox** — native map token and native SDK download token.
2. **Google and Apple sign-in** — provider credentials and redirect URIs.
3. **Firebase Cloud Messaging** — push notifications.
4. **Resend** — email delivery.
5. **Twilio** — phone verification and SOS SMS.
6. **OpenAI** — optional generated explanations; deterministic location tools work without it.
7. **AWS** — RDS, ElastiCache, ECS, S3, KMS, Secrets Manager, and CloudWatch.
8. **Cloudflare** — DNS, WAF, rate controls, and TLS in front of AWS.

Never put private API keys in a variable beginning with `EXPO_PUBLIC_`. Those values are bundled into the mobile app and visible to users.

---

## What to learn first in the code

Read these files in order:

1. `apps/mobile/src/navigation/AppNavigator.tsx` — all screens.
2. `apps/mobile/src/features/home/screens/HomeScreen.tsx` — main product experience.
3. `apps/mobile/src/features/location/components/ShareLocationSheet.tsx` — consent UI.
4. `apps/api/src/modules/locations/locations.service.ts` — server authorization.
5. `apps/api/src/modules/locations/locations.gateway.ts` — real-time updates.
6. `apps/api/prisma/schema.prisma` — database model.
7. `apps/api/src/modules/auth/auth.service.ts` — sessions and rotating refresh tokens.

Do not begin by changing the entire architecture. Make one small change, run the checks, and commit it.

---

## Recommended next milestone

Your next engineering milestone should be:

> **Run the two-account consent test locally and record every failure.**

Only after that passes should you add Mapbox credentials and test background location on real iOS and Android development builds.
