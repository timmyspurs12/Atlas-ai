import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantResponse } from '@atlas/contracts';
import OpenAI from 'openai';
import { estimateEtaMinutes, haversineDistanceM } from '../../common/utils/geo.util';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { AiRole, LocationShareStatus } from '../../generated/prisma/client';
import type { AskAssistantDto } from './ai.dto';
import { AssistantIntent, parseAssistantIntent } from './intent-parser';

interface AssistantResult {
  answer: string;
  action: AssistantResponse['action'];
  dataAsOf: Date | null;
  safetyNotice: string | null;
  generatedBy: 'DETERMINISTIC' | 'AI';
}

@Injectable()
export class AiService {
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {
    const apiKey = config.get('OPENAI_API_KEY', { infer: true });
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async ask(userId: string, input: AskAssistantDto): Promise<AssistantResponse> {
    const conversation = input.conversationId
      ? await this.prisma.aiConversation.findFirst({
          where: { id: input.conversationId, userId, deletedAt: null },
        })
      : await this.prisma.aiConversation.create({
          data: { userId, title: input.question.slice(0, 80) },
        });
    if (!conversation) throw new ForbiddenException('Assistant conversation not found');

    const parsed = parseAssistantIntent(input.question);
    await this.prisma.aiInteraction.create({
      data: {
        conversationId: conversation.id,
        role: AiRole.USER,
        content: input.question,
        intent: parsed.intent,
        preciseLocationShared: input.preciseLocationConsent,
      },
    });

    const result = await this.resolve(userId, input, parsed.intent, parsed.personName);
    await this.prisma.$transaction([
      this.prisma.aiInteraction.create({
        data: {
          conversationId: conversation.id,
          role: AiRole.ASSISTANT,
          content: result.answer,
          intent: parsed.intent,
          model: result.generatedBy === 'AI' ? this.config.get('OPENAI_MODEL', { infer: true }) : null,
          preciseLocationShared: input.preciseLocationConsent && result.generatedBy === 'AI',
        },
      }),
      this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return {
      conversationId: conversation.id,
      answer: result.answer,
      action: result.action,
      generatedBy: result.generatedBy,
      dataAsOf: result.dataAsOf?.toISOString() ?? null,
      safetyNotice: result.safetyNotice,
    };
  }

  private async resolve(
    userId: string,
    input: AskAssistantDto,
    intent: AssistantIntent,
    personName: string | null,
  ): Promise<AssistantResult> {
    if (intent === AssistantIntent.WHERE_PERSON || intent === AssistantIntent.ETA_PERSON) {
      return this.personLocation(userId, personName, intent === AssistantIntent.ETA_PERSON);
    }
    if (intent === AssistantIntent.CLOSEST_PERSON) return this.closestPerson(userId);
    if (intent === AssistantIntent.REPLAY_TRIP) return this.replayYesterday(userId);
    if (intent === AssistantIntent.DISTANCE_TRAVELLED) return this.distanceThisWeek(userId);
    if (intent === AssistantIntent.WEEKLY_REPORT) return this.weeklyReport(userId);
    if (intent === AssistantIntent.TRAVEL_PATTERNS) return this.travelPatterns(userId);
    if (intent === AssistantIntent.UNUSUAL_TRAVEL) return this.unusualTravel(userId);
    return this.generateGeneralAnswer(userId, input);
  }

  private async personLocation(
    userId: string,
    personName: string | null,
    includeEta: boolean,
  ): Promise<AssistantResult> {
    if (!personName) return this.simple('Who would you like me to check?');
    const shares = await this.authorizedPeople(userId);
    const normalized = personName.toLocaleLowerCase();
    const share = shares.find((item) =>
      item.owner.profile?.displayName.toLocaleLowerCase().includes(normalized),
    );
    if (!share) {
      return this.simple(
        `I can’t access ${personName}’s location. They need to actively share it with you first.`,
        'Location access is always consent-based.',
      );
    }
    const location = share.owner.liveLocation;
    if (!location) {
      return this.simple(
        `${share.owner.profile?.displayName ?? personName} is sharing, but no location update is available yet.`,
      );
    }
    const ageMinutes = Math.max(0, Math.round((Date.now() - location.recordedAt.getTime()) / 60_000));
    const stale = ageMinutes >= 2;
    let answer = `${share.owner.profile?.displayName ?? personName}’s location was updated ${ageMinutes === 0 ? 'just now' : `${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`}${stale ? ' and may be stale' : ''}.`;
    if (includeEta) {
      const own = await this.prisma.liveLocation.findUnique({ where: { userId } });
      if (own) {
        const distanceM = haversineDistanceM(
          { latitude: Number(location.latitude), longitude: Number(location.longitude) },
          { latitude: Number(own.latitude), longitude: Number(own.longitude) },
        );
        const eta = estimateEtaMinutes(distanceM, Number(location.speedMps ?? 0) || null);
        answer += ` Based on current distance and movement, the rough ETA to you is ${eta} minute${eta === 1 ? '' : 's'}.`;
      } else {
        answer += ' I need your current location to estimate an ETA to you.';
      }
    } else {
      answer += ' Open the live map to view the authorized location.';
    }
    return {
      answer,
      action: { type: 'OPEN_PERSON', userId: share.ownerId },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: location.recordedAt,
      safetyNotice: includeEta ? 'ETA is an estimate and can change with traffic or signal quality.' : null,
    };
  }

  private async closestPerson(userId: string): Promise<AssistantResult> {
    const own = await this.prisma.liveLocation.findUnique({ where: { userId } });
    if (!own) return this.simple('Turn on your location to compare distances to people sharing with you.');
    const people = (await this.authorizedPeople(userId)).filter((share) => share.owner.liveLocation);
    if (people.length === 0) return this.simple('No trusted contacts are actively sharing a location with you.');
    const ranked = people
      .map((share) => ({
        share,
        distanceM: haversineDistanceM(
          { latitude: Number(own.latitude), longitude: Number(own.longitude) },
          {
            latitude: Number(share.owner.liveLocation?.latitude),
            longitude: Number(share.owner.liveLocation?.longitude),
          },
        ),
      }))
      .sort((first, second) => first.distanceM - second.distanceM);
    const closest = ranked[0];
    if (!closest) return this.simple('No current locations are available.');
    const name = closest.share.owner.profile?.displayName ?? 'Your closest contact';
    return {
      answer: `${name} is closest at approximately ${(closest.distanceM / 1_000).toFixed(1)} km away.`,
      action: { type: 'OPEN_PERSON', userId: closest.share.ownerId },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: closest.share.owner.liveLocation?.recordedAt ?? null,
      safetyNotice: 'Straight-line distance may differ from travel distance.',
    };
  }

  private async replayYesterday(userId: string): Promise<AssistantResult> {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const trip = await this.prisma.trip.findFirst({
      where: { userId, startedAt: { gte: from, lt: to }, deletedAt: null },
      orderBy: { distanceM: 'desc' },
    });
    if (!trip) return this.simple('I couldn’t find a recorded trip from yesterday.');
    return {
      answer: `I found yesterday’s ${trip.title ?? 'journey'}: ${(trip.distanceM / 1_000).toFixed(1)} km over ${Math.round(trip.durationSeconds / 60)} minutes.`,
      action: { type: 'OPEN_TRIP', tripId: trip.id },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: trip.endedAt ?? trip.updatedAt,
      safetyNotice: null,
    };
  }

  private async distanceThisWeek(userId: string): Promise<AssistantResult> {
    const from = this.startOfWeek();
    const aggregate = await this.prisma.trip.aggregate({
      where: { userId, startedAt: { gte: from }, deletedAt: null },
      _sum: { distanceM: true, durationSeconds: true },
      _count: true,
    });
    const distanceKm = (aggregate._sum.distanceM ?? 0) / 1_000;
    return {
      answer: `You’ve travelled ${distanceKm.toFixed(1)} km across ${aggregate._count} recorded trip${aggregate._count === 1 ? '' : 's'} this week.`,
      action: { type: 'OPEN_REPORT', period: 'WEEK' },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: new Date(),
      safetyNotice: 'Totals include recorded trips only.',
    };
  }

  private async weeklyReport(userId: string): Promise<AssistantResult> {
    const from = this.startOfWeek();
    const trips = await this.prisma.trip.findMany({
      where: { userId, startedAt: { gte: from }, deletedAt: null },
      orderBy: { distanceM: 'desc' },
    });
    const distanceM = trips.reduce((sum, trip) => sum + trip.distanceM, 0);
    const minutes = Math.round(trips.reduce((sum, trip) => sum + trip.durationSeconds, 0) / 60);
    const longest = trips[0];
    return {
      answer: `This week: ${trips.length} trip${trips.length === 1 ? '' : 's'}, ${(distanceM / 1_000).toFixed(1)} km, and ${minutes} minutes travelling.${longest ? ` Your longest trip was ${(longest.distanceM / 1_000).toFixed(1)} km.` : ''}`,
      action: { type: 'OPEN_REPORT', period: 'WEEK' },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: new Date(),
      safetyNotice: null,
    };
  }

  private async travelPatterns(userId: string): Promise<AssistantResult> {
    const since = new Date(Date.now() - 28 * 86_400_000);
    const trips = await this.prisma.trip.findMany({
      where: { userId, startedAt: { gte: since }, deletedAt: null },
    });
    if (trips.length < 3) return this.simple('Record a few more trips before I analyse travel patterns.');
    const byDay = new Map<number, number>();
    trips.forEach((trip) => byDay.set(trip.startedAt.getUTCDay(), (byDay.get(trip.startedAt.getUTCDay()) ?? 0) + trip.distanceM));
    const [day, distance] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    return {
      answer: `${dayName}s have been your highest-travel days over the last four weeks, totalling ${(distance / 1_000).toFixed(1)} km. This is descriptive, not a prediction.`,
      action: { type: 'OPEN_REPORT', period: 'MONTH' },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: new Date(),
      safetyNotice: 'Pattern insights use your own recorded trip history.',
    };
  }

  private async unusualTravel(userId: string): Promise<AssistantResult> {
    const since = new Date(Date.now() - 56 * 86_400_000);
    const trips = await this.prisma.trip.findMany({
      where: { userId, startedAt: { gte: since }, deletedAt: null },
    });
    if (trips.length < 8) return this.simple('There isn’t enough trip history for a reliable unusual-travel check yet.');
    const weekTotals = new Map<string, number>();
    trips.forEach((trip) => {
      const start = new Date(trip.startedAt);
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      const key = start.toISOString().slice(0, 10);
      weekTotals.set(key, (weekTotals.get(key) ?? 0) + trip.distanceM);
    });
    const values = [...weekTotals.values()];
    const current = values.at(-1) ?? 0;
    const baseline = values.slice(0, -1);
    const mean = baseline.reduce((sum, value) => sum + value, 0) / Math.max(1, baseline.length);
    const unusual = mean > 0 && current > mean * 1.8;
    return {
      answer: unusual
        ? `Your recorded distance this week is notably higher than your recent baseline (${(current / 1_000).toFixed(1)} km versus ${(mean / 1_000).toFixed(1)} km on average).`
        : 'I didn’t find a significant distance anomaly in your recent weekly travel.',
      action: { type: 'OPEN_REPORT', period: 'WEEK' },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: new Date(),
      safetyNotice: 'This is a statistical observation, not a safety determination.',
    };
  }

  private async generateGeneralAnswer(userId: string, input: AskAssistantDto): Promise<AssistantResult> {
    if (!this.openai) {
      return this.simple(
        'I can help with live-location status, ETA, closest contacts, trip replay, distance totals, weekly reports, and travel patterns. Try “How far did I travel this week?”',
      );
    }
    const from = this.startOfWeek();
    const [tripStats, activeShareCount] = await Promise.all([
      this.prisma.trip.aggregate({
        where: { userId, startedAt: { gte: from }, deletedAt: null },
        _sum: { distanceM: true, durationSeconds: true },
        _count: true,
      }),
      this.prisma.locationShare.count({
        where: { recipientId: userId, status: LocationShareStatus.ACTIVE, expiresAt: { gt: new Date() }, deletedAt: null },
      }),
    ]);
    const context = {
      weeklyTrips: tripStats._count,
      weeklyDistanceKm: Number(((tripStats._sum.distanceM ?? 0) / 1_000).toFixed(1)),
      weeklyTravelMinutes: Math.round((tripStats._sum.durationSeconds ?? 0) / 60),
      activeConsentBasedShares: activeShareCount,
      preciseCoordinatesIncluded: false,
    };
    const response = await this.openai.responses.create({
      model: this.config.get('OPENAI_MODEL', { infer: true }),
      input: [
        {
          role: 'system',
          content:
            'You are Atlas AI, a concise location-safety assistant. Never imply you can locate a person without an active share. Never invent a location, ETA, trip, or emergency. Use only the supplied aggregate context. Refuse surveillance, stalking, coercion, or bypassing consent. Give emergency-services guidance when immediate danger is described. Do not expose coordinates.',
        },
        {
          role: 'user',
          content: `Aggregate context: ${JSON.stringify(context)}\nQuestion: ${input.question}`,
        },
      ],
      max_output_tokens: 300,
    });
    return {
      answer: response.output_text.trim() || 'I could not generate a reliable answer.',
      action: { type: 'NONE' },
      generatedBy: 'AI',
      dataAsOf: new Date(),
      safetyNotice: 'AI responses may be imperfect; verify time-sensitive safety information.',
    };
  }

  private async authorizedPeople(userId: string) {
    return this.prisma.locationShare.findMany({
      where: {
        recipientId: userId,
        status: LocationShareStatus.ACTIVE,
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      include: { owner: { include: { profile: true, liveLocation: true } } },
    });
  }

  private simple(answer: string, safetyNotice: string | null = null): AssistantResult {
    return {
      answer,
      action: { type: 'NONE' },
      generatedBy: 'DETERMINISTIC',
      dataAsOf: null,
      safetyNotice,
    };
  }

  private startOfWeek(): Date {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  }
}
