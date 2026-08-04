import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionPlan } from '../../generated/prisma/client';

const catalog = {
  [SubscriptionPlan.FREE]: {
    liveShareRecipients: 3,
    historyDays: 7,
    geofences: 1,
    aiQuestionsPerDay: 5,
  },
  [SubscriptionPlan.PLUS]: {
    liveShareRecipients: 10,
    historyDays: 90,
    geofences: 10,
    aiQuestionsPerDay: 100,
  },
  [SubscriptionPlan.FAMILY]: {
    liveShareRecipients: 20,
    historyDays: 365,
    geofences: 25,
    aiQuestionsPerDay: 250,
  },
  [SubscriptionPlan.BUSINESS]: {
    liveShareRecipients: 100,
    historyDays: 730,
    geofences: 100,
    aiQuestionsPerDay: 1_000,
  },
} as const;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(userId: string): Promise<Record<string, unknown>> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const plan = subscription?.plan ?? SubscriptionPlan.FREE;
    return { subscription, entitlements: catalog[plan], catalog };
  }

  limits(plan: SubscriptionPlan) {
    return catalog[plan];
  }
}
