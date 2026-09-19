import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { GeocodingProvider } from '../geo-proxy/providers/geocoding.provider';
import type { SosPlaceInput } from './domain/sos-place.policy';

/** Added to the upstream timeout so the inner bound normally wins and reports a real reason. */
const OUTER_GRACE_MS = 500;

/**
 * Best-effort place naming for the SOS path.
 *
 * The contract is the important part: **this never throws and never blocks longer than a hard
 * ceiling.** An SOS must reach a recipient even when the geocoder is down, slow, disabled,
 * rate-limited, or has never been configured. Every failure mode resolves to `null`, and the
 * caller sends the alert without a place description.
 *
 * A note on why the outer timeout exists even though the HTTP layer already has one: DNS
 * resolution happens before the request timeout starts, and `dns.resolve` has no default
 * timeout of its own. Without this outer bound a hung resolver could stall an emergency.
 */
@Injectable()
export class SosLocationService {
  private readonly logger = new Logger(SosLocationService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly geocoding: GeocodingProvider,
  ) {}

  /**
   * Resolve a human-readable place for coordinates.
   *
   * Deliberately does not log the coordinates or the resolved name. Atlas's rule is that
   * location data does not reach application logs, and an SOS location is the most sensitive
   * location in the system. Only the outcome and a failure reason are logged.
   */
  async describe(latitude: number, longitude: number): Promise<SosPlaceInput | null> {
    const ceiling = this.config.get('GEO_EMERGENCY_TIMEOUT_MS', { infer: true }) + OUTER_GRACE_MS;

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ceiling);
      });

      const lookup = this.geocoding.reverseForEmergency(latitude, longitude).then((result) => {
        if (!result.ok) {
          this.logger.warn(`SOS place lookup unavailable: ${result.reason}`);
          return null;
        }
        const place = result.value;
        return {
          name: place.name,
          locality: place.locality,
          region: place.region,
          country: place.country,
        } satisfies SosPlaceInput;
      });

      const outcome = await Promise.race([lookup, timeout]);
      if (outcome === null) this.logger.warn('SOS place lookup did not resolve in time');
      return outcome;
    } catch (error) {
      // Defensive: the SOS path must survive even an unexpected failure here.
      this.logger.warn(
        `SOS place lookup failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
