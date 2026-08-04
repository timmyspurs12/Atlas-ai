import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthDeliveryService } from './auth-delivery.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SocialTokenService } from './social-token.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthDeliveryService, SocialTokenService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
