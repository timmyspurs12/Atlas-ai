import { Module } from '@nestjs/common';
import { TransitPublicationController } from './transit-publication.controller';
import { TransitPublicationService } from './transit-publication.service';

@Module({
  controllers: [TransitPublicationController],
  providers: [TransitPublicationService],
  exports: [TransitPublicationService],
})
export class TransitModule {}
