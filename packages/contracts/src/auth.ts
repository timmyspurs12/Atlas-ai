import { z } from 'zod';
import { isoDateSchema, userSummarySchema, uuidSchema } from './common';

const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128)
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number');

export const registerSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60),
  acceptedTermsVersion: z.string().min(1).max(20),
  device: z.object({
    installationId: z.string().min(16).max(128),
    name: z.string().min(1).max(100),
    platform: z.enum(['IOS', 'ANDROID', 'WEB']),
    appVersion: z.string().max(30),
  }),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
  device: registerSchema.shape.device,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(40).max(512),
  installationId: z.string().min(16).max(128),
});

export const sessionUserSchema = userSummarySchema.extend({
  email: z.email().nullable(),
  phone: z.string().nullable(),
  role: z.enum(['USER', 'BUSINESS_ADMIN', 'DISPATCHER', 'SECURITY_OPERATOR', 'SUPER_ADMIN']),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
});

export const authSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  sessionId: uuidSchema,
  user: sessionUserSchema,
});

export const deviceSessionSchema = z.object({
  id: uuidSchema,
  deviceName: z.string(),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  lastUsedAt: isoDateSchema,
  createdAt: isoDateSchema,
  isCurrent: z.boolean(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
