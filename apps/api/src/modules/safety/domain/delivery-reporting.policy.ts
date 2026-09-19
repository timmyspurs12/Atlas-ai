/**
 * Reporting policy for an SOS channel that could not deliver.
 *
 * Pure functions, kept out of the service for two reasons:
 *
 *  - The exact wording of a safety-critical warning is worth testing directly, including the
 *    guarantee that a destination is masked and that coordinates never appear.
 *  - The service imports Prisma. A spec that imported it could only run where the Prisma
 *    client has been generated; testing the policy here runs anywhere.
 */

export type DeliveryChannel = 'sms' | 'email' | 'push';

/**
 * Name the environment variables that are unset, so a skip warning is actionable.
 *
 * "SMS not configured" sends you to the docs; "missing TWILIO_AUTH_TOKEN" sends you straight
 * to the line that needs fixing. An empty string counts as missing — the `.env.example` files
 * ship these keys present but blank, which is the most common way to be half-configured.
 */
export function missingEnvNames(values: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(values)
    .filter(([, value]) => value === undefined || value.trim() === '')
    .map(([name]) => name);
}

/**
 * Mask a phone number or email address for logs.
 *
 * Keeps only the last two characters — enough for a human to confirm which contact a message
 * was addressed to, not enough to reconstruct the destination. Alert logs get read during
 * incident review and pasted into issue trackers, so destinations are personal data that
 * should not travel with them.
 */
export function maskRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return '••';
  return `${'•'.repeat(Math.min(trimmed.length - 2, 6))}${trimmed.slice(-2)}`;
}

export interface SkippedChannelInput {
  readonly channel: DeliveryChannel;
  readonly missing: readonly string[];
  readonly recipient: string;
  /** The exact copy that would have been sent. Never contains coordinates. */
  readonly copy: string;
  readonly dryRun: boolean;
}

export interface SkippedChannelReport {
  /** Always emitted. A skipped safety channel must never fail silently. */
  readonly warning: string;
  /** Emitted only under `DELIVERY_DRY_RUN=true`, since alert copy is personal data. */
  readonly dryRunDetail: string | null;
}

/**
 * Compose the log lines for a channel that could not deliver.
 *
 * The unconditional warning is the important half. These channels previously returned `false`
 * without emitting anything, which conflated two very different situations:
 *
 *  - **Misconfiguration** — a typo in `TWILIO_ACCOUNT_SID` silently stops every emergency SMS.
 *  - **Provider rejection** — the credentials are fine and the network said no.
 *
 * Both surfaced as `{ sms: false }`. In a safety feature that difference decides whether
 * anyone learns that nobody was notified, so it now says which one happened.
 */
export function buildSkippedChannelReport(input: SkippedChannelInput): SkippedChannelReport {
  const missing = input.missing.length > 0 ? ` (missing ${input.missing.join(', ')})` : '';
  return {
    warning:
      `${input.channel} delivery skipped: not configured${missing}. ` +
      `This alert was NOT sent by ${input.channel}.`,
    dryRunDetail: input.dryRun
      ? `[DRY RUN] ${input.channel} would have sent to ${maskRecipient(input.recipient)}: ${input.copy}`
      : null,
  };
}
