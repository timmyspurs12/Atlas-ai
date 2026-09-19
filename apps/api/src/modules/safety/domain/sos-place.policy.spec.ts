import { describe, expect, it } from 'vitest';
import {
  SOS_PLACE_MAX_CHARS,
  buildSosMessages,
  escapeHtml,
  formatPlaceSummary,
  sanitiseForMessage,
  truncateToWordBoundary,
} from './sos-place.policy';

/** The exact SMS body delivered before place naming existed. */
const legacySms = (sender: string, url: string): string =>
  `SOS from ${sender}. View their time-limited Atlas safety link: ${url}`;

const TRACKING_URL = 'https://app.atlas.example/sos/tok_abc123';

describe('message sanitisation', () => {
  it('removes newlines and control characters', () => {
    expect(sanitiseForMessage('Gamboru\nMarket')).toBe('Gamboru Market');
    expect(sanitiseForMessage('a\u0000b\u001bc')).toBe('a b c');
    expect(sanitiseForMessage('tab\there')).toBe('tab here');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(sanitiseForMessage('   Maiduguri    Borno  ')).toBe('Maiduguri Borno');
  });

  it('returns null for empty or non-string input', () => {
    expect(sanitiseForMessage('')).toBeNull();
    expect(sanitiseForMessage('   ')).toBeNull();
    expect(sanitiseForMessage(null)).toBeNull();
    expect(sanitiseForMessage(undefined)).toBeNull();
  });

  it('blocks an SMS body being split by a crafted display name', () => {
    // The display name is user-controlled and lands in an SMS. Without sanitisation someone
    // could make a fake second message appear to come from Atlas.
    const crafted = 'Maya\n\nATLAS: This alert was cancelled. Ignore it.';
    const messages = buildSosMessages({
      senderName: crafted,
      place: null,
      trackingUrl: TRACKING_URL,
    });
    expect(messages.sms).not.toContain('\n');
    expect(messages.sms).toContain('Maya ATLAS: This alert was cancelled. Ignore it.');
  });
});

describe('HTML escaping', () => {
  it('escapes every character that can break out of an attribute or text node', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("a & b ' c")).toBe('a &amp; b &#39; c');
  });

  it('leaves ordinary names untouched', () => {
    expect(escapeHtml('Maya Okonkwo')).toBe('Maya Okonkwo');
  });
});

describe('place summary formatting', () => {
  it('prefers the most specific usable description', () => {
    const summary = formatPlaceSummary({
      name: 'Gamboru Market',
      locality: 'Maiduguri',
      region: 'Borno',
      country: 'Nigeria',
    });
    expect(summary).toBe('Gamboru Market, Maiduguri, Borno');
  });

  it('deduplicates when OSM repeats the city as the name', () => {
    const summary = formatPlaceSummary({
      name: 'Maiduguri',
      locality: 'Maiduguri',
      region: 'Borno',
      country: null,
    });
    expect(summary).toBe('Maiduguri, Borno');
  });

  it('is case-insensitive when deduplicating', () => {
    const summary = formatPlaceSummary({
      name: 'maiduguri',
      locality: 'Maiduguri',
      region: null,
      country: null,
    });
    expect(summary).toBe('maiduguri');
  });

  it('falls back to locality when the name is missing', () => {
    const summary = formatPlaceSummary({
      name: null,
      locality: 'Maiduguri',
      region: 'Borno',
      country: 'Nigeria',
    });
    expect(summary).toBe('Maiduguri, Borno');
  });

  it('falls back to region when name and locality are missing', () => {
    const summary = formatPlaceSummary({
      name: null,
      locality: null,
      region: 'Borno',
      country: 'Nigeria',
    });
    expect(summary).toBe('Borno');
  });

  it('returns null when there is nothing usable', () => {
    expect(
      formatPlaceSummary({ name: null, locality: null, region: null, country: null }),
    ).toBeNull();
    expect(
      formatPlaceSummary({ name: '   ', locality: null, region: null, country: null }),
    ).toBeNull();
  });

  it('never exceeds the SMS character budget', () => {
    const summary = formatPlaceSummary({
      name: 'Musa Abatcha Gwange Ward Community Primary Health Care Centre Building',
      locality: 'Metropolitan Maiduguri Main Township',
      region: 'Borno State',
      country: 'Nigeria',
    });
    expect(summary).not.toBeNull();
    expect(summary?.length).toBeLessThanOrEqual(SOS_PLACE_MAX_CHARS);
  });

  it('drops less specific parts to fit a tighter budget', () => {
    // 24 characters fits "Gamboru Market" but not "Gamboru Market, Maiduguri".
    const summary = formatPlaceSummary(
      { name: 'Gamboru Market', locality: 'Maiduguri', region: 'Borno', country: 'Nigeria' },
      24,
    );
    expect(summary).toBe('Gamboru Market');
  });

  it('truncates the most specific part when nothing fits whole', () => {
    const summary = formatPlaceSummary(
      {
        name: 'AnExtremelyLongUnbrokenPlaceNameWithoutSpaces',
        locality: 'B',
        region: 'C',
        country: null,
      },
      12,
    );
    expect(summary?.length).toBeLessThanOrEqual(12);
    expect(summary).toContain('…');
  });

  it('returns null for a budget too small to be meaningful', () => {
    const summary = formatPlaceSummary(
      { name: 'Gamboru Market', locality: 'Maiduguri', region: 'Borno', country: 'Nigeria' },
      3,
    );
    expect(summary).toBeNull();
  });
});

describe('truncateToWordBoundary', () => {
  it('leaves short text alone', () => {
    expect(truncateToWordBoundary('Maiduguri', 60)).toBe('Maiduguri');
  });

  it('breaks at a word boundary when enough of the text survives', () => {
    expect(truncateToWordBoundary('Gamboru Market Road', 12)).toBe('Gamboru…');
  });

  it('keeps more characters when a word boundary would waste the budget', () => {
    expect(truncateToWordBoundary('Gamboru Market Road', 15)).toBe('Gamboru Market…');
  });

  it('hard-cuts when a word boundary would throw away most of the budget', () => {
    expect(truncateToWordBoundary('Supercalifragilistic', 10)).toBe('Supercali…');
  });

  it('returns empty for a degenerate budget', () => {
    expect(truncateToWordBoundary('anything', 1)).toBe('');
    expect(truncateToWordBoundary('anything', 0)).toBe('');
  });
});

describe('SOS message composition', () => {
  it('leaves the SMS byte-identical when no place could be resolved', () => {
    // This is the regression guard: the geocoder is an enhancement, so its failure path must
    // reproduce the pre-existing alert exactly.
    const messages = buildSosMessages({
      senderName: 'Maya',
      place: null,
      trackingUrl: TRACKING_URL,
    });
    expect(messages.sms).toBe(legacySms('Maya', TRACKING_URL));
  });

  it('leaves the push body and email copy untouched when there is no place', () => {
    const messages = buildSosMessages({
      senderName: 'Maya',
      place: null,
      trackingUrl: TRACKING_URL,
    });
    expect(messages.pushBody).toBe('Open Atlas AI to see their live safety alert.');
    expect(messages.emailPlaceParagraph).toBeNull();
  });

  it('places the location ahead of the tracking link', () => {
    const messages = buildSosMessages({
      senderName: 'Maya',
      place: { name: 'Gamboru Market', locality: 'Maiduguri', region: 'Borno', country: null },
      trackingUrl: TRACKING_URL,
    });
    const placeIndex = messages.sms.indexOf('Gamboru Market');
    const linkIndex = messages.sms.indexOf(TRACKING_URL);
    expect(placeIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(-1);
    // Carriers truncate and handsets preview only the start, so location must come first.
    expect(placeIndex).toBeLessThan(linkIndex);
  });

  it('adds a place paragraph to the email and a place clause to the push body', () => {
    const messages = buildSosMessages({
      senderName: 'Maya',
      place: { name: 'Gamboru Market', locality: 'Maiduguri', region: 'Borno', country: null },
      trackingUrl: TRACKING_URL,
    });
    expect(messages.emailPlaceParagraph).toBe(
      'Their last known location is near Gamboru Market, Maiduguri, Borno.',
    );
    expect(messages.pushBody).toContain('near Gamboru Market');
  });

  it('substitutes a neutral sender when the display name is missing', () => {
    const messages = buildSosMessages({
      senderName: null,
      place: null,
      trackingUrl: TRACKING_URL,
    });
    expect(messages.senderName).toBe('Your trusted contact');
    expect(messages.sms).toBe(legacySms('Your trusted contact', TRACKING_URL));
  });

  it('exposes the sanitised sender for reuse in titles and subjects', () => {
    const messages = buildSosMessages({
      senderName: '  Maya\nOkonkwo ',
      place: null,
      trackingUrl: TRACKING_URL,
    });
    expect(messages.senderName).toBe('Maya Okonkwo');
  });
});
