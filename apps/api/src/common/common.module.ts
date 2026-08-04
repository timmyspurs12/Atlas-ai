import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [AuditService, EncryptionService],
  exports: [AuditService, EncryptionService],
})
export class CommonModule {}
