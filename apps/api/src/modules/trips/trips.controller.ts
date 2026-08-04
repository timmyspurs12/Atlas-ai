import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { StartTripDto, TripsQueryDto } from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('Trip history')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: TripsQueryDto,
  ): ReturnType<TripsService['list']> {
    return this.trips.list(principal.userId, query);
  }

  @Post()
  start(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: StartTripDto,
  ): ReturnType<TripsService['start']> {
    return this.trips.start(principal.userId, input);
  }

  @Post(':tripId/complete')
  complete(
    @CurrentUser() principal: AuthPrincipal,
    @Param('tripId') tripId: string,
  ): ReturnType<TripsService['complete']> {
    return this.trips.complete(principal.userId, tripId);
  }

  @Get(':tripId')
  detail(
    @CurrentUser() principal: AuthPrincipal,
    @Param('tripId') tripId: string,
  ): ReturnType<TripsService['detail']> {
    return this.trips.detail(principal.userId, tripId);
  }
}
