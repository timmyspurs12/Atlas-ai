import { Module } from '@nestjs/common';
import { CallSafetyController } from './call-safety.controller';
import { CallSafetyGateway } from './call-safety.gateway';
import { CallSafetyLifecycleService } from './call-safety-lifecycle.service';
import { CallSafetyService } from './call-safety.service';

@Module({
  controllers: [CallSafetyController],
  providers: [CallSafetyService, CallSafetyGateway, CallSafetyLifecycleService],
  exports: [CallSafetyService, CallSafetyGateway],
})
export class CallSafetyModule {}
