# Stay With Me invitation delivery

## Security model

Atlas supports two invitation paths with different credentials:

1. **Manual link:** the creator receives a random invitation token once. The API stores only its peppered SHA-256 hash. The raw token is never logged, placed in a notification, or recoverable after refresh.
2. **Authenticated in-app/push invitation:** notifications contain only `invitationId`, `sessionId`, `expiresAt`, and a fixed event kind. Accept/decline-by-ID endpoints require a valid Atlas access token and verify that the signed-in user is the intended invitee and that the invitation is still pending and unexpired.

A UUID reference is not sufficient to accept an invitation without the intended recipient's authenticated session.

## Delivery behavior

- The session, hashed invitation, in-app notification, and push outbox record are created in one database transaction.
- Push delivery is optional and off at the operating-system level until the user taps **Enable**.
- The lock-screen message is generic and includes no name, location, phone number, raw invitation token, or call details.
- Push tokens are bound to the authenticated device from the JWT and can be removed in-app immediately.
- Invalid Expo device tokens are disabled automatically.
- Failed delivery uses a bounded retry with a database claim lease to reduce duplicate delivery across API instances.
- In-app delivery remains available when push is disabled, unavailable, or delayed.
- Accepting or declining marks the in-app item read and prevents queued push delivery.

## Configuration

Mobile native builds require:

```dotenv
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

The API supports:

```dotenv
EXPO_PUSH_ENABLED=true
EXPO_ACCESS_TOKEN=
```

`EXPO_ACCESS_TOKEN` is optional unless Expo Push Security is enabled for the project. Never commit either real value.

## Native verification

Use two verified accounts on physical devices and a development/preview build:

1. Enable push invitations on the invitee device.
2. Create a 15-minute Stay With Me session from the initiator.
3. Confirm an in-app notification appears with a generic safe payload.
4. Confirm the push lock-screen text exposes no token or coordinates.
5. Open the notification, accept by authenticated invitation ID, and verify the session loads as `PENDING` without starting location.
6. Repeat and decline; verify the initiator receives the realtime terminal update.
7. Disable push in-app and verify the device token is removed while in-app delivery still works.
8. Expire an invitation and verify both token and ID acceptance paths reject it.
9. Query notification JSON and confirm it has no `invitationToken`, token hash, latitude, or longitude.

Do not mark the feature pull request ready until this physical-device test is complete.
