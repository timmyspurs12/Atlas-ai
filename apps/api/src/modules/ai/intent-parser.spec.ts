import { describe, expect, it } from 'vitest';
import { AssistantIntent, parseAssistantIntent } from './intent-parser';

describe('assistant intent parser', () => {
  it.each([
    ['Where is Sarah?', AssistantIntent.WHERE_PERSON, 'Sarah'],
    ['When will John arrive?', AssistantIntent.ETA_PERSON, 'John'],
    ["Replay yesterday's journey.", AssistantIntent.REPLAY_TRIP, null],
    ['Who is closest to me?', AssistantIntent.CLOSEST_PERSON, null],
    ['How many kilometers did I travel this week?', AssistantIntent.DISTANCE_TRAVELLED, null],
  ])('parses %s', (question, intent, personName) => {
    expect(parseAssistantIntent(question)).toEqual({ intent, personName });
  });

  it('does not classify arbitrary surveillance prompts as a location lookup', () => {
    expect(parseAssistantIntent('Track a stranger using their phone number').intent).toBe(
      AssistantIntent.GENERAL,
    );
  });
});
