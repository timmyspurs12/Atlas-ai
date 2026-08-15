-- Add a dedicated notification type for consent-based Stay With Me invitations.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CALL_SAFETY_INVITATION';

-- Store only authenticated entity references and delivery metadata. Raw invitation
-- tokens remain hashed in call_invitations and are never copied into notifications.
ALTER TABLE "notifications"
  ADD COLUMN "entityType" VARCHAR(80),
  ADD COLUMN "entityId" UUID,
  ADD COLUMN "dedupeKey" VARCHAR(180),
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextDeliveryAt" TIMESTAMPTZ(3),
  ADD COLUMN "deliveryClaimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deliveryError" VARCHAR(500);

ALTER TABLE "notification_preferences"
  ADD COLUMN "callSafetyInvitations" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "notifications_dedupeKey_key"
  ON "notifications"("dedupeKey");

CREATE INDEX "notifications_channel_deliveredAt_nextDeliveryAt_deletedAt_idx"
  ON "notifications"("channel", "deliveredAt", "nextDeliveryAt", "deletedAt");

CREATE INDEX "notifications_entityType_entityId_createdAt_idx"
  ON "notifications"("entityType", "entityId", "createdAt" DESC);
