import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Footprints,
  MapPinned,
  Play,
  Route,
} from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { apiRequest } from '@/shared/api/api-client';
import { palette, radii, spacing } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

type Period = 'DAY' | 'WEEK' | 'MONTH';
interface TripsResponse {
  summary: {
    trips: number;
    distanceM: number;
    durationSeconds: number;
    averageDailyDistanceM: number;
  };
  data: Array<{
    id: string;
    title: string | null;
    startedAt: string;
    distanceM: number;
    durationSeconds: number;
  }>;
}

const demoTrips = [
  {
    id: '1',
    title: 'Morning commute',
    time: '8:12 AM',
    route: 'Ikoyi → Victoria Island',
    distance: '7.4 km',
    duration: '28 min',
    color: palette.blue,
  },
  {
    id: '2',
    title: 'Lunch walk',
    time: '1:06 PM',
    route: 'Adeola Odeku',
    distance: '1.8 km',
    duration: '24 min',
    color: palette.teal,
  },
  {
    id: '3',
    title: 'Evening journey',
    time: '6:34 PM',
    route: 'Victoria Island → Oniru',
    distance: '5.2 km',
    duration: '31 min',
    color: '#8B5CF6',
  },
];

export function ActivityScreen() {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const [period, setPeriod] = useState<Period>('WEEK');
  const tripsQuery = useQuery({
    queryKey: ['trips', period],
    queryFn: () => apiRequest<TripsResponse>(`/trips?period=${period}`),
    enabled: mode === 'live',
    staleTime: 60_000,
  });
  const bars = useMemo(() => [38, 62, 45, 79, 54, 92, 64], []);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <AtlasText variant="h1">Activity</AtlasText>
          <AtlasText color={theme.colors.textMuted}>Your journeys, clearly explained.</AtlasText>
        </View>
        <View
          style={[
            styles.calendar,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <CalendarDays size={19} color={theme.colors.text} />
        </View>
      </View>

      <View
        style={[
          styles.period,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {(['DAY', 'WEEK', 'MONTH'] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === item }}
            onPress={() => setPeriod(item)}
            style={[styles.periodButton, period === item && { backgroundColor: palette.blue }]}
          >
            <AtlasText
              variant="caption"
              color={period === item ? palette.white : theme.colors.textMuted}
            >
              {item === 'DAY' ? 'Today' : item === 'WEEK' ? 'This week' : 'This month'}
            </AtlasText>
          </Pressable>
        ))}
      </View>

      <Card elevated style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <AtlasText variant="micro" color={theme.colors.textMuted}>
              DISTANCE TRAVELLED
            </AtlasText>
            <View style={styles.valueRow}>
              <AtlasText style={[styles.heroValue, { color: theme.colors.text }]}>
                {((tripsQuery.data?.summary.distanceM ?? 42_800) / 1_000).toFixed(1)}
              </AtlasText>
              <AtlasText variant="h3" color={theme.colors.textMuted}>
                km
              </AtlasText>
            </View>
          </View>
          <Pill label="↑ 12%" color={palette.green} backgroundColor="rgba(34,197,94,0.11)" />
        </View>
        <View style={styles.chart}>
          {bars.map((height, index) => (
            <View key={index} style={styles.barColumn}>
              <View style={[styles.barTrack, { backgroundColor: theme.colors.background }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${height}%`,
                      backgroundColor: index === 5 ? palette.blue : 'rgba(37,99,235,0.34)',
                    },
                  ]}
                />
              </View>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
              </AtlasText>
            </View>
          ))}
        </View>
        <View style={[styles.summaryRow, { borderColor: theme.colors.border }]}>
          <View style={styles.summaryItem}>
            <Route size={17} color={palette.blue} />
            <View>
              <AtlasText variant="label">{tripsQuery.data?.summary.trips ?? 9}</AtlasText>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                TRIPS
              </AtlasText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryItem}>
            <Clock3 size={17} color={palette.teal} />
            <View>
              <AtlasText variant="label">3h 42m</AtlasText>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                ON THE MOVE
              </AtlasText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryItem}>
            <Footprints size={17} color="#8B5CF6" />
            <View>
              <AtlasText variant="label">6,840</AtlasText>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                AVG STEPS
              </AtlasText>
            </View>
          </View>
        </View>
      </Card>

      <View style={styles.sectionHeader}>
        <View>
          <AtlasText variant="h3">Today’s timeline</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Tuesday, 4 August
          </AtlasText>
        </View>
        <Pressable>
          <AtlasText variant="label" color={palette.blue}>
            See all
          </AtlasText>
        </Pressable>
      </View>

      <View style={styles.timeline}>
        {demoTrips.map((trip, index) => (
          <View key={trip.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={[styles.timelineDot, { backgroundColor: trip.color }]} />
              {index < demoTrips.length - 1 ? (
                <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />
              ) : null}
            </View>
            <Card style={styles.tripCard}>
              <View style={styles.tripHeader}>
                <View style={[styles.tripIcon, { backgroundColor: `${trip.color}18` }]}>
                  <MapPinned size={18} color={trip.color} />
                </View>
                <View style={styles.flex}>
                  <AtlasText variant="label">{trip.title}</AtlasText>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>
                    {trip.time} · {trip.duration}
                  </AtlasText>
                </View>
                <ChevronRight size={18} color={theme.colors.textMuted} />
              </View>
              <View style={styles.routePreview}>
                <Svg height="62" width="100%" viewBox="0 0 300 62">
                  <Path
                    d="M0 10 C55 20 68 55 126 40 C183 25 219 13 300 44"
                    stroke={theme.dark ? '#1E293B' : '#E2E8F0'}
                    strokeWidth="20"
                    fill="none"
                  />
                  <Polyline
                    points="3,10 44,16 82,47 126,40 178,25 222,15 297,44"
                    stroke={trip.color}
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Circle
                    cx="3"
                    cy="10"
                    r="5"
                    fill={palette.white}
                    stroke={trip.color}
                    strokeWidth="3"
                  />
                  <Circle cx="297" cy="44" r="5" fill={trip.color} />
                </Svg>
              </View>
              <View style={styles.tripFooter}>
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  {trip.route}
                </AtlasText>
                <AtlasText variant="label">{trip.distance}</AtlasText>
              </View>
            </Card>
          </View>
        ))}
      </View>

      <Card style={styles.replayCard}>
        <View style={styles.play}>
          <Play size={18} color={palette.white} fill={palette.white} />
        </View>
        <View style={styles.flex}>
          <AtlasText variant="label">Replay a journey</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Watch your route unfold on the map.
          </AtlasText>
        </View>
        <ChevronRight size={19} color={theme.colors.textMuted} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  calendar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  period: { borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', padding: 4 },
  periodButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  heroCard: { gap: spacing.md },
  heroTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  valueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 5 },
  heroValue: {
    color: palette.navy,
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    letterSpacing: -1.2,
    lineHeight: 43,
  },
  chart: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm, height: 120 },
  barColumn: { alignItems: 'center', flex: 1, gap: 6, height: '100%', justifyContent: 'flex-end' },
  barTrack: { borderRadius: 5, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', width: 18 },
  bar: { borderRadius: 5, width: '100%' },
  summaryRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  summaryItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  divider: { height: 32, width: StyleSheet.hairlineWidth },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineRail: { alignItems: 'center', width: 18 },
  timelineDot: {
    borderColor: palette.white,
    borderRadius: 7,
    borderWidth: 3,
    height: 14,
    marginTop: 18,
    width: 14,
    zIndex: 2,
  },
  timelineLine: { flex: 1, width: 2 },
  tripCard: { flex: 1, marginBottom: spacing.sm },
  tripHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  tripIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  flex: { flex: 1 },
  routePreview: { borderRadius: radii.sm, marginTop: spacing.sm, overflow: 'hidden' },
  tripFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  replayCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  play: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 15,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
});
