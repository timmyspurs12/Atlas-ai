import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { GeofenceType } from '../../generated/prisma/client';

export class CreateGeofenceDto {
  @IsUUID()
  subjectUserId: string;

  @IsEnum(GeofenceType)
  type: GeofenceType = GeofenceType.CUSTOM;

  @IsString()
  @MaxLength(80)
  name: string;

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
  @IsInt()
  @Min(50)
  @Max(5_000)
  radiusM: number;

  @IsBoolean()
  notifyOnArrival = true;

  @IsBoolean()
  notifyOnDeparture = true;
}

export class UpdateGeofenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(5_000)
  radiusM?: number;

  @IsOptional()
  @IsBoolean()
  notifyOnArrival?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnDeparture?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
