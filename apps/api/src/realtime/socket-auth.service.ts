import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { Environment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { SessionStatus, UserStatus } from '../generated/prisma/client';
import type { AccessTokenClaims, AuthPrincipal } from '../modules/auth/auth.types';

interface SocketAuthenticationData {
  atlasAccessTokenExpiresAt?: number;
}

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(client: Socket): Promise<AuthPrincipal> {
    const token = this.extractToken(client);
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
    if (claims.type !== 'access' || typeof claims.exp !== 'number') {
      throw new UnauthorizedException('Wrong token type');
    }
    this.data(client).atlasAccessTokenExpiresAt = claims.exp * 1_000;
    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        deviceId: claims.did,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        deletedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { id: true, userId: true, deviceId: true, user: { select: { role: true } } },
    });
    if (!session) throw new UnauthorizedException('Inactive session');
    return {
      userId: session.userId,
      sessionId: session.id,
      deviceId: session.deviceId,
      role: session.user.role,
    };
  }

  async assertActive(client: Socket, principal: AuthPrincipal): Promise<void> {
    const expiresAt = this.data(client).atlasAccessTokenExpiresAt;
    if (typeof expiresAt !== 'number' || expiresAt <= Date.now()) {
      this.reject(client, 'Access token expired');
    }
    const session = await this.prisma.session.findFirst({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        deviceId: principal.deviceId,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        deletedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { id: true },
    });
    if (!session) this.reject(client, 'Inactive session');
  }

  private reject(client: Socket, message: string): never {
    client.emit('auth:error', { code: 'UNAUTHORIZED', message });
    client.disconnect(true);
    throw new UnauthorizedException(message);
  }

  private data(client: Socket): SocketAuthenticationData {
    return client.data as SocketAuthenticationData;
  }

  private extractToken(client: Socket): string {
    const authToken: unknown = client.handshake.auth.token;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;
    const authorization = client.handshake.headers.authorization;
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
    throw new UnauthorizedException('Missing socket token');
  }
}
