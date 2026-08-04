import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AskAssistantDto {
  @IsString()
  @Length(2, 500)
  question: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsBoolean()
  preciseLocationConsent = false;
}
