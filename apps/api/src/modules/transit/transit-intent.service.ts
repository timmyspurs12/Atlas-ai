import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { TransitCoverageStatus, TransitReviewStatus } from '../../generated/prisma/client';
import type { PlannerPreference } from './domain/transit-planner';
import type { InterpretTransitJourneyDto } from './transit-intent.dto';
import { PlannerPreferenceDto } from './transit-planner.dto';
import { TransitPlannerService } from './transit-planner.service';

const intentSchema = z.object({
  origin: z.string().trim().min(1).max(100).nullable(),
  destination: z.string().trim().min(1).max(100).nullable(),
  preference: z.enum([
    'BALANCED',
    'CHEAPEST',
    'FASTEST',
    'FEWEST_TRANSFERS',
    'LEAST_WALKING',
    'FORMAL_TRANSIT',
  ]),
});

export type TransitIntent = z.infer<typeof intentSchema>;

export function parseDeterministicTransitIntent(question: string): TransitIntent {
  const normalized = question.trim().replace(/\s+/g, ' ');
  const originMatch =
    /(?:\bfrom|\bat|\bin)\s+([\p{L}\p{N} .'-]+?)(?=,|\s+(?:and|trying|going|heading|to)\b)/iu.exec(
      normalized,
    );
  const destinationMatch =
    /(?:trying to get to|need to get to|get to|going to|heading to|\bto(?!\s+get\b))\s+([\p{L}\p{N} .'-]+?)(?=,|\s+(?:on|with|using|for|cheap|cheaply|fast|quickly)\b|[.!?]|$)/iu.exec(
      normalized,
    );
  const lower = normalized.toLocaleLowerCase();
  const preference: PlannerPreference = /tight budget|cheap|cheapest|save money|affordable/.test(
    lower,
  )
    ? 'CHEAPEST'
    : /fast|quick|urgent|soon/.test(lower)
      ? 'FASTEST'
      : /few(?:er|est)? transfers|no change/.test(lower)
        ? 'FEWEST_TRANSFERS'
        : /least walk|avoid walking|minimal walking/.test(lower)
          ? 'LEAST_WALKING'
          : /formal|brt|rail|ferry/.test(lower)
            ? 'FORMAL_TRANSIT'
            : 'BALANCED';
  return {
    origin: originMatch?.[1]?.trim() ?? null,
    destination: destinationMatch?.[1]?.trim() ?? null,
    preference,
  };
}

@Injectable()
export class TransitIntentService {
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: TransitPlannerService,
    config: ConfigService<Environment, true>,
  ) {
    const apiKey = config.get('OPENAI_API_KEY', { infer: true });
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = config.get('OPENAI_MODEL', { infer: true });
  }

  private readonly model: string;

  async interpretAndPlan(input: InterpretTransitJourneyDto): Promise<Record<string, unknown>> {
    const deterministic = parseDeterministicTransitIntent(input.question);
    const intent =
      deterministic.origin && deterministic.destination
        ? deterministic
        : await this.extractWithAi(input.question, deterministic);
    const [originCandidates, destinationCandidates] = await Promise.all([
      intent.origin ? this.resolvePlaces(intent.origin) : Promise.resolve([]),
      intent.destination ? this.resolvePlaces(intent.destination) : Promise.resolve([]),
    ]);
    const interpretation = {
      origin: intent.origin,
      destination: intent.destination,
      preference: intent.preference,
      generatedBy:
        deterministic.origin && deterministic.destination
          ? 'DETERMINISTIC'
          : this.openai
            ? 'AI'
            : 'DETERMINISTIC',
    };
    if (!intent.origin || !intent.destination) {
      return {
        interpretation,
        requiresClarification: true,
        clarification: 'Tell me both where you are leaving from and where you want to go.',
        originCandidates,
        destinationCandidates,
        journey: null,
      };
    }
    if (originCandidates.length !== 1 || destinationCandidates.length !== 1) {
      return {
        interpretation,
        requiresClarification: true,
        clarification:
          originCandidates.length === 0 || destinationCandidates.length === 0
            ? 'One or both places do not yet have approved transit coverage.'
            : 'Choose the intended place because more than one approved match exists.',
        originCandidates,
        destinationCandidates,
        journey: null,
      };
    }
    const origin = originCandidates[0];
    const destination = destinationCandidates[0];
    if (!origin || !destination) throw new Error('Place resolution invariant failed');
    const journey = await this.planner.plan({
      originPlaceId: origin.id,
      destinationPlaceId: destination.id,
      preference: intent.preference as PlannerPreferenceDto,
      maxTransfers: 3,
      maxAlternatives: 3,
    });
    return {
      interpretation,
      requiresClarification: false,
      clarification: null,
      originCandidates,
      destinationCandidates,
      journey,
    };
  }

  private async resolvePlaces(
    name: string,
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const normalized = this.normalize(name);
    const places = await this.prisma.transitPlace.findMany({
      where: {
        verificationStatus: TransitReviewStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        area: {
          is: {
            coverage: {
              is: {
                status: {
                  in: [TransitCoverageStatus.BETA, TransitCoverageStatus.VERIFIED],
                },
                deletedAt: null,
              },
            },
          },
        },
        OR: [
          { normalizedName: normalized },
          { aliases: { some: { normalizedAlias: normalized, deletedAt: null } } },
        ],
      },
      include: { area: { select: { id: true, name: true, type: true } } },
      take: 5,
    });
    return places.map((place) => ({
      id: place.id,
      name: place.name,
      code: place.code,
      type: place.type,
      area: place.area,
    }));
  }

  private async extractWithAi(question: string, fallback: TransitIntent): Promise<TransitIntent> {
    if (!this.openai) return fallback;
    try {
      const response = await this.openai.responses.create({
        model: this.model,
        max_output_tokens: 180,
        input: [
          {
            role: 'system',
            content:
              'Extract transit search intent only. Never invent a route, stop, fare, coordinate, or travel fact. Return JSON with origin, destination, and preference. preference must be BALANCED, CHEAPEST, FASTEST, FEWEST_TRANSFERS, LEAST_WALKING, or FORMAL_TRANSIT. Use null when a place is missing.',
          },
          { role: 'user', content: question },
        ],
      });
      const parsed: unknown = JSON.parse(response.output_text);
      const validated = intentSchema.safeParse(parsed);
      return validated.success ? validated.data : fallback;
    } catch {
      return fallback;
    }
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('en-NG')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ');
  }
}
