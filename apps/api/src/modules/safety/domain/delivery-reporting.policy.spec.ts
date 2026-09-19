import { describe, expect, it } from 'vitest';

import {
  buildSkippedChannelReport,
  maskRecipient,
  missingEnvNames,
} from './delivery-reporting.policy';

describe('missingEnvNames', () => {
  it('names only the variables that are absent', () => {
    expect(
      missingEnvNames({
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: undefined,
        TWILIO_FROM_NUMBER: '+15551234567',
      }),
    ).toEqual(['TWILIO_AUTH_TOKEN']);
  });

  it('treats a blank value as missing', () => {
    // The .env.example files ship these keys present but empty, which is the most common way
    // to be half-configured. Reporting "configured" for an empty string would send someone
    // hunting for a bug that is really a missing value.
    expect(missingEnvNames({ RESEND_API_KEY: '' })).toEqual(['RESEND_API_KEY']);
    expect(missingEnvNames({ RESEND_API_KEY: '   ' })).toEqual(['RESEND_API_KEY']);
  });

  it('returns every name when nothing is set, in declaration order', () => {
    expect(
      missingEnvNames({
        FCM_PROJECT_ID: undefined,
        FCM_CLIENT_EMAIL: '',
        FCM_PRIVATE_KEY: undefined,
      }),
    ).toEqual(['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY']);
  });

  it('returns an empty list when everything is set', () => {
    expect(missingEnvNames({ RESEND_API_KEY: 're_abc' })).toEqual([]);
  });
});

describe('maskRecipient', () => {
  it('keeps only the last two characters of a phone number', () => {
    expect(maskRecipient('+2348031234567')).toBe('••••••67');
  });

  it('keeps only the last two characters of an email address', () => {
    expect(maskRecipient('maya.bello@example.com')).toBe('••••••om');
  });

  it('caps the mask at six characters so long values do not bloat a log line', () => {
    expect(maskRecipient('+2348031234567')).toHaveLength(8);
  });

  it('masks everything for a value too short to be worth identifying', () => {
    expect(maskRecipient('ab')).toBe('••');
    expect(maskRecipient('')).toBe('••');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskRecipient('  +2348031234567  ')).toBe('••••••67');
  });

  it('never reveals the unmasked destination', () => {
    const masked = maskRecipient('+2348031234567');
    expect(masked).not.toContain('234803');
    expect(masked).not.toContain('+234');
  });
});

describe('buildSkippedChannelReport', () => {
  const base = {
    channel: 'sms' as const,
    missing: ['TWILIO_AUTH_TOKEN'],
    recipient: '+2348031234567',
    copy: '"SOS from Maya Bello. Near Gamboru Market, Maiduguri. View https://app.atlas.ng/sos/abc"',
    dryRun: false,
  };

  it('always produces a warning, whatever the dry-run setting', () => {
    // The point of the change: a skipped safety channel must never be silent.
    expect(buildSkippedChannelReport({ ...base, dryRun: false }).warning).toContain('sms');
    expect(buildSkippedChannelReport({ ...base, dryRun: true }).warning).toContain('sms');
  });

  it('states plainly that the alert was not sent', () => {
    const { warning } = buildSkippedChannelReport(base);
    expect(warning).toContain('NOT sent');
    expect(warning).toContain('not configured');
  });

  it('names the exact missing variables', () => {
    const { warning } = buildSkippedChannelReport(base);
    expect(warning).toContain('TWILIO_AUTH_TOKEN');
  });

  it('omits the parenthetical when no variable name is known', () => {
    const { warning } = buildSkippedChannelReport({ ...base, missing: [] });
    expect(warning).not.toContain('missing');
    expect(warning).toContain('not configured');
  });

  it('withholds the alert copy unless dry run is enabled', () => {
    // Alert copy is personal data. It earns its place in a log only when someone has
    // deliberately asked to inspect delivery.
    expect(buildSkippedChannelReport({ ...base, dryRun: false }).dryRunDetail).toBeNull();
    expect(buildSkippedChannelReport({ ...base, dryRun: true }).dryRunDetail).not.toBeNull();
  });

  it('includes the full copy under dry run so the wording can be read', () => {
    const detail = buildSkippedChannelReport({ ...base, dryRun: true }).dryRunDetail;
    expect(detail).toContain('[DRY RUN]');
    expect(detail).toContain('Gamboru Market, Maiduguri');
    expect(detail).toContain('https://app.atlas.ng/sos/abc');
  });

  it('masks the recipient in the dry-run line', () => {
    const detail = buildSkippedChannelReport({ ...base, dryRun: true }).dryRunDetail ?? '';
    expect(detail).not.toContain('+2348031234567');
    expect(detail).toContain('••••••67');
  });

  it('reports each channel by its own name', () => {
    for (const channel of ['sms', 'email', 'push'] as const) {
      const { warning } = buildSkippedChannelReport({ ...base, channel });
      expect(warning).toContain(`${channel} delivery skipped`);
    }
  });
});
