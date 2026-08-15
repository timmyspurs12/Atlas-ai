import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(512)
  @Matches(/^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]{8,256}\]$/, {
    message: 'pushToken must be a valid Expo push token',
  })
  pushToken: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() friendRequests?: boolean;
  @IsOptional() @IsBoolean() locationSharing?: boolean;
  @IsOptional() @IsBoolean() geofenceAlerts?: boolean;
  @IsOptional() @IsBoolean() chatMessages?: boolean;
  @IsOptional() @IsBoolean() sosAlerts?: boolean;
  @IsOptional() @IsBoolean() callSafetyInvitations?: boolean;
  @IsOptional() @IsBoolean() weeklyReports?: boolean;
  @IsOptional() @IsBoolean() productUpdates?: boolean;
}
