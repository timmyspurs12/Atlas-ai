import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  ArrowLeft,
  BellRing,
  CheckCheck,
  MapPinCheck,
  MessageCircle,
  ShieldAlert,
  UserPlus,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { palette, spacing } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

const initial = [
  {
    id: '1',
    title: 'Sarah arrived at Home',
    body: 'Arrival detected at 3:42 PM.',
    time: '2m',
    type: 'arrival',
    unread: true,
  },
  {
    id: '2',
    title: 'New message from John',
    body: 'I’m leaving the office now.',
    time: '18m',
    type: 'chat',
    unread: true,
  },
  {
    id: '3',
    title: 'Location sharing started',
    body: 'Leo is sharing with you for 24 hours.',
    time: '1h',
    type: 'share',
    unread: false,
  },
  {
    id: '4',
    title: 'Friend request',
    body: 'Amara wants to join your trusted circle.',
    time: 'Yesterday',
    type: 'friend',
    unread: false,
  },
];

export function NotificationsScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation();
  const [items, setItems] = useState(initial);
  const icon = (type: string) =>
    type === 'arrival'
      ? MapPinCheck
      : type === 'chat'
        ? MessageCircle
        : type === 'friend'
          ? UserPlus
          : BellRing;
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={styles.flex}>
          <AtlasText variant="h2">Notifications</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            {items.filter((item) => item.unread).length} unread
          </AtlasText>
        </View>
        <IconButton
          icon={CheckCheck}
          label="Mark all as read"
          onPress={() => setItems((current) => current.map((item) => ({ ...item, unread: false })))}
        />
      </View>
      <View style={styles.list}>
        {items.map((item) => {
          const Icon = icon(item.type);
          return (
            <Pressable
              key={item.id}
              onPress={() =>
                setItems((current) =>
                  current.map((candidate) =>
                    candidate.id === item.id ? { ...candidate, unread: false } : candidate,
                  ),
                )
              }
            >
              <Card style={styles.row}>
                <View
                  style={[
                    styles.icon,
                    {
                      backgroundColor:
                        item.type === 'arrival' ? 'rgba(20,184,166,0.12)' : 'rgba(37,99,235,0.1)',
                    },
                  ]}
                >
                  <Icon size={20} color={item.type === 'arrival' ? palette.teal : palette.blue} />
                </View>
                <View style={styles.flex}>
                  <AtlasText variant="label">{item.title}</AtlasText>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>
                    {item.body}
                  </AtlasText>
                  <AtlasText variant="micro" color={theme.colors.textMuted} style={styles.time}>
                    {item.time.toUpperCase()}
                  </AtlasText>
                </View>
                {item.unread ? <View style={styles.unread} /> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>
      <Card style={styles.safetyNote}>
        <ShieldAlert size={18} color={palette.red} />
        <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
          SOS alerts bypass quiet hours when enabled for a verified emergency contact.
        </AtlasText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  time: { marginTop: 5 },
  unread: { backgroundColor: palette.blue, borderRadius: 5, height: 9, marginTop: 7, width: 9 },
  safetyNote: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
