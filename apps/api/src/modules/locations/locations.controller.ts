import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { LocationUpdateDto, StartLocationShareDto } from './locations.dto';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';

@ApiTags('Live location')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly gateway: LocationsGateway,
  ) {}

  @Get('shares')
  shares(@CurrentUser() principal: AuthPrincipal): ReturnType<LocationsService['listShares']> {
    return this.locations.listShares(principal.userId);
  }

  @Get('people')
  people(@CurrentUser() principal: AuthPrincipal): ReturnType<LocationsService['livePeople']> {
    return this.locations.livePeople(principal.userId);
  }

  @Post('shares')
  async start(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: StartLocationShareDto,
  ): Promise<Record<string, unknown>> {
    const shares = await this.locations.startShares(principal.userId, input);
    this.gateway.notifyShareChanged(
      [principal.userId, ...shares.map((share) => share.recipientId)],
      { action: 'STARTED', shareIds: shares.map((share) => share.id) },
    );
    return { data: shares };
  }

  @Delete('shares/:shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() principal: AuthPrincipal,
    @Param('shareId') shareId: string,
  ): Promise<void> {
    const share = await this.locations.revokeShare(principal.userId, shareId);
    this.gateway.notifyShareChanged([share.ownerId, share.recipientId], {
      action: 'REVOKED',
      shareId: share.id,
    });
  }

  @Delete('shares')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(@CurrentUser() principal: AuthPrincipal): Promise<void> {
    const recipients = await this.locations.activeRecipients(principal.userId);
    await this.locations.revokeAllOwned(principal.userId);
    this.gateway.notifyShareChanged([principal.userId, ...recipients], { action: 'ALL_STOPPED' });
  }

  @Post('updates')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: LocationUpdateDto,
  ): Promise<{ accepted: boolean; sequence: number }> {
    const broadcast = await this.locations.ingest(principal, input);
    if (broadcast) this.gateway.broadcast(broadcast);
    return { accepted: Boolean(broadcast), sequence: input.sequence };
  }
}
