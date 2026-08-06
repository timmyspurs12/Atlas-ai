-- CreateEnum
CREATE TYPE "AdministrativeAreaType" AS ENUM ('COUNTRY', 'STATE', 'FCT', 'LGA', 'CITY', 'TOWN', 'DISTRICT', 'WARD', 'LOCALITY');

-- CreateEnum
CREATE TYPE "TransitCoverageStatus" AS ENUM ('COMING_SOON', 'DATA_COLLECTION', 'BETA', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TransitMode" AS ENUM ('DANFO', 'BRT', 'CITY_BUS', 'KOROPE', 'KEKE', 'SHARED_TAXI', 'INTERCITY_BUS', 'RAIL', 'FERRY', 'WALK', 'OKADA', 'OTHER');

-- CreateEnum
CREATE TYPE "TransitPlaceType" AS ENUM ('STOP', 'MOTOR_PARK', 'TERMINAL', 'STATION', 'JUNCTION', 'LANDMARK', 'JETTY', 'PICKUP_POINT');

-- CreateEnum
CREATE TYPE "TransitRouteScope" AS ENUM ('URBAN', 'INTERCITY', 'REGIONAL');

-- CreateEnum
CREATE TYPE "TransitRouteStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "TransitDirection" AS ENUM ('OUTBOUND', 'INBOUND', 'LOOP', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "TransitReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransitDataSourceType" AS ENUM ('FIELD_SURVEY', 'GOVERNMENT_AGENCY', 'TRANSPORT_OPERATOR', 'UNION_PARTNER', 'INTERNAL_RESEARCH');

-- CreateEnum
CREATE TYPE "TransitImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'NEEDS_CORRECTION', 'READY', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransitJourneyPreference" AS ENUM ('BALANCED', 'CHEAPEST', 'FASTEST', 'FEWEST_TRANSFERS', 'LEAST_WALKING', 'FORMAL_TRANSIT');

-- CreateEnum
CREATE TYPE "TransitServiceDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "TransitFareTimeBand" AS ENUM ('ANYTIME', 'MORNING_PEAK', 'EVENING_PEAK', 'OFF_PEAK', 'NIGHT', 'WEEKEND');

-- CreateEnum
CREATE TYPE "TransitDisruptionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransitDisruptionSeverity" AS ENUM ('INFO', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TransitJourneyStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'TRANSIT_EDITOR';
ALTER TYPE "UserRole" ADD VALUE 'TRANSIT_REVIEWER';

-- CreateTable
CREATE TABLE "administrative_areas" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "code" VARCHAR(40),
    "type" "AdministrativeAreaType" NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'NG',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Lagos',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "administrative_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_coverages" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "status" "TransitCoverageStatus" NOT NULL DEFAULT 'COMING_SOON',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "dataVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSurveyedAt" TIMESTAMPTZ(3),
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_data_sources" (
    "id" UUID NOT NULL,
    "areaId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "type" "TransitDataSourceType" NOT NULL,
    "organization" VARCHAR(160),
    "sourceUrl" VARCHAR(2048),
    "licenseName" VARCHAR(120),
    "licenseUrl" VARCHAR(2048),
    "reliabilityScore" INTEGER NOT NULL DEFAULT 50,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_places" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "sourceId" UUID,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalizedName" VARCHAR(160) NOT NULL,
    "type" "TransitPlaceType" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "locationAccuracyM" DECIMAL(8,2),
    "geohash" VARCHAR(12),
    "address" VARCHAR(300),
    "landmarkDescription" TEXT,
    "defaultBoardingDirections" TEXT,
    "isWheelchairAccessible" BOOLEAN,
    "verificationStatus" "TransitReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_place_aliases" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "alias" VARCHAR(160) NOT NULL,
    "normalizedAlias" VARCHAR(160) NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-NG',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_place_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_place_modes" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "mode" "TransitMode" NOT NULL,
    "boardingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "alightingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "operatingNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_place_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_routes" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "sourceId" UUID,
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "originPlaceId" UUID NOT NULL,
    "destinationPlaceId" UUID NOT NULL,
    "currentRevisionId" UUID,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "normalizedName" VARCHAR(180) NOT NULL,
    "scope" "TransitRouteScope" NOT NULL,
    "mode" "TransitMode" NOT NULL,
    "status" "TransitRouteStatus" NOT NULL DEFAULT 'DRAFT',
    "direction" "TransitDirection" NOT NULL,
    "destinationSign" VARCHAR(180),
    "operatorName" VARCHAR(180),
    "publicDescription" TEXT,
    "boardingSummary" TEXT,
    "durationMinMinutes" INTEGER,
    "durationMaxMinutes" INTEGER,
    "dataVersion" INTEGER NOT NULL DEFAULT 1,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_route_stops" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "platformName" VARCHAR(120),
    "pickupAllowed" BOOLEAN NOT NULL DEFAULT true,
    "dropoffAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isTimingPoint" BOOLEAN NOT NULL DEFAULT false,
    "boardingInstructions" TEXT,
    "alightingInstructions" TEXT,
    "averageDwellSeconds" INTEGER,
    "distanceFromStartM" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_segments" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "fromStopId" UUID NOT NULL,
    "toStopId" UUID NOT NULL,
    "segmentOrder" INTEGER NOT NULL,
    "distanceM" INTEGER,
    "durationMinMinutes" INTEGER,
    "durationMaxMinutes" INTEGER,
    "fareMinKobo" INTEGER,
    "fareMaxKobo" INTEGER,
    "roadDescription" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_service_windows" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "day" "TransitServiceDay" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "endsNextDay" BOOLEAN NOT NULL DEFAULT false,
    "frequencyMinMinutes" INTEGER,
    "frequencyMaxMinutes" INTEGER,
    "isApproximate" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_service_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_fare_observations" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "fromPlaceId" UUID,
    "toPlaceId" UUID,
    "amountMinKobo" INTEGER NOT NULL,
    "amountMaxKobo" INTEGER NOT NULL,
    "currencyCode" CHAR(3) NOT NULL DEFAULT 'NGN',
    "timeBand" "TransitFareTimeBand" NOT NULL DEFAULT 'ANYTIME',
    "confidenceScore" INTEGER NOT NULL DEFAULT 50,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "validUntil" TIMESTAMPTZ(3),
    "evidenceFileKey" VARCHAR(512),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_fare_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_route_revisions" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "changeSummary" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_route_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_route_reviews" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "status" "TransitReviewStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_route_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_import_jobs" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "sourceId" UUID,
    "createdById" UUID NOT NULL,
    "status" "TransitImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "originalFileName" VARCHAR(255) NOT NULL,
    "fileKey" VARCHAR(512) NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "errorReportKey" VARCHAR(512),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_disruptions" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "routeId" UUID,
    "placeId" UUID,
    "sourceId" UUID,
    "publishedById" UUID NOT NULL,
    "status" "TransitDisruptionStatus" NOT NULL,
    "severity" "TransitDisruptionSeverity" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "transit_disruptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_transit_journeys" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originPlaceId" UUID,
    "destinationPlaceId" UUID,
    "originLabel" VARCHAR(180) NOT NULL,
    "destinationLabel" VARCHAR(180) NOT NULL,
    "preference" "TransitJourneyPreference" NOT NULL DEFAULT 'BALANCED',
    "status" "TransitJourneyStatus" NOT NULL DEFAULT 'PLANNED',
    "totalFareMinKobo" INTEGER,
    "totalFareMaxKobo" INTEGER,
    "totalDurationMinMinutes" INTEGER,
    "totalDurationMaxMinutes" INTEGER,
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "walkingDistanceM" INTEGER NOT NULL DEFAULT 0,
    "plannedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "saved_transit_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_transit_journey_legs" (
    "id" UUID NOT NULL,
    "journeyId" UUID NOT NULL,
    "routeId" UUID,
    "fromPlaceId" UUID,
    "toPlaceId" UUID,
    "legOrder" INTEGER NOT NULL,
    "mode" "TransitMode" NOT NULL,
    "fromLabel" VARCHAR(180) NOT NULL,
    "toLabel" VARCHAR(180) NOT NULL,
    "destinationSign" VARCHAR(180),
    "instructions" TEXT NOT NULL,
    "fareMinKobo" INTEGER,
    "fareMaxKobo" INTEGER,
    "durationMinMinutes" INTEGER,
    "durationMaxMinutes" INTEGER,
    "distanceM" INTEGER,
    "routeDataVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "saved_transit_journey_legs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrative_areas_slug_key" ON "administrative_areas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_areas_code_key" ON "administrative_areas"("code");

-- CreateIndex
CREATE INDEX "administrative_areas_parentId_type_deletedAt_idx" ON "administrative_areas"("parentId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "administrative_areas_countryCode_type_isActive_deletedAt_idx" ON "administrative_areas"("countryCode", "type", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "administrative_areas_normalizedName_idx" ON "administrative_areas"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_areas_parentId_normalizedName_type_key" ON "administrative_areas"("parentId", "normalizedName", "type");

-- CreateIndex
CREATE UNIQUE INDEX "transit_coverages_areaId_key" ON "transit_coverages"("areaId");

-- CreateIndex
CREATE INDEX "transit_coverages_status_deletedAt_idx" ON "transit_coverages"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_coverages_qualityScore_status_idx" ON "transit_coverages"("qualityScore", "status");

-- CreateIndex
CREATE INDEX "transit_data_sources_areaId_type_deletedAt_idx" ON "transit_data_sources"("areaId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_data_sources_isActive_reliabilityScore_idx" ON "transit_data_sources"("isActive", "reliabilityScore");

-- CreateIndex
CREATE UNIQUE INDEX "transit_places_code_key" ON "transit_places"("code");

-- CreateIndex
CREATE INDEX "transit_places_areaId_type_isActive_deletedAt_idx" ON "transit_places"("areaId", "type", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_places_areaId_normalizedName_deletedAt_idx" ON "transit_places"("areaId", "normalizedName", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_places_normalizedName_idx" ON "transit_places"("normalizedName");

-- CreateIndex
CREATE INDEX "transit_places_geohash_idx" ON "transit_places"("geohash");

-- CreateIndex
CREATE INDEX "transit_places_latitude_longitude_idx" ON "transit_places"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "transit_places_verificationStatus_isActive_idx" ON "transit_places"("verificationStatus", "isActive");

-- CreateIndex
CREATE INDEX "transit_place_aliases_normalizedAlias_locale_deletedAt_idx" ON "transit_place_aliases"("normalizedAlias", "locale", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_place_aliases_placeId_isPrimary_deletedAt_idx" ON "transit_place_aliases"("placeId", "isPrimary", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transit_place_aliases_placeId_normalizedAlias_locale_key" ON "transit_place_aliases"("placeId", "normalizedAlias", "locale");

-- CreateIndex
CREATE INDEX "transit_place_modes_mode_boardingAllowed_deletedAt_idx" ON "transit_place_modes"("mode", "boardingAllowed", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_place_modes_placeId_deletedAt_idx" ON "transit_place_modes"("placeId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transit_place_modes_placeId_mode_key" ON "transit_place_modes"("placeId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "transit_routes_currentRevisionId_key" ON "transit_routes"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "transit_routes_code_key" ON "transit_routes"("code");

-- CreateIndex
CREATE INDEX "transit_routes_areaId_status_mode_deletedAt_idx" ON "transit_routes"("areaId", "status", "mode", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_routes_originPlaceId_destinationPlaceId_status_idx" ON "transit_routes"("originPlaceId", "destinationPlaceId", "status");

-- CreateIndex
CREATE INDEX "transit_routes_normalizedName_idx" ON "transit_routes"("normalizedName");

-- CreateIndex
CREATE INDEX "transit_routes_createdById_status_updatedAt_idx" ON "transit_routes"("createdById", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "transit_routes_publishedAt_status_idx" ON "transit_routes"("publishedAt", "status");

-- CreateIndex
CREATE INDEX "transit_route_stops_placeId_routeId_deletedAt_idx" ON "transit_route_stops"("placeId", "routeId", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_route_stops_routeId_pickupAllowed_dropoffAllowed_idx" ON "transit_route_stops"("routeId", "pickupAllowed", "dropoffAllowed");

-- CreateIndex
CREATE UNIQUE INDEX "transit_route_stops_routeId_stopOrder_key" ON "transit_route_stops"("routeId", "stopOrder");

-- CreateIndex
CREATE INDEX "transit_segments_fromStopId_toStopId_idx" ON "transit_segments"("fromStopId", "toStopId");

-- CreateIndex
CREATE INDEX "transit_segments_routeId_deletedAt_idx" ON "transit_segments"("routeId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transit_segments_routeId_segmentOrder_key" ON "transit_segments"("routeId", "segmentOrder");

-- CreateIndex
CREATE UNIQUE INDEX "transit_segments_routeId_fromStopId_toStopId_key" ON "transit_segments"("routeId", "fromStopId", "toStopId");

-- CreateIndex
CREATE INDEX "transit_service_windows_routeId_day_deletedAt_idx" ON "transit_service_windows"("routeId", "day", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_service_windows_day_startMinute_endMinute_idx" ON "transit_service_windows"("day", "startMinute", "endMinute");

-- CreateIndex
CREATE UNIQUE INDEX "transit_service_windows_routeId_day_startMinute_endMinute_key" ON "transit_service_windows"("routeId", "day", "startMinute", "endMinute");

-- CreateIndex
CREATE INDEX "transit_fare_observations_routeId_observedAt_deletedAt_idx" ON "transit_fare_observations"("routeId", "observedAt" DESC, "deletedAt");

-- CreateIndex
CREATE INDEX "transit_fare_observations_fromPlaceId_toPlaceId_observedAt_idx" ON "transit_fare_observations"("fromPlaceId", "toPlaceId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "transit_fare_observations_sourceId_observedAt_idx" ON "transit_fare_observations"("sourceId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "transit_fare_observations_validUntil_confidenceScore_idx" ON "transit_fare_observations"("validUntil", "confidenceScore");

-- CreateIndex
CREATE INDEX "transit_route_revisions_routeId_createdAt_idx" ON "transit_route_revisions"("routeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transit_route_revisions_createdById_submittedAt_idx" ON "transit_route_revisions"("createdById", "submittedAt");

-- CreateIndex
CREATE INDEX "transit_route_revisions_checksum_idx" ON "transit_route_revisions"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "transit_route_revisions_routeId_version_key" ON "transit_route_revisions"("routeId", "version");

-- CreateIndex
CREATE INDEX "transit_route_reviews_reviewerId_status_createdAt_idx" ON "transit_route_reviews"("reviewerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "transit_route_reviews_revisionId_status_deletedAt_idx" ON "transit_route_reviews"("revisionId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transit_route_reviews_revisionId_reviewerId_key" ON "transit_route_reviews"("revisionId", "reviewerId");

-- CreateIndex
CREATE INDEX "transit_import_jobs_areaId_status_createdAt_idx" ON "transit_import_jobs"("areaId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transit_import_jobs_createdById_status_idx" ON "transit_import_jobs"("createdById", "status");

-- CreateIndex
CREATE INDEX "transit_import_jobs_checksum_idx" ON "transit_import_jobs"("checksum");

-- CreateIndex
CREATE INDEX "transit_disruptions_areaId_status_startsAt_endsAt_idx" ON "transit_disruptions"("areaId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "transit_disruptions_routeId_status_deletedAt_idx" ON "transit_disruptions"("routeId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_disruptions_placeId_status_deletedAt_idx" ON "transit_disruptions"("placeId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "transit_disruptions_severity_status_startsAt_idx" ON "transit_disruptions"("severity", "status", "startsAt");

-- CreateIndex
CREATE INDEX "saved_transit_journeys_userId_status_plannedAt_deletedAt_idx" ON "saved_transit_journeys"("userId", "status", "plannedAt" DESC, "deletedAt");

-- CreateIndex
CREATE INDEX "saved_transit_journeys_originPlaceId_destinationPlaceId_idx" ON "saved_transit_journeys"("originPlaceId", "destinationPlaceId");

-- CreateIndex
CREATE INDEX "saved_transit_journeys_expiresAt_status_idx" ON "saved_transit_journeys"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "saved_transit_journey_legs_routeId_routeDataVersion_idx" ON "saved_transit_journey_legs"("routeId", "routeDataVersion");

-- CreateIndex
CREATE INDEX "saved_transit_journey_legs_fromPlaceId_toPlaceId_idx" ON "saved_transit_journey_legs"("fromPlaceId", "toPlaceId");

-- CreateIndex
CREATE INDEX "saved_transit_journey_legs_journeyId_deletedAt_idx" ON "saved_transit_journey_legs"("journeyId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_transit_journey_legs_journeyId_legOrder_key" ON "saved_transit_journey_legs"("journeyId", "legOrder");

-- AddForeignKey
ALTER TABLE "administrative_areas" ADD CONSTRAINT "administrative_areas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "administrative_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_coverages" ADD CONSTRAINT "transit_coverages_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_data_sources" ADD CONSTRAINT "transit_data_sources_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_places" ADD CONSTRAINT "transit_places_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_places" ADD CONSTRAINT "transit_places_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "transit_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_place_aliases" ADD CONSTRAINT "transit_place_aliases_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "transit_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_place_modes" ADD CONSTRAINT "transit_place_modes_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "transit_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "transit_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_originPlaceId_fkey" FOREIGN KEY ("originPlaceId") REFERENCES "transit_places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_destinationPlaceId_fkey" FOREIGN KEY ("destinationPlaceId") REFERENCES "transit_places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_routes" ADD CONSTRAINT "transit_routes_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "transit_route_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_stops" ADD CONSTRAINT "transit_route_stops_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_stops" ADD CONSTRAINT "transit_route_stops_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "transit_places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_segments" ADD CONSTRAINT "transit_segments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_segments" ADD CONSTRAINT "transit_segments_fromStopId_fkey" FOREIGN KEY ("fromStopId") REFERENCES "transit_route_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_segments" ADD CONSTRAINT "transit_segments_toStopId_fkey" FOREIGN KEY ("toStopId") REFERENCES "transit_route_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_service_windows" ADD CONSTRAINT "transit_service_windows_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_fare_observations" ADD CONSTRAINT "transit_fare_observations_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_fare_observations" ADD CONSTRAINT "transit_fare_observations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "transit_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_fare_observations" ADD CONSTRAINT "transit_fare_observations_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_fare_observations" ADD CONSTRAINT "transit_fare_observations_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_fare_observations" ADD CONSTRAINT "transit_fare_observations_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_revisions" ADD CONSTRAINT "transit_route_revisions_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_revisions" ADD CONSTRAINT "transit_route_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_reviews" ADD CONSTRAINT "transit_route_reviews_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "transit_route_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_route_reviews" ADD CONSTRAINT "transit_route_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_import_jobs" ADD CONSTRAINT "transit_import_jobs_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_import_jobs" ADD CONSTRAINT "transit_import_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "transit_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_import_jobs" ADD CONSTRAINT "transit_import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_disruptions" ADD CONSTRAINT "transit_disruptions_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "administrative_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_disruptions" ADD CONSTRAINT "transit_disruptions_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_disruptions" ADD CONSTRAINT "transit_disruptions_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_disruptions" ADD CONSTRAINT "transit_disruptions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "transit_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_disruptions" ADD CONSTRAINT "transit_disruptions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journeys" ADD CONSTRAINT "saved_transit_journeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journeys" ADD CONSTRAINT "saved_transit_journeys_originPlaceId_fkey" FOREIGN KEY ("originPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journeys" ADD CONSTRAINT "saved_transit_journeys_destinationPlaceId_fkey" FOREIGN KEY ("destinationPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journey_legs" ADD CONSTRAINT "saved_transit_journey_legs_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "saved_transit_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journey_legs" ADD CONSTRAINT "saved_transit_journey_legs_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transit_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journey_legs" ADD CONSTRAINT "saved_transit_journey_legs_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_transit_journey_legs" ADD CONSTRAINT "saved_transit_journey_legs_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "transit_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Atlas Routes PostgreSQL integrity constraints.
-- Append this file to the generated nationwide_transit_foundation migration before applying it.

ALTER TABLE "administrative_areas"
  ADD CONSTRAINT "administrative_areas_latitude_range" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "administrative_areas_longitude_range" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

ALTER TABLE "transit_coverages"
  ADD CONSTRAINT "transit_coverages_quality_score_range" CHECK ("qualityScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "transit_coverages_data_version_positive" CHECK ("dataVersion" >= 1),
  ADD CONSTRAINT "transit_coverages_verified_timestamp" CHECK ("status" <> 'VERIFIED' OR "lastVerifiedAt" IS NOT NULL),
  ADD CONSTRAINT "transit_coverages_published_timestamp" CHECK ("publishedAt" IS NULL OR "status" IN ('BETA', 'VERIFIED'));

ALTER TABLE "transit_data_sources"
  ADD CONSTRAINT "transit_data_sources_reliability_range" CHECK ("reliabilityScore" BETWEEN 0 AND 100);

ALTER TABLE "transit_places"
  ADD CONSTRAINT "transit_places_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "transit_places_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "transit_places_accuracy_nonnegative" CHECK ("locationAccuracyM" IS NULL OR "locationAccuracyM" >= 0),
  ADD CONSTRAINT "transit_places_verified_timestamp" CHECK ("verificationStatus" <> 'APPROVED' OR "verifiedAt" IS NOT NULL);

ALTER TABLE "transit_routes"
  ADD CONSTRAINT "transit_routes_origin_destination" CHECK ("direction" = 'LOOP' OR "originPlaceId" <> "destinationPlaceId"),
  ADD CONSTRAINT "transit_routes_duration_min_nonnegative" CHECK ("durationMinMinutes" IS NULL OR "durationMinMinutes" >= 0),
  ADD CONSTRAINT "transit_routes_duration_max_nonnegative" CHECK ("durationMaxMinutes" IS NULL OR "durationMaxMinutes" >= 0),
  ADD CONSTRAINT "transit_routes_duration_range" CHECK ("durationMinMinutes" IS NULL OR "durationMaxMinutes" IS NULL OR "durationMinMinutes" <= "durationMaxMinutes"),
  ADD CONSTRAINT "transit_routes_data_version_positive" CHECK ("dataVersion" >= 1),
  ADD CONSTRAINT "transit_routes_confidence_range" CHECK ("confidenceScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "transit_routes_publish_integrity" CHECK (
    "status" <> 'PUBLISHED'
    OR (
      "currentRevisionId" IS NOT NULL
      AND "publishedById" IS NOT NULL
      AND "publishedAt" IS NOT NULL
      AND "lastVerifiedAt" IS NOT NULL
    )
  );

ALTER TABLE "transit_route_stops"
  ADD CONSTRAINT "transit_route_stops_order_nonnegative" CHECK ("stopOrder" >= 0),
  ADD CONSTRAINT "transit_route_stops_dwell_nonnegative" CHECK ("averageDwellSeconds" IS NULL OR "averageDwellSeconds" >= 0),
  ADD CONSTRAINT "transit_route_stops_distance_nonnegative" CHECK ("distanceFromStartM" IS NULL OR "distanceFromStartM" >= 0);

ALTER TABLE "transit_segments"
  ADD CONSTRAINT "transit_segments_distinct_stops" CHECK ("fromStopId" <> "toStopId"),
  ADD CONSTRAINT "transit_segments_order_nonnegative" CHECK ("segmentOrder" >= 0),
  ADD CONSTRAINT "transit_segments_distance_nonnegative" CHECK ("distanceM" IS NULL OR "distanceM" >= 0),
  ADD CONSTRAINT "transit_segments_duration_min_nonnegative" CHECK ("durationMinMinutes" IS NULL OR "durationMinMinutes" >= 0),
  ADD CONSTRAINT "transit_segments_duration_max_nonnegative" CHECK ("durationMaxMinutes" IS NULL OR "durationMaxMinutes" >= 0),
  ADD CONSTRAINT "transit_segments_duration_range" CHECK ("durationMinMinutes" IS NULL OR "durationMaxMinutes" IS NULL OR "durationMinMinutes" <= "durationMaxMinutes"),
  ADD CONSTRAINT "transit_segments_fare_min_nonnegative" CHECK ("fareMinKobo" IS NULL OR "fareMinKobo" >= 0),
  ADD CONSTRAINT "transit_segments_fare_max_nonnegative" CHECK ("fareMaxKobo" IS NULL OR "fareMaxKobo" >= 0),
  ADD CONSTRAINT "transit_segments_fare_range" CHECK ("fareMinKobo" IS NULL OR "fareMaxKobo" IS NULL OR "fareMinKobo" <= "fareMaxKobo");

ALTER TABLE "transit_service_windows"
  ADD CONSTRAINT "transit_service_windows_start_minute_range" CHECK ("startMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "transit_service_windows_end_minute_range" CHECK ("endMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "transit_service_windows_time_order" CHECK ("endsNextDay" OR "endMinute" > "startMinute"),
  ADD CONSTRAINT "transit_service_windows_frequency_min_positive" CHECK ("frequencyMinMinutes" IS NULL OR "frequencyMinMinutes" > 0),
  ADD CONSTRAINT "transit_service_windows_frequency_max_positive" CHECK ("frequencyMaxMinutes" IS NULL OR "frequencyMaxMinutes" > 0),
  ADD CONSTRAINT "transit_service_windows_frequency_range" CHECK ("frequencyMinMinutes" IS NULL OR "frequencyMaxMinutes" IS NULL OR "frequencyMinMinutes" <= "frequencyMaxMinutes");

ALTER TABLE "transit_fare_observations"
  ADD CONSTRAINT "transit_fares_amount_min_nonnegative" CHECK ("amountMinKobo" >= 0),
  ADD CONSTRAINT "transit_fares_amount_max_nonnegative" CHECK ("amountMaxKobo" >= 0),
  ADD CONSTRAINT "transit_fares_amount_range" CHECK ("amountMinKobo" <= "amountMaxKobo"),
  ADD CONSTRAINT "transit_fares_confidence_range" CHECK ("confidenceScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "transit_fares_validity_range" CHECK ("validUntil" IS NULL OR "validUntil" > "observedAt");

ALTER TABLE "transit_route_revisions"
  ADD CONSTRAINT "transit_route_revisions_version_positive" CHECK ("version" >= 1);

ALTER TABLE "transit_route_reviews"
  ADD CONSTRAINT "transit_route_reviews_decision_timestamp" CHECK ("status" = 'PENDING' OR "reviewedAt" IS NOT NULL);

ALTER TABLE "transit_import_jobs"
  ADD CONSTRAINT "transit_import_jobs_total_nonnegative" CHECK ("totalRows" >= 0),
  ADD CONSTRAINT "transit_import_jobs_valid_nonnegative" CHECK ("validRows" >= 0),
  ADD CONSTRAINT "transit_import_jobs_invalid_nonnegative" CHECK ("invalidRows" >= 0),
  ADD CONSTRAINT "transit_import_jobs_imported_nonnegative" CHECK ("importedRows" >= 0),
  ADD CONSTRAINT "transit_import_jobs_imported_not_above_valid" CHECK ("importedRows" <= "validRows");

ALTER TABLE "transit_disruptions"
  ADD CONSTRAINT "transit_disruptions_time_range" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  ADD CONSTRAINT "transit_disruptions_publish_integrity" CHECK ("status" NOT IN ('ACTIVE', 'RESOLVED') OR "publishedAt" IS NOT NULL),
  ADD CONSTRAINT "transit_disruptions_resolve_integrity" CHECK ("status" <> 'RESOLVED' OR "resolvedAt" IS NOT NULL);

ALTER TABLE "saved_transit_journeys"
  ADD CONSTRAINT "saved_journeys_fare_min_nonnegative" CHECK ("totalFareMinKobo" IS NULL OR "totalFareMinKobo" >= 0),
  ADD CONSTRAINT "saved_journeys_fare_max_nonnegative" CHECK ("totalFareMaxKobo" IS NULL OR "totalFareMaxKobo" >= 0),
  ADD CONSTRAINT "saved_journeys_fare_range" CHECK ("totalFareMinKobo" IS NULL OR "totalFareMaxKobo" IS NULL OR "totalFareMinKobo" <= "totalFareMaxKobo"),
  ADD CONSTRAINT "saved_journeys_duration_min_nonnegative" CHECK ("totalDurationMinMinutes" IS NULL OR "totalDurationMinMinutes" >= 0),
  ADD CONSTRAINT "saved_journeys_duration_max_nonnegative" CHECK ("totalDurationMaxMinutes" IS NULL OR "totalDurationMaxMinutes" >= 0),
  ADD CONSTRAINT "saved_journeys_duration_range" CHECK ("totalDurationMinMinutes" IS NULL OR "totalDurationMaxMinutes" IS NULL OR "totalDurationMinMinutes" <= "totalDurationMaxMinutes"),
  ADD CONSTRAINT "saved_journeys_transfers_nonnegative" CHECK ("transferCount" >= 0),
  ADD CONSTRAINT "saved_journeys_walking_nonnegative" CHECK ("walkingDistanceM" >= 0),
  ADD CONSTRAINT "saved_journeys_expiry_range" CHECK ("expiresAt" IS NULL OR "expiresAt" > "plannedAt");

ALTER TABLE "saved_transit_journey_legs"
  ADD CONSTRAINT "saved_journey_legs_order_nonnegative" CHECK ("legOrder" >= 0),
  ADD CONSTRAINT "saved_journey_legs_fare_min_nonnegative" CHECK ("fareMinKobo" IS NULL OR "fareMinKobo" >= 0),
  ADD CONSTRAINT "saved_journey_legs_fare_max_nonnegative" CHECK ("fareMaxKobo" IS NULL OR "fareMaxKobo" >= 0),
  ADD CONSTRAINT "saved_journey_legs_fare_range" CHECK ("fareMinKobo" IS NULL OR "fareMaxKobo" IS NULL OR "fareMinKobo" <= "fareMaxKobo"),
  ADD CONSTRAINT "saved_journey_legs_duration_min_nonnegative" CHECK ("durationMinMinutes" IS NULL OR "durationMinMinutes" >= 0),
  ADD CONSTRAINT "saved_journey_legs_duration_max_nonnegative" CHECK ("durationMaxMinutes" IS NULL OR "durationMaxMinutes" >= 0),
  ADD CONSTRAINT "saved_journey_legs_duration_range" CHECK ("durationMinMinutes" IS NULL OR "durationMaxMinutes" IS NULL OR "durationMinMinutes" <= "durationMaxMinutes"),
  ADD CONSTRAINT "saved_journey_legs_distance_nonnegative" CHECK ("distanceM" IS NULL OR "distanceM" >= 0),
  ADD CONSTRAINT "saved_journey_legs_route_version_positive" CHECK ("routeDataVersion" IS NULL OR "routeDataVersion" >= 1);

CREATE UNIQUE INDEX "transit_place_aliases_one_active_primary"
  ON "transit_place_aliases" ("placeId")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;
