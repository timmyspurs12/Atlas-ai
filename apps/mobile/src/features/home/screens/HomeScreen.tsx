import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import {
  Bell,
  Crosshair,
  Layers3,
  MessageCircle,
  Navigation2,
  Radio,
  Share2,
  ShieldAlert,
  Square,
  TrafficCone,
} from 'lucide-react-native';
import { MapSurface } from '@/components/map/MapSurface';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { ShareLocationSheet } from '@/features/location/components/ShareLocationSheet';
import { stopLiveLocationTracking } from '@/features/location/services/location-service';
import { connectRealtime } from '@/features/location/services/realtime-service';
import { useLocationStore } from '@/features/location/store/location-store';
import { SosSheet } from '@/features/safety/components/SosSheet';
import type { RootStackParamList } from '@/navigation/types';
import { apiRequest } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { useUiStore } from '@/shared/store/ui-store';

export function HomeScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const session = useAppSelector((state) => state.auth.session);
  const mode = useAppSelector((state) => state.auth.mode);
  const people = useLocationStore((state) => state.people);
  const selectedPersonId = useLocationStore((state) => state.selectedPersonId);
  const selectPerson = useLocationStore((state) => state.selectPerson);
  const updatePerson = useLocationStore((state) => state.updatePerson);
  const sharingActive = useLocationStore((state) => state.sharingActive);
  const sharingUntil = useLocationStore((state) => state.sharingUntil);
  const stopSharing = useLocationStore((state) => state.stopSharing);
  const satellite = useUiStore((state) => state.satelliteMode);
  const traffic = useUiStore((state) => state.trafficVisible);
  const toggleSatellite = useUiStore((state) => state.toggleSatelliteMode);
  const toggleTraffic = useUiStore((state) => state.toggleTraffic);
  const [shareSheet, setShareSheet] = useState(false);
  const [sosSheet, setSosSheet] = useState(false);
  const [stopping, setStopping] = useState(false);
  const selected = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? people[0],
    [people, selectedPersonId],
  );

  useEffect(() => {
    if (mode === 'live') void connectRealtime();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'demo') return;
    const timer = setInterval(() => {
      const sarah = useLocationStore.getState().people[0];
      if (!sarah) return;
      updatePerson(sarah.id, {
        mapX: Math.min(73, sarah.mapX + 0.45),
        mapY: Math.max(31, sarah.mapY - 0.18),
        updatedAt: new Date().toISOString(),
      });
    }, 4_000);
    return () => clearInterval(timer);
  }, [mode, updatePerson]);

  const confirmStop = (): void => {
    Alert.alert(
      'Stop sharing your location?',
      'Everyone you selected will lose access immediately.',
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop now',
          style: 'destructive',
          onPress: () => void stopNow(),
        },
      ],
    );
  };

  const stopNow = async (): Promise<void> => {
    setStopping(true);
    try {
      if (mode === 'live') {
        await apiRequest('/locations/shares', { method: 'DELETE' });
        await stopLiveLocationTracking();
      }
      stopSharing();
    } finally {
      setStopping(false);
    }
  };

  const expiresLabel = sharingUntil
    ? new Date(sharingUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <MapSurface
        people={people}
        selectedPersonId={selectedPersonId}
        onSelectPerson={selectPerson}
        dark={theme.dark}
        satellite={satellite}
        traffic={traffic}
      />
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={[styles.greeting, shadow, { backgroundColor: theme.colors.mapOverlay, borderColor: theme.colors.border }]}>
            <Avatar name={session?.user.displayName ?? 'Atlas user'} color={palette.blue} size={38} online />
            <View>
              <AtlasText variant="micro" color={theme.colors.textMuted}>GOOD AFTERNOON</AtlasText>
              <AtlasText variant="label">{session?.user.displayName.split(' ')[0] ?? 'Welcome'}</AtlasText>
            </View>
          </View>
          <IconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('Notifications')} />
        </View>

        <View style={styles.statusRow}>
          {sharingActive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop sharing location"
              onPress={confirmStop}
              style={[styles.livePill, shadow, { backgroundColor: theme.colors.mapOverlay }]}
            >
              <View style={styles.liveDot} />
              <View>
                <AtlasText variant="micro" color={palette.green}>SHARING LIVE</AtlasText>
                <AtlasText variant="caption">Until {expiresLabel}</AtlasText>
              </View>
              <Square size={14} fill={palette.red} color={palette.red} />
            </Pressable>
          ) : (
            <Pill label="Location private" dot color={palette.slate500} backgroundColor={theme.colors.mapOverlay} style={shadow} />
          )}
        </View>

        <View style={styles.mapControls} pointerEvents="box-none">
          <IconButton icon={Crosshair} label="Center on my location" onPress={() => undefined} />
          <IconButton icon={Layers3} label="Toggle satellite map" onPress={toggleSatellite} />
          <IconButton icon={TrafficCone} label="Toggle traffic" onPress={toggleTraffic} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open emergency SOS"
          onPress={() => setSosSheet(true)}
          style={({ pressed }) => [styles.sosFab, shadow, { opacity: pressed ? 0.82 : 1 }]}
        >
          <ShieldAlert size={23} color={palette.white} />
          <AtlasText variant="micro" color={palette.white}>SOS</AtlasText>
        </Pressable>

        <View style={styles.bottomArea} pointerEvents="box-none">
          {selected ? (
            <View style={[styles.personCard, shadow, { backgroundColor: theme.colors.mapOverlay, borderColor: theme.colors.border }]}>
              <View style={styles.personTop}>
                <Avatar name={selected.name} color={selected.color} size={50} online={selected.status !== 'stale'} />
                <View style={styles.personCopy}>
                  <View style={styles.nameRow}>
                    <AtlasText variant="h3">{selected.name}</AtlasText>
                    {selected.status === 'moving' ? (
                      <Pill label="LIVE" dot color={palette.green} backgroundColor="rgba(34,197,94,0.12)" />
                    ) : null}
                  </View>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>{selected.statusLabel}</AtlasText>
                </View>
                <IconButton
                  icon={MessageCircle}
                  label={`Message ${selected.firstName}`}
                  onPress={() => navigation.navigate('Chat', { title: selected.name })}
                  size={40}
                />
              </View>
              <View style={[styles.placeRow, { borderColor: theme.colors.border }]}>
                <View style={styles.placeIcon}><Navigation2 size={15} color={palette.blue} /></View>
                <View style={styles.placeCopy}>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>LAST KNOWN AREA</AtlasText>
                  <AtlasText variant="label">{selected.place}</AtlasText>
                </View>
                <View style={styles.eta}>
                  <AtlasText variant="micro" color={theme.colors.textMuted}>ETA TO YOU</AtlasText>
                  <AtlasText variant="label" color={palette.blue}>12 min</AtlasText>
                </View>
              </View>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sharingActive ? 'Manage location sharing' : 'Share my location'}
            onPress={() => setShareSheet(true)}
            style={({ pressed }) => [
              styles.shareButton,
              shadow,
              { backgroundColor: sharingActive ? theme.colors.surface : palette.blue, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            {sharingActive ? <Radio size={20} color={palette.blue} /> : <Share2 size={20} color={palette.white} />}
            <AtlasText variant="label" color={sharingActive ? theme.colors.text : palette.white}>
              {sharingActive ? (stopping ? 'Stopping…' : 'Manage sharing') : 'Share my location'}
            </AtlasText>
          </Pressable>
        </View>
      </SafeAreaView>
      <ShareLocationSheet visible={shareSheet} onClose={() => setShareSheet(false)} />
      <SosSheet visible={sosSheet} onClose={() => setSosSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  greeting: { alignItems: 'center', borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  statusRow: { left: spacing.md, position: 'absolute', top: 84 },
  livePill: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  liveDot: { backgroundColor: palette.green, borderRadius: 6, height: 10, width: 10 },
  mapControls: { gap: spacing.xs, position: 'absolute', right: spacing.md, top: 114 },
  sosFab: { alignItems: 'center', backgroundColor: palette.red, borderRadius: 18, gap: 1, justifyContent: 'center', minHeight: 58, position: 'absolute', right: spacing.md, top: 278, width: 58 },
  bottomArea: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.sm },
  personCard: { borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: spacing.md },
  personTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  personCopy: { flex: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  placeRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm },
  placeIcon: { alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.1)', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  placeCopy: { flex: 1 },
  eta: { alignItems: 'flex-end' },
  shareButton: { alignItems: 'center', borderRadius: radii.lg, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.lg },
});
