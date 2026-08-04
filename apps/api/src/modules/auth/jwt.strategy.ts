import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { SessionStatus, UserStatus } from '../../generated/prisma/client';
import type { AccessTokenClaims, AuthPrincipal } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: AccessTokenClaims): Promise<AuthPrincipal> {
    if (payload.type !== 'access' || !payload.sub || !payload.sid || !payload.did) {
      throw new UnauthorizedException('Invalid access token');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        deviceId: payload.did,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        deletedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { id: true, userId: true, deviceId: true, user: { select: { role: true } } },
    });
    if (!session) throw new UnauthorizedException('Session is no longer active');

    return {
      userId: session.userId,
      sessionId: session.id,
      deviceId: session.deviceId,
      role: session.user.role,
    };
  }
}
