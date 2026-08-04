import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { AskAssistantDto } from './ai.dto';
import { AiService } from './ai.service';

@ApiTags('AI assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AiController {
  constructor(private readonly assistant: AiService) {}

  @Post('ask')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ask(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: AskAssistantDto,
  ): ReturnType<AiService['ask']> {
    return this.assistant.ask(principal.userId, input);
  }
}
