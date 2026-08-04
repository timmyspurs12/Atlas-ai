import { io, type Socket } from 'socket.io-client';
import type { LocationUpdate } from '@atlas/contracts';
import { runtime } from '@/shared/config/runtime';
import { sessionStorage } from '@/shared/storage';
import { useLocationStore } from '../store/location-store';

interface ServerEvents {
  'location:updated': (event: {
    userId: string;
    shareVersion: number;
    location: LocationUpdate;
  }) => void;
  'share:changed': (event: Record<string, unknown>) => void;
  'presence:ready': (event: { recovered: boolean; serverTime: string }) => void;
  'auth:error': (error: { code: string; message: string }) => void;
}

interface ClientEvents {
  heartbeat: (callback: (response: { ok: true; serverTime: string }) => void) => void;
  'location:update': (
    update: LocationUpdate,
    callback: (response: { accepted: boolean; sequence: number }) => void,
  ) => void;
}

let socket: Socket<ServerEvents, ClientEvents> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export async function connectRealtime(): Promise<void> {
  const session = await sessionStorage.getSession();
  if (!session || socket?.connected) return;
  useLocationStore.getState().setSocketStatus('connecting');
  socket = io(`${runtime.socketUrl}/live`, {
    auth: { token: session.accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.4,
  });
  socket.on('connect', () => {
    useLocationStore.getState().setSocketStatus(socket?.recovered ? 'recovering' : 'connected');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => socket?.emit('heartbeat', () => undefined), 25_000);
  });
  socket.on('disconnect', () => useLocationStore.getState().setSocketStatus('offline'));
  socket.on('location:updated', ({ userId, location }) => {
    useLocationStore.getState().updatePerson(userId, {
      latitude: location.latitude,
      longitude: location.longitude,
      batteryPct: location.batteryPct ?? null,
      speedKph: location.speedMps ? Math.round(location.speedMps * 3.6) : 0,
      status: location.speedMps && location.speedMps > 1 ? 'moving' : 'at-place',
      statusLabel:
        location.speedMps && location.speedMps > 1
          ? `Moving · ${Math.round(location.speedMps * 3.6)} km/h`
          : 'Current location',
      updatedAt: location.recordedAt,
      heading: location.headingDeg ?? 0,
    });
  });
  socket.on('auth:error', () => disconnectRealtime());
}

export function disconnectRealtime(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  socket?.disconnect();
  socket = null;
  useLocationStore.getState().setSocketStatus('offline');
}

export async function emitLiveLocation(update: LocationUpdate): Promise<boolean> {
  if (!socket?.connected) return false;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(false);
    }, 5_000);
    socket?.emit('location:update', update, (response) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve(response.accepted);
    });
  });
}
