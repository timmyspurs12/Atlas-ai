import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { ReviewTransitCoverageDto } from './transit-coverage.dto';
import { TransitCoverageService } from './transit-coverage.service';

@ApiTags('Transit coverage administration')
@ApiBearerAuth()
@Controller('transit/admin/coverage')
export class TransitCoverageController {
  constructor(private readonly coverage: TransitCoverageService) {}

  @Get()
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  list(): ReturnType<TransitCoverageService['list']> {
    return this.coverage.list();
  }

  @Get(':areaId/metrics')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  metrics(
    @Param('areaId', new ParseUUIDPipe()) areaId: string,
  ): ReturnType<TransitCoverageService['metrics']> {
    return this.coverage.metrics(areaId);
  }

  @Post(':areaId/review')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  review(
    @CurrentUser() principal: AuthPrincipal,
    @Param('areaId', new ParseUUIDPipe()) areaId: string,
    @Body() input: ReviewTransitCoverageDto,
  ): ReturnType<TransitCoverageService['review']> {
    return this.coverage.review(principal.userId, areaId, input);
  }
}
