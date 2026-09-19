import { Module } from '@nestjs/common';
import { GeoCacheService } from './geo-cache.service';
import { GeoProxyController } from './geo-proxy.controller';
import { GeocodingProvider } from './providers/geocoding.provider';
import { RoutingProvider } from './providers/routing.provider';
import { WeatherProvider } from './providers/weather.provider';
import { UpstreamHttpService } from './upstream-http.service';

/**
 * Keyless public geo data — routing, geocoding and weather.
 *
 * Providers are exported so other modules (trips, transit, safety, the assistant) can use
 * them directly instead of calling the HTTP surface. See ./README.md for the design rules,
 * and THIRD_PARTY_NOTICES.md for attribution obligations.
 */
@Module({
  controllers: [GeoProxyController],
  providers: [
    UpstreamHttpService,
    GeoCacheService,
    RoutingProvider,
    GeocodingProvider,
    WeatherProvider,
  ],
  exports: [RoutingProvider, GeocodingProvider, WeatherProvider],
})
export class GeoProxyModule {}
