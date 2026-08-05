import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface ScreenProps extends ScrollViewProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  contentStyle,
  ...props
}: ScreenProps) {
  const theme = useAtlasTheme();
  const content = [styles.content, padded && styles.padded, contentStyle];
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {scroll ? (
        <ScrollView
          {...props}
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={content}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
});
