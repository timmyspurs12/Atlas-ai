import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(512)
  pushToken: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() friendRequests?: boolean;
  @IsOptional() @IsBoolean() locationSharing?: boolean;
  @IsOptional() @IsBoolean() geofenceAlerts?: boolean;
  @IsOptional() @IsBoolean() chatMessages?: boolean;
  @IsOptional() @IsBoolean() sosAlerts?: boolean;
  @IsOptional() @IsBoolean() weeklyReports?: boolean;
  @IsOptional() @IsBoolean() productUpdates?: boolean;
}
