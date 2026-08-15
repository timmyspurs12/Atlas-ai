-- Ensure one unresolved SOS per initiator, even under concurrent requests.
CREATE UNIQUE INDEX "sos_alerts_one_unresolved_per_initiator"
  ON "sos_alerts" ("initiatorId")
  WHERE "status" IN ('ACTIVE', 'ACKNOWLEDGED') AND "deletedAt" IS NULL;
