import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AuthSession, SessionUser } from '@atlas/contracts';
import type { Environment } from '../../config/environment';
import { AuditService } from '../../common/audit.service';
import { EncryptionService } from '../../common/encryption.service';
import {
  createRefreshToken,
  hashRefreshSecret,
  parseRefreshToken,
  safeHashEquals,
} from '../../common/utils/token.util';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthProvider,
  SessionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  UserStatus,
  VerificationPurpose,
  type Profile,
  type User,
} from '../../generated/prisma/client';
import { AuthDeliveryService } from './auth-delivery.service';
import type {
  DeviceDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestPhoneVerificationDto,
  ResetPasswordDto,
  SocialLoginDto,
  VerifyPhoneDto,
} from './auth.dto';
import { SocialProviderDto } from './auth.dto';
import { SocialTokenService } from './social-token.service';
import type { AuthPrincipal, RequestMetadata } from './auth.types';

interface UserWithProfile extends User {
  profile: Profile | null;
}

interface CreatedSession {
  id: string;
  refreshToken: string;
  deviceId: string;
}

@Injectable()
export class AuthService {
  private readonly passwordOptions: argon2.Options & { raw?: false } = {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
    private readonly audit: AuditService,
    private readonly socialTokens: SocialTokenService,
    private readonly delivery: AuthDeliveryService,
    private readonly encryption: EncryptionService,
  ) {}

  async register(input: RegisterDto, metadata: RequestMetadata): Promise<AuthSession> {
    const passwordHash = await argon2.hash(input.password, this.passwordOptions);
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: input.email,
            passwordHash,
            termsVersion: input.acceptedTermsVersion,
            termsAcceptedAt: new Date(),
            profile: { create: { displayName: input.displayName } },
            subscriptions: {
              create: {
                plan: SubscriptionPlan.FREE,
                status: SubscriptionStatus.ACTIVE,
                entitlements: {},
              },
            },
          },
          include: { profile: true },
        });
        const session = await this.createSession(user.id, input.device, metadata, transaction);
        return { user, session };
      });

      await this.audit.record({
        actorId: result.user.id,
        action: 'AUTH_REGISTERED',
        entityType: 'User',
        entityId: result.user.id,
        requestId: metadata.requestId,
      });
      return this.issueAuthSession(result.user, result.session);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('An account already exists');
      throw error;
    }
  }

  async login(input: LoginDto, metadata: RequestMetadata): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
      include: { profile: true },
    });
    const valid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, input.password)
      : await this.consumePasswordWork(input.password);

    if (!user || !valid || user.status !== UserStatus.ACTIVE) {
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        outcome: 'DENIED',
        requestId: metadata.requestId,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const session = await this.createSession(user.id, input.device, metadata, this.prisma);
    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      entityType: 'Session',
      entityId: session.id,
      requestId: metadata.requestId,
    });
    return this.issueAuthSession(user, session);
  }

  async socialLogin(input: SocialLoginDto, metadata: RequestMetadata): Promise<AuthSession> {
    const identity = await this.socialTokens.verify(input.provider, input.idToken);
    const provider =
      input.provider === SocialProviderDto.GOOGLE ? AuthProvider.GOOGLE : AuthProvider.APPLE;

    const result = await this.prisma.$transaction(async (transaction) => {
      const existingIdentity = await transaction.authIdentity.findUnique({
        where: { provider_providerSubject: { provider, providerSubject: identity.subject } },
        include: { user: { include: { profile: true } } },
      });
      if (existingIdentity?.user.deletedAt)
        throw new UnauthorizedException('Account is unavailable');

      let user: UserWithProfile;
      if (existingIdentity) {
        user = existingIdentity.user;
      } else {
        const existingByEmail = identity.email
          ? await transaction.user.findFirst({
              where: { email: identity.email, deletedAt: null },
              include: { profile: true },
            })
          : null;
        user =
          existingByEmail ??
          (await transaction.user.create({
            data: {
              email: identity.email,
              emailVerifiedAt: identity.emailVerified ? new Date() : null,
              termsVersion: input.acceptedTermsVersion,
              termsAcceptedAt: new Date(),
              profile: {
                create: {
                  displayName: input.displayName ?? identity.displayName ?? 'Atlas member',
                },
              },
              subscriptions: {
                create: {
                  plan: SubscriptionPlan.FREE,
                  status: SubscriptionStatus.ACTIVE,
                  entitlements: {},
                },
              },
            },
            include: { profile: true },
          }));
        await transaction.authIdentity.create({
          data: {
            userId: user.id,
            provider,
            providerSubject: identity.subject,
            providerEmail: identity.email,
          },
        });
      }

      if (user.status !== UserStatus.ACTIVE)
        throw new UnauthorizedException('Account is unavailable');
      const session = await this.createSession(user.id, input.device, metadata, transaction);
      return { user, session };
    });

    await this.audit.record({
      actorId: result.user.id,
      action: `AUTH_${provider}_LOGIN`,
      entityType: 'Session',
      entityId: result.session.id,
      requestId: metadata.requestId,
    });
    return this.issueAuthSession(result.user, result.session);
  }

  async refresh(input: RefreshDto, metadata: RequestMetadata): Promise<AuthSession> {
    const parsed = parseRefreshToken(input.refreshToken);
    if (!parsed) throw new UnauthorizedException('Invalid refresh token');

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      include: { device: true, user: { include: { profile: true } } },
    });
    if (
      !session ||
      session.deletedAt ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      session.device.installationId !== input.installationId ||
      session.user.deletedAt ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const presentedHash = hashRefreshSecret(parsed.secret, this.refreshPepper);
    if (
      session.previousRefreshTokenHash &&
      safeHashEquals(presentedHash, session.previousRefreshTokenHash)
    ) {
      await this.revokeTokenFamily(session.tokenFamily, 'REFRESH_TOKEN_REUSE');
      await this.audit.record({
        actorId: session.userId,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        entityType: 'Session',
        entityId: session.id,
        severity: 'CRITICAL',
        outcome: 'DENIED',
        requestId: metadata.requestId,
      });
      throw new UnauthorizedException('Session revoked for security');
    }
    if (!safeHashEquals(presentedHash, session.refreshTokenHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const next = createRefreshToken(session.id);
    const nextHash = hashRefreshSecret(next.secret, this.refreshPepper);
    const rotated = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        status: SessionStatus.ACTIVE,
        generation: session.generation,
        refreshTokenHash: session.refreshTokenHash,
      },
      data: {
        previousRefreshTokenHash: session.refreshTokenHash,
        refreshTokenHash: nextHash,
        generation: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
    if (rotated.count !== 1) {
      await this.revokeTokenFamily(session.tokenFamily, 'CONCURRENT_REFRESH_REUSE');
      throw new UnauthorizedException('Session revoked for security');
    }

    return this.issueAuthSession(session.user, {
      id: session.id,
      deviceId: session.deviceId,
      refreshToken: next.serialized,
    });
  }

  async logout(principal: AuthPrincipal, metadata: RequestMetadata): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: principal.sessionId, userId: principal.userId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokeReason: 'USER_LOGOUT' },
    });
    await this.audit.record({
      actorId: principal.userId,
      action: 'AUTH_LOGOUT',
      entityType: 'Session',
      entityId: principal.sessionId,
      requestId: metadata.requestId,
    });
  }

  async listSessions(principal: AuthPrincipal): Promise<Array<Record<string, unknown>>> {
    const sessions = await this.prisma.session.findMany({
      where: { userId: principal.userId, status: SessionStatus.ACTIVE, deletedAt: null },
      include: { device: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.device.name,
      platform: session.device.platform,
      lastUsedAt: session.lastUsedAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      isCurrent: session.id === principal.sessionId,
    }));
  }

  async revokeSession(principal: AuthPrincipal, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: principal.userId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
    });
    if (result.count === 0) throw new UnauthorizedException('Session not found');
    await this.audit.record({
      actorId: principal.userId,
      action: 'AUTH_SESSION_REVOKED',
      entityType: 'Session',
      entityId: sessionId,
    });
  }

  async requestPhoneVerification(
    userId: string,
    input: RequestPhoneVerificationDto,
  ): Promise<{ challengeId: string; delivery: 'SENT' | 'DEVELOPMENT_ONLY' }> {
    const used = await this.prisma.user.findFirst({
      where: { phone: input.phone, id: { not: userId }, deletedAt: null },
      select: { id: true },
    });
    if (used) throw new ConflictException('That phone number is already in use');
    const code = randomInt(100_000, 1_000_000).toString();
    const challenge = await this.prisma.verificationChallenge.create({
      data: {
        userId,
        purpose: VerificationPurpose.VERIFY_PHONE,
        targetHash: this.hashValue(input.phone),
        targetCiphertext: this.encryption.encryptUtf8(input.phone),
        codeHash: this.hashValue(code),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const delivered = await this.delivery.sendPhoneVerification(input.phone, code);
    return { challengeId: challenge.id, delivery: delivered ? 'SENT' : 'DEVELOPMENT_ONLY' };
  }

  async verifyPhone(userId: string, input: VerifyPhoneDto): Promise<void> {
    const challenge = await this.prisma.verificationChallenge.findFirst({
      where: {
        id: input.challengeId,
        userId,
        purpose: VerificationPurpose.VERIFY_PHONE,
        attempts: { lt: 5 },
        consumedAt: null,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge?.targetCiphertext) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }
    await this.prisma.verificationChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    if (!safeHashEquals(this.hashValue(input.code), challenge.codeHash)) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }
    const phone = this.encryption.decryptUtf8(challenge.targetCiphertext);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { phone, phoneVerifiedAt: new Date() },
      }),
      this.prisma.verificationChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actorId: userId,
      action: 'AUTH_PHONE_VERIFIED',
      entityType: 'User',
      entityId: userId,
    });
  }

  async requestPasswordReset(input: ForgotPasswordDto): Promise<{ accepted: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });
    if (!user) return { accepted: true };

    const challengeId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.verificationChallenge.create({
      data: {
        id: challengeId,
        userId: user.id,
        purpose: VerificationPurpose.RESET_PASSWORD,
        targetHash: this.hashValue(input.email),
        codeHash: this.hashValue(secret),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    await this.delivery.sendPasswordReset(input.email, `${challengeId}.${secret}`);
    return { accepted: true };
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    const parsed = parseRefreshToken(input.token);
    if (!parsed) throw new UnauthorizedException('Reset link is invalid or expired');
    const challenge = await this.prisma.verificationChallenge.findFirst({
      where: {
        id: parsed.sessionId,
        purpose: VerificationPurpose.RESET_PASSWORD,
        consumedAt: null,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge || !safeHashEquals(this.hashValue(parsed.secret), challenge.codeHash)) {
      throw new UnauthorizedException('Reset link is invalid or expired');
    }

    const passwordHash = await argon2.hash(input.password, this.passwordOptions);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: challenge.userId }, data: { passwordHash } }),
      this.prisma.verificationChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: challenge.userId, status: SessionStatus.ACTIVE },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          revokeReason: 'PASSWORD_RESET',
        },
      }),
    ]);
    await this.audit.record({
      actorId: challenge.userId,
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'User',
      entityId: challenge.userId,
    });
  }

  private async createSession(
    userId: string,
    deviceInput: DeviceDto,
    metadata: RequestMetadata,
    transaction: Pick<PrismaService, 'device' | 'session'>,
  ): Promise<CreatedSession> {
    const now = new Date();
    const device = await transaction.device.upsert({
      where: { userId_installationId: { userId, installationId: deviceInput.installationId } },
      create: {
        userId,
        installationId: deviceInput.installationId,
        name: deviceInput.name,
        platform: deviceInput.platform,
        appVersion: deviceInput.appVersion,
        osVersion: deviceInput.osVersion,
        lastSeenAt: now,
      },
      update: {
        name: deviceInput.name,
        platform: deviceInput.platform,
        appVersion: deviceInput.appVersion,
        osVersion: deviceInput.osVersion,
        lastSeenAt: now,
        deletedAt: null,
      },
    });
    const sessionId = randomUUID();
    const refresh = createRefreshToken(sessionId);
    await transaction.session.create({
      data: {
        id: sessionId,
        userId,
        deviceId: device.id,
        refreshTokenHash: hashRefreshSecret(refresh.secret, this.refreshPepper),
        tokenFamily: randomUUID(),
        ipHash: metadata.ip ? this.hashValue(metadata.ip) : null,
        userAgent: metadata.userAgent?.slice(0, 512),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + this.refreshTtlDays * 86_400_000),
      },
    });
    return { id: sessionId, refreshToken: refresh.serialized, deviceId: device.id };
  }

  private async issueAuthSession(
    user: UserWithProfile,
    session: CreatedSession,
  ): Promise<AuthSession> {
    if (!user.profile) throw new Error('User profile invariant violated');
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: session.id,
        did: session.deviceId,
        role: user.role,
        type: 'access',
      },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn,
        algorithm: 'HS256',
      },
    );
    return {
      accessToken,
      refreshToken: session.refreshToken,
      expiresIn,
      sessionId: session.id,
      user: this.toSessionUser(user),
    };
  }

  private toSessionUser(user: UserWithProfile): SessionUser {
    if (!user.profile) throw new Error('User profile invariant violated');
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.profile.displayName,
      handle: user.profile.handle,
      avatarUrl: user.profile.avatarUrl,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      isOnline: false,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
    };
  }

  private async consumePasswordWork(password: string): Promise<false> {
    await argon2.hash(password, this.passwordOptions);
    return false;
  }

  private async revokeTokenFamily(tokenFamily: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenFamily, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokeReason: reason },
    });
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(`${this.refreshPepper}:${value}`).digest('hex');
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private get refreshPepper(): string {
    return this.config.get('REFRESH_TOKEN_PEPPER', { infer: true });
  }

  private get refreshTtlDays(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }
}
