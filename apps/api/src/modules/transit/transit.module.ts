import { Module } from '@nestjs/common';
import { TransitAdminController } from './transit-admin.controller';
import { TransitAdminService } from './transit-admin.service';
import { TransitCoverageController } from './transit-coverage.controller';
import { TransitCoverageService } from './transit-coverage.service';
import { TransitIntentService } from './transit-intent.service';
import { TransitPlannerService } from './transit-planner.service';
import { TransitPublicationController } from './transit-publication.controller';
import { TransitPublicationService } from './transit-publication.service';
import { TransitPublicController } from './transit-public.controller';

@Module({
  controllers: [
    TransitPublicController,
    TransitPublicationController,
    TransitAdminController,
    TransitCoverageController,
  ],
  providers: [
    TransitAdminService,
    TransitCoverageService,
    TransitIntentService,
    TransitPlannerService,
    TransitPublicationService,
  ],
  exports: [
    TransitAdminService,
    TransitCoverageService,
    TransitIntentService,
    TransitPlannerService,
    TransitPublicationService,
  ],
})
export class TransitModule {}
