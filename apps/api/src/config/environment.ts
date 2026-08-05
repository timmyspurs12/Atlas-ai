import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z.string().min(32),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    FIELD_ENCRYPTION_KEY: z.string().min(32),
    CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
    APP_WEB_URL: z.url().default('http://localhost:8081'),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-5-mini'),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_IDS: z.string().optional(),
    APPLE_CLIENT_ID: z.string().default('com.atlasai.app'),
    TRUST_PROXY: booleanFromString,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;

    const unsafeValues = ['replace-with', 'atlas_dev_only', 'development-only'];
    for (const key of [
      'JWT_ACCESS_SECRET',
      'REFRESH_TOKEN_PEPPER',
      'FIELD_ENCRYPTION_KEY',
    ] as const) {
      if (unsafeValues.some((value) => env[key].includes(value))) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be replaced for production`,
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  return parsed.data;
}
