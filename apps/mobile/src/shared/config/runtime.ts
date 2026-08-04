import Constants from 'expo-constants';

interface AtlasExtra {
  apiUrl?: string;
  socketUrl?: string;
  mapboxAccessToken?: string;
  demoMode?: boolean;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  googleWebClientId?: string;
  eas?: { projectId?: string };
}

const extra = (Constants.expoConfig?.extra ?? {}) as AtlasExtra;

export const runtime = {
  apiUrl: extra.apiUrl ?? 'http://localhost:4000/v1',
  socketUrl: extra.socketUrl ?? 'http://localhost:4000',
  mapboxAccessToken: extra.mapboxAccessToken ?? '',
  demoMode: extra.demoMode ?? false,
  googleIosClientId: extra.googleIosClientId,
  googleAndroidClientId: extra.googleAndroidClientId,
  googleWebClientId: extra.googleWebClientId,
  easProjectId: extra.eas?.projectId,
} as const;
