import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { RegisterInput } from '@atlas/contracts';
import { sessionStorage } from '../storage';

export async function installationId(): Promise<string> {
  const existing = await sessionStorage.getInstallationId();
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await sessionStorage.setInstallationId(created);
  return created;
}

export async function deviceDescriptor(): Promise<RegisterInput['device']> {
  return {
    installationId: await installationId(),
    name: Device.deviceName ?? (Platform.OS === 'web' ? 'Web browser' : 'Mobile device'),
    platform: Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB',
    appVersion: '0.1.0',
  };
}
