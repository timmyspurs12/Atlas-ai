import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import {
  ArrowRight,
  BusFront,
  Clock3,
  Coins,
  Footprints,
  LocateFixed,
  MapPin,
  Navigation2,
  Route,
  Save,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import type { RootStackParamList } from '@/navigation/types';
import { AtlasApiError } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { DEMO_ORIGIN, DEMO_TRANSIT_JOURNEYS } from '../data/demo-routes';
import {
  nearbyTransitPlaces,
  planTransitJourney,
  searchTransitPlaces,
  type RoutePreference,
  type TransitJourney,
} from '../services/routes-service';
import { parseTransitPrompt } from '../services/transit-prompt';

const preferences: Array<{ value: RoutePreference; label: string }> = [
  { value: 'BALANCED', label: 'Balanced' },
  { value: 'CHEAPEST', label: 'Cheapest' },
  { value: 'FASTEST', label: 'Fastest' },
  { value: 'FEWEST_TRANSFERS', label: 'Fewer changes' },
  { value: 'FORMAL_TRANSIT', label: 'Formal transit' },
];

const formatFare = (minimum: number | null, maximum: number | null): string => {
  if (minimum === null || maximum === null) return 'Ask before boarding';
  const naira = (value: number) => `₦${Math.round(value / 100).toLocaleString('en-NG')}`;
  return minimum === maximum ? naira(minimum) : `${naira(minimum)}–${naira(maximum)}`;
};

const formatMode = (mode: string): string =>
  mode
    .toLowerCase()
    .split('_')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');

export function RoutesScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const mode = useAppSelector((state) => state.auth.mode);
  const [prompt, setPrompt] = useState('I am at Ikeja, trying to get to Ajah on a tight budget.');
  const [origin, setOrigin] = useState('Ikeja');
  const [destination, setDestination] = useState('Ajah');
  const [originPlaceId, setOriginPlaceId] = useState<string | null>(null);
  const [destinationPlaceId, setDestinationPlaceId] = useState<string | null>(null);
  const [preference, setPreference] = useState<RoutePreference>('CHEAPEST');
  const [journeys, setJourneys] = useState<TransitJourney[]>(
    mode === 'demo' ? DEMO_TRANSIT_JOURNEYS : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    mode === 'demo' ? (DEMO_TRANSIT_JOURNEYS[0]?.id ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => journeys.find((journey) => journey.id === selectedId) ?? journeys[0],
    [journeys, selectedId],
  );

  const executePlan = async (
    from: string,
    to: string,
    requestedPreference: RoutePreference,
  ): Promise<void> => {
    if (!from.trim() || !to.trim()) {
      setError('Enter both an origin and a destination.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === 'demo') {
        await new Promise((resolve) => setTimeout(resolve, 650));
        setJourneys(DEMO_TRANSIT_JOURNEYS);
        setSelectedId(requestedPreference === 'FASTEST' ? 'demo-fast' : 'demo-budget');
        return;
      }
      const [originMatches, destinationMatches] = await Promise.all([
        originPlaceId ? Promise.resolve([{ id: originPlaceId }]) : searchTransitPlaces(from),
        destinationPlaceId
          ? Promise.resolve([{ id: destinationPlaceId }])
          : searchTransitPlaces(to),
      ]);
      const resolvedOrigin = originMatches[0];
      const resolvedDestination = destinationMatches[0];
      if (!resolvedOrigin || !resolvedDestination) {
        throw new Error('No approved matching transit place is available yet.');
      }
      const response = await planTransitJourney({
        originPlaceId: resolvedOrigin.id,
        destinationPlaceId: resolvedDestination.id,
        preference: requestedPreference,
      });
      setJourneys(response.data);
      setSelectedId(response.data[0]?.id ?? null);
    } catch (caught) {
      setJourneys([]);
      setSelectedId(null);
      setError(
        caught instanceof AtlasApiError || caught instanceof Error
          ? caught.message
          : 'The journey could not be planned.',
      );
    } finally {
      setLoading(false);
    }
  };

  const usePrompt = (): void => {
    const parsed = parseTransitPrompt(prompt);
    const from = parsed.origin ?? origin;
    const to = parsed.destination ?? destination;
    setOrigin(from);
    setDestination(to);
    setOriginPlaceId(null);
    setDestinationPlaceId(null);
    setPreference(parsed.preference);
    void executePlan(from, to, parsed.preference);
  };

  const useCurrentLocation = async (): Promise<void> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError('Location permission was not granted. Your origin was not changed.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (mode === 'demo') {
      setOrigin('Current location (demo)');
      setOriginPlaceId(DEMO_ORIGIN.id);
      return;
    }
    try {
      const nearby = await nearbyTransitPlaces(current.coords.latitude, current.coords.longitude);
      const closest = nearby[0];
      if (!closest) throw new Error('No approved transit stop was found nearby.');
      setOrigin(closest.name);
      setOriginPlaceId(closest.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nearby stop lookup failed.');
    }
  };

  const saveOffline = async (): Promise<void> => {
    if (!selected) return;
    await AsyncStorage.setItem(
      `atlas.saved.transit.${selected.id}`,
      JSON.stringify({ savedAt: new Date().toISOString(), journey: selected }),
    );
    Alert.alert('Journey saved', 'This route is available from this device while offline.');
  };

  const shareJourney = async (): Promise<void> => {
    if (!selected) return;
    const legSummary = selected.legs
      .map(
        (leg, index) => `${index + 1}. ${leg.fromLabel} → ${leg.toLabel} (${formatMode(leg.mode)})`,
      )
      .join('\n');
    await Share.share({
      message: `Atlas journey: ${origin} → ${destination}\n${legSummary}\nFare estimate: ${formatFare(selected.totalFareMinKobo, selected.totalFareMaxKobo)}\nVerify time-sensitive details before travelling.`,
    });
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.routeLogo}>
          <Route size={23} color={palette.white} />
        </View>
        <View style={styles.flex}>
          <AtlasText variant="h2">Atlas Routes</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Local journeys, explained step by step
          </AtlasText>
        </View>
        <IconButton
          icon={Sparkles}
          label="Open Atlas Assistant"
          onPress={() => navigation.navigate('Assistant')}
        />
      </View>

      {mode === 'demo' ? (
        <Card style={styles.demoNotice}>
          <ShieldCheck size={19} color={palette.amber} />
          <View style={styles.flex}>
            <AtlasText variant="label" color={palette.amber}>
              Illustrative demo—not travel guidance
            </AtlasText>
            <AtlasText variant="caption" color={theme.colors.textMuted}>
              These sample legs and prices are simulated. Live Atlas results use approved data only.
            </AtlasText>
          </View>
        </Card>
      ) : null}

      <Card elevated style={styles.askCard}>
        <View style={styles.askHeading}>
          <Sparkles size={18} color={palette.blue} />
          <AtlasText variant="label">Ask naturally</AtlasText>
        </View>
        <TextInput
          accessibilityLabel="Describe your transit journey"
          multiline
          maxLength={300}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="I’m at Ikeja and need the cheapest route to Ajah…"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.promptInput,
            typography.body,
            { color: theme.colors.text, backgroundColor: theme.colors.background },
          ]}
        />
        <Button label="Understand and plan" icon={ArrowRight} onPress={usePrompt} />
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.locationRow}>
          <View style={styles.locationRail}>
            <View style={styles.originDot} />
            <View style={[styles.railLine, { backgroundColor: theme.colors.border }]} />
            <MapPin size={16} color={palette.red} fill={palette.red} />
          </View>
          <View style={styles.locationFields}>
            <View style={[styles.field, { borderColor: theme.colors.border }]}>
              <TextInput
                accessibilityLabel="Origin"
                value={origin}
                onChangeText={(value) => {
                  setOrigin(value);
                  setOriginPlaceId(null);
                }}
                placeholder="From"
                placeholderTextColor={theme.colors.textMuted}
                style={[typography.body, { color: theme.colors.text, flex: 1 }]}
              />
              <Pressable accessibilityRole="button" onPress={() => void useCurrentLocation()}>
                <LocateFixed size={18} color={palette.blue} />
              </Pressable>
            </View>
            <View style={[styles.field, { borderColor: theme.colors.border }]}>
              <TextInput
                accessibilityLabel="Destination"
                value={destination}
                onChangeText={(value) => {
                  setDestination(value);
                  setDestinationPlaceId(null);
                }}
                placeholder="To"
                placeholderTextColor={theme.colors.textMuted}
                style={[typography.body, { color: theme.colors.text, flex: 1 }]}
              />
            </View>
          </View>
        </View>
        <AtlasText variant="micro" color={theme.colors.textMuted}>
          OPTIMISE FOR
        </AtlasText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {preferences.map((item) => {
            const active = preference === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setPreference(item.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? palette.blue : theme.colors.background,
                    borderColor: active ? palette.blue : theme.colors.border,
                  },
                ]}
              >
                <AtlasText variant="caption" color={active ? palette.white : theme.colors.text}>
                  {item.label}
                </AtlasText>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button
          label="Plan verified journey"
          loading={loading}
          onPress={() => void executePlan(origin, destination, preference)}
        />
        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <AtlasText variant="caption" color={palette.red}>
              {error}
            </AtlasText>
          </View>
        ) : null}
      </Card>

      {journeys.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <AtlasText variant="h3">Journey options</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted}>
                {journeys.length} alternative{journeys.length === 1 ? '' : 's'}
              </AtlasText>
            </View>
            <Pill
              label={mode === 'demo' ? 'DEMO DATA' : 'VERIFIED DATA'}
              color={mode === 'demo' ? palette.amber : palette.green}
              backgroundColor={mode === 'demo' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)'}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.alternatives}
          >
            {journeys.map((journey, index) => {
              const active = selected?.id === journey.id;
              return (
                <Pressable key={journey.id} onPress={() => setSelectedId(journey.id)}>
                  <Card style={[styles.alternative, active && styles.activeAlternative]}>
                    <View style={styles.alternativeTop}>
                      <AtlasText variant="label">
                        {journey.preference === 'CHEAPEST'
                          ? 'Cheapest'
                          : journey.preference === 'FASTEST'
                            ? 'Fastest'
                            : `Option ${index + 1}`}
                      </AtlasText>
                      {index === 0 ? (
                        <Pill
                          label="BEST MATCH"
                          color={palette.blue}
                          backgroundColor="rgba(37,99,235,0.1)"
                        />
                      ) : null}
                    </View>
                    <AtlasText variant="h2">
                      {formatFare(journey.totalFareMinKobo, journey.totalFareMaxKobo)}
                    </AtlasText>
                    <View style={styles.metrics}>
                      <View style={styles.metric}>
                        <Clock3 size={14} color={theme.colors.textMuted} />
                        <AtlasText variant="caption" color={theme.colors.textMuted}>
                          {journey.totalDurationMinMinutes}–{journey.totalDurationMaxMinutes} min
                        </AtlasText>
                      </View>
                      <View style={styles.metric}>
                        <Navigation2 size={14} color={theme.colors.textMuted} />
                        <AtlasText variant="caption" color={theme.colors.textMuted}>
                          {journey.transferCount} change{journey.transferCount === 1 ? '' : 's'}
                        </AtlasText>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {selected ? (
        <View style={styles.details}>
          <View style={styles.sectionHeader}>
            <AtlasText variant="h3">Step-by-step</AtlasText>
            <View style={styles.actions}>
              <IconButton
                icon={Save}
                label="Save journey offline"
                onPress={() => void saveOffline()}
                size={38}
              />
              <IconButton
                icon={Share2}
                label="Share journey"
                onPress={() => void shareJourney()}
                size={38}
              />
            </View>
          </View>
          {selected.legs.map((leg, index) => (
            <View key={`${leg.routeId}-${index}`} style={styles.legRow}>
              <View style={styles.legRail}>
                <View
                  style={[
                    styles.legNumber,
                    { backgroundColor: index === 0 ? palette.blue : palette.teal },
                  ]}
                >
                  <AtlasText variant="caption" color={palette.white}>
                    {index + 1}
                  </AtlasText>
                </View>
                {index < selected.legs.length - 1 ? (
                  <View style={[styles.legLine, { backgroundColor: theme.colors.border }]} />
                ) : null}
              </View>
              <Card style={styles.legCard}>
                <View style={styles.legHeader}>
                  <View style={styles.busIcon}>
                    <BusFront size={19} color={palette.blue} />
                  </View>
                  <View style={styles.flex}>
                    <AtlasText variant="label">
                      {formatMode(leg.mode)} · {leg.routeName}
                    </AtlasText>
                    <AtlasText variant="caption" color={theme.colors.textMuted}>
                      {leg.fromLabel} → {leg.toLabel}
                    </AtlasText>
                  </View>
                </View>
                {leg.destinationSign ? (
                  <View style={[styles.sign, { backgroundColor: theme.colors.background }]}>
                    <AtlasText variant="micro" color={theme.colors.textMuted}>
                      LOOK FOR
                    </AtlasText>
                    <AtlasText variant="label">“{leg.destinationSign}”</AtlasText>
                  </View>
                ) : null}
                {leg.instructions.map((instruction) => (
                  <AtlasText key={instruction} variant="caption" color={theme.colors.textMuted}>
                    • {instruction}
                  </AtlasText>
                ))}
                <View style={[styles.legFooter, { borderColor: theme.colors.border }]}>
                  <View style={styles.metric}>
                    <Clock3 size={14} color={palette.blue} />
                    <AtlasText variant="caption">
                      {leg.durationMinMinutes}–{leg.durationMaxMinutes} min
                    </AtlasText>
                  </View>
                  <View style={styles.metric}>
                    <Coins size={14} color={palette.teal} />
                    <AtlasText variant="caption">
                      {formatFare(leg.fareMinKobo, leg.fareMaxKobo)}
                    </AtlasText>
                  </View>
                  <View style={styles.metric}>
                    <Footprints size={14} color="#8B5CF6" />
                    <AtlasText variant="caption">
                      {leg.stopCount} segment{leg.stopCount === 1 ? '' : 's'}
                    </AtlasText>
                  </View>
                </View>
              </Card>
            </View>
          ))}
          <Card style={styles.verifyCard}>
            <ShieldCheck size={20} color={mode === 'demo' ? palette.amber : palette.green} />
            <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
              {mode === 'demo'
                ? 'Demo values are simulated. Do not use this screen as live travel guidance.'
                : 'Route data is approved, but fares and conditions can still change. Confirm before boarding.'}
            </AtlasText>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  routeLogo: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 15,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  demoNotice: {
    alignItems: 'center',
    borderColor: 'rgba(245,158,11,0.25)',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  askCard: { gap: spacing.sm },
  askHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  promptInput: {
    borderRadius: radii.md,
    minHeight: 82,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  formCard: { gap: spacing.md },
  locationRow: { flexDirection: 'row', gap: spacing.sm },
  locationRail: { alignItems: 'center', paddingVertical: 17, width: 22 },
  originDot: { backgroundColor: palette.blue, borderRadius: 6, height: 11, width: 11 },
  railLine: { flex: 1, marginVertical: 3, width: 2 },
  locationFields: { flex: 1, gap: spacing.xs },
  field: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  chips: { gap: spacing.xs },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  error: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, padding: spacing.sm },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  alternatives: { gap: spacing.sm, paddingBottom: 3 },
  alternative: { gap: spacing.xs, width: 260 },
  activeAlternative: { borderColor: palette.blue, borderWidth: 1.5, ...shadow },
  alternativeTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  details: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.xs },
  legRow: { flexDirection: 'row', gap: spacing.sm },
  legRail: { alignItems: 'center', width: 30 },
  legNumber: {
    alignItems: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
    zIndex: 2,
  },
  legLine: { flex: 1, width: 2 },
  legCard: { flex: 1, gap: spacing.sm, marginBottom: spacing.sm },
  legHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  busIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  sign: { borderRadius: radii.sm, gap: 2, padding: spacing.sm },
  legFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  verifyCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
