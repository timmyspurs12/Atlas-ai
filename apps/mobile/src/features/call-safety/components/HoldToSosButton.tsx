import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ShieldAlert } from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { palette, radii, spacing } from '@/shared/config/theme';
import { evaluateSosHold, SOS_HOLD_DURATION_MS } from '../services/sos-hold-policy';

interface HoldToSosButtonProps {
  disabled?: boolean;
  onComplete: () => void;
}

const initialState = evaluateSosHold(0, 0);

export function HoldToSosButton({ disabled = false, onComplete }: HoldToSosButtonProps) {
  const [hold, setHold] = useState(initialState);
  const [holding, setHolding] = useState(false);
  const startedAt = useRef(0);
  const active = useRef(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback((): void => {
    if (interval.current) clearInterval(interval.current);
    if (timeout.current) clearTimeout(timeout.current);
    if (resetTimeout.current) clearTimeout(resetTimeout.current);
    interval.current = null;
    timeout.current = null;
    resetTimeout.current = null;
  }, []);

  const cancelHold = useCallback((): void => {
    if (!active.current) return;
    active.current = false;
    clearTimers();
    setHolding(false);
    setHold(initialState);
  }, [clearTimers]);

  const completeHold = useCallback((): void => {
    if (!active.current || disabled) return;
    active.current = false;
    clearTimers();
    setHolding(false);
    setHold({ progress: 1, remainingSeconds: 0, complete: true });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onComplete();
    resetTimeout.current = setTimeout(() => setHold(initialState), 350);
  }, [clearTimers, disabled, onComplete]);

  const startHold = useCallback((): void => {
    if (disabled || active.current) return;
    clearTimers();
    active.current = true;
    startedAt.current = Date.now();
    setHolding(true);
    setHold(evaluateSosHold(startedAt.current, startedAt.current));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    interval.current = setInterval(() => {
      const next = evaluateSosHold(startedAt.current, Date.now());
      setHold(next);
      if (next.complete) completeHold();
    }, 50);
    timeout.current = setTimeout(completeHold, SOS_HOLD_DURATION_MS);
  }, [clearTimers, completeHold, disabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelHold();
    });
    return () => {
      subscription.remove();
      active.current = false;
      clearTimers();
    };
  }, [cancelHold, clearTimers]);

  useEffect(() => {
    if (disabled) cancelHold();
  }, [cancelHold, disabled]);

  const percent = Math.round(hold.progress * 100);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Emergency SOS"
      accessibilityHint="Press and hold for three seconds, then confirm before Atlas sends an SOS."
      accessibilityState={{ disabled, busy: holding }}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      accessibilityActions={[{ name: 'activate', label: 'Open SOS confirmation' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !disabled) onComplete();
      }}
      disabled={disabled}
      onPressIn={startHold}
      onPressOut={cancelHold}
      testID="stay-with-me-hold-to-sos"
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.45 : pressed || holding ? 0.92 : 1 },
      ]}
    >
      <View style={[styles.progress, { width: `${percent}%` }]} />
      <View style={styles.content}>
        <ShieldAlert size={21} color={palette.white} />
        <View style={styles.copy} accessibilityLiveRegion="polite">
          <AtlasText variant="label" color={palette.white}>
            {holding
              ? `Keep holding… ${hold.remainingSeconds}s`
              : hold.complete
                ? 'SOS ready — confirm'
                : 'Hold 3 seconds for SOS'}
          </AtlasText>
          <AtlasText variant="micro" color="rgba(255,255,255,0.82)">
            Release early to cancel
          </AtlasText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#991B1B',
    borderColor: palette.red,
    borderRadius: radii.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 66,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
  },
  progress: {
    alignSelf: 'flex-start',
    backgroundColor: palette.red,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  copy: { alignItems: 'center' },
});
