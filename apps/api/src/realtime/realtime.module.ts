import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { SocketAuthService } from './socket-auth.service';

@Global()
@Module({
  imports: [AuthModule],
  providers: [SocketAuthService],
  exports: [SocketAuthService],
})
export class RealtimeModule {}
