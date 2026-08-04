import { authSessionSchema, type AuthSession } from '@atlas/contracts';
import type { SessionStoragePort } from './secure-storage.types';

const SESSION_KEY = 'atlas.session.v1';
const INSTALLATION_KEY = 'atlas.installation.v1';

const storage = (): Storage | null =>
  typeof window === 'undefined' ? null : window.sessionStorage;

export const sessionStorage: SessionStoragePort = {
  getSession(): Promise<AuthSession | null> {
    const value = storage()?.getItem(SESSION_KEY);
    if (!value) return Promise.resolve(null);
    const parsed = authSessionSchema.safeParse(JSON.parse(value));
    return Promise.resolve(parsed.success ? parsed.data : null);
  },
  setSession(session): Promise<void> {
    storage()?.setItem(SESSION_KEY, JSON.stringify(session));
    return Promise.resolve();
  },
  clearSession(): Promise<void> {
    storage()?.removeItem(SESSION_KEY);
    return Promise.resolve();
  },
  getInstallationId(): Promise<string | null> {
    return Promise.resolve(storage()?.getItem(INSTALLATION_KEY) ?? null);
  },
  setInstallationId(id): Promise<void> {
    storage()?.setItem(INSTALLATION_KEY, id);
    return Promise.resolve();
  },
};
