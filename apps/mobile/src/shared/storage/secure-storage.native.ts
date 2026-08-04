import * as SecureStore from 'expo-secure-store';
import { authSessionSchema, type AuthSession } from '@atlas/contracts';
import type { SessionStoragePort } from './secure-storage.types';

const SESSION_KEY = 'atlas.session.v1';
const INSTALLATION_KEY = 'atlas.installation.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const sessionStorage: SessionStoragePort = {
  async getSession(): Promise<AuthSession | null> {
    const value = await SecureStore.getItemAsync(SESSION_KEY, options);
    if (!value) return null;
    const parsed = authSessionSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      await SecureStore.deleteItemAsync(SESSION_KEY, options);
      return null;
    }
    return parsed.data;
  },
  async setSession(session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), options);
  },
  async clearSession() {
    await SecureStore.deleteItemAsync(SESSION_KEY, options);
  },
  getInstallationId: () => SecureStore.getItemAsync(INSTALLATION_KEY, options),
  setInstallationId: (id) => SecureStore.setItemAsync(INSTALLATION_KEY, id, options),
};
