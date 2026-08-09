import { Module } from '@nestjs/common';
import { TransitAdminController } from './transit-admin.controller';
import { TransitAdminService } from './transit-admin.service';
import { TransitIntentService } from './transit-intent.service';
import { TransitPlannerService } from './transit-planner.service';
import { TransitPublicationController } from './transit-publication.controller';
import { TransitPublicationService } from './transit-publication.service';
import { TransitPublicController } from './transit-public.controller';

@Module({
  controllers: [TransitPublicController, TransitPublicationController, TransitAdminController],
  providers: [
    TransitAdminService,
    TransitIntentService,
    TransitPlannerService,
    TransitPublicationService,
  ],
  exports: [
    TransitAdminService,
    TransitIntentService,
    TransitPlannerService,
    TransitPublicationService,
  ],
})
export class TransitModule {}
