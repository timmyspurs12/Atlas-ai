import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { CreateEmergencyContactDto, TriggerSosDto } from './safety.dto';
import { SafetyService } from './safety.service';

@ApiTags('Safety and SOS')
@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('contacts')
  @ApiBearerAuth()
  contacts(@CurrentUser() principal: AuthPrincipal): ReturnType<SafetyService['listContacts']> {
    return this.safety.listContacts(principal.userId);
  }

  @Post('contacts')
  @ApiBearerAuth()
  addContact(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateEmergencyContactDto,
  ): ReturnType<SafetyService['addContact']> {
    return this.safety.addContact(principal.userId, input);
  }

  @Post('contacts/:contactId/accept')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptContact(
    @CurrentUser() principal: AuthPrincipal,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.safety.acceptContact(principal.userId, contactId);
  }

  @Delete('contacts/:contactId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeContact(
    @CurrentUser() principal: AuthPrincipal,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.safety.removeContact(principal.userId, contactId);
  }

  @Get('sos')
  @ApiBearerAuth()
  alerts(@CurrentUser() principal: AuthPrincipal): ReturnType<SafetyService['listAlerts']> {
    return this.safety.listAlerts(principal.userId);
  }

  @Post('sos')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  trigger(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: TriggerSosDto,
  ): ReturnType<SafetyService['trigger']> {
    return this.safety.trigger(principal, input);
  }

  @Post('sos/:alertId/acknowledge')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @CurrentUser() principal: AuthPrincipal,
    @Param('alertId') alertId: string,
  ): Promise<void> {
    await this.safety.acknowledge(principal.userId, alertId);
  }

  @Post('sos/:alertId/resolve')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @CurrentUser() principal: AuthPrincipal,
    @Param('alertId') alertId: string,
  ): Promise<void> {
    await this.safety.resolve(principal.userId, alertId);
  }

  @Post('sos/:alertId/cancel')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() principal: AuthPrincipal,
    @Param('alertId') alertId: string,
  ): Promise<void> {
    await this.safety.resolve(principal.userId, alertId, true);
  }

  @Public()
  @Get('sos/public/:token')
  @Header('Cache-Control', 'no-store, private')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  publicAlert(@Param('token') token: string): ReturnType<SafetyService['publicAlert']> {
    return this.safety.publicAlert(token);
  }
}
