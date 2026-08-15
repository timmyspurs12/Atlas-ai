import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import type { Environment } from '../src/config/environment';
import { PrismaService } from '../src/database/prisma.service';
import {
  CallSessionStatus,
  DevicePlatform,
  SessionStatus,
  UserRole,
} from '../src/generated/prisma/client';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';

interface TestPrincipal {
  userId: string;
  deviceId: string;
  sessionId: string;
  token: string;
}

interface RecordValue {
  [key: string]: unknown;
}

const createdUserIds: string[] = [];
const sockets: Socket[] = [];
let app: INestApplication;
let prisma: PrismaService;
let jwt: JwtService;
let config: ConfigService<Environment, true>;
let redisAdapter: RedisIoAdapter;
let httpServer: Server;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  prisma = app.get(PrismaService);
  jwt = app.get(JwtService);
  config = app.get(ConfigService<Environment, true>);
  redisAdapter = new RedisIoAdapter(app, config);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);
  await app.listen(0, '127.0.0.1');
  httpServer = app.getHttpServer() as Server;
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await app.close();
  await redisAdapter.disconnectFromRedis();
});

describe('Stay With Me REST and Socket.IO authorization', () => {
  it('enforces invitee identity, room membership, mutual consent, and immediate revocation', async () => {
    const runId = randomUUID().slice(0, 8);
    const initiator = await createPrincipal(`initiator-${runId}`);
    const invitee = await createPrincipal(`invitee-${runId}`);
    const outsider = await createPrincipal(`outsider-${runId}`);

    await request(httpServer).get('/v1/call-safety/sessions').expect(401);

    const created = await request(httpServer)
      .post('/v1/call-safety/sessions')
      .set('Authorization', `Bearer ${initiator.token}`)
      .send({
        invitedUserId: invitee.userId,
        durationMinutes: 15,
        mode: 'PSTN_COMPANION',
      })
      .expect(201);
    const createBody = asRecord(created.body);
    const sessionId = requiredString(createBody, 'sessionId');
    const rawInvitationToken = requiredString(createBody, 'invitationToken');

    const invitation = await prisma.callInvitation.findUniqueOrThrow({
      where: { sessionId },
      select: { id: true, tokenHash: true },
    });
    expect(invitation.tokenHash).not.toBe(rawInvitationToken);

    const notifications = await prisma.notification.findMany({
      where: { entityType: 'CallInvitation', entityId: invitation.id },
      select: { channel: true, data: true },
      orderBy: { channel: 'asc' },
    });
    expect(notifications).toHaveLength(2);
    for (const notification of notifications) {
      const serialized = JSON.stringify(notification.data);
      expect(serialized).not.toContain(rawInvitationToken);
      expect(serialized).not.toContain('invitationToken');
      expect(serialized).not.toContain('latitude');
      expect(serialized).not.toContain('longitude');
    }

    await request(httpServer)
      .post(`/v1/call-safety/invitations/by-id/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    await request(httpServer)
      .get(`/v1/call-safety/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403);

    await request(httpServer)
      .post(`/v1/call-safety/invitations/by-id/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201)
      .expect((response) => {
        expect(asRecord(response.body).sessionId).toBe(sessionId);
      });

    const initiatorSocket = await connectAuthorized(initiator.token);
    const inviteeSocket = await connectAuthorized(invitee.token);
    const outsiderSocket = await connectAuthorized(outsider.token);

    await expectSocketException(
      outsiderSocket,
      'session:join',
      { sessionId },
      'SESSION_JOIN_REJECTED',
    );
    await joinSession(initiatorSocket, sessionId);
    await joinSession(inviteeSocket, sessionId);

    const firstLocation = locationPayload(sessionId, 1);
    await expectSocketException(
      initiatorSocket,
      'location:update',
      firstLocation,
      'LOCATION_UPDATE_REJECTED',
    );
    expect(await prisma.callSessionLocation.count({ where: { sessionId } })).toBe(0);

    const firstConsent = await request(httpServer)
      .post(`/v1/call-safety/sessions/${sessionId}/consent`)
      .set('Authorization', `Bearer ${initiator.token}`)
      .send({ precision: 'PRECISE', shareBattery: false, shareSpeed: false })
      .expect(201);
    expect(asRecord(firstConsent.body).active).toBe(false);

    const secondConsent = await request(httpServer)
      .post(`/v1/call-safety/sessions/${sessionId}/consent`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({ precision: 'PRECISE', shareBattery: false, shareSpeed: false })
      .expect(201);
    expect(asRecord(secondConsent.body).active).toBe(true);

    const remoteLocation = waitForEvent(inviteeSocket, 'location:updated');
    const accepted = await emitWithAck(initiatorSocket, 'location:update', firstLocation);
    expect(asRecord(accepted)).toMatchObject({ accepted: true, sequence: 1 });
    expect(asRecord(await remoteLocation)).toMatchObject({
      userId: initiator.userId,
      sequence: 1,
    });
    expect(await prisma.callSessionLocation.count({ where: { sessionId } })).toBe(1);

    await expectSocketException(
      initiatorSocket,
      'location:update',
      firstLocation,
      'LOCATION_UPDATE_REJECTED',
    );
    expect(await prisma.callSessionLocation.count({ where: { sessionId } })).toBe(1);

    const ended = waitForEvent(inviteeSocket, 'session:ended');
    await request(httpServer)
      .delete(`/v1/call-safety/sessions/${sessionId}/consent`)
      .set('Authorization', `Bearer ${initiator.token}`)
      .expect(204);
    expect(asRecord(await ended)).toMatchObject({
      sessionId,
      reason: 'CONSENT_REVOKED',
    });

    await expectSocketException(
      initiatorSocket,
      'location:update',
      locationPayload(sessionId, 2),
      'LOCATION_UPDATE_REJECTED',
    );
    expect(await prisma.callSessionLocation.count({ where: { sessionId } })).toBe(1);
    const endedSession = await prisma.callSafetySession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true },
    });
    expect(endedSession.status).toBe(CallSessionStatus.ENDED);

    const missingTokenSocket = createSocket();
    const missingTokenError = waitForEvent(missingTokenSocket, 'auth:error');
    const missingTokenDisconnect = waitForDisconnect(missingTokenSocket);
    missingTokenSocket.connect();
    expect(asRecord(await missingTokenError)).toMatchObject({ code: 'UNAUTHORIZED' });
    await missingTokenDisconnect;

    await prisma.session.update({
      where: { id: outsider.sessionId },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
    });
    const activeSocketAuthError = waitForEvent(outsiderSocket, 'auth:error');
    const activeSocketDisconnect = waitForDisconnect(outsiderSocket);
    outsiderSocket.emit('session:join', { sessionId });
    expect(asRecord(await activeSocketAuthError)).toMatchObject({ code: 'UNAUTHORIZED' });
    await activeSocketDisconnect;

    const revokedSocket = createSocket(outsider.token);
    const revokedError = waitForEvent(revokedSocket, 'auth:error');
    const revokedDisconnect = waitForDisconnect(revokedSocket);
    revokedSocket.connect();
    expect(asRecord(await revokedError)).toMatchObject({ code: 'UNAUTHORIZED' });
    await revokedDisconnect;
  });
});

async function createPrincipal(label: string): Promise<TestPrincipal> {
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: `${label}@e2e.atlas.invalid`,
      emailVerifiedAt: now,
      role: UserRole.USER,
      termsVersion: 'e2e-2026-01',
      termsAcceptedAt: now,
      profile: { create: { displayName: label, isDiscoverable: true } },
    },
  });
  createdUserIds.push(user.id);
  const device = await prisma.device.create({
    data: {
      userId: user.id,
      installationId: `e2e-${randomUUID()}`,
      platform: DevicePlatform.WEB,
      name: `${label} test device`,
      appVersion: '0.1.0-e2e',
      lastSeenAt: now,
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      refreshTokenHash: 'e2e-refresh-hash',
      tokenFamily: randomUUID(),
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    },
  });
  const token = await jwt.signAsync(
    {
      sub: user.id,
      sid: session.id,
      did: device.id,
      role: UserRole.USER,
      type: 'access',
    },
    {
      secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithm: 'HS256',
      expiresIn: 900,
    },
  );
  return { userId: user.id, deviceId: device.id, sessionId: session.id, token };
}

function createSocket(token?: string): Socket {
  const socket = io(`${baseUrl}/call-safety`, {
    autoConnect: false,
    auth: token ? { token } : {},
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  sockets.push(socket);
  return socket;
}

async function connectAuthorized(token: string): Promise<Socket> {
  const socket = createSocket(token);
  const connected = waitForEvent(socket, 'session:connected');
  socket.connect();
  await connected;
  return socket;
}

async function joinSession(socket: Socket, sessionId: string): Promise<void> {
  expect(asRecord(await emitWithAck(socket, 'session:join', { sessionId }))).toEqual({
    joined: true,
    sessionId,
  });
}

async function expectSocketException(
  socket: Socket,
  event: string,
  payload: RecordValue,
  expectedCode: string,
): Promise<void> {
  const exception = waitForEvent(socket, 'exception');
  socket.emit(event, payload);
  expect(JSON.stringify(await exception)).toContain(expectedCode);
}

function emitWithAck(socket: Socket, event: string, payload: RecordValue): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Socket acknowledgement timed out: ${event}`)),
      5_000,
    );
    socket.emit(event, payload, (response: unknown) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function waitForEvent(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Socket event timed out: ${event}`));
    }, 5_000);
    const handler = (payload: unknown): void => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function waitForDisconnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket disconnect timed out')), 5_000);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function locationPayload(sessionId: string, sequence: number): RecordValue {
  return {
    sessionId,
    latitude: 6.5243793,
    longitude: 3.3792057,
    accuracyM: 12.5,
    headingDeg: 90,
    speedMps: 2.1,
    sequence,
    recordedAt: new Date().toISOString(),
  };
}

function asRecord(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object payload');
  }
  return value as RecordValue;
}

function requiredString(value: RecordValue, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new Error(`Expected ${key} to be a string`);
  return field;
}
