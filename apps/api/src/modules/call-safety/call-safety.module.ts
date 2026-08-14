import { Module } from '@nestjs/common';
import { CallSafetyController } from './call-safety.controller';
import { CallSafetyGateway } from './call-safety.gateway';
import { CallSafetyLifecycleService } from './call-safety-lifecycle.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SafetyModule } from '../safety/safety.module';
import { CallSafetyService } from './call-safety.service';

@Module({
  imports: [SafetyModule, NotificationsModule],
  controllers: [CallSafetyController],
  providers: [CallSafetyService, CallSafetyGateway, CallSafetyLifecycleService],
  exports: [CallSafetyService, CallSafetyGateway],
})
export class CallSafetyModule {}
