import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export enum PlannerPreferenceDto {
  BALANCED = 'BALANCED',
  CHEAPEST = 'CHEAPEST',
  FASTEST = 'FASTEST',
  FEWEST_TRANSFERS = 'FEWEST_TRANSFERS',
  LEAST_WALKING = 'LEAST_WALKING',
  FORMAL_TRANSIT = 'FORMAL_TRANSIT',
}

export class PlanTransitJourneyDto {
  @IsUUID()
  originPlaceId: string;

  @IsUUID()
  destinationPlaceId: string;

  @IsEnum(PlannerPreferenceDto)
  preference: PlannerPreferenceDto = PlannerPreferenceDto.BALANCED;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxTransfers = 3;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxAlternatives = 3;
}

export class NearbyTransitPlacesDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(20_000)
  radiusM = 2_000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 10;
}

export class SearchTransitPlacesDto {
  @IsString()
  @Length(2, 100)
  q: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 15;
}
