import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CoverageTargetStatusDto {
  DATA_COLLECTION = 'DATA_COLLECTION',
  BETA = 'BETA',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
}

export class ReviewTransitCoverageDto {
  @IsEnum(CoverageTargetStatusDto)
  status: CoverageTargetStatusDto;

  @IsOptional()
  @IsDateString()
  lastSurveyedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
