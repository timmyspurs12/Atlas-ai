import { spawnSync } from 'node:child_process';

const acceptedAdvisories = new Map([
  [
    'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
    {
      packageName: 'image-size',
      expiresAt: '2026-11-01T00:00:00.000Z',
      reason:
        'Transitive Metro build-time parser. Atlas does not pass user uploads to Metro or image-size at runtime. No patched image-size release exists yet.',
    },
  ],
  [
    'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
    {
      packageName: 'image-size',
      expiresAt: '2026-11-01T00:00:00.000Z',
      reason:
        'Transitive Metro build-time parser. Atlas does not accept JXL or HEIF in its runtime API. No patched image-size release exists yet.',
    },
  ],
]);

const audit = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 20 * 1024 * 1024,
});
if (!audit.stdout.trim()) {
  process.stderr.write(`npm audit produced no JSON output.\n${audit.stderr}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  process.stderr.write(
    `Unable to parse npm audit JSON: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const now = new Date();

function advisoryIsAccepted(advisory) {
  const acceptance = acceptedAdvisories.get(advisory.url);
  if (!acceptance || acceptance.packageName !== advisory.name) return false;
  if (new Date(acceptance.expiresAt) <= now) {
    process.stderr.write(
      `Security exception expired for ${advisory.url} on ${acceptance.expiresAt}.\n`,
    );
    return false;
  }
  return true;
}

function evaluateVulnerability(name, visited = new Set()) {
  if (visited.has(name)) return { accepted: true, acceptedAdvisoryCount: 0 };
  visited.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return { accepted: false, acceptedAdvisoryCount: 0 };

  let acceptedAdvisoryCount = 0;
  for (const cause of vulnerability.via) {
    if (typeof cause !== 'string') {
      if (!['high', 'critical'].includes(cause.severity)) continue;
      if (!advisoryIsAccepted(cause)) {
        return { accepted: false, acceptedAdvisoryCount };
      }
      acceptedAdvisoryCount += 1;
      continue;
    }

    const dependency = vulnerabilities[cause];
    if (!dependency || !['high', 'critical'].includes(dependency.severity)) continue;
    const result = evaluateVulnerability(cause, new Set(visited));
    if (!result.accepted) return result;
    acceptedAdvisoryCount += result.acceptedAdvisoryCount;
  }

  return { accepted: true, acceptedAdvisoryCount };
}

function vulnerabilityIsAccepted(name) {
  const result = evaluateVulnerability(name);
  return result.accepted && result.acceptedAdvisoryCount > 0;
}

const blocking = [];
const accepted = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;
  if (vulnerabilityIsAccepted(name)) accepted.push(name);
  else blocking.push({ name, severity: vulnerability.severity, via: vulnerability.via });
}

if (accepted.length > 0) {
  process.stdout.write(
    `Accepted temporary build-time advisory chain: ${accepted.sort().join(', ')}\n`,
  );
  for (const [url, acceptance] of acceptedAdvisories) {
    process.stdout.write(`- ${url} expires ${acceptance.expiresAt}: ${acceptance.reason}\n`);
  }
}

if (blocking.length > 0) {
  process.stderr.write('Blocking high/critical npm vulnerabilities found:\n');
  process.stderr.write(`${JSON.stringify(blocking, null, 2)}\n`);
  process.exit(1);
}

const metadata = report.metadata?.vulnerabilities ?? {};
process.stdout.write(
  `Audit policy passed. critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, moderate=${metadata.moderate ?? 0}.\n`,
);
