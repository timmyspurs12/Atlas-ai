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
  CreateCallSafetySessionDto,
  GrantCallConsentDto,
} from './call-safety.dto';
import { CallSafetyService } from './call-safety.service';

@ApiTags('Stay With Me')
@ApiBearerAuth()
@Controller('call-safety')
export class CallSafetyController {
  constructor(private readonly service: CallSafetyService) {}

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
  accept(@CurrentUser() user: AuthPrincipal, @Param('token') token: string) {
    return this.service.accept(user.userId, token);
  }

  @Post('invitations/:token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@CurrentUser() user: AuthPrincipal, @Param('token') token: string) {
    return this.service.decline(user.userId, token);
  }

  @Post('sessions/:sessionId/consent')
  consent(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: GrantCallConsentDto,
  ) {
    return this.service.grantConsent(user.userId, sessionId, input);
  }

  @Delete('sessions/:sessionId/consent')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.revokeConsent(user.userId, sessionId);
  }

  @Post('sessions/:sessionId/location')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  location(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CallSafetyLocationDto,
  ) {
    return this.service.updateLocation(user.userId, sessionId, input);
  }

  @Post('sessions/:sessionId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  end(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.end(user.userId, sessionId);
  }
}
