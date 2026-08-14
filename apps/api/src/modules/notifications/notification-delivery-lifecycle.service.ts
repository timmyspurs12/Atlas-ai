import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationDeliveryLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryLifecycleService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly delivery: NotificationDeliveryService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const delivered = await this.delivery.deliverPending();
      if (delivered > 0) this.logger.log(`Delivered ${delivered} pending push notification(s)`);
    } catch (error) {
      this.logger.error(
        `Notification delivery maintenance failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
