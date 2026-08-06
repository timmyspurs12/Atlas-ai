import { Module } from '@nestjs/common';
import { TransitPlannerService } from './transit-planner.service';
import { TransitPublicationController } from './transit-publication.controller';
import { TransitPublicationService } from './transit-publication.service';
import { TransitPublicController } from './transit-public.controller';

@Module({
  controllers: [TransitPublicController, TransitPublicationController],
  providers: [TransitPlannerService, TransitPublicationService],
  exports: [TransitPlannerService, TransitPublicationService],
})
export class TransitModule {}
