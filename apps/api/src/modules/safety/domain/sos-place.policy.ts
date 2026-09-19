/**
 * Pure policy for turning a geocoded place into words a human can act on during an emergency.
 *
 * Context: an SOS previously delivered "SOS from Maya. View their time-limited Atlas safety
 * link: <url>". A recipient who cannot open that link — flat battery, poor data, a feature
 * phone receiving SMS — learned nothing about *where*. Naming the place in the message body
 * is the difference between "my daughter sent an alert" and "my daughter is near Gamboru
 * Market in Maiduguri", which is what someone actually says to the police on the phone.
 *
 * Everything here is pure so the awkward cases — budgets, truncation, injection — are tested
 * rather than discovered at 2am.
 */

export interface SosPlaceInput {
  readonly name: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly country: string | null;
}

/**
 * SMS bodies are billed per 160-character segment. The place description is worth paying for,
 * but not without limit: a long OSM name would push a two-segment alert into three.
 */
export const SOS_PLACE_MAX_CHARS = 60;

/**
 * Strip control characters and collapse whitespace.
 *
 * This is not cosmetic. Both the sender's display name and the place name reach an SMS body,
 * and the display name is user-controlled. An embedded newline would let someone split an
 * alert across what a recipient reads as two separate messages — for example making a
 * cancellation look like it came from Atlas. Collapsing whitespace removes that lever.
 */
export function sanitiseForMessage(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const withoutControl = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  const collapsed = withoutControl.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Truncate to `maxChars`, preferring a word boundary and marking the cut. */
export function truncateToWordBoundary(text: string, maxChars: number): string {
  if (maxChars <= 1) return '';
  if (text.length <= maxChars) return text;

  const budget = maxChars - 1; // room for the ellipsis
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break at a word boundary if it does not throw away most of the budget.
  if (lastSpace >= Math.floor(budget * 0.6)) return `${cut.slice(0, lastSpace)}…`;
  return `${cut}…`;
}

function dedupePreservingOrder(values: ReadonlyArray<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = sanitiseForMessage(value);
    if (!clean) continue;
    const fingerprint = clean.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(clean);
  }
  return result;
}

/**
 * Build the most specific place description that fits the character budget.
 *
 * Specificity order is name → locality → region: a responder needs the most granular thing
 * that still makes sense on its own. Duplicates are dropped, because OSM commonly returns
 * `name` and `city` as the same value and "Maiduguri, Maiduguri" reads like a bug.
 *
 * Returns null when there is nothing usable, which the caller must treat as "send the alert
 * without a place" — never as a reason to delay or fail delivery.
 */
export function formatPlaceSummary(
  place: SosPlaceInput,
  maxChars: number = SOS_PLACE_MAX_CHARS,
): string | null {
  if (maxChars < 4) return null;

  const parts = dedupePreservingOrder([place.name, place.locality, place.region]);
  if (parts.length === 0) return null;

  const included: string[] = [];
  let length = 0;
  for (const part of parts) {
    // Each additional part costs its own length plus ", ".
    const cost = included.length === 0 ? part.length : part.length + 2;
    if (length + cost > maxChars) break;
    included.push(part);
    length += cost;
  }

  // Nothing fit whole, so truncate the most specific part rather than returning nothing.
  if (included.length === 0) {
    const first = parts[0];
    return first ? truncateToWordBoundary(first, maxChars) : null;
  }
  return included.join(', ');
}

export interface SosMessageInput {
  readonly senderName: string | null;
  readonly place: SosPlaceInput | null;
  readonly trackingUrl: string;
}

/**
 * Escape text for interpolation into HTML.
 *
 * The sender's display name is user-controlled and currently reaches an HTML email body.
 * Sanitising control characters is not enough there — `<` and `&` still inject markup.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SosMessageSet {
  /** Sanitised sender name, safe for SMS and push copy. Escape separately for HTML. */
  readonly senderName: string;
  readonly sms: string;
  readonly pushBody: string;
  /** An extra email paragraph, or null to leave the existing email copy untouched. */
  readonly emailPlaceParagraph: string | null;
}

/**
 * Compose the alert copy for every channel.
 *
 * Two rules shaped this:
 *
 *  1. **With no place resolved, the SMS is byte-identical to the previous wording.** The
 *     geocoder is an enhancement to the SOS path and must not change its behaviour when it
 *     is unavailable, slow, or disabled.
 *  2. **The place goes near the front.** Carriers truncate and some handsets preview only the
 *     first characters, so the location must not be the thing that gets cut.
 */
export function buildSosMessages(input: SosMessageInput): SosMessageSet {
  const sender = sanitiseForMessage(input.senderName) ?? 'Your trusted contact';
  const place = input.place ? formatPlaceSummary(input.place) : null;

  const sms = place
    ? `SOS from ${sender}. Near ${place}. View their time-limited Atlas safety link: ${input.trackingUrl}`
    : `SOS from ${sender}. View their time-limited Atlas safety link: ${input.trackingUrl}`;

  const pushBody = place
    ? `Open Atlas AI to see their live safety alert near ${place}.`
    : 'Open Atlas AI to see their live safety alert.';

  return {
    senderName: sender,
    sms,
    pushBody,
    // Null rather than a reworded sentence: with no place resolved the email stays exactly
    // as it was before this feature existed.
    emailPlaceParagraph: place ? `Their last known location is near ${place}.` : null,
  };
}
