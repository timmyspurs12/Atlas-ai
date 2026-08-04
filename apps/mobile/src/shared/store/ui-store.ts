import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

interface UiState {
  themePreference: ThemePreference;
  satelliteMode: boolean;
  trafficVisible: boolean;
  reduceMotion: boolean;
  setThemePreference: (preference: ThemePreference) => void;
  toggleSatelliteMode: () => void;
  toggleTraffic: () => void;
  setReduceMotion: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      satelliteMode: false,
      trafficVisible: true,
      reduceMotion: false,
      setThemePreference: (themePreference) => set({ themePreference }),
      toggleSatelliteMode: () => set((state) => ({ satelliteMode: !state.satelliteMode })),
      toggleTraffic: () => set((state) => ({ trafficVisible: !state.trafficVisible })),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: 'atlas-ui-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ themePreference, satelliteMode, trafficVisible, reduceMotion }) => ({
        themePreference,
        satelliteMode,
        trafficVisible,
        reduceMotion,
      }),
    },
  ),
);
