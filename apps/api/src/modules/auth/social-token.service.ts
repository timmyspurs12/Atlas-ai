import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { SocialProviderDto } from './auth.dto';

export interface VerifiedSocialIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

const joseModule = import('jose');
const googleKeySet = joseModule.then(({ createRemoteJWKSet }) =>
  createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
);
const appleKeySet = joseModule.then(({ createRemoteJWKSet }) =>
  createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
);

@Injectable()
export class SocialTokenService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async verify(provider: SocialProviderDto, idToken: string): Promise<VerifiedSocialIdentity> {
    try {
      const { jwtVerify } = await joseModule;
      if (provider === SocialProviderDto.GOOGLE) {
        const configured =
          this.config.get('GOOGLE_CLIENT_IDS', { infer: true }) ??
          this.config.get('GOOGLE_CLIENT_ID', { infer: true });
        const audience = configured?.split(',').map((value) => value.trim()).filter(Boolean);
        if (!audience?.length) throw new UnauthorizedException('Google login is not configured');
        const { payload } = await jwtVerify(idToken, await googleKeySet, {
          audience,
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
        });
        if (!payload.sub) throw new UnauthorizedException('Identity token has no subject');
        return {
          subject: payload.sub,
          email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
          emailVerified: payload.email_verified === true,
          displayName: typeof payload.name === 'string' ? payload.name : null,
        };
      }

      const { payload } = await jwtVerify(idToken, await appleKeySet, {
        audience: this.config.get('APPLE_CLIENT_ID', { infer: true }),
        issuer: 'https://appleid.apple.com',
      });
      if (!payload.sub) throw new UnauthorizedException('Identity token has no subject');
      return {
        subject: payload.sub,
        email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        displayName: null,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('The identity token could not be verified');
    }
  }
}
