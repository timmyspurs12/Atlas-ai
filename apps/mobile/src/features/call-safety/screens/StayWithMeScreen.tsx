import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ExpoLinking from 'expo-linking';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Clock3,
  MapPin,
  PhoneCall,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import type { RootStackParamList } from '@/navigation/types';
import { apiRequest, AtlasApiError } from '@/shared/api/api-client';
import { palette, radii, spacing } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import {
  acceptCallSafetyInvitation,
  createCallSafetySession,
  declineCallSafetyInvitation,
  endCallSafetySession,
  escalateCallSafetySos,
  getCallSafetySession,
  grantCallSafetyConsent,
  listCallSafetySessions,
  purgeCallSafetyLocation,
  revokeCallSafetyConsent,
  sendCallSafetyLocation,
  type CallSafetySession,
} from '../services/call-safety-api';
import {
  connectCallSafetyRealtime,
  disconnectCallSafetyRealtime,
  joinCallSafetySession,
} from '../services/call-safety-realtime';

type Props = NativeStackScreenProps<RootStackParamList, 'StayWithMe'>;
interface FriendItem {
  id: string;
  friend: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isOnline: boolean;
  };
}

export function StayWithMeScreen({ navigation, route }: Props) {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const currentUserId = useAppSelector((state) => state.auth.session?.user.id ?? null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [precise, setPrecise] = useState(true);
  const [current, setCurrent] = useState<CallSafetySession | null>(null);
  const [remoteLocation, setRemoteLocation] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvitationLink, setCreatedInvitationLink] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<
    'consent' | 'dialer' | 'sos' | 'purge' | 'stop' | 'end' | null
  >(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const sequence = useRef(0);
  const rawInvitationToken = route.params?.invitationToken;
  const invitationToken =
    rawInvitationToken && rawInvitationToken !== 'undefined' ? rawInvitationToken : undefined;

  const remainingMinutes = useMemo(() => {
    if (!current) return null;
    return Math.max(0, Math.ceil((new Date(current.expiresAt).getTime() - Date.now()) / 60_000));
  }, [current]);

  const refresh = async (sessionId?: string): Promise<CallSafetySession | null> => {
    if (mode === 'demo') return null;
    const sessions = await listCallSafetySessions();
    const id = sessionId ?? current?.id ?? sessions[0]?.id;
    if (!id) return null;
    const updated = await getCallSafetySession(id);
    setCurrent(updated);
    return updated;
  };

  useEffect(() => {
    if (mode === 'demo') {
      const demoFriends: FriendItem[] = [
        {
          id: 'demo',
          friend: {
            id: '77bf481a-2060-4e3b-96f0-d8fb50f70b73',
            displayName: 'Sarah Chen',
            avatarUrl: null,
            isOnline: true,
          },
        },
      ];
      setFriends(demoFriends);
      setSelectedUserId(demoFriends[0]?.friend.id ?? null);
      return;
    }
    void apiRequest<{ friends: FriendItem[] }>('/friends').then((result) => {
      setFriends(result.friends);
      setSelectedUserId(result.friends[0]?.friend.id ?? null);
    });
    void connectCallSafetyRealtime({
      onLocation: setRemoteLocation,
      onSessionChanged: () =>
        void refresh().then((updated) => {
          const ownConsent = updated?.participants.find(
            (participant) => participant.userId === currentUserId,
          )?.consent;
          if (updated?.status === 'ACTIVE' && ownConsent?.status === 'ACTIVE') {
            void startTracking(updated.id);
          }
        }),
    });
    void refresh();
    return () => {
      disconnectCallSafetyRealtime();
      locationSubscription.current?.remove();
    };
  }, [mode]);

  const create = async (): Promise<void> => {
    if (!selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'demo') {
        Alert.alert('Demo invitation created', 'No real location is shared in demo mode.');
        return;
      }
      const result = await createCallSafetySession({
        invitedUserId: selectedUserId,
        durationMinutes: duration,
      });
      await refresh(result.sessionId);
      if (!result.invitationToken) {
        throw new Error('The server did not return a valid invitation token.');
      }
      const link = ExpoLinking.createURL(
        `stay-with-me/invite/${encodeURIComponent(result.invitationToken)}`,
      );
      setCreatedInvitationLink(link);
      try {
        await Share.share({
          message: `Stay With Me invitation from Atlas AI. Open this private, expiring link: ${link}`,
        });
      } catch {
        // The selectable link remains visible when Web Share is unavailable.
      }
    } catch (caught) {
      setError(
        caught instanceof AtlasApiError ? caught.message : 'Invitation could not be created.',
      );
    } finally {
      setLoading(false);
    }
  };

  const respond = async (accept: boolean): Promise<void> => {
    if (!invitationToken) return;
    setLoading(true);
    try {
      if (accept) {
        const result = await acceptCallSafetyInvitation(invitationToken);
        await refresh(result.sessionId);
      } else {
        await declineCallSafetyInvitation(invitationToken);
        navigation.goBack();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation response failed.');
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (
    action: NonNullable<typeof currentAction>,
    operation: () => Promise<void>,
    successMessage: string,
  ): Promise<void> => {
    const startedAt = Date.now();
    setCurrentAction(action);
    setError(null);
    try {
      await operation();
      const remaining = Math.max(0, 1_800 - (Date.now() - startedAt));
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      Alert.alert('Completed', successMessage);
    } catch (caught) {
      const message =
        caught instanceof AtlasApiError || caught instanceof Error
          ? caught.message
          : 'The action could not be completed.';
      setError(message);
      Alert.alert('Action failed', message);
    } finally {
      setCurrentAction(null);
    }
  };

  async function startTracking(sessionId: string): Promise<void> {
    if (locationSubscription.current) return;
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Location permission was not granted.');
    locationSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 8 },
      (location) => {
        sequence.current += 1;
        void sendCallSafetyLocation(sessionId, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyM: location.coords.accuracy ?? 0,
          headingDeg: location.coords.heading ?? undefined,
          speedMps: location.coords.speed ?? undefined,
          sequence: sequence.current,
          recordedAt: new Date(location.timestamp).toISOString(),
        }).catch((caught: unknown) => {
          const message = caught instanceof Error ? caught.message : 'Location update failed.';
          setError(message);
          if (message.includes('Active consent is required')) {
            locationSubscription.current?.remove();
            locationSubscription.current = null;
          }
        });
      },
    );
  }

  const consent = async (): Promise<void> => {
    if (!current) return;
    await runAction(
      'consent',
      async () => {
        const result = await grantCallSafetyConsent(
          current.id,
          precise ? 'PRECISE' : 'APPROXIMATE',
        );
        joinCallSafetySession(current.id);
        await refresh(current.id);
        if (result.active) await startTracking(current.id);
      },
      'Your consent was recorded. Location starts only when the session is active.',
    );
  };

  const stop = (): void => {
    if (!current) return;
    Alert.alert(
      'Stop sharing now?',
      'This immediately ends mutual location sharing for both participants.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () =>
            void runAction(
              'stop',
              async () => {
                locationSubscription.current?.remove();
                locationSubscription.current = null;
                await revokeCallSafetyConsent(current.id);
                await refresh(current.id);
              },
              'Location sharing stopped for both participants.',
            ),
        },
      ],
    );
  };

  const purge = (): void => {
    if (!current) return;
    Alert.alert(
      'Delete my session location now?',
      'This permanently deletes your stored coordinates and ends mutual sharing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete and stop',
          style: 'destructive',
          onPress: () =>
            void runAction(
              'purge',
              async () => {
                locationSubscription.current?.remove();
                locationSubscription.current = null;
                await purgeCallSafetyLocation(current.id);
                setCurrent(null);
              },
              'Your stored session coordinates were permanently deleted.',
            ),
        },
      ],
    );
  };

  const escalateSos = (): void => {
    if (!current) return;
    Alert.alert(
      'Escalate to emergency SOS?',
      'Your current location will be sent to your verified emergency contacts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () =>
            void runAction(
              'sos',
              async () => {
                const permission = await Location.requestForegroundPermissionsAsync();
                if (!permission.granted) {
                  throw new Error('Location permission is required for SOS.');
                }
                const location = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.High,
                });
                await escalateCallSafetySos(current.id, {
                  clientRequestId: Crypto.randomUUID(),
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  accuracyM: location.coords.accuracy ?? 0,
                  message: 'SOS escalated from an active Stay With Me session.',
                });
              },
              'SOS sent. Verified emergency contacts are being notified.',
            ),
        },
      ],
    );
  };

  const end = (): void => {
    if (!current) return;
    Alert.alert('End Stay With Me session?', 'This stops the session for both participants.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: () =>
          void runAction(
            'end',
            async () => {
              locationSubscription.current?.remove();
              locationSubscription.current = null;
              await endCallSafetySession(current.id);
              setCurrent(null);
            },
            'The Stay With Me session ended.',
          ),
      },
    ]);
  };

  if (invitationToken && !current) {
    return (
      <Screen contentStyle={styles.content}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <Card elevated style={styles.inviteCard}>
          <View style={styles.shield}>
            <ShieldCheck color={palette.white} size={30} />
          </View>
          <AtlasText variant="h2" align="center">
            Stay With Me invitation
          </AtlasText>
          <AtlasText color={theme.colors.textMuted} align="center">
            Accepting does not share anything yet. You choose location precision separately.
          </AtlasText>
          {error ? <AtlasText color={palette.red}>{error}</AtlasText> : null}
          <Button label="Accept invitation" loading={loading} onPress={() => void respond(true)} />
          <Button label="Decline" variant="secondary" onPress={() => void respond(false)} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={styles.flex}>
          <AtlasText variant="h2">Stay With Me</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            A consent-based companion for calls and journeys
          </AtlasText>
        </View>
      </View>

      {current ? (
        <Card elevated style={styles.activeCard}>
          <View style={styles.statusRow}>
            <View style={styles.liveDot} />
            <AtlasText variant="label">{current.status}</AtlasText>
            <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.pushRight}>
              {remainingMinutes} min remaining
            </AtlasText>
          </View>
          <View style={styles.people}>
            {current.participants.map((participant) => (
              <View key={participant.id} style={styles.person}>
                <Avatar
                  name={participant.user.profile?.displayName ?? 'Atlas user'}
                  uri={participant.user.profile?.avatarUrl}
                  size={50}
                  color={participant.role === 'INITIATOR' ? palette.blue : palette.teal}
                />
                <AtlasText variant="caption">{participant.user.profile?.displayName}</AtlasText>
                <AtlasText variant="micro" color={theme.colors.textMuted}>
                  {participant.consent?.status ?? 'WAITING'}
                </AtlasText>
              </View>
            ))}
          </View>
          {createdInvitationLink && current.status === 'PENDING' ? (
            <View style={[styles.pendingInvite, { backgroundColor: theme.colors.background }]}>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                SEND THIS PRIVATE LINK TO THE INVITED PERSON
              </AtlasText>
              <AtlasText selectable variant="caption" color={palette.blue}>
                {createdInvitationLink}
              </AtlasText>
              <Button
                label="Share invitation again"
                variant="secondary"
                onPress={() =>
                  void Share.share({
                    message: `Stay With Me invitation from Atlas AI: ${createdInvitationLink}`,
                  })
                }
              />
            </View>
          ) : null}
          {remoteLocation ? (
            <View style={[styles.locationNotice, { backgroundColor: theme.colors.background }]}>
              <MapPin size={18} color={palette.teal} />
              <AtlasText variant="caption">
                Trusted participant location updated securely.
              </AtlasText>
            </View>
          ) : null}
          <View style={styles.consentRow}>
            <View style={styles.flex}>
              <AtlasText variant="label">Share precise location</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted}>
                Turn off to share an intentionally blurred area.
              </AtlasText>
            </View>
            <Switch value={precise} onValueChange={setPrecise} />
          </View>
          <Button
            label="Grant my consent"
            icon={UserRoundCheck}
            loading={loading || currentAction === 'consent'}
            onPress={() => void consent()}
          />
          <Button
            label="Open phone dialler"
            icon={PhoneCall}
            variant="secondary"
            loading={currentAction === 'dialer'}
            onPress={() =>
              void runAction(
                'dialer',
                async () => {
                  await Linking.openURL('tel:');
                },
                'Phone dialler requested.',
              )
            }
          />
          <Button
            label="Emergency SOS"
            variant="danger"
            loading={currentAction === 'sos'}
            onPress={escalateSos}
          />
          <Button
            label="Delete my location now"
            variant="secondary"
            loading={currentAction === 'purge'}
            onPress={purge}
          />
          <Button
            label="Stop sharing now"
            variant="danger"
            loading={currentAction === 'stop'}
            onPress={stop}
          />
          <Button
            label="End session"
            variant="ghost"
            loading={currentAction === 'end'}
            onPress={end}
          />
        </Card>
      ) : (
        <>
          <Card style={styles.privacyCard}>
            <ShieldCheck size={22} color={palette.teal} />
            <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
              No tracking starts until the invited person accepts and each participant grants
              consent.
            </AtlasText>
          </Card>
          <AtlasText variant="h3">Choose a trusted person</AtlasText>
          <View style={styles.friendList}>
            {friends.map((friend) => {
              const selected = selectedUserId === friend.friend.id;
              return (
                <Pressable
                  key={friend.id}
                  onPress={() => setSelectedUserId(friend.friend.id)}
                  style={[
                    styles.friend,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: selected ? palette.blue : theme.colors.border,
                    },
                  ]}
                >
                  <Avatar
                    name={friend.friend.displayName}
                    uri={friend.friend.avatarUrl}
                    size={46}
                    color={palette.blue}
                    online={friend.friend.isOnline}
                  />
                  <AtlasText variant="label" style={styles.flex}>
                    {friend.friend.displayName}
                  </AtlasText>
                  {selected ? <ShieldCheck size={20} color={palette.blue} /> : null}
                </Pressable>
              );
            })}
          </View>
          <AtlasText variant="h3">Session duration</AtlasText>
          <View style={styles.durations}>
            {([15, 30, 60] as const).map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setDuration(minutes)}
                style={[
                  styles.duration,
                  {
                    backgroundColor: duration === minutes ? palette.blue : theme.colors.surface,
                    borderColor: duration === minutes ? palette.blue : theme.colors.border,
                  },
                ]}
              >
                <Clock3
                  size={17}
                  color={duration === minutes ? palette.white : theme.colors.textMuted}
                />
                <AtlasText
                  variant="label"
                  color={duration === minutes ? palette.white : theme.colors.text}
                >
                  {minutes} min
                </AtlasText>
              </Pressable>
            ))}
          </View>
          {error ? (
            <View style={styles.error}>
              <AtlasText color={palette.red}>{error}</AtlasText>
            </View>
          ) : null}
          {createdInvitationLink ? (
            <Card style={styles.invitationLinkCard}>
              <AtlasText variant="micro" color={theme.colors.textMuted}>
                PRIVATE EXPIRING INVITATION — COPY THIS LINK
              </AtlasText>
              <AtlasText selectable variant="caption" color={palette.blue}>
                {createdInvitationLink}
              </AtlasText>
              <Button
                label="Open share menu"
                variant="secondary"
                onPress={() =>
                  void Share.share({
                    message: `Stay With Me invitation from Atlas AI: ${createdInvitationLink}`,
                  })
                }
              />
            </Card>
          ) : null}
          <Button
            label="Create private invitation"
            icon={ShieldCheck}
            loading={loading}
            disabled={!selectedUserId}
            onPress={() => void create()}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  inviteCard: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxxl,
    padding: spacing.xl,
  },
  shield: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 25,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  privacyCard: {
    alignItems: 'center',
    borderColor: 'rgba(20,184,166,0.24)',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  friendList: { gap: spacing.sm },
  friend: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  durations: { flexDirection: 'row', gap: spacing.xs },
  duration: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 48,
  },
  activeCard: { gap: spacing.md },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  liveDot: { backgroundColor: palette.green, borderRadius: 6, height: 10, width: 10 },
  people: { flexDirection: 'row', justifyContent: 'space-around' },
  person: { alignItems: 'center', gap: 3 },
  pendingInvite: {
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  locationNotice: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  consentRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  error: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, padding: spacing.sm },
  invitationLinkCard: { gap: spacing.sm, borderColor: 'rgba(37,99,235,0.25)' },
});
