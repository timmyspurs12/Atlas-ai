import type { AuthSession, LoginInput, RegisterInput } from '@atlas/contracts';
import { apiRequest } from '@/shared/api/api-client';
import { deviceDescriptor } from '@/shared/lib/device';
import { sessionStorage } from '@/shared/storage';

export async function login(
  credentials: Pick<LoginInput, 'email' | 'password'>,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { ...credentials, device: await deviceDescriptor() },
  });
  await sessionStorage.setSession(session);
  return session;
}

export async function register(
  input: Omit<RegisterInput, 'device' | 'acceptedTermsVersion'>,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: {
      ...input,
      acceptedTermsVersion: '2026-01',
      device: await deviceDescriptor(),
    },
  });
  await sessionStorage.setSession(session);
  return session;
}

export async function socialLogin(
  provider: 'GOOGLE' | 'APPLE',
  idToken: string,
  displayName?: string | null,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/social', {
    method: 'POST',
    authenticated: false,
    body: {
      provider,
      idToken,
      displayName: displayName || undefined,
      acceptedTermsVersion: '2026-01',
      device: await deviceDescriptor(),
    },
  });
  await sessionStorage.setSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } finally {
    await sessionStorage.clearSession();
  }
}
