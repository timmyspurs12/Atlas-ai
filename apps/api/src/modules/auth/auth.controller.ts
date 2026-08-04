import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestPhoneVerificationDto,
  ResetPasswordDto,
  SocialLoginDto,
  VerifyPhoneDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import type { AuthPrincipal, RequestMetadata } from './auth.types';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a user, device, and rotating session' })
  register(@Body() input: RegisterDto, @Req() request: Request): ReturnType<AuthService['register']> {
    return this.auth.register(input, this.metadata(request));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate with email and password' })
  login(@Body() input: LoginDto, @Req() request: Request): ReturnType<AuthService['login']> {
    return this.auth.login(input, this.metadata(request));
  }

  @Public()
  @Post('social')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate with a verified Apple or Google identity token' })
  social(@Body() input: SocialLoginDto, @Req() request: Request): ReturnType<AuthService['socialLogin']> {
    return this.auth.socialLogin(input, this.metadata(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() input: RefreshDto, @Req() request: Request): ReturnType<AuthService['refresh']> {
    return this.auth.refresh(input, this.metadata(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logout(
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(principal, this.metadata(request));
  }

  @Get('sessions')
  @ApiBearerAuth()
  sessions(@CurrentUser() principal: AuthPrincipal): ReturnType<AuthService['listSessions']> {
    return this.auth.listSessions(principal);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async revokeSession(
    @CurrentUser() principal: AuthPrincipal,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(principal, sessionId);
  }

  @Post('phone/request')
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  requestPhone(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: RequestPhoneVerificationDto,
  ): ReturnType<AuthService['requestPhoneVerification']> {
    return this.auth.requestPhoneVerification(principal.userId, input);
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  async verifyPhone(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: VerifyPhoneDto,
  ): Promise<void> {
    await this.auth.verifyPhone(principal.userId, input);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  forgotPassword(@Body() input: ForgotPasswordDto): ReturnType<AuthService['requestPasswordReset']> {
    return this.auth.requestPasswordReset(input);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(input);
  }

  private metadata(request: Request): RequestMetadata {
    return {
      ip: request.ip,
      userAgent: request.header('user-agent'),
      requestId: (request as Request & { requestId?: string }).requestId,
    };
  }
}
