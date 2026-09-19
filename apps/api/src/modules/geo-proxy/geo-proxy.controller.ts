import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Environment } from '../../config/environment';
import type { LoadResult } from './geo-cache.service';
import {
  PlaceCoordinatesDto,
  PlanRouteDto,
  RoutingProfileDto,
  SearchPlaceDto,
} from './geo-proxy.dto';
import { GeocodingProvider, type GeocodePlace } from './providers/geocoding.provider';
import {
  RoutingProvider,
  type RouteSummary,
  type RoutingProfile,
} from './providers/routing.provider';
import { WeatherProvider, type CurrentWeather } from './providers/weather.provider';

/** String enums are nominal in TypeScript, so the DTO/profile mapping is explicit. */
const PROFILE_MAP: Readonly<Record<RoutingProfileDto, RoutingProfile>> = {
  [RoutingProfileDto.DRIVING]: 'driving',
  [RoutingProfileDto.CYCLING]: 'cycling',
  [RoutingProfileDto.WALKING]: 'walking',
};

/**
 * Keyless public geo data, proxied through the API.
 *
 * Every route here is authenticated. An anonymous proxy to third-party providers would burn
 * their free quota on Atlas's behalf and hand strangers a request relay; neither is
 * acceptable. Rate limits are deliberately tighter than the global throttler.
 */
@ApiTags('Geo data')
@ApiBearerAuth()
@Controller('geo')
export class GeoProxyController {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly routing: RoutingProvider,
    private readonly geocoding: GeocodingProvider,
    private readonly weather: WeatherProvider,
  ) {}

  @Post('routes/plan')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Plan a road, cycle or foot route using public OSRM instances (no API key)',
  })
  async planRoute(@Body() input: PlanRouteDto): Promise<RouteSummary> {
    this.assertEnabled();
    return this.unwrap(
      this.routing.route(input.coordinates, PROFILE_MAP[input.profile], input.withSteps),
    );
  }

  @Get('places/search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search for a place by name using OpenStreetMap data (no API key)' })
  async searchPlace(@Query() input: SearchPlaceDto): Promise<GeocodePlace> {
    this.assertEnabled();
    return this.unwrap(this.geocoding.search(input.query));
  }

  @Get('places/reverse')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resolve coordinates to a place description (no API key)' })
  async reversePlace(@Query() input: PlaceCoordinatesDto): Promise<GeocodePlace> {
    this.assertEnabled();
    return this.unwrap(this.geocoding.reverse(input.latitude, input.longitude));
  }

  @Get('weather/current')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Current conditions for trip and safety context (no API key)' })
  async currentWeather(@Query() input: PlaceCoordinatesDto): Promise<CurrentWeather> {
    this.assertEnabled();
    return this.unwrap(this.weather.current(input.latitude, input.longitude));
  }

  private assertEnabled(): void {
    if (!this.config.get('GEO_PROXY_ENABLED', { infer: true })) {
      throw new ServiceUnavailableException('Geo data is disabled on this deployment');
    }
  }

  /**
   * Turn a provider result into an HTTP response.
   *
   * `kind` distinguishes a bad request from a missing place from an upstream outage, so
   * clients can retry the right ones and stop retrying the wrong ones.
   */
  private async unwrap<T>(promise: Promise<LoadResult<T>>): Promise<T> {
    const result = await promise;
    if (result.ok) return result.value;
    switch (result.kind) {
      case 'invalid':
        throw new BadRequestException(result.reason);
      case 'not_found':
        throw new NotFoundException(result.reason);
      case 'upstream':
        throw new ServiceUnavailableException(result.reason);
    }
  }
}
