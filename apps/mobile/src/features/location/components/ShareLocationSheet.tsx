import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { Check, Clock3, LocateFixed, ShieldCheck, X } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { apiRequest, AtlasApiError } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { useAppSelector } from '@/shared/hooks/redux';
import {
  requestBackgroundLocationConsent,
  requestLocationConsent,
  startLiveLocationTracking,
} from '../services/location-service';
import { connectRealtime } from '../services/realtime-service';
import { useLocationStore } from '../store/location-store';

interface ShareLocationSheetProps {
  visible: boolean;
  onClose: () => void;
}

const durations = [
  { label: '1 hour', minutes: 60 },
  { label: 'Until tonight', minutes: 8 * 60 },
  { label: '24 hours', minutes: 24 * 60 },
] as const;

export function ShareLocationSheet({ visible, onClose }: ShareLocationSheetProps) {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const people = useLocationStore((state) => state.people);
  const startSharing = useLocationStore((state) => state.startSharing);
  const [selected, setSelected] = useState<string[]>(people.slice(0, 2).map((person) => person.id));
  const [duration, setDuration] = useState(60);
  const [precise, setPrecise] = useState(true);
  const [allowGeofences, setAllowGeofences] = useState(false);
  const [background, setBackground] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedLabel = useMemo(
    () => durations.find((option) => option.minutes === duration)?.label ?? 'Custom',
    [duration],
  );

  const togglePerson = (id: string): void => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const begin = async (): Promise<void> => {
    if (selected.length === 0) {
      setError('Choose at least one trusted contact.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === 'demo') {
        await new Promise((resolve) => setTimeout(resolve, 450));
      } else {
        if (!(await requestLocationConsent())) {
          throw new Error('Location permission was not granted. Sharing remains off.');
        }
        if (background) await requestBackgroundLocationConsent();
        await apiRequest('/locations/shares', {
          method: 'POST',
          body: {
            recipientIds: selected,
            durationMinutes: duration,
            precision: precise ? 'PRECISE' : 'APPROXIMATE',
            shareBattery: true,
            shareSpeed: true,
            allowGeofences,
          },
        });
        await connectRealtime();
        try {
          await startLiveLocationTracking();
        } catch (trackingError) {
          await apiRequest('/locations/shares', { method: 'DELETE' });
          throw trackingError;
        }
      }
      startSharing(duration);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof AtlasApiError || caught instanceof Error
          ? caught.message
          : 'Location sharing could not start.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(180)}
          style={[styles.sheet, shadow, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <AtlasText variant="h2">Share my location</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted}>
                Only the people you choose can see it.
              </AtlasText>
            </View>
            <IconButton icon={X} label="Close sharing sheet" onPress={onClose} size={40} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <AtlasText variant="micro" color={theme.colors.textMuted}>
              SHARE WITH
            </AtlasText>
            <View style={styles.peopleRow}>
              {people.map((person) => {
                const checked = selected.includes(person.id);
                return (
                  <Pressable
                    key={person.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    onPress={() => togglePerson(person.id)}
                    style={styles.personChoice}
                  >
                    <View>
                      <Avatar name={person.name} color={person.color} size={52} />
                      <View
                        style={[
                          styles.check,
                          {
                            backgroundColor: checked ? palette.blue : theme.colors.surface,
                            borderColor: checked ? palette.blue : theme.colors.border,
                          },
                        ]}
                      >
                        {checked ? <Check size={12} color={palette.white} strokeWidth={3} /> : null}
                      </View>
                    </View>
                    <AtlasText variant="caption" numberOfLines={1}>
                      {person.firstName}
                    </AtlasText>
                  </Pressable>
                );
              })}
            </View>

            <AtlasText variant="micro" color={theme.colors.textMuted}>
              DURATION
            </AtlasText>
            <View style={styles.segmentRow}>
              {durations.map((option) => {
                const active = option.minutes === duration;
                return (
                  <Pressable
                    key={option.minutes}
                    onPress={() => setDuration(option.minutes)}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: active ? palette.blue : theme.colors.background,
                        borderColor: active ? palette.blue : theme.colors.border,
                      },
                    ]}
                  >
                    <AtlasText variant="caption" color={active ? palette.white : theme.colors.text}>
                      {option.label}
                    </AtlasText>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.optionCard, { borderColor: theme.colors.border }]}>
              <View style={styles.optionIcon}>
                <LocateFixed size={18} color={palette.blue} />
              </View>
              <View style={styles.optionCopy}>
                <AtlasText variant="label">Precise location</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  Turn off to share an intentionally blurred area.
                </AtlasText>
              </View>
              <Switch
                accessibilityLabel="Share precise location"
                value={precise}
                onValueChange={setPrecise}
                trackColor={{ false: theme.colors.border, true: palette.blue }}
              />
            </View>
            <View style={[styles.optionCard, { borderColor: theme.colors.border }]}>
              <View style={styles.optionIcon}>
                <Clock3 size={18} color={palette.teal} />
              </View>
              <View style={styles.optionCopy}>
                <AtlasText variant="label">Continue in background</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  Optional. Your phone will show an active indicator.
                </AtlasText>
              </View>
              <Switch
                accessibilityLabel="Continue sharing in background"
                value={background}
                onValueChange={setBackground}
                trackColor={{ false: theme.colors.border, true: palette.teal }}
              />
            </View>
            <View style={[styles.optionCard, { borderColor: theme.colors.border }]}>
              <View style={styles.optionIcon}>
                <ShieldCheck size={18} color={palette.teal} />
              </View>
              <View style={styles.optionCopy}>
                <AtlasText variant="label">Allow place alerts</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  Let these contacts create arrival or departure alerts during this share.
                </AtlasText>
              </View>
              <Switch
                accessibilityLabel="Allow geofence alerts"
                value={allowGeofences}
                onValueChange={setAllowGeofences}
                trackColor={{ false: theme.colors.border, true: palette.teal }}
              />
            </View>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <AtlasText variant="caption" color={palette.red}>
                  {error}
                </AtlasText>
              </View>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { borderColor: theme.colors.border }]}>
            <View style={styles.footerMeta}>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                AUTO-STOPS
              </AtlasText>
              <AtlasText variant="label">{selectedLabel}</AtlasText>
            </View>
            <Button
              fullWidth={false}
              label="Start sharing"
              loading={loading}
              onPress={() => void begin()}
              style={styles.startButton}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(2,6,23,0.58)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '91%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: palette.slate400,
    borderRadius: 3,
    height: 4,
    opacity: 0.45,
    width: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  scrollContent: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  peopleRow: { flexDirection: 'row', gap: spacing.lg },
  personChoice: { alignItems: 'center', gap: 6, width: 58 },
  check: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 2,
    bottom: -2,
    height: 19,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 19,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.xs },
  segment: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 43,
    paddingHorizontal: 4,
  },
  optionCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  optionCopy: { flex: 1 },
  error: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, padding: spacing.sm },
  footer: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  footerMeta: { flex: 1 },
  startButton: { minWidth: 160 },
});
