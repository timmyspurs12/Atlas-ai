import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiRequest } from '@/shared/api/api-client';
import { runtime } from '@/shared/config/runtime';
import {
  parseCallSafetyInvitationRoute,
  type CallSafetyInvitationRoute,
} from './notification-routing';

export interface AtlasNotification {
  id: string;
  actorId: string | null;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: AtlasNotification[];
  unread: number;
}

export interface PushRegistrationResult {
  status: 'REGISTERED' | 'DENIED' | 'UNAVAILABLE';
  message: string;
}

const handledResponseIds = new Set<string>();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
  });
}

export function listNotifications(): Promise<NotificationListResponse> {
  return apiRequest('/notifications');
}

export function markNotificationRead(notificationId: string): Promise<void> {
  return apiRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsRead(): Promise<number> {
  return apiRequest('/notifications/read-all', { method: 'PATCH' });
}

export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await apiRequest('/notifications/push-token', { method: 'DELETE' });
  await Notifications.setBadgeCountAsync(0);
}

export async function registerPushNotifications(
  requestPermission: boolean,
): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { status: 'UNAVAILABLE', message: 'Push invitations require the native Atlas app.' };
  }
  if (!Device.isDevice) {
    return {
      status: 'UNAVAILABLE',
      message: 'Push invitations require a physical iOS or Android device.',
    };
  }
  if (!runtime.easProjectId) {
    return {
      status: 'UNAVAILABLE',
      message: 'Push invitations will be available after the EAS project ID is configured.',
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('call-safety', {
      name: 'Stay With Me invitations',
      description: 'Private, time-limited Stay With Me safety requests.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#2563EB',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== Notifications.PermissionStatus.GRANTED && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== Notifications.PermissionStatus.GRANTED) {
    return {
      status: 'DENIED',
      message: requestPermission
        ? 'Notification permission was not granted. In-app invitations remain available.'
        : 'Push permission has not been granted.',
    };
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId: runtime.easProjectId });
  await apiRequest('/notifications/push-token', {
    method: 'POST',
    body: { pushToken: token.data },
  });
  return {
    status: 'REGISTERED',
    message: 'Push invitations are enabled on this device.',
  };
}

export function addCallSafetyNotificationResponseListener(
  onInvitation: (route: CallSafetyInvitationRoute) => void,
): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleResponse(response, onInvitation);
  });
  return () => subscription.remove();
}

export async function openInitialCallSafetyNotification(
  onInvitation: (route: CallSafetyInvitationRoute) => void,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) handleResponse(response, onInvitation);
}

function handleResponse(
  response: Notifications.NotificationResponse,
  onInvitation: (route: CallSafetyInvitationRoute) => void,
): void {
  const identifier = response.notification.request.identifier;
  if (handledResponseIds.has(identifier)) return;
  const route = parseCallSafetyInvitationRoute(response.notification.request.content.data);
  if (!route) return;
  handledResponseIds.add(identifier);
  onInvitation(route);
}
