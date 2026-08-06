import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { ReviewTransitRouteDto, SubmitTransitRouteDto } from './transit-publication.dto';
import { TransitPublicationService } from './transit-publication.service';

@ApiTags('Transit publication')
@ApiBearerAuth()
@Controller('transit')
export class TransitPublicationController {
  constructor(private readonly publication: TransitPublicationService) {}

  @Post('editor/routes/:routeId/submit')
  @Roles(UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create and submit an immutable route revision' })
  submit(
    @CurrentUser() principal: AuthPrincipal,
    @Param('routeId', new ParseUUIDPipe()) routeId: string,
    @Body() input: SubmitTransitRouteDto,
  ): ReturnType<TransitPublicationService['submitRouteRevision']> {
    return this.publication.submitRouteRevision(principal.userId, routeId, input);
  }

  @Post('reviewer/revisions/:revisionId/review')
  @Roles(UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve, request changes, or reject a route revision' })
  review(
    @CurrentUser() principal: AuthPrincipal,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Body() input: ReviewTransitRouteDto,
  ): ReturnType<TransitPublicationService['reviewRouteRevision']> {
    return this.publication.reviewRouteRevision(principal.userId, revisionId, input);
  }
}
