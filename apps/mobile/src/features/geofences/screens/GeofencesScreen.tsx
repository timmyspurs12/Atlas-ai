import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { ArrowLeft, BriefcaseBusiness, Dumbbell, Home, MapPin, Plus, School, ShieldCheck, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { apiRequest } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface Place {
  id: string;
  name: string;
  type: 'HOME' | 'OFFICE' | 'SCHOOL' | 'GYM' | 'CUSTOM';
  radius: number;
  arrivals: boolean;
  departures: boolean;
  subject: string;
}

const iconFor: Record<Place['type'], LucideIcon> = {
  HOME: Home,
  OFFICE: BriefcaseBusiness,
  SCHOOL: School,
  GYM: Dumbbell,
  CUSTOM: MapPin,
};

export function GeofencesScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation();
  const mode = useAppSelector((state) => state.auth.mode);
  const userId = useAppSelector((state) => state.auth.session?.user.id);
  const [places, setPlaces] = useState<Place[]>([
    { id: '1', name: 'Home', type: 'HOME', radius: 180, arrivals: true, departures: true, subject: 'Sarah' },
    { id: '2', name: 'Office', type: 'OFFICE', radius: 250, arrivals: false, departures: true, subject: 'John' },
    { id: '3', name: 'School', type: 'SCHOOL', radius: 200, arrivals: true, departures: true, subject: 'Maya' },
  ]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Place['type']>('CUSTOM');
  const [radius, setRadius] = useState(200);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string, field: 'arrivals' | 'departures'): void => {
    setPlaces((current) => current.map((place) => place.id === id ? { ...place, [field]: !place[field] } : place));
  };

  const save = async (): Promise<void> => {
    if (!name.trim() || !userId) return;
    setSaving(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mode === 'live') {
        await apiRequest('/geofences', {
          method: 'POST',
          body: {
            subjectUserId: userId,
            type,
            name: name.trim(),
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            radiusM: radius,
            notifyOnArrival: true,
            notifyOnDeparture: true,
          },
        });
      }
      setPlaces((current) => [...current, { id: String(Date.now()), name: name.trim(), type, radius, arrivals: true, departures: true, subject: 'Maya' }]);
      setAdding(false);
      setName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={styles.flex}><AtlasText variant="h2">Places</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Arrival and departure alerts</AtlasText></View>
        <IconButton icon={Plus} label="Add a place" onPress={() => setAdding(true)} />
      </View>

      <Card style={styles.consent}>
        <ShieldCheck size={20} color={palette.teal} />
        <View style={styles.flex}><AtlasText variant="label">Consent-aware alerts</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Alerts for another person work only while they explicitly allow precise geofence access.</AtlasText></View>
      </Card>

      <View style={styles.list}>
        {places.map((place) => {
          const Icon = iconFor[place.type];
          return (
            <Card key={place.id} style={styles.placeCard}>
              <View style={styles.placeHeader}>
                <View style={styles.placeIcon}><Icon size={21} color={palette.blue} /></View>
                <View style={styles.flex}><AtlasText variant="h3">{place.name}</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>{place.radius} m radius · watching {place.subject}</AtlasText></View>
                <Pressable><AtlasText variant="label" color={palette.blue}>Edit</AtlasText></Pressable>
              </View>
              <View style={[styles.miniMap, { backgroundColor: theme.dark ? '#101C2A' : '#E8EEF2' }]}>
                <View style={[styles.zoneOuter, { borderColor: `${palette.blue}55`, backgroundColor: `${palette.blue}12` }]}><View style={styles.zonePin}><MapPin size={17} color={palette.white} /></View></View>
                <View style={[styles.road, { backgroundColor: theme.dark ? '#334155' : palette.white }]} />
              </View>
              <View style={[styles.alertRow, { borderColor: theme.colors.border }]}>
                <View style={styles.flex}><AtlasText variant="label">Arrival alerts</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Notify when entering the zone</AtlasText></View>
                <Switch value={place.arrivals} onValueChange={() => toggle(place.id, 'arrivals')} trackColor={{ false: theme.colors.border, true: palette.teal }} />
              </View>
              <View style={styles.alertRow}>
                <View style={styles.flex}><AtlasText variant="label">Departure alerts</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Notify when leaving the zone</AtlasText></View>
                <Switch value={place.departures} onValueChange={() => toggle(place.id, 'departures')} trackColor={{ false: theme.colors.border, true: palette.teal }} />
              </View>
            </Card>
          );
        })}
      </View>
      <Button label="Add another place" icon={Plus} variant="secondary" onPress={() => setAdding(true)} />

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAdding(false)} />
          <View style={[styles.modal, shadow, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}><View style={styles.flex}><AtlasText variant="h2">Add a place</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Uses your current position as the centre.</AtlasText></View><IconButton icon={X} label="Close" onPress={() => setAdding(false)} size={40} /></View>
            <View style={styles.typeRow}>
              {(Object.keys(iconFor) as Place['type'][]).map((item) => {
                const TypeIcon = iconFor[item];
                return <Pressable key={item} onPress={() => setType(item)} style={[styles.typeChoice, { backgroundColor: type === item ? palette.blue : theme.colors.background }]}><TypeIcon size={18} color={type === item ? palette.white : theme.colors.textMuted} /></Pressable>;
              })}
            </View>
            <View style={[styles.nameField, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput value={name} onChangeText={setName} placeholder="Place name" placeholderTextColor={theme.colors.textMuted} style={[typography.body, { color: theme.colors.text, flex: 1 }]} />
            </View>
            <AtlasText variant="micro" color={theme.colors.textMuted}>ZONE RADIUS</AtlasText>
            <View style={styles.radiusRow}>{[100, 200, 500].map((value) => <Pressable key={value} onPress={() => setRadius(value)} style={[styles.radius, { backgroundColor: radius === value ? palette.blue : theme.colors.background, borderColor: radius === value ? palette.blue : theme.colors.border }]}><AtlasText variant="caption" color={radius === value ? palette.white : theme.colors.text}>{value} m</AtlasText></Pressable>)}</View>
            <Button label="Save place" loading={saving} disabled={!name.trim()} onPress={() => void save()} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  consent: { alignItems: 'center', borderColor: 'rgba(20,184,166,0.22)', flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.md },
  placeCard: { gap: spacing.sm },
  placeHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  placeIcon: { alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.1)', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  miniMap: { borderRadius: radii.md, height: 110, overflow: 'hidden' },
  zoneOuter: { alignItems: 'center', borderRadius: 43, borderWidth: 2, height: 86, justifyContent: 'center', left: '39%', position: 'absolute', top: 12, width: 86, zIndex: 2 },
  zonePin: { alignItems: 'center', backgroundColor: palette.blue, borderRadius: 14, height: 30, justifyContent: 'center', width: 30 },
  road: { height: 16, left: -10, position: 'absolute', top: 48, transform: [{ rotate: '-11deg' }], width: '120%' },
  alertRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingTop: spacing.sm },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.65)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modal: { borderRadius: radii.xl, gap: spacing.md, maxWidth: 430, padding: spacing.lg, width: '100%' },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeChoice: { alignItems: 'center', borderRadius: 12, flex: 1, height: 44, justifyContent: 'center' },
  nameField: { borderRadius: radii.md, borderWidth: 1, minHeight: 50, paddingHorizontal: spacing.md, justifyContent: 'center' },
  radiusRow: { flexDirection: 'row', gap: spacing.xs },
  radius: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
});
