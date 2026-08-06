import type { RoutePreference } from './routes-service';

export interface ParsedTransitPrompt {
  origin: string | null;
  destination: string | null;
  preference: RoutePreference;
}

export function parseTransitPrompt(prompt: string): ParsedTransitPrompt {
  const normalized = prompt.trim().replace(/\s+/g, ' ');
  const originMatch =
    /(?:\bfrom|\bat|\bin)\s+([\p{L}\p{N} .'-]+?)(?=,|\s+(?:and|trying|going|heading|to)\b)/iu.exec(
      normalized,
    );
  const destinationMatch =
    /(?:trying to get to|going to|heading to|\bto)\s+([\p{L}\p{N} .'-]+?)(?=,|\s+(?:on|with|using|for)\b|[.!?]|$)/iu.exec(
      normalized,
    );
  const lower = normalized.toLocaleLowerCase();
  const preference: RoutePreference = /tight budget|cheap|cheapest|save money|affordable/.test(
    lower,
  )
    ? 'CHEAPEST'
    : /fast|quick|urgent|soon/.test(lower)
      ? 'FASTEST'
      : /few(?:er|est)? transfers|no change/.test(lower)
        ? 'FEWEST_TRANSFERS'
        : /formal|brt|rail|ferry/.test(lower)
          ? 'FORMAL_TRANSIT'
          : 'BALANCED';
  return {
    origin: originMatch?.[1]?.trim() ?? null,
    destination: destinationMatch?.[1]?.trim() ?? null,
    preference,
  };
}
