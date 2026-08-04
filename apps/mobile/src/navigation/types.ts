export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Main: undefined;
  Notifications: undefined;
  Chat: { conversationId?: string; title?: string } | undefined;
  Geofences: undefined;
  Safety: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  People: undefined;
  Activity: undefined;
  Assistant: undefined;
  Settings: undefined;
};
