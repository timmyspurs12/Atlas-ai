# Stay With Me REST and Socket.IO end-to-end testing

## Safety isolation

The end-to-end suite refuses to start without `ATLAS_E2E_DATABASE_URL`, and it rejects database names that do not contain `test` or `e2e`. It must never run against the normal `atlas` development or production database.

For local Windows/Git Bash testing, use:

```bash
npm run test:e2e:local
```

That command:

1. Starts the existing PostgreSQL and Redis containers and waits for health.
2. Creates a separate `atlas_e2e` database if needed.
3. Applies migrations only to `atlas_e2e`.
4. Uses Redis database 15.
5. Starts a real Nest application on a random local port with the production Redis Socket.IO adapter.
6. Deletes all generated users and their cascading test data after the run.

The normal `atlas` database is not reset, truncated, or migrated by this helper.

## Authorization coverage

The suite verifies:

- REST requests without JWT authentication are rejected.
- Only the intended authenticated invitee can accept an invitation by ID.
- Raw manual invitation tokens never appear in in-app or push notification payloads.
- Non-participants cannot read a session or join its Socket.IO room.
- A participant cannot publish location before mutual consent.
- Both valid participants can join the room after authentication.
- The second consent activates the session.
- An authorized location event reaches the other participant and is persisted once.
- Duplicate sequence numbers are rejected without creating another row.
- Revocation ends mutual consent immediately and blocks every later update.
- Missing-token and revoked-session sockets receive `auth:error` and disconnect.
- Already-connected sockets are revalidated on every protected action and disconnect immediately after access-token expiry or server-side session revocation.

## CI

The `Stay With Me REST and Socket.IO authorization` GitHub Actions job provisions isolated PostgreSQL 17 and Redis 8 services, deploys every migration, and executes the suite under Node 22.14.

A passing unit-test job alone is not sufficient for changes to call-safety authorization, gateway authentication, consent transitions, or realtime location updates. The end-to-end job must also be green.
