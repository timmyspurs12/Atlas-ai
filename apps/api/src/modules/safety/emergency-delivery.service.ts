import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { isExpoPushToken } from '../notifications/domain/call-safety-invitation-notification.policy';

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
    const jobs: Array<Promise<[string, boolean]>> = [];
    if (request.notifyPush && request.recipientUserId) {
      jobs.push(this.push(request.recipientUserId, request.senderName, trackingUrl));
    }
    if (request.notifySms && request.phone) {
      jobs.push(this.sms(request.phone, request.senderName, trackingUrl));
    }
    if (request.notifyEmail && request.email) {
      jobs.push(this.email(request.email, request.senderName, trackingUrl));
    }
    const settled = await Promise.allSettled(jobs);
    return Object.fromEntries(
      settled.map((result, index) =>
        result.status === 'fulfilled' ? result.value : [`channel_${index}`, false],
      ),
    );
  }

  private async push(userId: string, senderName: string, url: string): Promise<[string, boolean]> {
    const devices = await this.prisma.device.findMany({
      where: { userId, pushEnabled: true, pushToken: { not: null }, deletedAt: null },
      select: { id: true, pushToken: true },
    });
    const tokens = devices.flatMap((device) => (device.pushToken ? [device.pushToken] : []));
    if (tokens.length === 0) return ['push', false];

    const expoTokens = tokens.filter(isExpoPushToken);
    const nativeTokens = tokens.filter((token) => !isExpoPushToken(token));
    const results: boolean[] = [];

    if (expoTokens.length > 0 && this.config.get('EXPO_PUSH_ENABLED', { infer: true })) {
      try {
        const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(
            expoTokens.slice(0, 100).map((token) => ({
              to: token,
              title: `SOS from ${senderName}`,
              body: 'Open Atlas AI to see their live safety alert.',
              sound: 'default',
              priority: 'high',
              data: { type: 'SOS', url },
            })),
          ),
          signal: AbortSignal.timeout(8_000),
        });
        results.push(response.ok);
      } catch {
        results.push(false);
      }
    }

    const credentials = {
      projectId: this.config.get('FCM_PROJECT_ID', { infer: true }),
      clientEmail: this.config.get('FCM_CLIENT_EMAIL', { infer: true }),
      privateKey: this.config.get('FCM_PRIVATE_KEY', { infer: true })?.replace(/\\n/g, '\n'),
    };
    if (
      nativeTokens.length > 0 &&
      credentials.projectId &&
      credentials.clientEmail &&
      credentials.privateKey
    ) {
      if (getApps().length === 0) initializeApp({ credential: cert(credentials) });
      const result = await getMessaging().sendEachForMulticast({
        tokens: nativeTokens,
        notification: {
          title: `SOS from ${senderName}`,
          body: 'Open Atlas AI to see their live safety alert.',
        },
        data: { type: 'SOS', url },
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      });
      results.push(result.successCount > 0);
    }
    return ['push', results.some(Boolean)];
  }

  private async sms(phone: string, senderName: string, url: string): Promise<[string, boolean]> {
    const sid = this.config.get('TWILIO_ACCOUNT_SID', { infer: true });
    const token = this.config.get('TWILIO_AUTH_TOKEN', { infer: true });
    const from = this.config.get('TWILIO_FROM_NUMBER', { infer: true });
    if (!sid || !token || !from) return ['sms', false];
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `SOS from ${senderName}. View their time-limited Atlas safety link: ${url}`,
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

  private async email(email: string, senderName: string, url: string): Promise<[string, boolean]> {
    const key = this.config.get('RESEND_API_KEY', { infer: true });
    if (!key) return ['email', false];
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Atlas AI Safety <safety@atlas.example>',
        to: [email],
        subject: `SOS alert from ${senderName}`,
        html: `<p>${senderName} sent an SOS alert.</p><p><a href="${url}">Open the time-limited safety link</a></p><p>If you believe they are in immediate danger, contact local emergency services.</p>`,
      }),
    });
    if (!response.ok) this.logger.error(`Email provider returned ${response.status}`);
    return ['email', response.ok];
  }
}
