import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('AtlasDemo2026!', {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
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
  if (!owner) return;
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
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
