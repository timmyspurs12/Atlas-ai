import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { MessageType } from '../../generated/prisma/client';

export class CreateDirectConversationDto {
  @IsUUID()
  userId: string;
}

export class SendMessageDto {
  @IsUUID()
  clientMessageId: string;

  @IsEnum(MessageType)
  type: MessageType = MessageType.TEXT;

  @IsString()
  @Length(1, 5_000)
  body: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
}

export class SocketSendMessageDto extends SendMessageDto {
  @IsUUID()
  conversationId: string;
}

export class TypingDto {
  @IsUUID()
  conversationId: string;
}

export class ReadMessageDto {
  @IsUUID()
  messageId: string;
}

export class SocketReadMessageDto extends ReadMessageDto {
  @IsUUID()
  conversationId: string;
}
