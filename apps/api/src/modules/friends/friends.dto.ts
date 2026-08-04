import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class SendFriendRequestDto {
  @IsUUID()
  userId: string;
}

export class BlockUserDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class FriendshipIdDto {
  @IsString()
  @Length(36, 36)
  friendshipId: string;
}
