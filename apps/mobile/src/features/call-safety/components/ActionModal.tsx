import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { palette, radii, shadow, spacing } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface ConfirmationProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationModal({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmationProps) {
  const theme = useAtlasTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close confirmation"
          style={StyleSheet.absoluteFill}
          onPress={loading ? undefined : onCancel}
        />
        <View style={[styles.card, shadow, { backgroundColor: theme.colors.surface }]}>
          <View
            style={[
              styles.icon,
              { backgroundColor: danger ? 'rgba(239,68,68,0.12)' : 'rgba(37,99,235,0.12)' },
            ]}
          >
            <ShieldAlert size={27} color={danger ? palette.red : palette.blue} />
          </View>
          <AtlasText variant="h2" align="center">
            {title}
          </AtlasText>
          <AtlasText color={theme.colors.textMuted} align="center">
            {message}
          </AtlasText>
          <View style={styles.buttons}>
            <Button label={cancelLabel} variant="secondary" disabled={loading} onPress={onCancel} />
            <Button
              label={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              loading={loading}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ResultProps {
  visible: boolean;
  success: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function ActionResultModal({ visible, success, title, message, onClose }: ResultProps) {
  const theme = useAtlasTheme();
  const ResultIcon = success ? CheckCircle2 : XCircle;
  const color = success ? palette.green : palette.red;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, shadow, { backgroundColor: theme.colors.surface }]}>
          <ResultIcon size={48} color={color} />
          <AtlasText variant="h2" align="center">
            {title}
          </AtlasText>
          <AtlasText color={theme.colors.textMuted} align="center">
            {message}
          </AtlasText>
          <Button label="OK" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    alignItems: 'center',
    borderRadius: radii.xl,
    gap: spacing.md,
    maxWidth: 430,
    padding: spacing.xl,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  buttons: { gap: spacing.sm, width: '100%' },
});
