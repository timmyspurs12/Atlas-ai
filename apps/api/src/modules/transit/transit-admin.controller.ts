import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  CreateTransitDisruptionDto,
  CreateTransitFareDto,
  CreateTransitPlaceDto,
  CreateTransitRouteDto,
  ReviewTransitFareDto,
  ReviewTransitPlaceDto,
  SaveTransitRouteGraphDto,
  TransitAdminListDto,
  ValidateTransitCsvDto,
} from './transit-admin.dto';
import { TransitAdminService } from './transit-admin.service';

const adminRoles = [UserRole.TRANSIT_EDITOR, UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN];

@ApiTags('Transit administration')
@ApiBearerAuth()
@Controller('transit/admin')
export class TransitAdminController {
  constructor(private readonly admin: TransitAdminService) {}

  @Get('overview')
  @Roles(...adminRoles)
  overview(): ReturnType<TransitAdminService['overview']> {
    return this.admin.overview();
  }

  @Get('places')
  @Roles(...adminRoles)
  places(@Query() input: TransitAdminListDto): ReturnType<TransitAdminService['listPlaces']> {
    return this.admin.listPlaces(input);
  }

  @Post('places')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  createPlace(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateTransitPlaceDto,
  ): ReturnType<TransitAdminService['createPlace']> {
    return this.admin.createPlace(principal.userId, input);
  }

  @Post('places/:placeId/review')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  reviewPlace(
    @CurrentUser() principal: AuthPrincipal,
    @Param('placeId', new ParseUUIDPipe()) placeId: string,
    @Body() input: ReviewTransitPlaceDto,
  ): ReturnType<TransitAdminService['reviewPlace']> {
    return this.admin.reviewPlace(principal.userId, placeId, input);
  }

  @Get('routes')
  @Roles(...adminRoles)
  routes(@Query() input: TransitAdminListDto): ReturnType<TransitAdminService['listRoutes']> {
    return this.admin.listRoutes(input);
  }

  @Get('routes/:routeId')
  @Roles(...adminRoles)
  routeDetails(
    @Param('routeId', new ParseUUIDPipe()) routeId: string,
  ): ReturnType<TransitAdminService['routeDetails']> {
    return this.admin.routeDetails(routeId);
  }

  @Post('routes')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  createRoute(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateTransitRouteDto,
  ): ReturnType<TransitAdminService['createRoute']> {
    return this.admin.createRoute(principal.userId, input);
  }

  @Post('routes/:routeId/graph')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  saveRouteGraph(
    @CurrentUser() principal: AuthPrincipal,
    @Param('routeId', new ParseUUIDPipe()) routeId: string,
    @Body() input: SaveTransitRouteGraphDto,
  ): ReturnType<TransitAdminService['saveRouteGraph']> {
    return this.admin.saveRouteGraph(principal.userId, routeId, input);
  }

  @Get('revisions/pending')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  pendingRevisions(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): ReturnType<TransitAdminService['pendingRevisions']> {
    return this.admin.pendingRevisions(limit);
  }

  @Post('fares')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  createFare(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateTransitFareDto,
  ): ReturnType<TransitAdminService['createFare']> {
    return this.admin.createFare(principal.userId, input);
  }

  @Post('fares/:fareId/review')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  reviewFare(
    @CurrentUser() principal: AuthPrincipal,
    @Param('fareId', new ParseUUIDPipe()) fareId: string,
    @Body() input: ReviewTransitFareDto,
  ): ReturnType<TransitAdminService['reviewFare']> {
    return this.admin.reviewFare(principal.userId, fareId, input);
  }

  @Post('disruptions')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  publishDisruption(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateTransitDisruptionDto,
  ): ReturnType<TransitAdminService['publishDisruption']> {
    return this.admin.publishDisruption(principal.userId, input);
  }

  @Post('imports/validate')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Validate a transit CSV without importing or publishing it' })
  validateCsv(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: ValidateTransitCsvDto,
  ): ReturnType<TransitAdminService['validateCsv']> {
    return this.admin.validateCsv(principal.userId, input);
  }
}
