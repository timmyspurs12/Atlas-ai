import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, ShieldAlert, X } from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { apiRequest, AtlasApiError } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface SosSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SosSheet({ visible, onClose }: SosSheetProps) {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const progress = useSharedValue(0);
  const [status, setStatus] = useState<'ready' | 'sending' | 'sent'>('ready');
  const [error, setError] = useState<string | null>(null);
  const progressStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  const trigger = async (): Promise<void> => {
    if (status !== 'ready') return;
    setStatus('sending');
    setError(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      if (mode === 'demo') {
        await new Promise((resolve) => setTimeout(resolve, 700));
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Location permission is needed to send an SOS location.');
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await apiRequest('/safety/sos', {
          method: 'POST',
          body: {
            clientRequestId: Crypto.randomUUID(),
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            accuracyM: current.coords.accuracy ?? 0,
            message: 'I may need help. Please check in with me.',
          },
        });
      }
      setStatus('sent');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setStatus('ready');
      setError(
        caught instanceof AtlasApiError || caught instanceof Error
          ? caught.message
          : 'The SOS could not be sent. Call local emergency services if you are in danger.',
      );
    }
  };

  const hold = Gesture.LongPress()
    .minDuration(3_000)
    .maxDistance(30)
    .onBegin(() => {
      progress.value = withTiming(1, { duration: 3_000 });
    })
    .onStart(() => {
      runOnJS(trigger)();
    })
    .onFinalize((_event, success) => {
      if (!success) cancelAnimation(progress);
      progress.value = withSpring(0);
    });

  const close = (): void => {
    setStatus('ready');
    setError(null);
    progress.value = 0;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, shadow, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <View style={styles.alertIcon}><ShieldAlert size={25} color={palette.red} /></View>
            <View style={styles.headerCopy}>
              <AtlasText variant="h2">Emergency SOS</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted}>Deliberate hold prevents accidental alerts.</AtlasText>
            </View>
            <IconButton icon={X} label="Close SOS" onPress={close} size={40} />
          </View>

          {status === 'sent' ? (
            <View style={styles.sentContent}>
              <View style={styles.sentIcon}><Check size={34} color={palette.white} strokeWidth={3} /></View>
              <AtlasText variant="h2" align="center">Your SOS was sent</AtlasText>
              <AtlasText align="center" color={theme.colors.textMuted}>
                Verified emergency contacts received your safety alert and time-limited location link.
              </AtlasText>
              <Button label="I’m safe — close alert" onPress={close} />
            </View>
          ) : (
            <>
              <View style={[styles.notice, { backgroundColor: theme.colors.background }]}>
                <AtlasText variant="label">This will immediately:</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>• Notify your verified emergency contacts</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>• Share a 24-hour safety link with your current location</AtlasText>
                <AtlasText variant="caption" color={theme.colors.textMuted}>• Send push, SMS, or email based on your settings</AtlasText>
              </View>
              <GestureDetector gesture={hold}>
                <Animated.View
                  accessibilityRole="button"
                  accessibilityLabel="Hold for three seconds to send SOS"
                  accessibilityHint="Keep holding until the progress bar is complete"
                  style={[styles.holdButton, { opacity: status === 'sending' ? 0.7 : 1 }]}
                >
                  <Animated.View style={[styles.progress, progressStyle]} />
                  <ShieldAlert color={palette.white} size={26} />
                  <View>
                    <AtlasText variant="h3" color={palette.white}>Hold for 3 seconds</AtlasText>
                    <AtlasText variant="caption" color="#FECACA">Release to cancel</AtlasText>
                  </View>
                </Animated.View>
              </GestureDetector>
              {status === 'sending' ? <AtlasText align="center">Sending encrypted alert…</AtlasText> : null}
              {error ? <AtlasText variant="caption" color={palette.red} align="center">{error}</AtlasText> : null}
              <AtlasText variant="caption" color={theme.colors.textMuted} align="center">
                Atlas AI does not replace emergency services. If danger is immediate, contact your local emergency number.
              </AtlasText>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.7)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radii.xl, gap: spacing.lg, maxWidth: 440, padding: spacing.lg, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  alertIcon: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 15, height: 46, justifyContent: 'center', width: 46 },
  headerCopy: { flex: 1 },
  notice: { borderRadius: radii.md, gap: spacing.xs, padding: spacing.md },
  holdButton: { alignItems: 'center', backgroundColor: palette.red, borderRadius: radii.lg, flexDirection: 'row', gap: spacing.md, minHeight: 78, overflow: 'hidden', paddingHorizontal: spacing.lg },
  progress: { backgroundColor: 'rgba(127,29,29,0.55)', bottom: 0, left: 0, position: 'absolute', top: 0, transformOrigin: 'left', width: '100%' },
  sentContent: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  sentIcon: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 34, height: 68, justifyContent: 'center', width: 68 },
});
