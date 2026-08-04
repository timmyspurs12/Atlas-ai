import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type AtlasTheme } from '../config/theme';
import { useUiStore } from '../store/ui-store';

export function useAtlasTheme(): AtlasTheme {
  const system = useColorScheme();
  const preference = useUiStore((state) => state.themePreference);
  const dark = preference === 'dark' || (preference === 'system' && system === 'dark');
  return dark ? darkTheme : lightTheme;
}
