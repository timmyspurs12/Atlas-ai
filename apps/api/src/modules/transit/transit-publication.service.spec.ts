import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { TransitReviewDecisionDto } from './transit-publication.dto';
import { TransitPublicationService } from './transit-publication.service';

function routeFixture() {
  const originPlace = {
    id: 'place-origin',
    name: 'Origin',
    verificationStatus: 'APPROVED',
    isActive: true,
    deletedAt: null,
  };
  const destinationPlace = {
    id: 'place-destination',
    name: 'Destination',
    verificationStatus: 'APPROVED',
    isActive: true,
    deletedAt: null,
  };
  return {
    id: '10000000-0000-4000-8000-000000000010',
    areaId: '10000000-0000-4000-8000-000000000011',
    sourceId: '10000000-0000-4000-8000-000000000012',
    createdById: '10000000-0000-4000-8000-000000000013',
    publishedById: null,
    originPlaceId: originPlace.id,
    destinationPlaceId: destinationPlace.id,
    currentRevisionId: null,
    code: 'NG-TEST-ROUTE',
    name: 'Test route',
    normalizedName: 'test route',
    scope: 'URBAN',
    mode: 'CITY_BUS',
    status: 'DRAFT',
    direction: 'OUTBOUND',
    destinationSign: null,
    operatorName: null,
    publicDescription: null,
    boardingSummary: null,
    durationMinMinutes: null,
    durationMaxMinutes: null,
    dataVersion: 1,
    source: { id: 'source-1', reliabilityScore: 80 },
    originPlace,
    destinationPlace,
    stops: [
      {
        id: 'stop-origin',
        placeId: originPlace.id,
        stopOrder: 0,
        platformName: null,
        pickupAllowed: true,
        dropoffAllowed: true,
        boardingInstructions: null,
        alightingInstructions: null,
        deletedAt: null,
        place: originPlace,
      },
      {
        id: 'stop-destination',
        placeId: destinationPlace.id,
        stopOrder: 1,
        platformName: null,
        pickupAllowed: true,
        dropoffAllowed: true,
        boardingInstructions: null,
        alightingInstructions: null,
        deletedAt: null,
        place: destinationPlace,
      },
    ],
    segments: [
      {
        id: 'segment-1',
        fromStopId: 'stop-origin',
        toStopId: 'stop-destination',
        segmentOrder: 0,
        distanceM: null,
        durationMinMinutes: null,
        durationMaxMinutes: null,
        fareMinKobo: null,
        fareMaxKobo: null,
        roadDescription: null,
      },
    ],
    serviceWindows: [],
  };
}

function harness() {
  const route = routeFixture();
  let revision:
    | {
        id: string;
        routeId: string;
        createdById: string;
        version: number;
        snapshot: unknown;
        checksum: string;
        submittedAt: Date;
        deletedAt: null;
      }
    | undefined;
  const userFindFirst = vi.fn();
  const routeUpdate = vi.fn(() => Promise.resolve(route));
  const reviewCreate = vi.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'review-1',
      ...data,
    }),
  );
  const transaction = {
    user: { findFirst: userFindFirst },
    transitRoute: {
      findFirst: vi.fn(() => Promise.resolve(route)),
      update: routeUpdate,
    },
    transitRouteRevision: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          revision
            ? {
                ...revision,
                route,
                reviews: [],
              }
            : null,
        ),
      ),
      aggregate: vi.fn(() => Promise.resolve({ _max: { version: null } })),
      create: vi.fn(
        ({ data }: { data: Omit<NonNullable<typeof revision>, 'id' | 'deletedAt'> }) => {
          revision = {
            id: '10000000-0000-4000-8000-000000000014',
            ...data,
            deletedAt: null,
          };
          return Promise.resolve(revision);
        },
      ),
    },
    transitRouteReview: { create: reviewCreate },
    auditLog: { create: vi.fn(() => Promise.resolve({ id: 'audit-1' })) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as PrismaService;
  return {
    route,
    service: new TransitPublicationService(prisma),
    userFindFirst,
    routeUpdate,
    reviewCreate,
  };
}

describe('TransitPublicationService', () => {
  it('submits an immutable revision and publishes it only after independent approval', async () => {
    const setup = harness();
    setup.userFindFirst
      .mockResolvedValueOnce({ id: setup.route.createdById, role: 'TRANSIT_EDITOR' })
      .mockResolvedValueOnce({
        id: '10000000-0000-4000-8000-000000000015',
        role: 'TRANSIT_REVIEWER',
      });

    const submitted = await setup.service.submitRouteRevision(
      setup.route.createdById,
      setup.route.id,
      { changeSummary: 'Initial reviewed route' },
    );
    expect(submitted).toMatchObject({ version: 1, routeStatus: 'IN_REVIEW' });

    const reviewed = await setup.service.reviewRouteRevision(
      '10000000-0000-4000-8000-000000000015',
      submitted.revisionId,
      {
        decision: TransitReviewDecisionDto.APPROVED,
        confidenceScore: 85,
      },
    );

    expect(reviewed.routeStatus).toBe('PUBLISHED');
    expect(setup.reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewerId: '10000000-0000-4000-8000-000000000015',
        status: 'APPROVED',
      }),
    });
    expect(setup.routeUpdate).toHaveBeenLastCalledWith({
      where: { id: setup.route.id },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        currentRevisionId: submitted.revisionId,
        confidenceScore: 85,
      }),
    });
  });

  it('rejects self-review even when the user has reviewer privileges', async () => {
    const setup = harness();
    setup.userFindFirst
      .mockResolvedValueOnce({ id: setup.route.createdById, role: 'TRANSIT_EDITOR' })
      .mockResolvedValueOnce({ id: setup.route.createdById, role: 'TRANSIT_REVIEWER' });
    const submitted = await setup.service.submitRouteRevision(
      setup.route.createdById,
      setup.route.id,
      {},
    );

    await expect(
      setup.service.reviewRouteRevision(setup.route.createdById, submitted.revisionId, {
        decision: TransitReviewDecisionDto.APPROVED,
        confidenceScore: 85,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
