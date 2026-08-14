import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
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
import { ActionResultModal, ConfirmationModal } from '../components/ActionModal';
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
  acceptCallSafetyInvitationById,
  createCallSafetySession,
  declineCallSafetyInvitation,
  declineCallSafetyInvitationById,
  endCallSafetySession,
  escalateCallSafetySos,
  getCallSafetySession,
  grantCallSafetyConsent,
  listCallSafetySessions,
  purgeCallSafetyLocation,
  revokeCallSafetyConsent,
  type CallSafetySession,
} from '../services/call-safety-api';
import {
  armCallSafetyLocationTracking,
  getCallSafetyTrackingSnapshot,
  prepareCallSafetyLocationPermission,
  reconcileCallSafetyLocationTracking,
  stopCallSafetyLocationTracking,
  subscribeCallSafetyTracking,
} from '../services/call-safety-location';
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

async function requireSafetyActions(
  actions: Array<Promise<unknown>>,
  fallbackMessage: string,
): Promise<void> {
  const results = await Promise.allSettled(actions);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    const reason: unknown = failure.reason;
    throw reason instanceof Error ? reason : new Error(fallbackMessage);
  }
}

export function StayWithMeScreen({ navigation, route }: Props) {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const currentUserId = useAppSelector((state) => state.auth.session?.user.id ?? null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [precise, setPrecise] = useState(true);
  const [continueInBackground, setContinueInBackground] = useState(false);
  const [trackingState, setTrackingState] = useState(getCallSafetyTrackingSnapshot);
  const [current, setCurrent] = useState<CallSafetySession | null>(null);
  const [remoteLocation, setRemoteLocation] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvitationLink, setCreatedInvitationLink] = useState<string | null>(null);
  type ActionName = 'consent' | 'dialer' | 'sos' | 'purge' | 'stop' | 'end';
  const [currentAction, setCurrentAction] = useState<ActionName | null>(null);
  const [confirmation, setConfirmation] = useState<{
    action: ActionName;
    title: string;
    message: string;
    cancelLabel: string;
    confirmLabel: string;
    danger: boolean;
    operation: () => Promise<void>;
    successMessage: string;
  } | null>(null);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    title: string;
    message: string;
  } | null>(null);
  const actionLock = useRef(false);
  const rawInvitationToken = route.params?.invitationToken;
  const invitationToken =
    rawInvitationToken && rawInvitationToken !== 'undefined' ? rawInvitationToken : undefined;
  const rawInvitationId = route.params?.invitationId;
  const invitationId =
    rawInvitationId && rawInvitationId !== 'undefined' ? rawInvitationId : undefined;

  const remainingMinutes = useMemo(() => {
    if (!current) return null;
    return Math.max(0, Math.ceil((new Date(current.expiresAt).getTime() - Date.now()) / 60_000));
  }, [current]);
  const sessionClosed = Boolean(
    current && ['ENDED', 'EXPIRED', 'CANCELLED'].includes(current.status),
  );
  const ownConsent = useMemo(
    () =>
      current?.participants.find((participant) => participant.userId === currentUserId)?.consent ??
      null,
    [current, currentUserId],
  );
  const ownConsentActive = ownConsent?.status === 'ACTIVE';
  const currentTrackingStatus =
    trackingState.sessionId === current?.id ? trackingState.status : 'IDLE';

  const refresh = async (sessionId?: string): Promise<CallSafetySession | null> => {
    if (mode === 'demo') return null;
    const sessions = await listCallSafetySessions();
    const id = sessionId ?? current?.id ?? sessions[0]?.id;
    if (!id) return null;
    const updated = await getCallSafetySession(id);
    setCurrent(updated);
    joinCallSafetySession(updated.id);
    if (currentUserId) {
      await reconcileCallSafetyLocationTracking(currentUserId, updated);
    }
    return updated;
  };

  useEffect(() => subscribeCallSafetyTracking(setTrackingState), []);

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
    void apiRequest<{ friends: FriendItem[] }>('/friends')
      .then((result) => {
        setFriends(result.friends);
        setSelectedUserId(result.friends[0]?.friend.id ?? null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Trusted people could not be loaded.');
      });
    void (async () => {
      await connectCallSafetyRealtime({
        onLocation: setRemoteLocation,
        onSessionChanged: () => {
          void refresh().catch((caught: unknown) => {
            setError(
              caught instanceof Error ? caught.message : 'Session status could not refresh.',
            );
          });
        },
      });
      if (!invitationToken && !invitationId) await refresh();
    })().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Stay With Me could not be loaded.');
    });
    return () => {
      disconnectCallSafetyRealtime();
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
    if (!invitationToken && !invitationId) return;
    setLoading(true);
    try {
      if (accept) {
        const result = invitationId
          ? await acceptCallSafetyInvitationById(invitationId)
          : await acceptCallSafetyInvitation(invitationToken as string);
        await refresh(result.sessionId);
      } else {
        if (invitationId) await declineCallSafetyInvitationById(invitationId);
        else await declineCallSafetyInvitation(invitationToken as string);
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
    if (actionLock.current) return;
    actionLock.current = true;
    const startedAt = Date.now();
    setCurrentAction(action);
    setError(null);
    try {
      await operation();
      const remaining = Math.max(0, 3_000 - (Date.now() - startedAt));
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      setActionResult({
        success: true,
        title: 'Action completed',
        message: successMessage,
      });
    } catch (caught) {
      const message =
        caught instanceof AtlasApiError || caught instanceof Error
          ? caught.message
          : 'The action could not be completed.';
      setError(message);
      setActionResult({ success: false, title: 'Action failed', message });
    } finally {
      actionLock.current = false;
      setCurrentAction(null);
    }
  };

  const consent = (): void => {
    if (!current) return;
    setConfirmation({
      action: 'consent',
      title: 'Grant location consent?',
      message: `You are about to share ${precise ? 'precise' : 'approximate'} location for the remaining session duration${continueInBackground ? ', including while Atlas is in the background' : ' while Atlas is open'}. No tracking starts until both people consent.`,
      cancelLabel: 'No, cancel',
      confirmLabel: 'Yes, grant consent',
      danger: false,
      operation: async () => {
        if (!currentUserId) throw new Error('Sign in again before granting consent.');
        const permission = await prepareCallSafetyLocationPermission(continueInBackground);
        let consentGranted = false;
        try {
          await grantCallSafetyConsent(current.id, precise ? 'PRECISE' : 'APPROXIMATE');
          consentGranted = true;
          joinCallSafetySession(current.id);
          const updated = await refresh(current.id);
          if (!updated) throw new Error('The session could not be verified after consent.');
          await armCallSafetyLocationTracking({
            session: updated,
            userId: currentUserId,
            mode: permission.mode,
          });
        } catch (caught) {
          if (consentGranted) {
            await Promise.allSettled([
              stopCallSafetyLocationTracking(current.id),
              revokeCallSafetyConsent(current.id),
            ]);
            await refresh(current.id).catch(() => null);
          }
          throw caught;
        }
      },
      successMessage:
        'Your consent was recorded. Location starts only after mutual consent and stops automatically at session expiry.',
    });
  };

  const stop = (): void => {
    if (!current) return;
    setConfirmation({
      action: 'stop',
      title: 'Do you want to stop sharing?',
      message: 'This immediately stops location sharing for both participants.',
      cancelLabel: 'No, continue sharing',
      confirmLabel: 'Yes, stop sharing',
      danger: true,
      operation: async () => {
        await requireSafetyActions(
          [stopCallSafetyLocationTracking(current.id), revokeCallSafetyConsent(current.id)],
          'Location sharing could not be stopped completely.',
        );
        await refresh(current.id);
      },
      successMessage: 'Location sharing stopped successfully for both participants.',
    });
  };

  const purge = (): void => {
    if (!current) return;
    setConfirmation({
      action: 'purge',
      title: 'Permanently delete your session location?',
      message:
        'This removes your stored coordinates and ends mutual sharing. This cannot be undone.',
      cancelLabel: 'No, keep it',
      confirmLabel: 'Yes, delete',
      danger: true,
      operation: async () => {
        await requireSafetyActions(
          [stopCallSafetyLocationTracking(current.id), purgeCallSafetyLocation(current.id)],
          'Location tracking stopped, but stored coordinates could not be fully purged.',
        );
        setCurrent(null);
      },
      successMessage: 'Your stored session coordinates were permanently deleted.',
    });
  };

  const escalateSos = (): void => {
    if (!current) return;
    setConfirmation({
      action: 'sos',
      title: 'Send emergency SOS?',
      message: 'Your current location will be sent to verified emergency contacts.',
      cancelLabel: 'No, cancel',
      confirmLabel: 'Yes, send SOS',
      danger: true,
      operation: async () => {
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
      successMessage: 'SOS sent. Verified emergency contacts are being notified.',
    });
  };

  const end = (): void => {
    if (!current) return;
    setConfirmation({
      action: 'end',
      title: 'End Stay With Me session?',
      message: 'Both participants will stop sharing and this session cannot restart.',
      cancelLabel: 'No, keep session',
      confirmLabel: 'Yes, end session',
      danger: true,
      operation: async () => {
        await requireSafetyActions(
          [stopCallSafetyLocationTracking(current.id), endCallSafetySession(current.id)],
          'The session could not be ended completely.',
        );
        setCurrent(null);
      },
      successMessage: 'The Stay With Me session ended.',
    });
  };

  if ((invitationToken || invitationId) && !current) {
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
                  {sessionClosed ? 'SESSION CLOSED' : (participant.consent?.status ?? 'WAITING')}
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
          {ownConsentActive ? (
            <View style={[styles.locationNotice, { backgroundColor: theme.colors.background }]}>
              <MapPin
                size={18}
                color={currentTrackingStatus === 'IDLE' ? palette.amber : palette.teal}
              />
              <View style={styles.flex}>
                <AtlasText variant="caption">
                  {currentTrackingStatus === 'BACKGROUND'
                    ? 'Background location sharing is active.'
                    : currentTrackingStatus === 'FOREGROUND'
                      ? 'Location sharing is active while Atlas is open.'
                      : currentTrackingStatus === 'ARMED'
                        ? 'Consent saved. Location is off while mutual consent is pending.'
                        : 'Location sharing is not running on this device.'}
                </AtlasText>
                {trackingState.sessionId === current.id && trackingState.lastError ? (
                  <AtlasText variant="micro" color={palette.red}>
                    {trackingState.lastError}
                  </AtlasText>
                ) : null}
              </View>
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
          {sessionClosed ? (
            <View style={styles.closedSession}>
              <AtlasText variant="h3">Session closed</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted} align="center">
                Location sharing is no longer active. Start a new session to share again.
              </AtlasText>
              <Button
                label="Start a new session"
                onPress={() => {
                  setCurrent(null);
                  setCreatedInvitationLink(null);
                  setError(null);
                }}
              />
            </View>
          ) : (
            <>
              <View style={styles.consentRow}>
                <View style={styles.flex}>
                  <AtlasText variant="label">Share precise location</AtlasText>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>
                    Turn off to share an intentionally blurred area.
                  </AtlasText>
                </View>
                <Switch value={precise} disabled={ownConsentActive} onValueChange={setPrecise} />
              </View>
              <View style={styles.consentRow}>
                <View style={styles.flex}>
                  <AtlasText variant="label">Continue in background</AtlasText>
                  <AtlasText variant="caption" color={theme.colors.textMuted}>
                    {Platform.OS === 'web'
                      ? 'Unavailable in the web preview. Use a native Atlas build.'
                      : 'Optional. Your phone shows a system indicator and you can stop at any time.'}
                  </AtlasText>
                </View>
                <Switch
                  accessibilityLabel="Continue Stay With Me location in background"
                  value={continueInBackground}
                  disabled={ownConsentActive || Platform.OS === 'web'}
                  onValueChange={setContinueInBackground}
                />
              </View>
              <Button
                label={ownConsentActive ? 'My consent is active' : 'Grant my consent'}
                icon={UserRoundCheck}
                loading={loading || currentAction === 'consent'}
                disabled={ownConsentActive}
                onPress={() => void consent()}
              />
              <Button
                label="Open phone dialler"
                icon={PhoneCall}
                variant="secondary"
                loading={currentAction === 'dialer'}
                onPress={() =>
                  setConfirmation({
                    action: 'dialer',
                    title: 'Open your phone dialler?',
                    message:
                      'Atlas does not record the call. Location sharing is controlled separately.',
                    cancelLabel: 'No',
                    confirmLabel: 'Open dialler',
                    danger: false,
                    operation: async () => {
                      await Linking.openURL('tel:');
                    },
                    successMessage: 'Phone dialler requested.',
                  })
                }
              />
              <Button
                label={
                  current.status === 'ACTIVE' ? 'Emergency SOS' : 'Emergency SOS (session inactive)'
                }
                variant="danger"
                loading={currentAction === 'sos'}
                disabled={current.status !== 'ACTIVE'}
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
            </>
          )}
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
      <ConfirmationModal
        visible={Boolean(confirmation)}
        title={confirmation?.title ?? ''}
        message={confirmation?.message ?? ''}
        cancelLabel={confirmation?.cancelLabel ?? 'Cancel'}
        confirmLabel={confirmation?.confirmLabel ?? 'Confirm'}
        danger={confirmation?.danger}
        loading={Boolean(confirmation && currentAction === confirmation.action)}
        onCancel={() => {
          if (!currentAction) setConfirmation(null);
        }}
        onConfirm={() => {
          if (!confirmation) return;
          const pending = confirmation;
          void runAction(pending.action, pending.operation, pending.successMessage).finally(() =>
            setConfirmation(null),
          );
        }}
      />
      <ActionResultModal
        visible={Boolean(actionResult)}
        success={actionResult?.success ?? false}
        title={actionResult?.title ?? ''}
        message={actionResult?.message ?? ''}
        onClose={() => setActionResult(null)}
      />
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
  closedSession: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  error: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, padding: spacing.sm },
  invitationLinkCard: { gap: spacing.sm, borderColor: 'rgba(37,99,235,0.25)' },
});
