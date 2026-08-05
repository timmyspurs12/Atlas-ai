import type { ConfigContext, ExpoConfig } from 'expo/config';

const environment = process.env as unknown as Record<string, string | undefined>;

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: ExpoConfig['plugins'] = [
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#020617',
        image: './assets/splash-icon.png',
        imageWidth: 180,
      },
    ],
    'expo-apple-authentication',
    [
      'expo-audio',
      {
        microphonePermission:
          'Atlas AI uses the microphone only while you deliberately record a voice note.',
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Atlas AI uses your location only while you explicitly share it or record a trip. You can stop sharing at any time.',
        isAndroidBackgroundLocationEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#2563EB',
        sounds: [],
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Atlas AI accesses selected photos only when you choose to share an image.',
        cameraPermission:
          'Atlas AI uses the camera only when you choose to take a profile or chat photo.',
      },
    ],
  ];
  if (environment.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) plugins.push('@rnmapbox/maps');

  return {
    ...config,
    name: 'Atlas AI',
    slug: 'atlas-ai',
    owner: 'atlas-ai',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'atlasai',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'ai.atlas.mobile',
      usesAppleSignIn: true,
      infoPlist: {
        UIBackgroundModes: ['location', 'remote-notification'],
        NSLocationWhenInUseUsageDescription:
          'Atlas AI uses location only when you ask to share it or record a trip.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow background location so an active share can continue while Atlas AI is not open.',
        NSMicrophoneUsageDescription:
          'Atlas AI uses the microphone only when you record a voice note.',
      },
    },
    android: {
      package: 'ai.atlas.mobile',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#2563EB',
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS',
        'RECORD_AUDIO',
      ],
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png',
      name: 'Atlas AI',
      shortName: 'Atlas',
      themeColor: '#2563EB',
      backgroundColor: '#F8FAFC',
    },
    plugins,
    experiments: { typedRoutes: false },
    extra: {
      apiUrl: environment.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/v1',
      socketUrl: environment.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:4000',
      mapboxAccessToken: environment.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
      demoMode: environment.EXPO_PUBLIC_DEMO_MODE !== 'false',
      googleIosClientId: environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      googleAndroidClientId: environment.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      googleWebClientId: environment.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      eas: { projectId: environment.EXPO_PUBLIC_EAS_PROJECT_ID },
    },
  };
};
