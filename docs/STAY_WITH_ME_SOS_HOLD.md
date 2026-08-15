# Stay With Me native hold-to-SOS

## Safety behavior

On native iOS and Android builds, an active Stay With Me session uses a deliberate three-second press-and-hold control before showing the final Yes/No confirmation.

- Releasing before three seconds cancels locally and sends nothing.
- The control displays live progress and remaining seconds.
- App backgrounding, interruptions, component unmounting, or disabling the control cancels an incomplete hold.
- Completion still opens the explicit confirmation required by Atlas safety policy.
- Selecting **No** discards the prepared action and sends nothing.
- Selecting **Yes** starts location resolution and the SOS API operation immediately. The three-second result spinner is only a minimum visible feedback period; it never delays the emergency request.
- A recent location of acceptable accuracy may be prepared while the confirmation is visible. Coordinates are held only in memory and are not sent until final confirmation.
- The existing client request UUID, service idempotency check, application action lock, and PostgreSQL unresolved-SOS uniqueness constraint remain active.

The web preview retains a normal confirmation button because browser press-and-hold behavior is inconsistent. Assistive-technology activation may open the same final confirmation without requiring a physical hold so the emergency action remains accessible.

## Native verification checklist

Use a physical development/preview build and an `ACTIVE` two-user Stay With Me session:

1. Press and release before three seconds; verify no confirmation and no SOS row.
2. Hold for the full three seconds; verify visible progress and the final confirmation.
3. Select **No**; verify no API request and no SOS row.
4. Repeat, select **Yes**, and verify the SOS API request starts immediately while feedback remains visible for at least three seconds.
5. Rapidly repeat the gesture and confirm only one unresolved SOS exists for the initiator.
6. Background the app mid-hold and verify the hold cancels.
7. Revoke/end the session and verify the hold control disables.
8. Test VoiceOver/TalkBack activation and verify it still requires final confirmation.
9. Resolve or cancel the test SOS before repeating live tests.

Use only test emergency contacts during verification. Do not rely on demo coordinates for real emergency guidance.
