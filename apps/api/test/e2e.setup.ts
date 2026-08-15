const databaseUrl = process.env.ATLAS_E2E_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'ATLAS_E2E_DATABASE_URL is required. End-to-end tests refuse to use the normal Atlas database.',
  );
}

const parsed = new URL(databaseUrl);
const databaseName = parsed.pathname.replace(/^\//, '');
if (!/(?:^|[_-])(test|e2e)$/i.test(databaseName)) {
  throw new Error(`Unsafe end-to-end database name: ${databaseName}`);
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL = process.env.ATLAS_E2E_REDIS_URL ?? 'redis://127.0.0.1:6379/15';
process.env.JWT_ACCESS_SECRET = 'atlas-e2e-access-secret-at-least-32-characters';
process.env.REFRESH_TOKEN_PEPPER = 'atlas-e2e-refresh-pepper-at-least-32-characters';
process.env.FIELD_ENCRYPTION_KEY = 'atlas-e2e-field-encryption-key-32-characters';
process.env.CORS_ORIGINS = 'http://127.0.0.1:8081';
process.env.APP_WEB_URL = 'http://127.0.0.1:8081';
process.env.LOG_LEVEL = 'error';
process.env.EXPO_PUSH_ENABLED = 'false';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '1';
