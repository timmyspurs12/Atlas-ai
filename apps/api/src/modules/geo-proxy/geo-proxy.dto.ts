import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Client-facing inputs for the geo proxy.
 *
 * Note what is absent: no URL, no host, no path and no provider selector. The destination
 * of every upstream request is operator configuration. That omission is the proxy's primary
 * SSRF defence and must not be "improved" by accepting a target from the client.
 */

export enum RoutingProfileDto {
  DRIVING = 'driving',
  CYCLING = 'cycling',
  WALKING = 'walking',
}

export class CoordinateDto {
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
}

export class PlanRouteDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  coordinates: CoordinateDto[];

  @IsOptional()
  @IsEnum(RoutingProfileDto)
  profile: RoutingProfileDto = RoutingProfileDto.DRIVING;

  /** Turn-by-turn steps are much larger; only request them when they will be rendered. */
  @IsOptional()
  @IsBoolean()
  withSteps = false;
}

export class SearchPlaceDto {
  @IsString()
  @Length(2, 200)
  query: string;
}

export class PlaceCoordinatesDto {
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
}
