import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  CallSafetyLocationDto,
  CallSafetySosDto,
  CreateCallSafetySessionDto,
  GrantCallConsentDto,
} from './call-safety.dto';
import { CallSafetyGateway } from './call-safety.gateway';
import { CallSafetyService } from './call-safety.service';

@ApiTags('Stay With Me')
@ApiBearerAuth()
@Controller('call-safety')
export class CallSafetyController {
  constructor(
    private readonly service: CallSafetyService,
    private readonly gateway: CallSafetyGateway,
  ) {}

  @Post('sessions')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  create(@CurrentUser() user: AuthPrincipal, @Body() input: CreateCallSafetySessionDto) {
    return this.service.create(user.userId, input);
  }

  @Get('sessions')
  list(@CurrentUser() user: AuthPrincipal) {
    return this.service.list(user.userId);
  }

  @Get('sessions/:sessionId')
  details(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.details(user.userId, sessionId);
  }

  @Post('invitations/:token/accept')
  async accept(@CurrentUser() user: AuthPrincipal, @Param('token') token: string) {
    const result = await this.service.accept(user.userId, token);
    this.gateway.notify(result.sessionId, 'invitation:accepted', result);
    return result;
  }

  @Post('invitations/:token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decline(@CurrentUser() user: AuthPrincipal, @Param('token') token: string): Promise<void> {
    const result = await this.service.decline(user.userId, token);
    this.gateway.notify(result.sessionId, 'session:ended', {
      sessionId: result.sessionId,
      reason: 'INVITATION_DECLINED',
    });
  }

  @Post('invitations/by-id/:invitationId/accept')
  async acceptById(
    @CurrentUser() user: AuthPrincipal,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    const result = await this.service.acceptById(user.userId, invitationId);
    this.gateway.notify(result.sessionId, 'invitation:accepted', result);
    return result;
  }

  @Post('invitations/by-id/:invitationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  async declineById(
    @CurrentUser() user: AuthPrincipal,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ): Promise<void> {
    const result = await this.service.declineById(user.userId, invitationId);
    this.gateway.notify(result.sessionId, 'session:ended', {
      sessionId: result.sessionId,
      reason: 'INVITATION_DECLINED',
    });
  }

  @Post('sessions/:sessionId/consent')
  async consent(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: GrantCallConsentDto,
  ) {
    const result = await this.service.grantConsent(user.userId, sessionId, input);
    this.gateway.notify(sessionId, 'consent:changed', result);
    if (result.active) this.gateway.notify(sessionId, 'session:activated', result);
    return result;
  }

  @Delete('sessions/:sessionId/consent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    await this.service.revokeConsent(user.userId, sessionId);
    this.gateway.notify(sessionId, 'session:ended', { sessionId, reason: 'CONSENT_REVOKED' });
  }

  @Post('sessions/:sessionId/location')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async location(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CallSafetyLocationDto,
  ) {
    const location = await this.service.updateLocation(user.userId, sessionId, input);
    this.gateway.notify(sessionId, 'location:updated', location);
    return location;
  }

  @Delete('sessions/:sessionId/locations')
  async purgeMyLocation(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<{ deleted: number }> {
    const deleted = await this.service.purgeMyLocation(user.userId, sessionId);
    this.gateway.notify(sessionId, 'location:purged', {
      sessionId,
      userId: user.userId,
    });
    this.gateway.notify(sessionId, 'session:ended', {
      sessionId,
      reason: 'LOCATION_PURGED',
    });
    return { deleted };
  }

  @Post('sessions/:sessionId/sos')
  async escalateSos(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CallSafetySosDto,
  ) {
    const result = await this.service.escalateSos(user, sessionId, input);
    this.gateway.notify(sessionId, 'sos:triggered', {
      sessionId,
      actorId: user.userId,
    });
    return result;
  }

  @Post('sessions/:sessionId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    await this.service.end(user.userId, sessionId);
    this.gateway.notify(sessionId, 'session:ended', { sessionId, reason: 'USER_ENDED' });
  }
}
