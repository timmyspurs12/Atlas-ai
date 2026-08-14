import { useEffect, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, View } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as Network from 'expo-network';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import atlasIcon from '../../assets/icon.png';
import { AtlasText } from '@/components/ui/AtlasText';
import { bootstrapSession } from '@/features/auth/store/auth-slice';
import {
  reconcileCallSafetyLocationTracking,
  stopCallSafetyLocationTracking,
} from '@/features/call-safety/services/call-safety-location';
import { AppNavigator } from '@/navigation/AppNavigator';
import { palette } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { store } from './store';

void ExpoSplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 2, networkMode: 'offlineFirst' },
    mutations: { retry: 1, networkMode: 'online' },
  },
});

onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) =>
    setOnline(Boolean(state.isConnected)),
  );
  return () => subscription.remove();
});

function AtlasApp() {
  const theme = useAtlasTheme();
  const authStatus = useAppSelector((state) => state.auth.status);
  const authMode = useAppSelector((state) => state.auth.mode);
  const currentUserId = useAppSelector((state) => state.auth.session?.user.id ?? null);
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    void store.dispatch(bootstrapSession());
    const timer = setTimeout(() => setMinimumSplashDone(true), 1_250);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
      if (
        status === 'active' &&
        authStatus === 'signedIn' &&
        authMode === 'live' &&
        currentUserId
      ) {
        void reconcileCallSafetyLocationTracking(currentUserId).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [authMode, authStatus, currentUserId]);

  useEffect(() => {
    if (authStatus === 'signedIn' && authMode === 'live' && currentUserId) {
      void reconcileCallSafetyLocationTracking(currentUserId).catch(() => undefined);
    } else if (authStatus === 'signedOut' || authMode === 'demo') {
      void stopCallSafetyLocationTracking().catch(() => undefined);
    }
  }, [authMode, authStatus, currentUserId]);

  useEffect(() => {
    if (fontsLoaded || fontError) void ExpoSplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  const ready = (fontsLoaded || Boolean(fontError)) && minimumSplashDone;
  if (!ready) {
    return (
      <Animated.View exiting={FadeOut.duration(350)} style={styles.splash}>
        <LinearGradient
          colors={['#020617', '#0B1B3D', '#0B2E40']}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View entering={ZoomIn.springify().damping(15)} style={styles.splashLogoWrap}>
          <Image source={atlasIcon} style={styles.splashLogo} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(350).duration(500)} style={styles.splashCopy}>
          <AtlasText variant="h1" color={palette.white}>
            Atlas AI
          </AtlasText>
          <AtlasText variant="caption" color="#94A3B8">
            KNOW WHERE YOUR PEOPLE ARE
          </AtlasText>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.stage, { backgroundColor: theme.dark ? '#00030C' : '#DDE5EF' }]}>
      <View style={[styles.deviceFrame, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <AppNavigator />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <AtlasApp />
          </SafeAreaProvider>
        </QueryClientProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stage: { alignItems: 'center', flex: 1 },
  deviceFrame: { flex: 1, maxWidth: 520, overflow: 'hidden', width: '100%' },
  splash: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  splashLogoWrap: {
    borderColor: 'rgba(147,197,253,0.24)',
    borderRadius: 34,
    borderWidth: 1,
    padding: 7,
    shadowColor: palette.blue,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
  },
  splashLogo: { borderRadius: 28, height: 112, width: 112 },
  splashCopy: { alignItems: 'center', gap: 5, marginTop: 24 },
});
