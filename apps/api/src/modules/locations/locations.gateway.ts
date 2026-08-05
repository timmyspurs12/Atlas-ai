import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { SocketAuthService } from '../../realtime/socket-auth.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { LocationUpdateDto } from './locations.dto';
import { LocationsService, type LocationBroadcast } from './locations.service';

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:19006')
  .split(',')
  .map((origin) => origin.trim());

type AuthenticatedSocket = Socket;
interface SocketData {
  principal?: AuthPrincipal;
}

@WebSocketGateway({
  namespace: '/live',
  transports: ['websocket'],
  cors: { origin: allowedOrigins, credentials: false },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
})
export class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LocationsGateway.name);

  constructor(
    private readonly locations: LocationsService,
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const principal = await this.socketAuth.authenticate(client);
      this.socketData(client).principal = principal;
      await client.join(this.userRoom(principal.userId));
      await this.markPresent(principal.userId);
      client.emit('presence:ready', {
        recovered: client.recovered,
        serverTime: new Date().toISOString(),
      });
    } catch {
      client.emit('auth:error', { code: 'UNAUTHORIZED', message: 'Socket authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const principal = this.socketData(client).principal;
    if (!principal) return;
    try {
      await this.redis.connect();
      await this.redis.client.del(`presence:${principal.userId}`);
      await this.prisma.user.update({
        where: { id: principal.userId },
        data: { lastSeenAt: new Date() },
      });
      client.to(this.userRoom(principal.userId)).emit('presence:changed', {
        userId: principal.userId,
        isOnline: false,
        lastSeenAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Disconnect cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  @SubscribeMessage('heartbeat')
  async heartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ ok: true; serverTime: string }> {
    const principal = this.principal(client);
    await this.markPresent(principal.userId);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('location:update')
  async locationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: LocationUpdateDto,
  ): Promise<{ accepted: boolean; sequence: number }> {
    try {
      const broadcast = await this.locations.ingest(this.principal(client), input);
      if (broadcast) this.broadcast(broadcast);
      return { accepted: Boolean(broadcast), sequence: input.sequence };
    } catch (error) {
      throw new WsException({
        code: 'LOCATION_UPDATE_REJECTED',
        message: error instanceof Error ? error.message : 'Location update rejected',
      });
    }
  }

  broadcast(event: LocationBroadcast): void {
    for (const item of event.events) {
      this.server.to(this.userRoom(item.recipientId)).emit('location:updated', item.payload);
    }
  }

  notifyShareChanged(userIds: string[], payload: Record<string, unknown>): void {
    for (const userId of new Set(userIds)) {
      this.server.to(this.userRoom(userId)).emit('share:changed', payload);
    }
  }

  private principal(client: AuthenticatedSocket): AuthPrincipal {
    const principal = this.socketData(client).principal;
    if (!principal) throw new WsException('Authentication required');
    return principal;
  }

  private socketData(client: AuthenticatedSocket): SocketData {
    return client.data as SocketData;
  }

  private async markPresent(userId: string): Promise<void> {
    try {
      await this.redis.connect();
      await this.redis.client.set(`presence:${userId}`, Date.now().toString(), 'EX', 45);
    } catch (error) {
      this.logger.warn(
        `Presence update failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
