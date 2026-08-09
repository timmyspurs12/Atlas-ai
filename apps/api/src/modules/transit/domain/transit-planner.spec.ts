import { describe, expect, it } from 'vitest';
import {
  planTransitJourneys,
  type PlannerRequest,
  type TransitGraph,
  type TransitGraphEdge,
} from './transit-planner';

const places = [
  { id: 'a', name: 'Ikeja' },
  { id: 'b', name: 'Obalende' },
  { id: 'c', name: 'Ajah' },
  { id: 'd', name: 'Oshodi' },
];

function edge(
  input: Partial<TransitGraphEdge> &
    Pick<TransitGraphEdge, 'id' | 'routeId' | 'fromPlaceId' | 'toPlaceId'>,
): TransitGraphEdge {
  return {
    routeCode: input.routeId,
    routeName: input.routeId,
    routeDataVersion: 1,
    mode: 'CITY_BUS',
    destinationSign: null,
    instructions: null,
    durationMinMinutes: 10,
    durationMaxMinutes: 15,
    fareMinKobo: 50_000,
    fareMaxKobo: 60_000,
    distanceM: 5_000,
    ...input,
  };
}

const graph: TransitGraph = {
  places,
  edges: [
    edge({
      id: 'cheap-1',
      routeId: 'cheap-a',
      fromPlaceId: 'a',
      toPlaceId: 'b',
      durationMinMinutes: 25,
      durationMaxMinutes: 35,
      fareMinKobo: 30_000,
      fareMaxKobo: 40_000,
    }),
    edge({
      id: 'cheap-2',
      routeId: 'cheap-b',
      fromPlaceId: 'b',
      toPlaceId: 'c',
      durationMinMinutes: 25,
      durationMaxMinutes: 35,
      fareMinKobo: 30_000,
      fareMaxKobo: 40_000,
    }),
    edge({
      id: 'fast-1',
      routeId: 'fast',
      fromPlaceId: 'a',
      toPlaceId: 'd',
      durationMinMinutes: 8,
      durationMaxMinutes: 10,
      fareMinKobo: 120_000,
      fareMaxKobo: 140_000,
    }),
    edge({
      id: 'fast-2',
      routeId: 'fast',
      fromPlaceId: 'd',
      toPlaceId: 'c',
      durationMinMinutes: 8,
      durationMaxMinutes: 10,
      fareMinKobo: 120_000,
      fareMaxKobo: 140_000,
    }),
  ],
};

function request(preference: PlannerRequest['preference']): PlannerRequest {
  return {
    originPlaceId: 'a',
    destinationPlaceId: 'c',
    preference,
    maxTransfers: 3,
    maxAlternatives: 3,
  };
}

describe('planTransitJourneys', () => {
  it('selects the lower-fare interchange for a tight budget', () => {
    const [result] = planTransitJourneys(graph, request('CHEAPEST'));

    expect(result?.totalFareMaxKobo).toBe(80_000);
    expect(result?.transferCount).toBe(1);
    expect(result?.legs.map((leg) => leg.routeId)).toEqual(['cheap-a', 'cheap-b']);
  });

  it('selects the quicker direct service for fastest preference', () => {
    const [result] = planTransitJourneys(graph, request('FASTEST'));

    expect(result?.totalDurationMaxMinutes).toBe(20);
    expect(result?.transferCount).toBe(0);
    expect(result?.legs).toHaveLength(1);
    expect(result?.legs[0]?.routeId).toBe('fast');
  });

  it('never treats an unknown fare as free', () => {
    const unknownGraph: TransitGraph = {
      places,
      edges: [
        edge({
          id: 'unknown',
          routeId: 'unknown',
          fromPlaceId: 'a',
          toPlaceId: 'c',
          fareMinKobo: null,
          fareMaxKobo: null,
        }),
      ],
    };
    const [result] = planTransitJourneys(unknownGraph, request('CHEAPEST'));

    expect(result?.hasUnknownFare).toBe(true);
    expect(result?.totalFareMinKobo).toBeNull();
    expect(result?.totalFareMaxKobo).toBeNull();
  });

  it('respects the maximum transfer limit', () => {
    const result = planTransitJourneys(graph, { ...request('CHEAPEST'), maxTransfers: 0 });

    expect(result[0]?.legs.map((leg) => leg.routeId)).toEqual(['fast']);
  });

  it('returns no journey when the destination is unreachable', () => {
    expect(
      planTransitJourneys(graph, {
        ...request('BALANCED'),
        destinationPlaceId: 'missing',
      }),
    ).toEqual([]);
  });
});
