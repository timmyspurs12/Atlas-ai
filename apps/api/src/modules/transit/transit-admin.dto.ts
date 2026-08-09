import { Transform, Type } from 'class-transformer';
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
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TransitDirection,
  TransitDisruptionSeverity,
  TransitMode,
  TransitPlaceType,
  TransitReviewStatus,
  TransitRouteScope,
  TransitRouteStatus,
  TransitServiceDay,
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

export class CreateTransitRouteDto {
  @IsUUID()
  areaId: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsUUID()
  originPlaceId: string;

  @IsUUID()
  destinationPlaceId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsEnum(TransitRouteScope)
  scope: TransitRouteScope;

  @IsEnum(TransitMode)
  mode: TransitMode;

  @IsEnum(TransitDirection)
  direction: TransitDirection;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  destinationSign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  operatorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  publicDescription?: string;
}

export class TransitGraphStopDto {
  @IsUUID()
  placeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  platformName?: string;

  @IsBoolean()
  pickupAllowed = true;

  @IsBoolean()
  dropoffAllowed = true;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  boardingInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  alightingInstructions?: string;
}

export class TransitGraphSegmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fromStopOrder: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  toStopOrder: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  durationMinMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  durationMaxMinutes: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  distanceM?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fareMinKobo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fareMaxKobo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  roadDescription?: string;
}

export class TransitServiceWindowDto {
  @IsEnum(TransitServiceDay)
  day: TransitServiceDay;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_439)
  startMinute: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_439)
  endMinute: number;

  @IsBoolean()
  endsNextDay = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  frequencyMinMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  frequencyMaxMinutes?: number;

  @IsBoolean()
  isApproximate = true;
}

export class SaveTransitRouteGraphDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransitGraphStopDto)
  stops: TransitGraphStopDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => TransitGraphSegmentDto)
  segments: TransitGraphSegmentDto[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TransitServiceWindowDto)
  serviceWindows: TransitServiceWindowDto[] = [];
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
