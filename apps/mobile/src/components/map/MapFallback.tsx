import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BatteryMedium, Navigation } from 'lucide-react-native';
import { Avatar } from '../ui/Avatar';
import { AtlasText } from '../ui/AtlasText';
import type { MapSurfaceProps } from './types';
import { palette, radii, shadow, spacing } from '@/shared/config/theme';

interface MarkerProps {
  person: MapSurfaceProps['people'][number];
  selected: boolean;
  onPress: () => void;
}

function PersonMarker({ person, selected, onPress }: MarkerProps) {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (person.status === 'moving') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1_200, easing: Easing.out(Easing.quad) }),
          withTiming(0.5, { duration: 0 }),
        ),
        -1,
      );
    }
  }, [person.status, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 0.8 + pulse.value * 1.3 }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.markerWrap, { left: `${person.mapX}%`, top: `${person.mapY}%` }]}
    >
      <Animated.View style={[styles.pulse, { backgroundColor: person.color }, pulseStyle]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${person.name}, ${person.statusLabel}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.marker,
          shadow,
          selected && styles.markerSelected,
          { transform: [{ scale: pressed ? 0.94 : selected ? 1.08 : 1 }] },
        ]}
      >
        <Avatar name={person.name} color={person.color} size={42} ring />
        {person.status === 'moving' ? (
          <View style={[styles.heading, { transform: [{ rotate: `${person.heading}deg` }] }]}>
            <Navigation fill={person.color} color={person.color} size={14} />
          </View>
        ) : null}
      </Pressable>
      {selected ? (
        <View style={styles.markerLabel}>
          <AtlasText variant="caption" numberOfLines={1} style={styles.markerLabelText}>
            {person.firstName}
          </AtlasText>
          {person.batteryPct !== null ? (
            <View style={styles.battery}>
              <BatteryMedium size={12} color={palette.slate500} />
              <AtlasText variant="micro" color={palette.slate500}>
                {person.batteryPct}%
              </AtlasText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function MapFallback({
  people,
  selectedPersonId,
  onSelectPerson,
  dark,
  satellite = false,
  traffic = true,
}: MapSurfaceProps) {
  const background = satellite ? (dark ? '#08120F' : '#D9E6D3') : dark ? '#0A1220' : '#EAF0F4';
  const minorRoad = dark ? '#243247' : '#FFFFFF';
  const majorRoad = dark ? '#334155' : '#CBD5E1';
  const water = dark ? '#0B2942' : '#C8E7F5';
  const land = dark ? '#101C2A' : '#E1ECE2';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 760" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="waterGlow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={water} stopOpacity="0.96" />
            <Stop offset="1" stopColor={dark ? '#0E3A55' : '#A7D8ED'} stopOpacity="0.9" />
          </LinearGradient>
          <Pattern id="blocks" width="46" height="46" patternUnits="userSpaceOnUse">
            <Rect x="5" y="5" width="32" height="24" rx="4" fill={land} opacity="0.65" />
          </Pattern>
        </Defs>
        <Rect width="400" height="760" fill="url(#blocks)" opacity={satellite ? 0.95 : 0.6} />
        <Path
          d="M-20 615 C70 540 80 485 140 455 C195 430 214 372 260 345 C310 316 334 245 430 210 L430 780 L-20 780 Z"
          fill="url(#waterGlow)"
        />
        <Path
          d="M-20 92 C85 140 106 206 194 226 C271 244 298 302 420 316"
          fill="none"
          stroke={majorRoad}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <Path
          d="M-20 92 C85 140 106 206 194 226 C271 244 298 302 420 316"
          fill="none"
          stroke={dark ? '#64748B' : '#FFFFFF'}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <G fill="none" stroke={minorRoad} strokeWidth="5" strokeLinecap="round" opacity="0.94">
          <Path d="M55 -20 C72 100 48 224 112 342 C155 420 130 505 165 620" />
          <Path d="M205 -30 C190 90 224 135 210 260 C196 350 248 420 236 535" />
          <Path d="M330 -20 C325 72 276 152 320 240 C350 306 318 390 368 465" />
          <Path d="M-10 356 C80 338 153 318 224 342 C283 363 335 390 425 370" />
          <Path d="M-20 470 C78 432 170 448 231 485 C286 518 330 535 420 515" />
          <Path d="M-10 205 C65 180 128 188 194 226 C252 258 318 240 412 210" />
          <Path d="M92 80 L336 552" />
        </G>
        {traffic ? (
          <G fill="none" strokeLinecap="round" opacity="0.85">
            <Path d="M38 118 C88 146 119 193 170 214" stroke="#22C55E" strokeWidth="5" />
            <Path d="M220 244 C270 261 290 296 342 309" stroke="#F59E0B" strokeWidth="5" />
            <Path d="M132 449 C170 445 199 459 232 482" stroke="#EF4444" strokeWidth="5" />
          </G>
        ) : null}
        <Circle cx="250" cy="570" r="7" fill={dark ? '#2DD4BF' : '#14B8A6'} opacity="0.6" />
      </Svg>
      <View style={styles.placeLabelTop}>
        <AtlasText variant="micro" color={dark ? palette.slate400 : palette.slate600}>
          IKOYI
        </AtlasText>
      </View>
      <View style={styles.placeLabelBottom}>
        <AtlasText variant="micro" color={dark ? palette.slate400 : palette.slate600}>
          VICTORIA ISLAND
        </AtlasText>
      </View>
      {people.map((person) => (
        <PersonMarker
          key={person.id}
          person={person}
          selected={person.id === selectedPersonId}
          onPress={() => onSelectPerson(person.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: {
    alignItems: 'center',
    marginLeft: -24,
    marginTop: -24,
    position: 'absolute',
    width: 76,
  },
  pulse: {
    borderRadius: 40,
    height: 58,
    position: 'absolute',
    top: -5,
    width: 58,
  },
  marker: { borderRadius: 28, zIndex: 3 },
  markerSelected: { zIndex: 5 },
  heading: { bottom: -5, position: 'absolute', right: -5 },
  markerLabel: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    ...shadow,
  },
  markerLabelText: { color: palette.navy, maxWidth: 55 },
  battery: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  placeLabelTop: { left: 64, opacity: 0.72, position: 'absolute', top: '23%' },
  placeLabelBottom: { opacity: 0.72, position: 'absolute', right: 32, top: '54%' },
});
