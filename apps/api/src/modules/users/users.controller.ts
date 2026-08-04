import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { SearchUsersDto, UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() principal: AuthPrincipal): ReturnType<UsersService['me']> {
    return this.users.me(principal.userId);
  }

  @Patch('me')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: UpdateProfileDto,
  ): ReturnType<UsersService['updateProfile']> {
    return this.users.updateProfile(principal.userId, input);
  }

  @Get('search')
  search(
    @CurrentUser() principal: AuthPrincipal,
    @Query() input: SearchUsersDto,
  ): ReturnType<UsersService['search']> {
    return this.users.search(principal.userId, input);
  }

  @Get('me/export')
  exportData(@CurrentUser() principal: AuthPrincipal): ReturnType<UsersService['exportData']> {
    return this.users.exportData(principal.userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() principal: AuthPrincipal): Promise<void> {
    await this.users.scheduleDeletion(principal);
  }
}
