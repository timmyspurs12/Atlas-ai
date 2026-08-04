export enum AssistantIntent {
  WHERE_PERSON = 'WHERE_PERSON',
  ETA_PERSON = 'ETA_PERSON',
  REPLAY_TRIP = 'REPLAY_TRIP',
  CLOSEST_PERSON = 'CLOSEST_PERSON',
  DISTANCE_TRAVELLED = 'DISTANCE_TRAVELLED',
  WEEKLY_REPORT = 'WEEKLY_REPORT',
  TRAVEL_PATTERNS = 'TRAVEL_PATTERNS',
  UNUSUAL_TRAVEL = 'UNUSUAL_TRAVEL',
  ROUTE_SUGGESTION = 'ROUTE_SUGGESTION',
  GENERAL = 'GENERAL',
}

export interface ParsedIntent {
  intent: AssistantIntent;
  personName: string | null;
}

const cleanName = (value: string | undefined): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/[?.!,]+$/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
};

export function parseAssistantIntent(question: string): ParsedIntent {
  const normalized = question.trim().replace(/\s+/g, ' ');
  const where = /(?:where (?:is|are)|locate|find)\s+([\p{L}\p{N} .'-]+)/iu.exec(normalized);
  if (where) return { intent: AssistantIntent.WHERE_PERSON, personName: cleanName(where[1]) };

  const eta = /(?:when will|eta (?:for|of)?|how long (?:until|before))\s+([\p{L}\p{N} .'-]+?)(?:\s+(?:arrive|gets? here|reach)|[?.!]|$)/iu.exec(normalized);
  if (eta) return { intent: AssistantIntent.ETA_PERSON, personName: cleanName(eta[1]) };

  if (/\b(replay|show)\b.*\b(yesterday|journey|trip|route)\b/i.test(normalized)) {
    return { intent: AssistantIntent.REPLAY_TRIP, personName: null };
  }
  if (/\bwho\b.*\bclosest\b|\bnearest (?:person|friend)\b/i.test(normalized)) {
    return { intent: AssistantIntent.CLOSEST_PERSON, personName: null };
  }
  if (/\b(how (?:many|far)|distance)\b.*\b(km|kilomet|travel|week|month|today)\b/i.test(normalized)) {
    return { intent: AssistantIntent.DISTANCE_TRAVELLED, personName: null };
  }
  if (/\b(weekly|week)\b.*\b(report|summary|recap)\b/i.test(normalized)) {
    return { intent: AssistantIntent.WEEKLY_REPORT, personName: null };
  }
  if (/\b(pattern|habit|routine)\b/i.test(normalized)) {
    return { intent: AssistantIntent.TRAVEL_PATTERNS, personName: null };
  }
  if (/\b(unusual|anomal|different|unexpected)\b/i.test(normalized)) {
    return { intent: AssistantIntent.UNUSUAL_TRAVEL, personName: null };
  }
  if (/\b(best|fastest|optimi[sz]e|route)\b/i.test(normalized)) {
    return { intent: AssistantIntent.ROUTE_SUGGESTION, personName: null };
  }
  return { intent: AssistantIntent.GENERAL, personName: null };
}
