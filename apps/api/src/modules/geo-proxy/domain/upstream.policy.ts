import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * Pure upstream-request policy for the geo proxy.
 *
 * Design intent, adapted from the hardening discipline published by the God's Eye View
 * project (MIT, code-only; see THIRD_PARTY_NOTICES.md): a client must never be able to make
 * this API fetch an arbitrary URL, and free public providers must never be abused to the
 * point that Atlas — and everyone else sharing those instances — gets blocked.
 *
 * Everything here is pure and network-free so it can be unit-tested exhaustively.
 */

export type AddressVerdict = 'GLOBAL' | 'BLOCKED';

/**
 * Addresses that must never be connected to.
 *
 * The threat is SSRF: an attacker steering a server-side request at cloud metadata
 * endpoints (169.254.169.254), loopback services, or internal hosts. Node's BlockList is
 * used rather than hand-rolled bit math so the ranges stay auditable in one place.
 */
const blockedRanges = new BlockList();

// IPv4
blockedRanges.addSubnet('0.0.0.0', 8, 'ipv4'); // "this" network
blockedRanges.addSubnet('10.0.0.0', 8, 'ipv4'); // private
blockedRanges.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT / shared address space
blockedRanges.addSubnet('127.0.0.0', 8, 'ipv4'); // loopback
blockedRanges.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local — includes cloud metadata
blockedRanges.addSubnet('172.16.0.0', 12, 'ipv4'); // private
blockedRanges.addSubnet('192.0.0.0', 24, 'ipv4'); // IETF protocol assignments
blockedRanges.addSubnet('192.0.2.0', 24, 'ipv4'); // TEST-NET-1 documentation
blockedRanges.addSubnet('192.88.99.0', 24, 'ipv4'); // 6to4 relay anycast (deprecated)
blockedRanges.addSubnet('192.168.0.0', 16, 'ipv4'); // private
blockedRanges.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmarking
blockedRanges.addSubnet('198.51.100.0', 24, 'ipv4'); // TEST-NET-2 documentation
blockedRanges.addSubnet('203.0.113.0', 24, 'ipv4'); // TEST-NET-3 documentation
blockedRanges.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
blockedRanges.addSubnet('240.0.0.0', 4, 'ipv4'); // reserved / future use
blockedRanges.addAddress('255.255.255.255', 'ipv4'); // limited broadcast

// IPv6
blockedRanges.addAddress('::', 'ipv6'); // unspecified
blockedRanges.addAddress('::1', 'ipv6'); // loopback
blockedRanges.addSubnet('100::', 64, 'ipv6'); // discard-only
blockedRanges.addSubnet('2001:2::', 48, 'ipv6'); // benchmarking
blockedRanges.addSubnet('2001:10::', 28, 'ipv6'); // ORCHID
blockedRanges.addSubnet('2001:20::', 28, 'ipv6'); // ORCHIDv2
blockedRanges.addSubnet('2001:db8::', 32, 'ipv6'); // documentation
blockedRanges.addSubnet('fc00::', 7, 'ipv6'); // unique local
blockedRanges.addSubnet('fe80::', 10, 'ipv6'); // link-local
blockedRanges.addSubnet('ff00::', 8, 'ipv6'); // multicast

/**
 * Transition mechanisms that embed an IPv4 address inside an IPv6 one. These must be
 * unwrapped and the embedded IPv4 judged on its own, or a blocked IPv4 becomes reachable
 * through an innocuous-looking IPv6 literal.
 *
 * Prefixes are compared against the fully expanded hex form so that every textual notation
 * is caught — `::ffff:127.0.0.1`, `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1` all normalise to
 * the same 32 hex characters.
 */
const IPV4_MAPPED_HEX_PREFIX = '00000000000000000000ffff'; // ::ffff:0:0/96
const NAT64_HEX_PREFIX = '0064ff9b0000000000000000'; // 64:ff9b::/96
const SIX_TO_FOUR_HEX_PREFIX = '2002'; // 2002::/16
const TEREDO_HEX_PREFIX = '20010000'; // 2001:0000::/32

function normaliseAddress(address: string): string {
  return address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%[a-z0-9]+$/, ''); // strip any zone/scope identifier
}

function expandIPv6Group(group: string): string {
  return group.padStart(4, '0');
}

/**
 * Expand an IPv6 literal to exactly 32 hex characters, or null if it is not valid IPv6.
 * Handles `::` compression and a trailing dotted-quad (`::ffff:127.0.0.1`).
 */
function ipv6ToHex(address: string): string | null {
  if (!isIPv6(address)) return null;

  let value = address;
  // A trailing dotted IPv4 occupies the final 32 bits and must become two hex groups.
  const dotted = value.match(/^(.*?)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const [, head, quad] = dotted;
    const octets = (quad ?? '').split('.').map((part) => Number.parseInt(part, 10));
    if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    const high = ((a << 8) | b).toString(16).padStart(4, '0');
    const low = ((c << 8) | d).toString(16).padStart(4, '0');
    value = `${head ?? ''}${high}:${low}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;
  const headText = halves[0] ?? '';
  const tailText = halves.length === 2 ? (halves[1] ?? '') : '';
  const head = headText ? headText.split(':') : [];
  const tail = tailText ? tailText.split(':') : [];
  const groups =
    halves.length === 2
      ? [...head, ...Array<string>(Math.max(8 - head.length - tail.length, 0)).fill('0'), ...tail]
      : head;

  if (groups.length !== 8) return null;
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map(expandIPv6Group).join('');
}

function hexToIPv4(hex: string): string | null {
  if (hex.length !== 8) return null;
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    const byte = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes.push(byte);
  }
  return bytes.join('.');
}

/**
 * Extract an IPv4 address hidden inside an IPv6 transition address.
 *
 * Teredo inverts the client address, so the embedded value is one's-complemented before
 * being judged — otherwise `2001:0000::7fff:feff` would hide a private address.
 */
export function unwrapTransitionAddress(address: string): string | null {
  const value = normaliseAddress(address);
  if (!isIPv6(value)) return null;

  const hex = ipv6ToHex(value);
  if (!hex) return null;

  const last32 = hex.slice(24, 32);

  if (hex.startsWith(IPV4_MAPPED_HEX_PREFIX)) return hexToIPv4(last32);
  if (hex.startsWith(NAT64_HEX_PREFIX)) return hexToIPv4(last32);

  // 2002:V4V4:V6V6::/48 — the IPv4 address is the second and third groups.
  if (hex.startsWith(SIX_TO_FOUR_HEX_PREFIX)) return hexToIPv4(hex.slice(4, 12));

  if (hex.startsWith(TEREDO_HEX_PREFIX)) {
    const inverted = Array.from(last32)
      .map((character) => (0xf - Number.parseInt(character, 16)).toString(16))
      .join('');
    return hexToIPv4(inverted);
  }

  return null;
}

/**
 * Judge whether a resolved address is safe to connect to.
 *
 * Returns 'BLOCKED' for anything private, loopback, link-local, reserved, multicast,
 * documentation-only, or an IPv6 transition address that wraps such an IPv4 address.
 * Note this judges the *resolved* address, which is what defeats DNS rebinding: the check
 * runs immediately before the connection is pinned to that address.
 */
export function classifyResolvedAddress(address: string): AddressVerdict {
  const value = normaliseAddress(address);
  if (!value) return 'BLOCKED';

  if (!isIPv4(value) && !isIPv6(value)) return 'BLOCKED';

  const unwrapped = unwrapTransitionAddress(value);
  if (unwrapped && blockedRanges.check(unwrapped, 'ipv4')) return 'BLOCKED';

  if (blockedRanges.check(value, isIPv4(value) ? 'ipv4' : 'ipv6')) return 'BLOCKED';

  // Every resolved address must be classified; an unparseable one fails closed.
  return isIPv4(value) || isIPv6(value) ? 'GLOBAL' : 'BLOCKED';
}

/** True only if every candidate address returned by DNS is safe to connect to. */
export function allAddressesRoutable(addresses: readonly string[]): boolean {
  if (addresses.length === 0) return false;
  return addresses.every((address) => classifyResolvedAddress(address) === 'GLOBAL');
}

// ---------------------------------------------------------------------------
// Upstream host allow-list
// ---------------------------------------------------------------------------

export interface UpstreamEndpoint {
  /** Stable identifier used for budget accounting and logging. */
  readonly id: string;
  readonly baseUrl: string;
  /** Credit line that must be surfaced to clients when this provider's data is used. */
  readonly attribution: string;
}

export interface ParsedEndpoint {
  readonly host: string;
  readonly port: number;
  readonly basePath: string;
}

/**
 * Parse and validate an operator-configured upstream base URL.
 *
 * Only https on the default TLS port is accepted. The allow-list is operator-controlled
 * configuration, never client input — that distinction is the entire basis of the SSRF
 * defence, and it is why the client DTOs expose coordinates and profile names but never a
 * URL.
 */
export function parseUpstreamEndpoint(baseUrl: string): ParsedEndpoint | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;

  const explicitPort = url.port === '' ? null : Number.parseInt(url.port, 10);
  if (explicitPort !== null && (Number.isNaN(explicitPort) || explicitPort !== 443)) return null;

  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return { host: url.hostname.toLowerCase(), port: 443, basePath };
}

// ---------------------------------------------------------------------------
// Request bounds
// ---------------------------------------------------------------------------

export interface UpstreamBounds {
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly maxCoordinates: number;
  readonly maxLegDistanceKm: number;
  readonly maxTotalDistanceKm: number;
}

export const DEFAULT_UPSTREAM_BOUNDS: UpstreamBounds = {
  maxResponseBytes: 8 * 1024 * 1024,
  timeoutMs: 12_000,
  maxCoordinates: 12,
  maxLegDistanceKm: 600,
  maxTotalDistanceKm: 2_500,
};

export type BoundsVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Approximate great-circle distance, reused from the geo utility conventions. */
export function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6_371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Reject a coordinate sequence that is too long, too far apart, or geographically absurd
 * before it is ever sent upstream. Bounds protect the provider's free instance as much as
 * they protect Atlas.
 */
export function assertCoordinatesWithinBounds(
  coordinates: ReadonlyArray<{ latitude: number; longitude: number }>,
  bounds: UpstreamBounds = DEFAULT_UPSTREAM_BOUNDS,
): BoundsVerdict {
  if (coordinates.length < 2) return { ok: false, reason: 'At least two coordinates are required' };
  if (coordinates.length > bounds.maxCoordinates) {
    return { ok: false, reason: `At most ${bounds.maxCoordinates} coordinates are allowed` };
  }

  for (const point of coordinates) {
    if (!isValidLatitude(point.latitude)) return { ok: false, reason: 'Latitude out of range' };
    if (!isValidLongitude(point.longitude)) return { ok: false, reason: 'Longitude out of range' };
  }

  let totalKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    if (!previous || !current) return { ok: false, reason: 'Coordinate sequence is incomplete' };
    const legKm = haversineKm(previous, current);
    if (legKm > bounds.maxLegDistanceKm) {
      return { ok: false, reason: `A single leg may not exceed ${bounds.maxLegDistanceKm} km` };
    }
    totalKm += legKm;
  }
  if (totalKm > bounds.maxTotalDistanceKm) {
    return { ok: false, reason: `Total distance may not exceed ${bounds.maxTotalDistanceKm} km` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cache cells
// ---------------------------------------------------------------------------

/**
 * Round coordinates into cache cells so that nearby requests share one upstream call.
 *
 * 0.1° cells are roughly 11 km at the equator: fine enough that a weather or place answer
 * stays locally relevant, coarse enough to collapse a burst of near-identical requests into
 * a single upstream fetch.
 */
export function cacheCellKey(prefix: string, latitude: number, longitude: number): string {
  const cellLat = Math.round(latitude * 10) / 10;
  const cellLon = Math.round(longitude * 10) / 10;
  return `${prefix}:${cellLat.toFixed(1)},${cellLon.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Daily budget governor
// ---------------------------------------------------------------------------

export interface BudgetState {
  readonly used: number;
  readonly limit: number;
}

export type BudgetVerdict =
  | { readonly ok: true; readonly remaining: number }
  | { readonly ok: false; readonly reason: string; readonly used: number; readonly limit: number };

export function utcDayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Decide whether another upstream request may be made today.
 *
 * This is an application-level safety ceiling, not a guarantee about any provider's own
 * quota. Its purpose is to make the failure mode *graceful degradation* rather than
 * *exhausted free tier*: once the budget is spent the proxy serves cache or reports
 * unavailable, and never silently burns the next day's allowance.
 */
export function evaluateDailyBudget(state: BudgetState | undefined, limit: number): BudgetVerdict {
  const used = state?.used ?? 0;
  if (limit <= 0) {
    return { ok: false, reason: 'Provider budget is disabled', used, limit };
  }
  if (used >= limit) {
    return {
      ok: false,
      reason: 'Daily provider budget exhausted',
      used,
      limit,
    };
  }
  return { ok: true, remaining: limit - used - 1 };
}
