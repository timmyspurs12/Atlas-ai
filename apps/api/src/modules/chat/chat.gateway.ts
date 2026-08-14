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
import { SocketReadMessageDto, SocketSendMessageDto, TypingDto } from './chat.dto';
import { ChatService } from './chat.service';

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:19006')
  .split(',')
  .map((origin) => origin.trim());

type AuthenticatedSocket = Socket;
interface SocketData {
  principal?: AuthPrincipal;
}

@WebSocketGateway({
  namespace: '/chat',
  transports: ['websocket'],
  cors: { origin: allowedOrigins, credentials: false },
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: false },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const principal = await this.socketAuth.authenticate(client);
      this.socketData(client).principal = principal;
      await client.join(this.room(principal.userId));
      client.emit('chat:ready', { recovered: client.recovered });
    } catch {
      client.emit('auth:error', { code: 'UNAUTHORIZED', message: 'Socket authentication failed' });
      client.disconnect(true);
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: SocketSendMessageDto,
  ): Promise<Record<string, unknown>> {
    try {
      const userId = await this.authorizedUserId(client);
      const message = await this.chat.send(userId, input.conversationId, input);
      const memberIds = await this.chat.memberIds(userId, input.conversationId);
      memberIds.forEach((memberId) => {
        this.server.to(this.room(memberId)).emit('message:created', message);
      });
      return message;
    } catch (error) {
      throw this.toSocketError(error);
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('typing:start')
  async typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: TypingDto,
  ): Promise<{ ok: true }> {
    return this.broadcastTyping(client, input.conversationId, true);
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('typing:stop')
  async typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: TypingDto,
  ): Promise<{ ok: true }> {
    return this.broadcastTyping(client, input.conversationId, false);
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('message:read')
  async read(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: SocketReadMessageDto,
  ): Promise<{ ok: true }> {
    try {
      const userId = await this.authorizedUserId(client);
      await this.chat.markRead(userId, input.conversationId, input.messageId);
      const members = await this.chat.memberIds(userId, input.conversationId);
      members.forEach((memberId) => {
        this.server.to(this.room(memberId)).emit('message:read', {
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId,
          readAt: new Date().toISOString(),
        });
      });
      return { ok: true };
    } catch (error) {
      throw this.toSocketError(error);
    }
  }

  private async broadcastTyping(
    client: AuthenticatedSocket,
    conversationId: string,
    isTyping: boolean,
  ): Promise<{ ok: true }> {
    try {
      const userId = await this.authorizedUserId(client);
      const members = await this.chat.memberIds(userId, conversationId);
      members
        .filter((memberId) => memberId !== userId)
        .forEach((memberId) => {
          this.server.to(this.room(memberId)).emit('typing:changed', {
            conversationId,
            userId,
            isTyping,
          });
        });
      return { ok: true };
    } catch (error) {
      throw this.toSocketError(error);
    }
  }

  private async authorizedUserId(client: AuthenticatedSocket): Promise<string> {
    const principal = this.socketData(client).principal;
    if (!principal) throw new WsException('Authentication required');
    await this.socketAuth.assertActive(client, principal);
    return principal.userId;
  }

  private socketData(client: AuthenticatedSocket): SocketData {
    return client.data as SocketData;
  }

  private room(userId: string): string {
    return `user:${userId}`;
  }

  private toSocketError(error: unknown): WsException {
    return new WsException({
      code: 'CHAT_ACTION_REJECTED',
      message: error instanceof Error ? error.message : 'Chat action rejected',
    });
  }
}
