import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum TripPeriodDto {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class StartTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class TripsQueryDto {
  @IsOptional()
  @IsEnum(TripPeriodDto)
  period: TripPeriodDto = TripPeriodDto.WEEK;

  @IsOptional()
  @IsDateString()
  anchor?: string;
}
