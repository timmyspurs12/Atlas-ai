import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { BlockUserDto, SendFriendRequestDto } from './friends.dto';
import { FriendsService } from './friends.service';

@ApiTags('Friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): ReturnType<FriendsService['list']> {
    return this.friends.list(principal.userId);
  }

  @Post('requests')
  send(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: SendFriendRequestDto,
  ): ReturnType<FriendsService['sendRequest']> {
    return this.friends.sendRequest(principal.userId, input);
  }

  @Post('requests/:friendshipId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() principal: AuthPrincipal,
    @Param('friendshipId') friendshipId: string,
  ): ReturnType<FriendsService['respond']> {
    return this.friends.respond(principal.userId, friendshipId, true);
  }

  @Post('requests/:friendshipId/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() principal: AuthPrincipal,
    @Param('friendshipId') friendshipId: string,
  ): ReturnType<FriendsService['respond']> {
    return this.friends.respond(principal.userId, friendshipId, false);
  }

  @Delete(':friendshipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('friendshipId') friendshipId: string,
  ): Promise<void> {
    await this.friends.remove(principal.userId, friendshipId);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(@CurrentUser() principal: AuthPrincipal, @Body() input: BlockUserDto): Promise<void> {
    await this.friends.block(principal.userId, input);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(
    @CurrentUser() principal: AuthPrincipal,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.friends.unblock(principal.userId, userId);
  }
}
