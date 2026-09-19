import { Module } from '@nestjs/common';
import { GeoProxyModule } from '../geo-proxy/geo-proxy.module';
import { EmergencyDeliveryService } from './emergency-delivery.service';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { SosLocationService } from './sos-location.service';

@Module({
  // GeoProxyModule supplies the geocoder used to name the place in an SOS alert.
  imports: [GeoProxyModule],
  controllers: [SafetyController],
  providers: [SafetyService, EmergencyDeliveryService, SosLocationService],
  exports: [SafetyService],
})
export class SafetyModule {}
