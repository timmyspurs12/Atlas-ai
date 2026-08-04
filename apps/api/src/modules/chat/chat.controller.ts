import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { CreateDirectConversationDto, ReadMessageDto, SendMessageDto } from './chat.dto';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  conversations(@CurrentUser() principal: AuthPrincipal): ReturnType<ChatService['conversations']> {
    return this.chat.conversations(principal.userId);
  }

  @Post('conversations/direct')
  createDirect(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateDirectConversationDto,
  ): ReturnType<ChatService['createDirect']> {
    return this.chat.createDirect(principal.userId, input);
  }

  @Get('conversations/:conversationId/messages')
  messages(
    @CurrentUser() principal: AuthPrincipal,
    @Param('conversationId') conversationId: string,
  ): ReturnType<ChatService['messages']> {
    return this.chat.messages(principal.userId, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  send(
    @CurrentUser() principal: AuthPrincipal,
    @Param('conversationId') conversationId: string,
    @Body() input: SendMessageDto,
  ): ReturnType<ChatService['send']> {
    return this.chat.send(principal.userId, conversationId, input);
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(
    @CurrentUser() principal: AuthPrincipal,
    @Param('conversationId') conversationId: string,
    @Body() input: ReadMessageDto,
  ): Promise<void> {
    await this.chat.markRead(principal.userId, conversationId, input.messageId);
  }
}
