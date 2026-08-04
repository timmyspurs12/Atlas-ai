import { Image, StyleSheet, View } from 'react-native';
import { AtlasText } from './AtlasText';
import { palette } from '@/shared/config/theme';

interface AvatarProps {
  name: string;
  uri?: string | null;
  color?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
}

export function Avatar({
  name,
  uri,
  color = palette.blue,
  size = 44,
  online,
  ring = false,
}: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View
      accessibilityLabel={`${name}${online ? ', online' : ''}`}
      style={[
        styles.frame,
        {
          height: size,
          width: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: ring ? 3 : 0,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ height: '100%', width: '100%', borderRadius: size / 2 }} />
      ) : (
        <AtlasText
          variant={size > 48 ? 'h3' : 'label'}
          color={palette.white}
          style={{ fontSize: size * 0.32 }}
        >
          {initials}
        </AtlasText>
      )}
      {online !== undefined ? (
        <View
          style={[
            styles.status,
            {
              backgroundColor: online ? palette.green : palette.slate400,
              borderRadius: size * 0.1,
              height: size * 0.2,
              width: size * 0.2,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.94)',
    justifyContent: 'center',
    position: 'relative',
  },
  status: {
    borderColor: palette.white,
    borderWidth: 2,
    bottom: 0,
    position: 'absolute',
    right: 0,
  },
});
