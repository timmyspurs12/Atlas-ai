import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { buildSosMessages, escapeHtml, type SosPlaceInput } from './domain/sos-place.policy';

export interface EmergencyDeliveryRequest {
  recipientUserId?: string | null;
  phone?: string | null;
  email?: string | null;
  notifyPush: boolean;
  notifySms: boolean;
  notifyEmail: boolean;
  senderName: string;
  message?: string | null;
  trackingToken: string;
  /**
   * Best-effort human-readable place for the alert coordinates, or null when it could not be
   * resolved. Null is the normal degraded case and must never delay or block delivery.
   */
  place: SosPlaceInput | null;
}

/** Composed as a pure helper so the escaping is testable and cannot be forgotten. */
export function buildEmailHtml(
  senderName: string,
  placeParagraph: string | null,
  url: string,
): string {
  const safeSender = escapeHtml(senderName);
  const placeHtml = placeParagraph ? `<p>${escapeHtml(placeParagraph)}</p>` : '';
  return `<p>${safeSender} sent an SOS alert.</p>${placeHtml}<p><a href="${escapeHtml(url)}">Open the time-limited safety link</a></p><p>If you believe they are in immediate danger, contact local emergency services.</p>`;
}

@Injectable()
export class EmergencyDeliveryService {
  private readonly logger = new Logger(EmergencyDeliveryService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
  ) {}

  async deliver(request: EmergencyDeliveryRequest): Promise<Record<string, unknown>> {
    const trackingUrl = `${this.config.get('APP_WEB_URL', { infer: true })}/sos/${encodeURIComponent(request.trackingToken)}`;
    // Composed once so every channel agrees on the wording, and so the sender name is
    // sanitised before it reaches an SMS body or an HTML email.
    const copy = buildSosMessages({
      senderName: request.senderName,
      place: request.place,
      trackingUrl,
    });

    const jobs: Array<Promise<[string, boolean]>> = [];
    if (request.notifyPush && request.recipientUserId) {
      jobs.push(this.push(request.recipientUserId, copy.senderName, copy.pushBody, trackingUrl));
    }
    if (request.notifySms && request.phone) {
      jobs.push(this.sms(request.phone, copy.sms));
    }
    if (request.notifyEmail && request.email) {
      jobs.push(this.email(request.email, copy.senderName, copy.emailPlaceParagraph, trackingUrl));
    }
    const settled = await Promise.allSettled(jobs);
    return Object.fromEntries(
      settled.map((result, index) =>
        result.status === 'fulfilled' ? result.value : [`channel_${index}`, false],
      ),
    );
  }

  private async push(
    userId: string,
    senderName: string,
    body: string,
    url: string,
  ): Promise<[string, boolean]> {
    const credentials = {
      projectId: this.config.get('FCM_PROJECT_ID', { infer: true }),
      clientEmail: this.config.get('FCM_CLIENT_EMAIL', { infer: true }),
      privateKey: this.config.get('FCM_PRIVATE_KEY', { infer: true })?.replace(/\\n/g, '\n'),
    };
    if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) {
      return ['push', false];
    }
    if (getApps().length === 0) initializeApp({ credential: cert(credentials) });
    const devices = await this.prisma.device.findMany({
      where: { userId, pushEnabled: true, pushToken: { not: null }, deletedAt: null },
      select: { pushToken: true },
    });
    const tokens = devices.flatMap((device) => (device.pushToken ? [device.pushToken] : []));
    if (tokens.length === 0) return ['push', false];
    const result = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `SOS from ${senderName}`,
        body,
      },
      data: { type: 'SOS', url },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
    });
    return ['push', result.successCount > 0];
  }

  private async sms(phone: string, messageBody: string): Promise<[string, boolean]> {
    const sid = this.config.get('TWILIO_ACCOUNT_SID', { infer: true });
    const token = this.config.get('TWILIO_AUTH_TOKEN', { infer: true });
    const from = this.config.get('TWILIO_FROM_NUMBER', { infer: true });
    if (!sid || !token || !from) return ['sms', false];
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: messageBody,
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!response.ok) this.logger.error(`SMS provider returned ${response.status}`);
    return ['sms', response.ok];
  }

  private async email(
    email: string,
    senderName: string,
    placeParagraph: string | null,
    url: string,
  ): Promise<[string, boolean]> {
    const key = this.config.get('RESEND_API_KEY', { infer: true });
    if (!key) return ['email', false];
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Atlas AI Safety <safety@atlas.example>',
        to: [email],
        subject: `SOS alert from ${escapeHtml(senderName)}`,
        // Sender name and place name both reach HTML, so both are escaped.
        html: buildEmailHtml(senderName, placeParagraph, url),
      }),
    });
    if (!response.ok) this.logger.error(`Email provider returned ${response.status}`);
    return ['email', response.ok];
  }
}
