import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../../common/encryption.service';
import { PrismaService } from '../../database/prisma.service';
import {
  ConversationType,
  FriendshipStatus,
  MessageReceiptStatus,
  NotificationType,
} from '../../generated/prisma/client';
import type { CreateDirectConversationDto, SendMessageDto } from './chat.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async createDirect(
    userId: string,
    input: CreateDirectConversationDto,
  ): Promise<Record<string, unknown>> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
        OR: [
          { requesterId: userId, addresseeId: input.userId },
          { requesterId: input.userId, addresseeId: userId },
        ],
      },
    });
    if (!friendship) throw new ForbiddenException('Chat is available to accepted friends');
    const pairKey = [userId, input.userId].sort().join(':');
    return this.prisma.conversation.upsert({
      where: { directPairKey: pairKey },
      create: {
        type: ConversationType.DIRECT,
        directPairKey: pairKey,
        createdById: userId,
        members: {
          create: [
            { userId, joinedAt: new Date() },
            { userId: input.userId, joinedAt: new Date() },
          ],
        },
      },
      update: { deletedAt: null },
      include: { members: true },
    });
  }

  async conversations(userId: string): Promise<Array<Record<string, unknown>>> {
    const conversations = await this.prisma.conversation.findMany({
      where: { deletedAt: null, members: { some: { userId, deletedAt: null } } },
      include: {
        members: {
          where: { deletedAt: null },
          include: { user: { include: { profile: true } } },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return conversations.map((conversation) => {
      const last = conversation.messages[0];
      return {
        id: conversation.id,
        type: conversation.type,
        title: conversation.title,
        members: conversation.members.map((member) => ({
          id: member.user.id,
          displayName: member.user.profile?.displayName ?? 'Atlas member',
          avatarUrl: member.user.profile?.avatarUrl ?? null,
        })),
        lastMessage: last
          ? {
              id: last.id,
              senderId: last.senderId,
              type: last.type,
              body: last.bodyCiphertext ? this.encryption.decryptUtf8(last.bodyCiphertext) : null,
              sentAt: last.sentAt,
            }
          : null,
        updatedAt: conversation.updatedAt,
      };
    });
  }

  async messages(userId: string, conversationId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertMember(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      include: {
        receipts: { where: { deletedAt: null } },
        attachments: { where: { deletedAt: null } },
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
    return messages.reverse().map((message) => ({
      id: message.id,
      clientMessageId: message.clientMessageId,
      senderId: message.senderId,
      type: message.type,
      body: message.bodyCiphertext ? this.encryption.decryptUtf8(message.bodyCiphertext) : null,
      replyToMessageId: message.replyToMessageId,
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      receipts: message.receipts,
      attachments: message.attachments,
    }));
  }

  async send(
    userId: string,
    conversationId: string,
    input: SendMessageDto,
  ): Promise<Record<string, unknown>> {
    await this.assertMember(userId, conversationId);
    const existing = await this.prisma.message.findUnique({
      where: {
        senderId_clientMessageId: { senderId: userId, clientMessageId: input.clientMessageId },
      },
    });
    if (existing) return this.serializeMessage(existing);

    if (input.replyToMessageId) {
      const reply = await this.prisma.message.findFirst({
        where: { id: input.replyToMessageId, conversationId, deletedAt: null },
      });
      if (!reply) throw new NotFoundException('Reply message not found');
    }
    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          conversationId,
          senderId: userId,
          clientMessageId: input.clientMessageId,
          type: input.type,
          bodyCiphertext: this.encryption.encryptUtf8(input.body),
          bodyPreview: 'Encrypted message',
          replyToMessageId: input.replyToMessageId,
          sentAt: new Date(),
        },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const recipients = await transaction.conversationMember.findMany({
        where: { conversationId, userId: { not: userId }, deletedAt: null },
        select: { userId: true },
      });
      if (recipients.length > 0) {
        await transaction.notification.createMany({
          data: recipients.map((recipient) => ({
            userId: recipient.userId,
            actorId: userId,
            type: NotificationType.CHAT,
            title: 'New message',
            body: 'You received an encrypted message.',
            data: { conversationId, messageId: created.id },
          })),
        });
      }
      return created;
    });
    return this.serializeMessage(message, input.body);
  }

  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.assertMember(userId, conversationId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Message not found');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.messageReceipt.upsert({
        where: {
          messageId_userId_status: {
            messageId,
            userId,
            status: MessageReceiptStatus.READ,
          },
        },
        create: { messageId, userId, status: MessageReceiptStatus.READ, occurredAt: now },
        update: { occurredAt: now, deletedAt: null },
      }),
      this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now },
      }),
    ]);
  }

  async memberIds(userId: string, conversationId: string): Promise<string[]> {
    await this.assertMember(userId, conversationId);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, deletedAt: null },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, deletedAt: null, conversation: { deletedAt: null } },
    });
    if (!member) throw new ForbiddenException('Conversation access denied');
  }

  private serializeMessage(
    message: {
      id: string;
      clientMessageId: string;
      senderId: string;
      conversationId: string;
      type: string;
      bodyCiphertext: Uint8Array | null;
      replyToMessageId: string | null;
      sentAt: Date;
    },
    knownBody?: string,
  ): Record<string, unknown> {
    return {
      id: message.id,
      clientMessageId: message.clientMessageId,
      senderId: message.senderId,
      conversationId: message.conversationId,
      type: message.type,
      body:
        knownBody ??
        (message.bodyCiphertext ? this.encryption.decryptUtf8(message.bodyCiphertext) : null),
      replyToMessageId: message.replyToMessageId,
      sentAt: message.sentAt,
    };
  }
}
