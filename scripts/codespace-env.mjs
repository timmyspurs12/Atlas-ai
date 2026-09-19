/**
 * Generate working `.env` files for a GitHub Codespace (or any devcontainer).
 *
 * Copying `.env.example` verbatim does not work in a devcontainer, for three reasons this
 * script handles:
 *
 *  1. **Postgres and Redis are sibling containers.** They are reachable as `postgres` and
 *     `redis`, not `localhost`.
 *  2. **The browser is not the container.** A Codespaces preview runs in your browser and
 *     reaches the API through a public forwarded URL. Any value the *browser* reads
 *     (`EXPO_PUBLIC_*`, CORS origins) must therefore use that forwarded hostname — leaving
 *     `localhost` there produces an app that loads and then silently fails every request.
 *  3. **Secrets must be unique per Codespace** and `FIELD_ENCRYPTION_KEY` must be a
 *     base64-encoded 32-byte key, not an arbitrary string.
 *
 * Usage:
 *   node scripts/codespace-env.mjs           # writes .env and apps/api/.env if absent
 *   node scripts/codespace-env.mjs --force   # overwrite existing files
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');

// Codespaces sets both of these. Outside Codespaces they are absent and we fall back to
// localhost, which is correct for a plain local `docker compose up`.
const codespaceName = process.env.CODESPACE_NAME ?? '';
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? '';
const inCodespaces = Boolean(codespaceName && forwardingDomain);

/** The public URL a browser uses to reach a forwarded port in this Codespace. */
function forwardedUrl(port) {
  return inCodespaces ? `https://${port}-${codespaceName}.${forwardingDomain}` : '';
}

const apiPublicUrl = forwardedUrl(4000);
const mobilePublicUrl = forwardedUrl(8081);
const adminPublicUrl = forwardedUrl(4173);

const secrets = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  REFRESH_TOKEN_PEPPER: randomBytes(48).toString('base64url'),
  // Must be exactly 32 bytes, base64-encoded — the field encryption adapter expects that shape.
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

/**
 * Per-file overrides. Only keys present in that file's `.env.example` are rewritten, so the
 * same map serves both the root and the API env files.
 */
const overrides = {
  DATABASE_URL: 'postgresql://atlas:atlas_dev_only@postgres:5432/atlas?schema=public',
  REDIS_URL: 'redis://redis:6379',
  ...secrets,

  // Browser-facing: must be the forwarded URL inside Codespaces.
  ...(apiPublicUrl
    ? {
        API_BASE_URL: `${apiPublicUrl}/v1`,
        EXPO_PUBLIC_API_URL: `${apiPublicUrl}/v1`,
        EXPO_PUBLIC_SOCKET_URL: apiPublicUrl,
        APP_WEB_URL: mobilePublicUrl,
        // Allow the forwarded mobile and admin origins to call the API.
        CORS_ORIGINS: [
          apiPublicUrl,
          mobilePublicUrl,
          adminPublicUrl,
          forwardedUrl(19006),
          'http://localhost:8081',
          'http://localhost:4173',
        ]
          .filter(Boolean)
          .join(','),
      }
    : {}),
};

function applyOverrides(exampleText) {
  let out = exampleText;
  for (const [key, value] of Object.entries(overrides)) {
    // Match `KEY=` or `KEY=value` at line start; leave comments and absent keys alone.
    const pattern = new RegExp(`^(${key})=.*$`, 'm');
    if (pattern.test(out)) out = out.replace(pattern, `$1=${value}`);
  }
  return out;
}

const targets = [
  { example: join(repoRoot, '.env.example'), env: join(repoRoot, '.env') },
  { example: join(repoRoot, 'apps/api/.env.example'), env: join(repoRoot, 'apps/api/.env') },
  // Expo loads env from the mobile app's own directory, not the repo root, so the
  // browser-facing EXPO_PUBLIC_* values must be rewritten here too — otherwise the web
  // preview calls localhost:4000 from the user's browser and every request fails.
  {
    example: join(repoRoot, 'apps/mobile/.env.example'),
    env: join(repoRoot, 'apps/mobile/.env.local'),
  },
];

let wrote = 0;
for (const { example, env } of targets) {
  if (!existsSync(example)) {
    console.warn(`skip: no ${example}`);
    continue;
  }
  if (existsSync(env) && !force) {
    console.warn(`exists (left untouched, use --force to overwrite): ${env}`);
    continue;
  }
  writeFileSync(env, applyOverrides(readFileSync(example, 'utf8')), 'utf8');
  wrote += 1;
  console.warn(`wrote ${env}`);
}

console.warn('');
if (inCodespaces) {
  console.warn(`Codespace detected: ${codespaceName}`);
  console.warn(`  API (browser-facing)  -> ${apiPublicUrl}/v1`);
  console.warn(`  Mobile web            -> ${mobilePublicUrl}`);
  console.warn(`  Admin                 -> ${adminPublicUrl}`);
  console.warn('  These ports are PRIVATE to your GitHub account until you mark them public.');
} else {
  console.warn('Not a Codespace: browser-facing URLs left on localhost.');
}
console.warn('');
console.warn(`Generated ${wrote} env file(s) with fresh per-Codespace secrets.`);
console.warn('Postgres and Redis are addressed as `postgres` and `redis` (compose services).');
