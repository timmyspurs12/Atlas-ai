import { describe, expect, it } from 'vitest';
import { transitGraphValidationErrors } from './transit-graph.policy';

const validGraph = {
  stops: [{ placeId: 'a' }, { placeId: 'b' }, { placeId: 'c' }],
  segments: [
    {
      fromStopOrder: 0,
      toStopOrder: 1,
      durationMinMinutes: 10,
      durationMaxMinutes: 15,
      fareMinKobo: 20_000,
      fareMaxKobo: 30_000,
    },
    {
      fromStopOrder: 1,
      toStopOrder: 2,
      durationMinMinutes: 15,
      durationMaxMinutes: 25,
      fareMinKobo: 30_000,
      fareMaxKobo: 40_000,
    },
  ],
  serviceWindows: [
    {
      startMinute: 360,
      endMinute: 1_320,
      endsNextDay: false,
      frequencyMinMinutes: 10,
      frequencyMaxMinutes: 30,
    },
  ],
};

describe('transitGraphValidationErrors', () => {
  it('accepts a connected graph with bounded values', () => {
    expect(transitGraphValidationErrors(validGraph)).toEqual([]);
  });

  it('rejects missing consecutive segments', () => {
    expect(
      transitGraphValidationErrors({ ...validGraph, segments: validGraph.segments.slice(0, 1) }),
    ).toContain('Every consecutive stop requires exactly one segment');
  });

  it('rejects inverted duration, fare, frequency, and service ranges', () => {
    const firstSegment = validGraph.segments[0];
    const secondSegment = validGraph.segments[1];
    if (!firstSegment || !secondSegment) throw new Error('Graph fixture is incomplete');
    const result = transitGraphValidationErrors({
      ...validGraph,
      segments: [
        {
          ...firstSegment,
          durationMinMinutes: 30,
          durationMaxMinutes: 10,
          fareMinKobo: 50_000,
          fareMaxKobo: 20_000,
        },
        secondSegment,
      ],
      serviceWindows: [
        {
          startMinute: 900,
          endMinute: 500,
          endsNextDay: false,
          frequencyMinMinutes: 40,
          frequencyMaxMinutes: 10,
        },
      ],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'Segment minimum duration cannot exceed maximum',
        'Segment minimum fare cannot exceed maximum',
        'Same-day service must end after it starts',
        'Minimum frequency cannot exceed maximum',
      ]),
    );
  });
});
