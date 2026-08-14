# Stay With Me background location

## Privacy contract

Atlas AI may collect call-safety coordinates only when all of the following are true:

1. The user accepted or created the Stay With Me session.
2. The user explicitly granted foreground location permission.
3. The user explicitly granted Atlas consent for this session.
4. The other verified participant also granted consent.
5. The server reports the session as `ACTIVE` and unexpired.
6. Background collection was separately selected and the operating system granted background permission.

Background mode is **off by default**. A pending session is only `ARMED`; it does not start a location watcher or background task.

## Revocation and expiry

- Stop, purge, end, sign-out, terminal realtime events, and local expiry clear the persisted tracking context and stop the dedicated foreground/background runner.
- The API independently rejects every update after either participant revokes, the session ends, or it expires.
- A background task that encounters an authorization rejection stops itself.
- Only one Stay With Me tracking context can exist on a device at a time.
- The mobile task never queues or persists coordinates. Temporary network failures drop the update rather than sending a stale point after consent changes.
- Server-side call-safety coordinates retain their existing 24-hour `purgeAt` policy, and the user can purge sooner.

## Platform behavior

- **Android native:** uses an ongoing foreground-service notification while background mode is active.
- **iOS native:** uses the system background-location indicator while background mode is active.
- **Web:** foreground-only; background mode is visibly unavailable.
- **Expo Go:** background location is not treated as supported. Use an Atlas development, preview, or production build.

## Native verification checklist

Use two verified test accounts and two physical devices. Demo mode must remain off.

1. Create and accept a 15-minute session.
2. Grant one participant consent and confirm the UI says it is waiting; verify no task/indicator starts.
3. Grant the second participant consent and verify both sessions become `ACTIVE`.
4. With background mode off, leave the Stay With Me screen and confirm sharing continues only while Atlas remains in the foreground.
5. Repeat with background mode on, approve the OS permission, background Atlas, and verify the Android notification or iOS indicator remains visible.
6. Revoke from the other device and verify the server rejects all later updates and the local task stops on the realtime event or next attempted update.
7. Repeat for End session, Delete my location, session expiry, and sign-out.
8. Confirm no `atlas.call-safety.*` tracking context remains and no location task remains registered after stopping.
9. Confirm stored `call_session_locations` rows have `purgeAt` no later than 24 hours after ingestion.

Background behavior cannot be fully validated in a browser or simulator-only workflow. Complete this checklist before marking the pull request ready for review.
