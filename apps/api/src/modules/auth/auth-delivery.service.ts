import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';

@Injectable()
export class AuthDeliveryService {
  private readonly logger = new Logger(AuthDeliveryService.name);

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async sendPhoneVerification(phone: string, code: string): Promise<boolean> {
    const sid = this.config.get('TWILIO_ACCOUNT_SID', { infer: true });
    const token = this.config.get('TWILIO_AUTH_TOKEN', { infer: true });
    const from = this.config.get('TWILIO_FROM_NUMBER', { infer: true });
    if (!sid || !token || !from) {
      if (this.config.get('NODE_ENV', { infer: true }) === 'development') {
        this.logger.warn(`SMS provider disabled; development verification code for ${phone}: ${code}`);
      }
      return false;
    }
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: from,
          Body: `${code} is your Atlas AI verification code. It expires in 10 minutes.`,
        }),
      },
    );
    return response.ok;
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const key = this.config.get('RESEND_API_KEY', { infer: true });
    const resetUrl = `${this.config.get('APP_WEB_URL', { infer: true })}/reset-password?token=${encodeURIComponent(token)}`;
    if (!key) {
      if (this.config.get('NODE_ENV', { infer: true }) === 'development') {
        this.logger.warn(`Email provider disabled; development reset link for ${email}: ${resetUrl}`);
      }
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Atlas AI <security@atlas.example>',
        to: [email],
        subject: 'Reset your Atlas AI password',
        html: `<p>A password reset was requested for your Atlas AI account.</p><p><a href="${resetUrl}">Reset password</a></p><p>This private link expires in 15 minutes. If this was not you, ignore this email.</p>`,
      }),
    });
    if (!response.ok) {
      this.logger.error(`Password reset delivery failed with status ${response.status}`);
    }
  }
}
