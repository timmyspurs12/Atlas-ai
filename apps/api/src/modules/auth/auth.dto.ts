import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DevicePlatform } from '../../generated/prisma/client';

export class DeviceDto {
  @IsString()
  @Length(16, 128)
  installationId: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsString()
  @MaxLength(30)
  appVersion: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  osVersion?: string;
}

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @Length(12, 128)
  @Matches(/[a-z]/)
  @Matches(/[A-Z]/)
  @Matches(/[0-9]/)
  password: string;

  @IsString()
  @Length(2, 60)
  displayName: string;

  @IsString()
  @Length(1, 20)
  acceptedTermsVersion: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class RefreshDto {
  @IsString()
  @Length(40, 512)
  refreshToken: string;

  @IsString()
  @Length(16, 128)
  installationId: string;
}

export class RevokeSessionDto {
  @IsUUID()
  sessionId: string;
}

export enum SocialProviderDto {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}

export class SocialLoginDto {
  @IsEnum(SocialProviderDto)
  provider: SocialProviderDto;

  @IsString()
  @Length(100, 10_000)
  idToken: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  displayName?: string;

  @IsString()
  @Length(1, 20)
  acceptedTermsVersion: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class RequestPhoneVerificationDto {
  @IsPhoneNumber()
  phone: string;
}

export class VerifyPhoneDto {
  @IsUUID()
  challengeId: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 512)
  token: string;

  @IsString()
  @Length(12, 128)
  @Matches(/[a-z]/)
  @Matches(/[A-Z]/)
  @Matches(/[0-9]/)
  password: string;
}
