import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TransitDisruptionSeverity,
  TransitMode,
  TransitPlaceType,
  TransitReviewStatus,
  TransitRouteStatus,
} from '../../generated/prisma/client';

export class TransitAdminListDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(TransitReviewStatus)
  verificationStatus?: TransitReviewStatus;

  @IsOptional()
  @IsEnum(TransitRouteStatus)
  routeStatus?: TransitRouteStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class CreateTransitPlaceDto {
  @IsUUID()
  areaId: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(60)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsEnum(TransitPlaceType)
  type: TransitPlaceType;

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

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  landmarkDescription?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  aliases: string[] = [];

  @IsArray()
  @ArrayMaxSize(12)
  @IsEnum(TransitMode, { each: true })
  modes: TransitMode[] = [];
}

export enum AdminReviewDecisionDto {
  APPROVED = 'APPROVED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  REJECTED = 'REJECTED',
}

export class ReviewTransitPlaceDto {
  @IsEnum(AdminReviewDecisionDto)
  decision: AdminReviewDecisionDto;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}

export class CreateTransitFareDto {
  @IsUUID()
  routeId: string;

  @IsUUID()
  sourceId: string;

  @IsOptional()
  @IsUUID()
  fromPlaceId?: string;

  @IsOptional()
  @IsUUID()
  toPlaceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinKobo: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMaxKobo: number;

  @IsDateString()
  observedAt: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}

export class ReviewTransitFareDto {
  @IsEnum(AdminReviewDecisionDto)
  decision: AdminReviewDecisionDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100)
  confidenceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}

export class CreateTransitDisruptionDto {
  @IsUUID()
  areaId: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  placeId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsEnum(TransitDisruptionSeverity)
  severity: TransitDisruptionSeverity;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(5_000)
  description: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ValidateTransitCsvDto {
  @IsUUID()
  areaId: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsString()
  @MaxLength(1_000_000)
  csvText: string;
}
