import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmergencyContactDto {
  @IsOptional()
  @IsUUID()
  contactUserId?: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  @IsBoolean()
  notifyPush = true;

  @IsBoolean()
  notifySms = false;

  @IsBoolean()
  notifyEmail = false;
}

export class TriggerSosDto {
  @IsUUID()
  clientRequestId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyM: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
