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
