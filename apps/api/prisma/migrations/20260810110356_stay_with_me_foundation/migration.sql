-- CreateEnum
CREATE TYPE "CallSessionMode" AS ENUM ('PSTN_COMPANION', 'ATLAS_VOIP');

-- CreateEnum
CREATE TYPE "CallSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallParticipantRole" AS ENUM ('INITIATOR', 'INVITEE');

-- CreateEnum
CREATE TYPE "CallInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CallConsentStatus" AS ENUM ('NOT_GRANTED', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CallSessionEventType" AS ENUM ('CREATED', 'INVITED', 'ACCEPTED', 'DECLINED', 'CONSENT_GRANTED', 'CONSENT_REVOKED', 'LOCATION_STARTED', 'LOCATION_STOPPED', 'CALL_LAUNCHED', 'SESSION_ENDED', 'SESSION_EXPIRED');

-- CreateTable
CREATE TABLE "call_safety_sessions" (
    "id" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "mode" "CallSessionMode" NOT NULL DEFAULT 'PSTN_COMPANION',
    "status" "CallSessionStatus" NOT NULL DEFAULT 'PENDING',
    "mutualRequired" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_safety_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_participants" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CallParticipantRole" NOT NULL,
    "joinedAt" TIMESTAMPTZ(3),
    "leftAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_consents" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "status" "CallConsentStatus" NOT NULL DEFAULT 'NOT_GRANTED',
    "precision" "LocationPrecision" NOT NULL DEFAULT 'PRECISE',
    "shareBattery" BOOLEAN NOT NULL DEFAULT false,
    "shareSpeed" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" VARCHAR(20) NOT NULL,
    "grantedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_invitations" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "invitedUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "status" "CallInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "declinedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_session_locations" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyM" DECIMAL(8,2) NOT NULL,
    "headingDeg" DECIMAL(6,2),
    "speedMps" DECIMAL(7,2),
    "batteryPct" INTEGER,
    "sequence" BIGINT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "purgeAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_session_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_session_events" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "actorId" UUID,
    "type" "CallSessionEventType" NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "call_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_safety_sessions_initiatorId_status_expiresAt_idx" ON "call_safety_sessions"("initiatorId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "call_safety_sessions_status_expiresAt_deletedAt_idx" ON "call_safety_sessions"("status", "expiresAt", "deletedAt");

-- CreateIndex
CREATE INDEX "call_participants_userId_createdAt_deletedAt_idx" ON "call_participants"("userId", "createdAt" DESC, "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_sessionId_userId_key" ON "call_participants"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_sessionId_role_key" ON "call_participants"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "call_consents_participantId_key" ON "call_consents"("participantId");

-- CreateIndex
CREATE INDEX "call_consents_status_expiresAt_deletedAt_idx" ON "call_consents"("status", "expiresAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_invitations_sessionId_key" ON "call_invitations"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "call_invitations_tokenHash_key" ON "call_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "call_invitations_invitedUserId_status_expiresAt_idx" ON "call_invitations"("invitedUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "call_session_locations_sessionId_userId_recordedAt_idx" ON "call_session_locations"("sessionId", "userId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "call_session_locations_purgeAt_deletedAt_idx" ON "call_session_locations"("purgeAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_session_locations_sessionId_userId_sequence_key" ON "call_session_locations"("sessionId", "userId", "sequence");

-- CreateIndex
CREATE INDEX "call_session_events_sessionId_occurredAt_idx" ON "call_session_events"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "call_session_events_actorId_occurredAt_idx" ON "call_session_events"("actorId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "call_safety_sessions" ADD CONSTRAINT "call_safety_sessions_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "call_safety_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_consents" ADD CONSTRAINT "call_consents_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "call_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invitations" ADD CONSTRAINT "call_invitations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "call_safety_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invitations" ADD CONSTRAINT "call_invitations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_session_locations" ADD CONSTRAINT "call_session_locations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "call_safety_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_session_locations" ADD CONSTRAINT "call_session_locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_session_events" ADD CONSTRAINT "call_session_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "call_safety_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_session_events" ADD CONSTRAINT "call_session_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
