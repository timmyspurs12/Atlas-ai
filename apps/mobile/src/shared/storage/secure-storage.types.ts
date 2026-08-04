import type { AuthSession } from '@atlas/contracts';

export interface SessionStoragePort {
  getSession: () => Promise<AuthSession | null>;
  setSession: (session: AuthSession) => Promise<void>;
  clearSession: () => Promise<void>;
  getInstallationId: () => Promise<string | null>;
  setInstallationId: (id: string) => Promise<void>;
}
