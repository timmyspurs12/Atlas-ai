import { Text, type TextProps, type TextStyle } from 'react-native';
import { typography } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

type Variant = keyof typeof typography;

interface AtlasTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function AtlasText({ variant = 'body', color, align, style, ...props }: AtlasTextProps) {
  const theme = useAtlasTheme();
  return (
    <Text
      {...props}
      style={[typography[variant], { color: color ?? theme.colors.text, textAlign: align }, style]}
    />
  );
}
