import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { radii, shadow } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  style?: ViewStyle;
  danger?: boolean;
  disabled?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 44,
  iconSize = 20,
  style,
  danger = false,
  disabled = false,
}: IconButtonProps) {
  const theme = useAtlasTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        shadow,
        {
          height: size,
          width: size,
          borderRadius: radii.md,
          backgroundColor: theme.colors.mapOverlay,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      <Icon
        color={danger ? theme.colors.danger : theme.colors.text}
        size={iconSize}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});
