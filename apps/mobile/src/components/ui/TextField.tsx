import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { AtlasText } from './AtlasText';
import { radii, spacing, typography } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: LucideIcon;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, icon: Icon, secureTextEntry, style, ...props },
  ref,
) {
  const theme = useAtlasTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.wrapper}>
      <AtlasText variant="label" style={styles.label}>
        {label}
      </AtlasText>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.primary
                : theme.colors.border,
          },
        ]}
      >
        {Icon ? <Icon color={theme.colors.textMuted} size={19} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.primary}
          {...props}
          secureTextEntry={Boolean(secureTextEntry && !revealed)}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          style={[styles.input, typography.body, { color: theme.colors.text }, style]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setRevealed((value) => !value)}
          >
            {revealed ? (
              <EyeOff size={19} color={theme.colors.textMuted} />
            ) : (
              <Eye size={19} color={theme.colors.textMuted} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AtlasText variant="caption" color={theme.colors.danger}>
          {error}
        </AtlasText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { marginLeft: 2 },
  field: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.2,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 50, paddingVertical: 0 },
});
