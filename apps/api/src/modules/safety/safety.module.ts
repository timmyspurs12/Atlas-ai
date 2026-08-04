import { Module } from '@nestjs/common';
import { EmergencyDeliveryService } from './emergency-delivery.service';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  controllers: [SafetyController],
  providers: [SafetyService, EmergencyDeliveryService],
  exports: [SafetyService],
})
export class SafetyModule {}
