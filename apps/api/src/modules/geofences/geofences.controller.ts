import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { CreateGeofenceDto, UpdateGeofenceDto } from './geofences.dto';
import { GeofencesService } from './geofences.service';

@ApiTags('Geofences')
@ApiBearerAuth()
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofences: GeofencesService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): ReturnType<GeofencesService['list']> {
    return this.geofences.list(principal.userId);
  }

  @Post()
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateGeofenceDto,
  ): ReturnType<GeofencesService['create']> {
    return this.geofences.create(principal.userId, input);
  }

  @Patch(':geofenceId')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('geofenceId') geofenceId: string,
    @Body() input: UpdateGeofenceDto,
  ): ReturnType<GeofencesService['update']> {
    return this.geofences.update(principal.userId, geofenceId, input);
  }

  @Delete(':geofenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('geofenceId') geofenceId: string,
  ): Promise<void> {
    await this.geofences.remove(principal.userId, geofenceId);
  }
}
