import type { TextStyle, ViewStyle } from 'react-native';

export const palette = {
  blue: '#2563EB',
  blueLight: '#60A5FA',
  navy: '#0F172A',
  teal: '#14B8A6',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate800: '#1E293B',
  slate900: '#0F172A',
  ink: '#020617',
  white: '#FFFFFF',
} as const;

export interface AtlasTheme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    accent: string;
    success: string;
    danger: string;
    warning: string;
    tabBar: string;
    mapOverlay: string;
  };
}

export const lightTheme: AtlasTheme = {
  dark: false,
  colors: {
    background: palette.slate50,
    surface: palette.white,
    surfaceElevated: palette.white,
    text: palette.navy,
    textMuted: palette.slate500,
    border: palette.slate200,
    primary: palette.blue,
    accent: palette.teal,
    success: palette.green,
    danger: palette.red,
    warning: palette.amber,
    tabBar: 'rgba(255,255,255,0.96)',
    mapOverlay: 'rgba(255,255,255,0.88)',
  },
};

export const darkTheme: AtlasTheme = {
  dark: true,
  colors: {
    background: palette.ink,
    surface: '#0B1220',
    surfaceElevated: palette.slate900,
    text: palette.slate50,
    textMuted: palette.slate400,
    border: 'rgba(148,163,184,0.18)',
    primary: palette.blueLight,
    accent: '#2DD4BF',
    success: '#4ADE80',
    danger: '#F87171',
    warning: '#FBBF24',
    tabBar: 'rgba(2,6,23,0.96)',
    mapOverlay: 'rgba(15,23,42,0.88)',
  },
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const typography = {
  hero: { fontFamily: 'Inter_700Bold', fontSize: 36, lineHeight: 42, letterSpacing: -1.2 } satisfies TextStyle,
  h1: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.7 } satisfies TextStyle,
  h2: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.4 } satisfies TextStyle,
  h3: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 22 } satisfies TextStyle,
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 } satisfies TextStyle,
  bodyMedium: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 } satisfies TextStyle,
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18 } satisfies TextStyle,
  caption: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16 } satisfies TextStyle,
  micro: { fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 13, letterSpacing: 0.4 } satisfies TextStyle,
} as const;

export const shadow: ViewStyle = {
  shadowColor: '#020617',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 8,
};
