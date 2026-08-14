import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  ArrowLeft,
  BellRing,
  CheckCheck,
  MapPinCheck,
  MessageCircle,
  PhoneCall,
  ShieldAlert,
  UserPlus,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import type { RootStackParamList } from '@/navigation/types';
import { palette, spacing } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { parseCallSafetyInvitationRoute } from '../services/notification-routing';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushNotifications,
  unregisterPushNotifications,
  type AtlasNotification,
} from '../services/notification-service';

const demoNotifications: AtlasNotification[] = [
  {
    id: '1',
    actorId: null,
    title: 'Sarah arrived at Home',
    body: 'Arrival detected at 3:42 PM.',
    type: 'ARRIVAL',
    data: null,
    readAt: null,
    deliveredAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  },
  {
    id: '2',
    actorId: null,
    title: 'New message from John',
    body: 'You received an encrypted message.',
    type: 'CHAT',
    data: null,
    readAt: null,
    deliveredAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
];

export function NotificationsScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const mode = useAppSelector((state) => state.auth.mode);
  const [items, setItems] = useState<AtlasNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'demo') {
        setItems(demoNotifications);
      } else {
        const response = await listNotifications();
        setItems(response.data);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const refreshPushStatus = useCallback(async (): Promise<void> => {
    if (mode !== 'live' || Platform.OS === 'web') return;
    try {
      const result = await registerPushNotifications(false);
      setPushEnabled(result.status === 'REGISTERED');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Push status could not be refreshed.');
    }
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshPushStatus();
    }, [load, refreshPushStatus]),
  );

  const open = async (item: AtlasNotification): Promise<void> => {
    setError(null);
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, readAt: new Date().toISOString() } : candidate,
      ),
    );
    if (mode === 'live' && !item.readAt) {
      try {
        await markNotificationRead(item.id);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Notification could not be marked read.',
        );
      }
    }
    const invitation = parseCallSafetyInvitationRoute(item.data);
    if (invitation) {
      navigation.navigate('StayWithMe', { invitationId: invitation.invitationId });
    }
  };

  const markAll = async (): Promise<void> => {
    setMarkingAll(true);
    setError(null);
    try {
      if (mode === 'live') await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Notifications could not be marked read.',
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const togglePush = async (): Promise<void> => {
    setPushLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (pushEnabled) {
        await unregisterPushNotifications();
        setPushEnabled(false);
        setMessage('Push invitations are disabled on this device.');
      } else {
        const result = await registerPushNotifications(true);
        if (result.status === 'REGISTERED') {
          setPushEnabled(true);
          setMessage(result.message);
        } else {
          setError(result.message);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Push settings could not be updated.');
    } finally {
      setPushLoading(false);
    }
  };

  const unread = items.filter((item) => !item.readAt).length;
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={styles.flex}>
          <AtlasText variant="h2">Notifications</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            {unread} unread
          </AtlasText>
        </View>
        <IconButton
          icon={CheckCheck}
          label="Mark all as read"
          disabled={markingAll || unread === 0}
          onPress={() => void markAll()}
        />
      </View>

      {mode === 'live' && Platform.OS !== 'web' ? (
        <Card style={styles.pushCard}>
          <BellRing size={20} color={palette.blue} />
          <View style={styles.flex}>
            <AtlasText variant="label">Push invitations</AtlasText>
            <AtlasText variant="caption" color={theme.colors.textMuted}>
              Optional. The lock-screen message contains no invitation token or location.
            </AtlasText>
          </View>
          <Button
            label={pushEnabled ? 'Disable' : 'Enable'}
            variant={pushEnabled ? 'secondary' : 'primary'}
            fullWidth={false}
            loading={pushLoading}
            onPress={() => void togglePush()}
          />
        </Card>
      ) : null}

      {message ? (
        <Card style={styles.successCard}>
          <AtlasText variant="caption" color={palette.green}>
            {message}
          </AtlasText>
        </Card>
      ) : null}
      {error ? (
        <Card style={styles.errorCard}>
          <AtlasText variant="caption" color={palette.red}>
            {error}
          </AtlasText>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Loading notifications…
          </AtlasText>
        </View>
      ) : items.length === 0 ? (
        <Card style={styles.emptyCard}>
          <BellRing size={24} color={theme.colors.textMuted} />
          <AtlasText variant="label">No notifications yet</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted} align="center">
            Stay With Me requests and other account activity will appear here.
          </AtlasText>
        </Card>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const Icon = notificationIcon(item.type);
            const callSafety = item.type === 'CALL_SAFETY_INVITATION';
            return (
              <Pressable key={item.id} onPress={() => void open(item)}>
                <Card style={styles.row}>
                  <View
                    style={[
                      styles.icon,
                      {
                        backgroundColor:
                          item.type === 'ARRIVAL'
                            ? 'rgba(20,184,166,0.12)'
                            : callSafety
                              ? 'rgba(245,158,11,0.12)'
                              : 'rgba(37,99,235,0.1)',
                      },
                    ]}
                  >
                    <Icon
                      size={20}
                      color={
                        item.type === 'ARRIVAL'
                          ? palette.teal
                          : callSafety
                            ? palette.amber
                            : palette.blue
                      }
                    />
                  </View>
                  <View style={styles.flex}>
                    <AtlasText variant="label">{item.title}</AtlasText>
                    <AtlasText variant="caption" color={theme.colors.textMuted}>
                      {item.body}
                    </AtlasText>
                    <AtlasText variant="micro" color={theme.colors.textMuted} style={styles.time}>
                      {relativeTime(item.createdAt)}
                    </AtlasText>
                  </View>
                  {!item.readAt ? <View style={styles.unread} /> : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      <Card style={styles.safetyNote}>
        <ShieldAlert size={18} color={palette.red} />
        <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
          SOS alerts bypass quiet hours when enabled for a verified emergency contact.
        </AtlasText>
      </Card>
    </Screen>
  );
}

function notificationIcon(type: string) {
  if (type === 'ARRIVAL' || type === 'DEPARTURE') return MapPinCheck;
  if (type === 'CHAT') return MessageCircle;
  if (type === 'FRIEND_REQUEST' || type === 'FRIEND_ACCEPTED') return UserPlus;
  if (type === 'CALL_SAFETY_INVITATION') return PhoneCall;
  return BellRing;
}

function relativeTime(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(createdAt));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'NOW';
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
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
  pushCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  successCard: { borderColor: 'rgba(34,197,94,0.25)' },
  errorCard: { borderColor: 'rgba(239,68,68,0.25)' },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  safetyNote: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
