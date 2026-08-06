import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

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
