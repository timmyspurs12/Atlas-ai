import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UPSTREAM_BOUNDS,
  allAddressesRoutable,
  assertCoordinatesWithinBounds,
  cacheCellKey,
  classifyResolvedAddress,
  evaluateDailyBudget,
  parseUpstreamEndpoint,
  unwrapTransitionAddress,
  utcDayStamp,
} from './upstream.policy';

describe('resolved address classification (SSRF guard)', () => {
  it('permits genuinely public IPv4 addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '203.0.114.5']) {
      expect(classifyResolvedAddress(address)).toBe('GLOBAL');
    }
  });

  it('blocks loopback, private and link-local IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.1.1',
      '0.0.0.0',
      '255.255.255.255',
    ]) {
      expect(classifyResolvedAddress(address), address).toBe('BLOCKED');
    }
  });

  it('blocks the cloud metadata endpoint specifically', () => {
    // The single most important SSRF target on any hosted platform.
    expect(classifyResolvedAddress('169.254.169.254')).toBe('BLOCKED');
    expect(classifyResolvedAddress('fd00:ec2::254')).toBe('BLOCKED');
  });

  it('blocks CGNAT, documentation, benchmark and multicast space', () => {
    for (const address of [
      '100.64.0.1', // CGNAT
      '100.127.255.255',
      '192.0.2.1', // TEST-NET-1
      '198.51.100.1', // TEST-NET-2
      '203.0.113.1', // TEST-NET-3
      '198.18.0.1', // benchmarking
      '192.88.99.1', // 6to4 relay anycast
      '224.0.0.1', // multicast
      '240.0.0.1', // reserved
    ]) {
      expect(classifyResolvedAddress(address), address).toBe('BLOCKED');
    }
  });

  it('permits public IPv6 and blocks local IPv6 space', () => {
    expect(classifyResolvedAddress('2606:4700:4700::1111')).toBe('GLOBAL');
    expect(classifyResolvedAddress('2a00:1450:4001:827::200e')).toBe('GLOBAL');
    for (const address of [
      '::',
      '::1',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '2001:db8::1',
      '2001:2::1',
      'ff02::1',
      '100::1',
    ]) {
      expect(classifyResolvedAddress(address), address).toBe('BLOCKED');
    }
  });

  it('fails closed on malformed input', () => {
    for (const value of ['', '   ', 'not-an-ip', '8.8.8.8.evil.example', '999.1.1.1', '1.2.3']) {
      expect(classifyResolvedAddress(value), JSON.stringify(value)).toBe('BLOCKED');
    }
  });

  it('requires a non-empty candidate set', () => {
    expect(allAddressesRoutable([])).toBe(false);
    expect(allAddressesRoutable(['8.8.8.8'])).toBe(true);
    // One blocked address in a set of many must fail the whole request.
    expect(allAddressesRoutable(['8.8.8.8', '169.254.169.254'])).toBe(false);
  });
});

describe('IPv6 transition address unwrapping', () => {
  it('unwraps IPv4-mapped addresses in every notation', () => {
    expect(unwrapTransitionAddress('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(unwrapTransitionAddress('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(unwrapTransitionAddress('0:0:0:0:0:ffff:a9fe:a9fe')).toBe('169.254.169.254');
    expect(unwrapTransitionAddress('::ffff:8.8.8.8')).toBe('8.8.8.8');
  });

  it('classifies mapped addresses by their embedded IPv4', () => {
    expect(classifyResolvedAddress('::ffff:127.0.0.1')).toBe('BLOCKED');
    expect(classifyResolvedAddress('::ffff:10.0.0.5')).toBe('BLOCKED');
    expect(classifyResolvedAddress('::ffff:169.254.169.254')).toBe('BLOCKED');
    expect(classifyResolvedAddress('::ffff:8.8.8.8')).toBe('GLOBAL');
  });

  it('unwraps NAT64, 6to4 and Teredo', () => {
    expect(unwrapTransitionAddress('64:ff9b::7f00:1')).toBe('127.0.0.1');
    expect(unwrapTransitionAddress('64:ff9b::808:808')).toBe('8.8.8.8');
    // 2002:V4V4:V6V6::/48 carries the IPv4 in groups two and three.
    expect(unwrapTransitionAddress('2002:7f00:1::')).toBe('127.0.0.1');
    expect(unwrapTransitionAddress('2002:a9fe:a9fe::')).toBe('169.254.169.254');
    // Teredo layout: prefix(32) + server(32) + flags(16) + port(16) + client(32), with the
    // client IPv4 stored one's-complemented in the final 32 bits.
    expect(unwrapTransitionAddress('2001:0000:4141:4141:0000:0000:80ff:fffe')).toBe('127.0.0.1');
    expect(unwrapTransitionAddress('2001:0000:4141:4141:0000:0000:5601:5601')).toBe(
      '169.254.169.254',
    );
  });

  it('blocks transition addresses that wrap a private IPv4', () => {
    expect(classifyResolvedAddress('64:ff9b::7f00:1')).toBe('BLOCKED');
    expect(classifyResolvedAddress('2002:7f00:1::')).toBe('BLOCKED');
    expect(classifyResolvedAddress('2002:a9fe:a9fe::')).toBe('BLOCKED');
    expect(classifyResolvedAddress('2001:0000:4141:4141:0000:0000:5601:5601')).toBe('BLOCKED');
  });

  it('returns null for addresses that carry no embedded IPv4', () => {
    expect(unwrapTransitionAddress('2606:4700:4700::1111')).toBeNull();
    expect(unwrapTransitionAddress('::1')).toBeNull();
    expect(unwrapTransitionAddress('8.8.8.8')).toBeNull();
    expect(unwrapTransitionAddress('nonsense')).toBeNull();
  });

  it('normalises brackets, case and zone identifiers before judging', () => {
    expect(classifyResolvedAddress('[::FFFF:127.0.0.1]')).toBe('BLOCKED');
    expect(classifyResolvedAddress('FE80::1%eth0')).toBe('BLOCKED');
    expect(classifyResolvedAddress('  8.8.8.8  ')).toBe('GLOBAL');
  });
});

describe('upstream endpoint allow-list', () => {
  it('accepts https on the default TLS port', () => {
    expect(parseUpstreamEndpoint('https://router.project-osrm.org')).toEqual({
      host: 'router.project-osrm.org',
      port: 443,
      basePath: '',
    });
    expect(parseUpstreamEndpoint('https://osrm.example.org/route/v1')).toEqual({
      host: 'osrm.example.org',
      port: 443,
      basePath: '/route/v1',
    });
    expect(parseUpstreamEndpoint('https://Nominatim.Example.ORG/')).toEqual({
      host: 'nominatim.example.org',
      port: 443,
      basePath: '',
    });
  });

  it('rejects anything that is not plain https', () => {
    for (const url of [
      'http://router.project-osrm.org',
      'ftp://router.project-osrm.org',
      'file:///etc/passwd',
      'https://router.project-osrm.org:8443',
      'https://router.project-osrm.org:80',
      'https://user:pass@router.project-osrm.org',
      'not a url',
      '',
    ]) {
      expect(parseUpstreamEndpoint(url), url).toBeNull();
    }
  });

  it('strips trailing slashes from the base path', () => {
    expect(parseUpstreamEndpoint('https://osrm.example.org/base///')?.basePath).toBe('/base');
  });
});

describe('coordinate bounds', () => {
  const maiduguri = { latitude: 11.8464, longitude: 13.1603 };
  const nearby = { latitude: 11.9, longitude: 13.2 };

  it('accepts a short realistic route', () => {
    expect(assertCoordinatesWithinBounds([maiduguri, nearby])).toEqual({ ok: true });
  });

  it('rejects fewer than two coordinates', () => {
    expect(assertCoordinatesWithinBounds([maiduguri]).ok).toBe(false);
    expect(assertCoordinatesWithinBounds([]).ok).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(assertCoordinatesWithinBounds([maiduguri, { latitude: 91, longitude: 0 }]).ok).toBe(
      false,
    );
    expect(assertCoordinatesWithinBounds([maiduguri, { latitude: 0, longitude: 181 }]).ok).toBe(
      false,
    );
    expect(
      assertCoordinatesWithinBounds([maiduguri, { latitude: Number.NaN, longitude: 0 }]).ok,
    ).toBe(false);
  });

  it('rejects a leg longer than the per-leg cap', () => {
    const verdict = assertCoordinatesWithinBounds([
      { latitude: 11.8464, longitude: 13.1603 },
      { latitude: 48.8566, longitude: 2.3522 },
    ]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('leg');
  });

  it('rejects a total distance over the aggregate cap', () => {
    const hop = 500; // under the 600 km leg cap individually
    const coordinates = Array.from({ length: 6 }, (_, index) => ({
      latitude: 11.8464 + index * (hop / 111),
      longitude: 13.1603,
    }));
    const verdict = assertCoordinatesWithinBounds(coordinates);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('Total distance');
  });

  it('rejects more coordinates than the cap', () => {
    const coordinates = Array.from({ length: DEFAULT_UPSTREAM_BOUNDS.maxCoordinates + 1 }, () => ({
      latitude: 11.8464,
      longitude: 13.1603,
    }));
    expect(assertCoordinatesWithinBounds(coordinates).ok).toBe(false);
  });
});

describe('cache cells', () => {
  it('collapses nearby coordinates into one cell', () => {
    expect(cacheCellKey('wx', 11.8464, 13.1603)).toBe(cacheCellKey('wx', 11.8499, 13.1549));
  });

  it('separates distant coordinates', () => {
    expect(cacheCellKey('wx', 11.8464, 13.1603)).not.toBe(cacheCellKey('wx', 12.5, 13.9));
  });

  it('namespaces by prefix', () => {
    expect(cacheCellKey('wx', 11.8, 13.1)).not.toBe(cacheCellKey('geo', 11.8, 13.1));
  });
});

describe('daily budget governor', () => {
  it('allows requests while under the limit and reports remaining', () => {
    expect(evaluateDailyBudget(undefined, 100)).toEqual({ ok: true, remaining: 99 });
    expect(evaluateDailyBudget({ used: 40, limit: 100 }, 100)).toEqual({ ok: true, remaining: 59 });
  });

  it('refuses once the limit is reached', () => {
    const verdict = evaluateDailyBudget({ used: 100, limit: 100 }, 100);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain('exhausted');
      expect(verdict.used).toBe(100);
    }
  });

  it('treats a zero limit as disabled rather than unlimited', () => {
    expect(evaluateDailyBudget(undefined, 0).ok).toBe(false);
    expect(evaluateDailyBudget(undefined, -1).ok).toBe(false);
  });

  it('produces a stable UTC day stamp', () => {
    expect(utcDayStamp(new Date('2026-09-18T23:59:00Z'))).toBe('2026-09-18');
    expect(utcDayStamp(new Date('2026-09-19T00:01:00Z'))).toBe('2026-09-19');
  });
});
