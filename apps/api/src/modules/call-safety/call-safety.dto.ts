import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CallSessionMode, LocationPrecision } from '../../generated/prisma/client';

export class CreateCallSafetySessionDto {
  @IsUUID()
  invitedUserId: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([15, 30, 60])
  durationMinutes: number;

  @IsEnum(CallSessionMode)
  mode: CallSessionMode = CallSessionMode.PSTN_COMPANION;
}

export class GrantCallConsentDto {
  @IsEnum(LocationPrecision)
  precision: LocationPrecision = LocationPrecision.PRECISE;

  @IsBoolean()
  shareBattery = false;

  @IsBoolean()
  shareSpeed = false;
}

export class CallSafetyLocationDto {
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  speedMps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence: number;

  @IsDateString()
  recordedAt: string;
}
