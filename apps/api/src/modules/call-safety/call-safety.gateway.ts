import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SocketAuthService } from '../../realtime/socket-auth.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { CallSafetySocketLocationDto, JoinCallSafetySessionDto } from './call-safety.dto';
import { CallSafetyService } from './call-safety.service';

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim());

type AuthenticatedSocket = Socket;
interface SocketData {
  principal?: AuthPrincipal;
  sessionIds?: Set<string>;
}

@WebSocketGateway({
  namespace: '/call-safety',
  transports: ['websocket'],
  cors: { origin: allowedOrigins, credentials: false },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
})
export class CallSafetyGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: SocketAuthService,
    private readonly safety: CallSafetyService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const principal = await this.auth.authenticate(client);
      this.data(client).principal = principal;
      this.data(client).sessionIds = new Set();
      client.emit('session:connected', {
        recovered: client.recovered,
        serverTime: new Date().toISOString(),
      });
    } catch {
      client.emit('auth:error', { code: 'UNAUTHORIZED', message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('session:join')
  async join(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: JoinCallSafetySessionDto,
  ): Promise<{ joined: true; sessionId: string }> {
    try {
      const principal = this.principal(client);
      await this.safety.participantIds(input.sessionId, principal.userId);
      await client.join(this.room(input.sessionId));
      this.data(client).sessionIds?.add(input.sessionId);
      return { joined: true, sessionId: input.sessionId };
    } catch (error) {
      throw this.socketError(error, 'SESSION_JOIN_REJECTED');
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('location:update')
  async location(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: CallSafetySocketLocationDto,
  ): Promise<{ accepted: true; sequence: number }> {
    try {
      const principal = this.principal(client);
      if (!this.data(client).sessionIds?.has(input.sessionId)) {
        throw new WsException('Join the session before sending location');
      }
      const location = await this.safety.updateLocation(principal.userId, input.sessionId, input);
      this.server.to(this.room(input.sessionId)).emit('location:updated', location);
      return { accepted: true, sequence: input.sequence };
    } catch (error) {
      throw this.socketError(error, 'LOCATION_UPDATE_REJECTED');
    }
  }

  notify(sessionId: string, event: string, payload: Record<string, unknown>): void {
    this.server.to(this.room(sessionId)).emit(event, payload);
  }

  private principal(client: AuthenticatedSocket): AuthPrincipal {
    const principal = this.data(client).principal;
    if (!principal) throw new WsException('Authentication required');
    return principal;
  }

  private data(client: AuthenticatedSocket): SocketData {
    return client.data as SocketData;
  }

  private room(sessionId: string): string {
    return `call-safety:${sessionId}`;
  }

  private socketError(error: unknown, code: string): WsException {
    return new WsException({
      code,
      message: error instanceof Error ? error.message : 'Action rejected',
    });
  }
}
