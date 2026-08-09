import { parseTransitPrompt } from '../src/features/routes/services/transit-prompt';

describe('transit prompt parser', () => {
  it('extracts the example budget journey', () => {
    expect(parseTransitPrompt('I am at Ikeja, trying to get to Ajah on a tight budget.')).toEqual({
      origin: 'Ikeja',
      destination: 'Ajah',
      preference: 'CHEAPEST',
    });
  });

  it('recognises a speed preference', () => {
    expect(parseTransitPrompt('From Yaba to Surulere, I need the fastest way')).toMatchObject({
      origin: 'Yaba',
      destination: 'Surulere',
      preference: 'FASTEST',
    });
  });
});
