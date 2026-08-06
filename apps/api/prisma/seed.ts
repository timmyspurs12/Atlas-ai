import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public',
});
const prisma = new PrismaClient({ adapter });

const NIGERIAN_REGIONS = [
  { code: 'NG-AB', name: 'Abia', slug: 'ng-abia', type: 'STATE' },
  { code: 'NG-AD', name: 'Adamawa', slug: 'ng-adamawa', type: 'STATE' },
  { code: 'NG-AK', name: 'Akwa Ibom', slug: 'ng-akwa-ibom', type: 'STATE' },
  { code: 'NG-AN', name: 'Anambra', slug: 'ng-anambra', type: 'STATE' },
  { code: 'NG-BA', name: 'Bauchi', slug: 'ng-bauchi', type: 'STATE' },
  { code: 'NG-BY', name: 'Bayelsa', slug: 'ng-bayelsa', type: 'STATE' },
  { code: 'NG-BE', name: 'Benue', slug: 'ng-benue', type: 'STATE' },
  { code: 'NG-BO', name: 'Borno', slug: 'ng-borno', type: 'STATE' },
  { code: 'NG-CR', name: 'Cross River', slug: 'ng-cross-river', type: 'STATE' },
  { code: 'NG-DE', name: 'Delta', slug: 'ng-delta', type: 'STATE' },
  { code: 'NG-EB', name: 'Ebonyi', slug: 'ng-ebonyi', type: 'STATE' },
  { code: 'NG-ED', name: 'Edo', slug: 'ng-edo', type: 'STATE' },
  { code: 'NG-EK', name: 'Ekiti', slug: 'ng-ekiti', type: 'STATE' },
  { code: 'NG-EN', name: 'Enugu', slug: 'ng-enugu', type: 'STATE' },
  {
    code: 'NG-FC',
    name: 'Federal Capital Territory',
    slug: 'ng-federal-capital-territory',
    type: 'FCT',
  },
  { code: 'NG-GO', name: 'Gombe', slug: 'ng-gombe', type: 'STATE' },
  { code: 'NG-IM', name: 'Imo', slug: 'ng-imo', type: 'STATE' },
  { code: 'NG-JI', name: 'Jigawa', slug: 'ng-jigawa', type: 'STATE' },
  { code: 'NG-KD', name: 'Kaduna', slug: 'ng-kaduna', type: 'STATE' },
  { code: 'NG-KN', name: 'Kano', slug: 'ng-kano', type: 'STATE' },
  { code: 'NG-KT', name: 'Katsina', slug: 'ng-katsina', type: 'STATE' },
  { code: 'NG-KE', name: 'Kebbi', slug: 'ng-kebbi', type: 'STATE' },
  { code: 'NG-KO', name: 'Kogi', slug: 'ng-kogi', type: 'STATE' },
  { code: 'NG-KW', name: 'Kwara', slug: 'ng-kwara', type: 'STATE' },
  { code: 'NG-LA', name: 'Lagos', slug: 'ng-lagos', type: 'STATE' },
  { code: 'NG-NA', name: 'Nasarawa', slug: 'ng-nasarawa', type: 'STATE' },
  { code: 'NG-NI', name: 'Niger', slug: 'ng-niger', type: 'STATE' },
  { code: 'NG-OG', name: 'Ogun', slug: 'ng-ogun', type: 'STATE' },
  { code: 'NG-ON', name: 'Ondo', slug: 'ng-ondo', type: 'STATE' },
  { code: 'NG-OS', name: 'Osun', slug: 'ng-osun', type: 'STATE' },
  { code: 'NG-OY', name: 'Oyo', slug: 'ng-oyo', type: 'STATE' },
  { code: 'NG-PL', name: 'Plateau', slug: 'ng-plateau', type: 'STATE' },
  { code: 'NG-RI', name: 'Rivers', slug: 'ng-rivers', type: 'STATE' },
  { code: 'NG-SO', name: 'Sokoto', slug: 'ng-sokoto', type: 'STATE' },
  { code: 'NG-TA', name: 'Taraba', slug: 'ng-taraba', type: 'STATE' },
  { code: 'NG-YO', name: 'Yobe', slug: 'ng-yobe', type: 'STATE' },
  { code: 'NG-ZA', name: 'Zamfara', slug: 'ng-zamfara', type: 'STATE' },
] as const;

const TRANSIT_SOURCE_ID = '10000000-0000-4000-8000-000000000001';

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en-NG')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function seedDemoUsers(passwordHash: string) {
  const demoUsers = [
    {
      email: 'maya@demo.atlas',
      displayName: 'Maya Okafor',
      handle: 'maya',
      lat: 6.4551,
      lng: 3.3942,
    },
    {
      email: 'sarah@demo.atlas',
      displayName: 'Sarah Chen',
      handle: 'sarahc',
      lat: 6.4433,
      lng: 3.4148,
    },
    {
      email: 'john@demo.atlas',
      displayName: 'John Adeyemi',
      handle: 'john.a',
      lat: 6.4698,
      lng: 3.3792,
    },
    {
      email: 'leo@demo.atlas',
      displayName: 'Leo Martin',
      handle: 'leom',
      lat: 6.4478,
      lng: 3.3878,
    },
  ];

  const users = [];
  for (const demo of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { deletedAt: null },
      create: {
        email: demo.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        termsVersion: '2026-01',
        termsAcceptedAt: new Date(),
        profile: {
          create: {
            displayName: demo.displayName,
            handle: demo.handle,
            timezone: 'Africa/Lagos',
          },
        },
        subscriptions: { create: { plan: 'FAMILY', status: 'ACTIVE', entitlements: {} } },
      },
      include: { profile: true },
    });
    await prisma.liveLocation.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        latitude: demo.lat,
        longitude: demo.lng,
        accuracyM: 8,
        headingDeg: 120,
        speedMps: 8.2,
        batteryPct: 78,
        isCharging: false,
        sequence: 1,
        recordedAt: new Date(),
      },
      update: {
        latitude: demo.lat,
        longitude: demo.lng,
        sequence: { increment: 1 },
        recordedAt: new Date(),
      },
    });
    users.push(user);
  }

  const owner = users[0];
  if (!owner) throw new Error('Demo owner was not created');

  for (const friend of users.slice(1)) {
    const pairKey = [owner.id, friend.id].sort().join(':');
    await prisma.friendship.upsert({
      where: { pairKey },
      create: {
        requesterId: owner.id,
        addresseeId: friend.id,
        pairKey,
        status: 'ACCEPTED',
        respondedAt: new Date(),
      },
      update: { status: 'ACCEPTED', deletedAt: null },
    });
    const existingShare = await prisma.locationShare.findFirst({
      where: { ownerId: friend.id, recipientId: owner.id, status: 'ACTIVE', deletedAt: null },
    });
    if (!existingShare) {
      await prisma.locationShare.create({
        data: {
          ownerId: friend.id,
          recipientId: owner.id,
          status: 'ACTIVE',
          precision: 'PRECISE',
          shareBattery: true,
          shareSpeed: true,
          allowGeofences: true,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
    }
  }

  const emergency = users[1];
  if (emergency) {
    const existing = await prisma.emergencyContact.findFirst({
      where: { ownerId: owner.id, contactUserId: emergency.id, deletedAt: null },
    });
    if (!existing) {
      await prisma.emergencyContact.create({
        data: {
          ownerId: owner.id,
          contactUserId: emergency.id,
          name: emergency.profile?.displayName ?? 'Sarah',
          relationship: 'Friend',
          isVerified: true,
          verifiedAt: new Date(),
          notifyPush: true,
        },
      });
    }
  }

  const tripCount = await prisma.trip.count({ where: { userId: owner.id } });
  if (tripCount === 0) {
    for (let day = 0; day < 6; day += 1) {
      const startedAt = new Date(Date.now() - day * 86_400_000 - 3_600_000);
      const trip = await prisma.trip.create({
        data: {
          userId: owner.id,
          status: 'COMPLETED',
          source: 'AUTOMATIC',
          title: day === 0 ? 'Morning commute' : 'City journey',
          startedAt,
          endedAt: new Date(startedAt.getTime() + 1_800_000),
          distanceM: 5_200 + day * 640,
          durationSeconds: 1_800,
        },
      });
      await prisma.tripPoint.createMany({
        data: Array.from({ length: 8 }, (_, index) => ({
          tripId: trip.id,
          latitude: 6.4551 + index * 0.0012,
          longitude: 3.3942 + index * 0.0018,
          accuracyM: 8,
          speedMps: 7.5,
          sequence: index + 1,
          recordedAt: new Date(startedAt.getTime() + index * 240_000),
        })),
      });
    }
  }

  return owner;
}

async function upsertTransitTeamUser(input: {
  email: string;
  displayName: string;
  handle: string;
  role: 'TRANSIT_EDITOR' | 'TRANSIT_REVIEWER';
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: { role: input.role, status: 'ACTIVE', deletedAt: null },
    create: {
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      termsVersion: '2026-01',
      termsAcceptedAt: new Date(),
      profile: {
        create: {
          displayName: input.displayName,
          handle: input.handle,
          timezone: 'Africa/Lagos',
        },
      },
      subscriptions: { create: { plan: 'FREE', status: 'ACTIVE', entitlements: {} } },
    },
  });
}

async function upsertCoverage(
  areaId: string,
  status: 'COMING_SOON' | 'DATA_COLLECTION',
  notes: string,
): Promise<void> {
  await prisma.transitCoverage.upsert({
    where: { areaId },
    create: { areaId, status, qualityScore: 0, dataVersion: 1, notes },
    update: { status, qualityScore: 0, notes, deletedAt: null },
  });
}

async function seedNationwideAreas() {
  const nigeria = await prisma.administrativeArea.upsert({
    where: { slug: 'nigeria' },
    create: {
      name: 'Nigeria',
      normalizedName: 'nigeria',
      slug: 'nigeria',
      code: 'NG',
      type: 'COUNTRY',
      countryCode: 'NG',
    },
    update: { name: 'Nigeria', normalizedName: 'nigeria', isActive: true, deletedAt: null },
  });

  await upsertCoverage(
    nigeria.id,
    'DATA_COLLECTION',
    'Nationwide administrative catalog initialized. Route coverage is published per locality only after review.',
  );

  const regions = new Map<string, { id: string; name: string }>();
  for (const region of NIGERIAN_REGIONS) {
    const saved = await prisma.administrativeArea.upsert({
      where: { slug: region.slug },
      create: {
        parentId: nigeria.id,
        name: region.name,
        normalizedName: normalizeName(region.name),
        slug: region.slug,
        code: region.code,
        type: region.type,
        countryCode: 'NG',
      },
      update: {
        parentId: nigeria.id,
        name: region.name,
        normalizedName: normalizeName(region.name),
        type: region.type,
        isActive: true,
        deletedAt: null,
      },
    });
    const activeCollection = region.code === 'NG-LA';
    await upsertCoverage(
      saved.id,
      activeCollection ? 'DATA_COLLECTION' : 'COMING_SOON',
      activeCollection
        ? 'Lagos reference data collection is active; no route is public until internal review.'
        : 'Nationwide catalog entry created; local route collection has not yet been published.',
    );
    regions.set(region.code, { id: saved.id, name: saved.name });
  }

  return { nigeria, regions };
}

async function seedLagosDraftTransit(editorId: string, lagosStateId: string): Promise<void> {
  const metro = await prisma.administrativeArea.upsert({
    where: { slug: 'ng-lagos-metropolitan-area' },
    create: {
      parentId: lagosStateId,
      name: 'Lagos Metropolitan Area',
      normalizedName: normalizeName('Lagos Metropolitan Area'),
      slug: 'ng-lagos-metropolitan-area',
      code: 'NG-LA-METRO',
      type: 'CITY',
      countryCode: 'NG',
      latitude: 6.5244,
      longitude: 3.3792,
    },
    update: { parentId: lagosStateId, isActive: true, deletedAt: null },
  });
  await upsertCoverage(
    metro.id,
    'DATA_COLLECTION',
    'Reference corridor collection is in progress. Candidate routes remain unpublished.',
  );

  const localityInputs = [
    { name: 'Ikeja', slug: 'ng-lagos-metro-ikeja', code: 'NG-LA-METRO-IKEJA' },
    { name: 'Obalende', slug: 'ng-lagos-metro-obalende', code: 'NG-LA-METRO-OBALENDE' },
    { name: 'Ajah', slug: 'ng-lagos-metro-ajah', code: 'NG-LA-METRO-AJAH' },
  ] as const;
  const localities = new Map<string, string>();
  for (const locality of localityInputs) {
    const saved = await prisma.administrativeArea.upsert({
      where: { slug: locality.slug },
      create: {
        parentId: metro.id,
        name: locality.name,
        normalizedName: normalizeName(locality.name),
        slug: locality.slug,
        code: locality.code,
        type: 'LOCALITY',
        countryCode: 'NG',
      },
      update: { parentId: metro.id, isActive: true, deletedAt: null },
    });
    await upsertCoverage(
      saved.id,
      'DATA_COLLECTION',
      'Draft reference place only. Coordinates and boarding details require field verification.',
    );
    localities.set(locality.name, saved.id);
  }

  await prisma.transitDataSource.upsert({
    where: { id: TRANSIT_SOURCE_ID },
    create: {
      id: TRANSIT_SOURCE_ID,
      areaId: metro.id,
      name: 'Atlas internal reference research',
      type: 'INTERNAL_RESEARCH',
      organization: 'Atlas AI',
      reliabilityScore: 20,
      isActive: true,
      notes:
        'Development seed only. Every route, coordinate, fare, and instruction requires internal field verification before publication.',
    },
    update: {
      areaId: metro.id,
      reliabilityScore: 20,
      isActive: true,
      deletedAt: null,
    },
  });

  const placeInputs = [
    {
      code: 'NG-LA-PLACE-IKEJA-UNDER-BRIDGE',
      name: 'Ikeja Under Bridge',
      locality: 'Ikeja',
      type: 'MOTOR_PARK',
      latitude: 6.6018,
      longitude: 3.3515,
      aliases: ['Ikeja', 'Ikeja Under Bridge'],
      modes: ['CITY_BUS', 'DANFO', 'KEKE'],
    },
    {
      code: 'NG-LA-PLACE-OBALENDE',
      name: 'Obalende',
      locality: 'Obalende',
      type: 'MOTOR_PARK',
      latitude: 6.4483,
      longitude: 3.413,
      aliases: ['Obalende Bus Stop', 'Obalende'],
      modes: ['CITY_BUS', 'DANFO'],
    },
    {
      code: 'NG-LA-PLACE-AJAH',
      name: 'Ajah Bus Stop',
      locality: 'Ajah',
      type: 'MOTOR_PARK',
      latitude: 6.4698,
      longitude: 3.5852,
      aliases: ['Ajah', 'Ajah Bus Stop'],
      modes: ['CITY_BUS', 'DANFO', 'KEKE'],
    },
  ] as const;

  const places = new Map<string, { id: string; code: string; name: string }>();
  for (const input of placeInputs) {
    const areaId = localities.get(input.locality);
    if (!areaId) throw new Error(`Missing locality ${input.locality}`);
    const place = await prisma.transitPlace.upsert({
      where: { code: input.code },
      create: {
        areaId,
        sourceId: TRANSIT_SOURCE_ID,
        code: input.code,
        name: input.name,
        normalizedName: normalizeName(input.name),
        type: input.type,
        latitude: input.latitude,
        longitude: input.longitude,
        locationAccuracyM: 500,
        verificationStatus: 'PENDING',
        isActive: true,
      },
      update: {
        areaId,
        sourceId: TRANSIT_SOURCE_ID,
        name: input.name,
        normalizedName: normalizeName(input.name),
        type: input.type,
        latitude: input.latitude,
        longitude: input.longitude,
        locationAccuracyM: 500,
        verificationStatus: 'PENDING',
        verifiedAt: null,
        isActive: true,
        deletedAt: null,
      },
    });
    for (const [index, alias] of input.aliases.entries()) {
      const normalizedAlias = normalizeName(alias);
      await prisma.transitPlaceAlias.upsert({
        where: {
          placeId_normalizedAlias_locale: {
            placeId: place.id,
            normalizedAlias,
            locale: 'en-NG',
          },
        },
        create: {
          placeId: place.id,
          alias,
          normalizedAlias,
          locale: 'en-NG',
          isPrimary: index === 0,
        },
        update: { alias, isPrimary: index === 0, deletedAt: null },
      });
    }
    for (const mode of input.modes) {
      await prisma.transitPlaceMode.upsert({
        where: { placeId_mode: { placeId: place.id, mode } },
        create: { placeId: place.id, mode },
        update: { boardingAllowed: true, alightingAllowed: true, deletedAt: null },
      });
    }
    places.set(input.locality, { id: place.id, code: place.code, name: place.name });
  }

  const routeInputs = [
    {
      code: 'NG-LA-DRAFT-IKEJA-OBALENDE',
      name: 'Ikeja to Obalende candidate',
      origin: 'Ikeja',
      destination: 'Obalende',
    },
    {
      code: 'NG-LA-DRAFT-OBALENDE-AJAH',
      name: 'Obalende to Ajah candidate',
      origin: 'Obalende',
      destination: 'Ajah',
    },
  ] as const;

  for (const input of routeInputs) {
    const origin = places.get(input.origin);
    const destination = places.get(input.destination);
    if (!origin || !destination) throw new Error(`Missing draft route places for ${input.code}`);

    const route = await prisma.transitRoute.upsert({
      where: { code: input.code },
      create: {
        areaId: metro.id,
        sourceId: TRANSIT_SOURCE_ID,
        createdById: editorId,
        originPlaceId: origin.id,
        destinationPlaceId: destination.id,
        code: input.code,
        name: input.name,
        normalizedName: normalizeName(input.name),
        scope: 'URBAN',
        mode: 'CITY_BUS',
        status: 'DRAFT',
        direction: 'OUTBOUND',
        publicDescription:
          'Internal candidate only. Do not present this route to passengers until reviewed and published.',
        dataVersion: 1,
        confidenceScore: 0,
      },
      update: {
        areaId: metro.id,
        sourceId: TRANSIT_SOURCE_ID,
        createdById: editorId,
        originPlaceId: origin.id,
        destinationPlaceId: destination.id,
        name: input.name,
        normalizedName: normalizeName(input.name),
        status: 'DRAFT',
        publishedById: null,
        publishedAt: null,
        lastVerifiedAt: null,
        currentRevisionId: null,
        confidenceScore: 0,
        deletedAt: null,
      },
    });

    const fromStop = await prisma.transitRouteStop.upsert({
      where: { routeId_stopOrder: { routeId: route.id, stopOrder: 0 } },
      create: { routeId: route.id, placeId: origin.id, stopOrder: 0 },
      update: { placeId: origin.id, deletedAt: null },
    });
    const toStop = await prisma.transitRouteStop.upsert({
      where: { routeId_stopOrder: { routeId: route.id, stopOrder: 1 } },
      create: { routeId: route.id, placeId: destination.id, stopOrder: 1 },
      update: { placeId: destination.id, deletedAt: null },
    });
    await prisma.transitSegment.upsert({
      where: { routeId_segmentOrder: { routeId: route.id, segmentOrder: 0 } },
      create: {
        routeId: route.id,
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        segmentOrder: 0,
        roadDescription: 'Unverified candidate segment. Field survey required.',
      },
      update: {
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        distanceM: null,
        durationMinMinutes: null,
        durationMaxMinutes: null,
        fareMinKobo: null,
        fareMaxKobo: null,
        deletedAt: null,
      },
    });

    const snapshot = {
      schemaVersion: 1,
      route: {
        code: route.code,
        name: route.name,
        scope: route.scope,
        mode: route.mode,
        direction: route.direction,
        status: 'DRAFT',
      },
      stops: [
        { order: 0, placeCode: origin.code, name: origin.name },
        { order: 1, placeCode: destination.code, name: destination.name },
      ],
      verification: {
        status: 'PENDING',
        warning: 'Development seed only; no public passenger guidance is authorized.',
      },
    };
    await prisma.transitRouteRevision.upsert({
      where: { routeId_version: { routeId: route.id, version: 1 } },
      create: {
        routeId: route.id,
        createdById: editorId,
        version: 1,
        snapshot,
        checksum: checksum(snapshot),
        changeSummary: 'Initial unverified development seed.',
      },
      update: {
        snapshot,
        checksum: checksum(snapshot),
        changeSummary: 'Initial unverified development seed.',
        submittedAt: null,
        deletedAt: null,
      },
    });
  }
}

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('AtlasDemo2026!', {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });

  await seedDemoUsers(passwordHash);
  const editor = await upsertTransitTeamUser({
    email: 'transit.editor@demo.atlas',
    displayName: 'Atlas Transit Editor',
    handle: 'transit.editor',
    role: 'TRANSIT_EDITOR',
    passwordHash,
  });
  await upsertTransitTeamUser({
    email: 'transit.reviewer@demo.atlas',
    displayName: 'Atlas Transit Reviewer',
    handle: 'transit.reviewer',
    role: 'TRANSIT_REVIEWER',
    passwordHash,
  });

  const { regions } = await seedNationwideAreas();
  const lagos = regions.get('NG-LA');
  if (!lagos) throw new Error('Lagos State was not seeded');
  await seedLagosDraftTransit(editor.id, lagos.id);

  const regionCount = await prisma.administrativeArea.count({
    where: { parent: { code: 'NG' }, deletedAt: null },
  });
  if (regionCount !== 37) {
    throw new Error(`Expected 37 state/FCT records, found ${regionCount}`);
  }

  process.stdout.write(
    'Atlas seed complete: demo users, Nigeria, 36 states, FCT, coverage records, and unpublished Lagos reference drafts.\n',
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
