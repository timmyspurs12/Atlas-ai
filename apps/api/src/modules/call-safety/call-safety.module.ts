import { Module } from '@nestjs/common';
import { CallSafetyController } from './call-safety.controller';
import { CallSafetyService } from './call-safety.service';

@Module({
  controllers: [CallSafetyController],
  providers: [CallSafetyService],
  exports: [CallSafetyService],
})
export class CallSafetyModule {}
