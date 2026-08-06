import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitTransitRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export enum TransitReviewDecisionDto {
  APPROVED = 'APPROVED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  REJECTED = 'REJECTED',
}

export class ReviewTransitRouteDto {
  @IsEnum(TransitReviewDecisionDto)
  decision: TransitReviewDecisionDto;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidenceScore?: number;
}
