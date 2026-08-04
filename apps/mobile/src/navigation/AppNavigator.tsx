import { NavigationContainer, DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bot, Clock3, Map, Settings, UsersRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityScreen } from '@/features/activity/screens/ActivityScreen';
import { AssistantScreen } from '@/features/assistant/screens/AssistantScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { OnboardingScreen } from '@/features/auth/screens/OnboardingScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { ChatScreen } from '@/features/chat/screens/ChatScreen';
import { PeopleScreen } from '@/features/friends/screens/PeopleScreen';
import { GeofencesScreen } from '@/features/geofences/screens/GeofencesScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { SafetyScreen } from '@/features/safety/screens/SafetyScreen';
import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';
import { palette, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, LucideIcon> = {
  Home: Map,
  People: UsersRound,
  Activity: Clock3,
  Assistant: Bot,
  Settings,
};

function MainTabs() {
  const theme = useAtlasTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => {
        const Icon = tabIcons[route.name];
        return {
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: { ...typography.micro, marginTop: 2 },
          tabBarIcon: ({ color, size, focused }) => (
            <Icon color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.5 : 2} />
          ),
          tabBarStyle: {
            backgroundColor: theme.colors.tabBar,
            borderTopColor: theme.colors.border,
            height: 72,
            paddingBottom: 8,
            paddingTop: 7,
          },
        };
      }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="People" component={PeopleScreen} />
      <Tabs.Screen name="Activity" component={ActivityScreen} />
      <Tabs.Screen name="Assistant" component={AssistantScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const atlasTheme = useAtlasTheme();
  const signedIn = useAppSelector((state) => state.auth.status === 'signedIn');
  const navigationTheme: Theme = {
    ...(atlasTheme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(atlasTheme.dark ? DarkTheme.colors : DefaultTheme.colors),
      primary: atlasTheme.colors.primary,
      background: atlasTheme.colors.background,
      card: atlasTheme.colors.surface,
      text: atlasTheme.colors.text,
      border: atlasTheme.colors.border,
      notification: palette.red,
    },
  };
  return (
    <NavigationContainer
      theme={navigationTheme}
      linking={{
        prefixes: ['atlasai://'],
        config: {
          screens: {
            Main: '',
            Login: 'login',
            Register: 'register',
            ForgotPassword: 'reset-password',
            Chat: 'chat/:conversationId',
            Safety: 'safety',
          },
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        {signedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Geofences" component={GeofencesScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Safety" component={SafetyScreen} options={{ presentation: 'modal' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
