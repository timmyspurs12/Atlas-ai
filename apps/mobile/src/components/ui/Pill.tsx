import { StyleSheet, View, type ViewStyle } from 'react-native';
import { AtlasText } from './AtlasText';
import { radii, spacing } from '@/shared/config/theme';

interface PillProps {
  label: string;
  color: string;
  backgroundColor: string;
  dot?: boolean;
  style?: ViewStyle;
}

export function Pill({ label, color, backgroundColor, dot = false, style }: PillProps) {
  return (
    <View style={[styles.base, { backgroundColor }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <AtlasText variant="caption" color={color}>
        {label}
      </AtlasText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
  },
  dot: { borderRadius: 4, height: 7, width: 7 },
});
