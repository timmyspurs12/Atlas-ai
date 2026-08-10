ALTER TABLE "call_safety_sessions"
  ADD CONSTRAINT "call_sessions_expiry_after_creation" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "call_sessions_end_after_start" CHECK ("endedAt" IS NULL OR "startsAt" IS NULL OR "endedAt" >= "startsAt");

ALTER TABLE "call_consents"
  ADD CONSTRAINT "call_consents_expiry_after_creation" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "call_consents_granted_timestamp" CHECK ("status" <> 'ACTIVE' OR "grantedAt" IS NOT NULL),
  ADD CONSTRAINT "call_consents_revoked_timestamp" CHECK ("status" <> 'REVOKED' OR "revokedAt" IS NOT NULL);

ALTER TABLE "call_invitations"
  ADD CONSTRAINT "call_invitations_expiry_after_creation" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "call_session_locations"
  ADD CONSTRAINT "call_locations_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "call_locations_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "call_locations_accuracy_nonnegative" CHECK ("accuracyM" >= 0),
  ADD CONSTRAINT "call_locations_battery_range" CHECK ("batteryPct" IS NULL OR "batteryPct" BETWEEN 0 AND 100),
  ADD CONSTRAINT "call_locations_purge_after_recording" CHECK ("purgeAt" > "recordedAt");
