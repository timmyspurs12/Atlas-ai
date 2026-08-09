import { describe, expect, it } from 'vitest';
import { parseDeterministicTransitIntent } from './transit-intent.service';

describe('parseDeterministicTransitIntent', () => {
  it('extracts the budget journey without asking an LLM', () => {
    expect(
      parseDeterministicTransitIntent('I am at Ikeja, trying to get to Ajah on a tight budget.'),
    ).toEqual({
      origin: 'Ikeja',
      destination: 'Ajah',
      preference: 'CHEAPEST',
    });
  });

  it('requests clarification instead of inventing a missing origin', () => {
    expect(parseDeterministicTransitIntent('I need to get to Ajah cheaply')).toEqual({
      origin: null,
      destination: 'Ajah',
      preference: 'CHEAPEST',
    });
  });

  it('recognises formal transit preference', () => {
    expect(parseDeterministicTransitIntent('From Yaba to CMS using BRT or rail')).toMatchObject({
      origin: 'Yaba',
      destination: 'CMS',
      preference: 'FORMAL_TRANSIT',
    });
  });
});
