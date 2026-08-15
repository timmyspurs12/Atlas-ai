import { io, type Socket } from 'socket.io-client';
import { runtime } from '@/shared/config/runtime';
import { sessionStorage } from '@/shared/storage';

let socket: Socket | null = null;
const joinedSessionIds = new Set<string>();

export async function connectCallSafetyRealtime(handlers: {
  onLocation: (location: Record<string, unknown>) => void;
  onSessionChanged: () => void;
}): Promise<Socket | null> {
  const session = await sessionStorage.getSession();
  if (!session) return null;
  socket?.disconnect();
  joinedSessionIds.clear();
  socket = io(`${runtime.socketUrl}/call-safety`, {
    auth: { token: session.accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8_000,
  });
  socket.on('connect', () => {
    for (const sessionId of joinedSessionIds) socket?.emit('session:join', { sessionId });
  });
  socket.on('location:updated', handlers.onLocation);
  socket.on('consent:changed', handlers.onSessionChanged);
  socket.on('session:activated', handlers.onSessionChanged);
  socket.on('session:ended', handlers.onSessionChanged);
  socket.on('location:purged', handlers.onSessionChanged);
  socket.on('invitation:accepted', handlers.onSessionChanged);
  return socket;
}

export function joinCallSafetySession(sessionId: string): void {
  joinedSessionIds.add(sessionId);
  if (socket?.connected) socket.emit('session:join', { sessionId });
}

export function disconnectCallSafetyRealtime(): void {
  socket?.disconnect();
  socket = null;
  joinedSessionIds.clear();
}
