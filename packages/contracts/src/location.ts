import { z } from 'zod';
import { isoDateSchema, userSummarySchema, uuidSchema } from './common';

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const locationUpdateSchema = coordinatesSchema.extend({
  accuracyM: z.number().min(0).max(10_000),
  altitudeM: z.number().min(-500).max(20_000).nullable().optional(),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  speedMps: z.number().min(0).max(200).nullable().optional(),
  batteryPct: z.number().int().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  recordedAt: isoDateSchema,
  sequence: z.number().int().nonnegative(),
  isMocked: z.boolean().default(false),
});

export const startLocationShareSchema = z.object({
  recipientIds: z.array(uuidSchema).min(1).max(50),
  durationMinutes: z.number().int().min(5).max(10_080),
  precision: z.enum(['PRECISE', 'APPROXIMATE']).default('PRECISE'),
  shareBattery: z.boolean().default(true),
  shareSpeed: z.boolean().default(true),
  allowGeofences: z.boolean().default(false),
});

export const livePersonSchema = z.object({
  user: userSummarySchema,
  shareId: uuidSchema,
  location: locationUpdateSchema.omit({ sequence: true, isMocked: true }).nullable(),
  precision: z.enum(['PRECISE', 'APPROXIMATE']),
  expiresAt: isoDateSchema,
  isStale: z.boolean(),
});

export const locationSocketEventSchema = z.object({
  userId: uuidSchema,
  shareVersion: z.number().int().positive(),
  location: locationUpdateSchema,
});

export type Coordinates = z.infer<typeof coordinatesSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type StartLocationShareInput = z.infer<typeof startLocationShareSchema>;
export type LivePerson = z.infer<typeof livePersonSchema>;
