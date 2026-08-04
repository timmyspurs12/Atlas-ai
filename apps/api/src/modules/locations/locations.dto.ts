import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LocationPrecision } from '../../generated/prisma/client';

export class StartLocationShareDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  recipientIds: string[];

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10_080)
  durationMinutes: number;

  @IsEnum(LocationPrecision)
  precision: LocationPrecision = LocationPrecision.PRECISE;

  @IsBoolean()
  shareBattery = true;

  @IsBoolean()
  shareSpeed = true;

  @IsBoolean()
  allowGeofences = false;
}

export class LocationUpdateDto {
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
  @Min(-500)
  @Max(20_000)
  altitudeM?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  speedMps?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number | null;

  @IsOptional()
  @IsBoolean()
  isCharging?: boolean | null;

  @IsDateString()
  recordedAt: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence: number;

  @IsBoolean()
  isMocked = false;
}
