import { authSessionSchema, type ApiError, type AuthSession } from '@atlas/contracts';
import { runtime } from '../config/runtime';
import { sessionStorage } from '../storage';

export class AtlasApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AtlasApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
  retryAfterRefresh?: boolean;
}

let refreshPromise: Promise<AuthSession | null> | null = null;

async function refreshSession(): Promise<AuthSession | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const session = await sessionStorage.getSession();
    const installationId = await sessionStorage.getInstallationId();
    if (!session || !installationId) return null;
    const response = await fetch(`${runtime.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken, installationId }),
    });
    if (!response.ok) {
      await sessionStorage.clearSession();
      return null;
    }
    const parsed = authSessionSchema.safeParse(await response.json());
    if (!parsed.success) {
      await sessionStorage.clearSession();
      return null;
    }
    await sessionStorage.setSession(parsed.data);
    return parsed.data;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authenticated = options.authenticated ?? true;
  const session = authenticated ? await sessionStorage.getSession() : null;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('x-api-version', '1');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${runtime.apiUrl}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new AtlasApiError(0, 'NETWORK_ERROR', 'Unable to reach Atlas AI. Check your connection.');
  }

  if (response.status === 401 && authenticated && options.retryAfterRefresh !== false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retryAfterRefresh: false });
    }
  }
  if (!response.ok) {
    let error: Partial<ApiError> = {};
    try {
      error = (await response.json()) as Partial<ApiError>;
    } catch {
      // A proxy can return a non-JSON error; expose a safe generic message.
    }
    throw new AtlasApiError(
      response.status,
      error.code ?? 'REQUEST_FAILED',
      error.message ?? 'The request could not be completed.',
      error.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
