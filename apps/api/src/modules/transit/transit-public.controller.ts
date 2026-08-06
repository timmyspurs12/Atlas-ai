import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  NearbyTransitPlacesDto,
  PlanTransitJourneyDto,
  SearchTransitPlacesDto,
} from './transit-planner.dto';
import { TransitPlannerService } from './transit-planner.service';

@ApiTags('Transit journeys')
@ApiBearerAuth()
@Controller('transit')
export class TransitPublicController {
  constructor(private readonly planner: TransitPlannerService) {}

  @Get('places/search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search approved transit places and aliases' })
  searchPlaces(
    @Query() input: SearchTransitPlacesDto,
  ): ReturnType<TransitPlannerService['searchPlaces']> {
    return this.planner.searchPlaces(input);
  }

  @Get('places/nearby')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Find approved transit places near coordinates' })
  nearbyPlaces(
    @Query() input: NearbyTransitPlacesDto,
  ): ReturnType<TransitPlannerService['nearbyPlaces']> {
    return this.planner.nearbyPlaces(input);
  }

  @Post('journeys/plan')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Plan journeys using approved and published transit data' })
  plan(@Body() input: PlanTransitJourneyDto): ReturnType<TransitPlannerService['plan']> {
    return this.planner.plan(input);
  }
}
