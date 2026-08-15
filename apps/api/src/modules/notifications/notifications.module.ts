import { Module } from '@nestjs/common';
import { NotificationDeliveryLifecycleService } from './notification-delivery-lifecycle.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryService,
    NotificationDeliveryLifecycleService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
