import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CallSafetyService } from './call-safety.service';

@Injectable()
export class CallSafetyLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallSafetyLifecycleService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly safety: CallSafetyService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const [expired, purged] = await Promise.all([
        this.safety.expireDueSessions(),
        this.safety.purgeExpiredLocations(),
      ]);
      if (expired || purged) {
        this.logger.log(`Stay With Me maintenance: expired=${expired}, purged=${purged}`);
      }
    } catch (error) {
      this.logger.error(
        `Stay With Me maintenance failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
