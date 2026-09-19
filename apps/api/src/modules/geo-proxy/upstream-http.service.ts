import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import https from 'node:https';
import {
  allAddressesRoutable,
  classifyResolvedAddress,
  parseUpstreamEndpoint,
  type ParsedEndpoint,
} from './domain/upstream.policy';

export interface UpstreamRequest {
  /** Operator-configured https base URL, e.g. https://router.project-osrm.org */
  readonly baseUrl: string;
  /** Path appended to the base URL's path. Must start with '/'. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly userAgent: string;
}

export type UpstreamResult<T> =
  | { readonly ok: true; readonly value: T; readonly status: number; readonly bytes: number }
  | { readonly ok: false; readonly reason: UpstreamFailure };

export type UpstreamFailure =
  | 'CONFIGURATION'
  | 'DNS'
  | 'UNSAFE_ADDRESS'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'REDIRECT'
  | 'HTTP_STATUS'
  | 'TOO_LARGE'
  | 'MALFORMED_BODY';

/**
 * Server-side HTTP client for keyless public geo providers.
 *
 * The client DTOs expose coordinates, profile names and query strings — never a URL. The
 * destination is always an operator-configured base URL, which is what makes this a proxy
 * rather than an open relay.
 *
 * Defence in depth, in the order it is applied:
 *  1. Base URL must be https on port 443 with no embedded credentials.
 *  2. DNS is resolved here, and every returned address must be globally routable.
 *  3. The socket is then PINNED to one validated address, with the real hostname supplied
 *     as TLS SNI and the Host header. Resolving again inside the TLS stack is what a DNS
 *     rebinding attack exploits; pinning closes that window.
 *  4. Redirects are never followed — a 3xx is a failure, not a new destination.
 *  5. Response size and wall-clock time are both bounded.
 */
@Injectable()
export class UpstreamHttpService {
  private readonly logger = new Logger(UpstreamHttpService.name);

  async getJson<T>(request: UpstreamRequest): Promise<UpstreamResult<T>> {
    const parsed = parseUpstreamEndpoint(request.baseUrl);
    if (!parsed) {
      this.logger.warn(`Rejected upstream base URL: ${request.baseUrl}`);
      return { ok: false, reason: 'CONFIGURATION' };
    }
    if (!request.path.startsWith('/')) {
      return { ok: false, reason: 'CONFIGURATION' };
    }

    const pinned = await this.resolveAndPin(parsed.host);
    if (!pinned.ok) return { ok: false, reason: pinned.reason };

    const fullPath = `${parsed.basePath}${request.path}${buildQueryString(request.query)}`;
    return this.request<T>(parsed, pinned.address, fullPath, request);
  }

  /** Resolve a hostname and confirm every candidate address is safe to connect to. */
  private async resolveAndPin(
    host: string,
  ): Promise<{ ok: true; address: string } | { ok: false; reason: UpstreamFailure }> {
    const settled = await Promise.allSettled([dns.resolve4(host), dns.resolve6(host)]);
    const addresses: string[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') addresses.push(...result.value);
    }
    if (addresses.length === 0) return { ok: false, reason: 'DNS' };

    if (!allAddressesRoutable(addresses)) {
      // Log which address was refused — operationally essential, and never a secret.
      const refused = addresses.filter((address) => classifyResolvedAddress(address) !== 'GLOBAL');
      this.logger.warn(
        `Refusing to connect to ${host}: non-routable addresses ${refused.join(', ')}`,
      );
      return { ok: false, reason: 'UNSAFE_ADDRESS' };
    }

    const address = addresses[0];
    if (!address) return { ok: false, reason: 'DNS' };
    return { ok: true, address };
  }

  private request<T>(
    parsed: ParsedEndpoint,
    pinnedAddress: string,
    fullPath: string,
    request: UpstreamRequest,
  ): Promise<UpstreamResult<T>> {
    return new Promise<UpstreamResult<T>>((resolve) => {
      const chunks: Buffer[] = [];
      let received = 0;
      let settled = false;

      const finish = (result: UpstreamResult<T>): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const req = https.request(
        {
          // Connect to the validated address, not to the hostname.
          host: pinnedAddress,
          port: parsed.port,
          path: fullPath,
          method: 'GET',
          // TLS SNI and certificate verification must use the real hostname.
          servername: parsed.host,
          agent: false,
          timeout: request.timeoutMs,
          headers: {
            host: parsed.host,
            'user-agent': request.userAgent,
            accept: 'application/json',
            'accept-language': 'en',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;

          // Never follow a redirect: a 3xx would let an allow-listed host point us at
          // somewhere that was never validated.
          if (status >= 300 && status < 400) {
            res.destroy();
            finish({ ok: false, reason: 'REDIRECT' });
            return;
          }

          res.on('data', (chunk: Buffer) => {
            received += chunk.byteLength;
            if (received > request.maxResponseBytes) {
              res.destroy();
              req.destroy();
              finish({ ok: false, reason: 'TOO_LARGE' });
              return;
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            if (status < 200 || status >= 300) {
              finish({ ok: false, reason: 'HTTP_STATUS' });
              return;
            }
            const body = Buffer.concat(chunks).toString('utf8');
            try {
              finish({
                ok: true,
                value: JSON.parse(body) as T,
                status,
                bytes: received,
              });
            } catch {
              finish({ ok: false, reason: 'MALFORMED_BODY' });
            }
          });

          res.on('error', () => finish({ ok: false, reason: 'NETWORK' }));
        },
      );

      req.on('timeout', () => {
        req.destroy();
        finish({ ok: false, reason: 'TIMEOUT' });
      });
      req.on('error', (error: Error) => {
        const reason: UpstreamFailure =
          error.message === 'Connection timed out' ? 'TIMEOUT' : 'NETWORK';
        this.logger.debug(`Upstream ${parsed.host} failed: ${error.message}`);
        finish({ ok: false, reason });
      });

      req.end();
    });
  }
}

function buildQueryString(query: UpstreamRequest['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
