import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { requestContextMiddleware } from './common/interceptors/request-context.middleware';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { FriendsModule } from './modules/friends/friends.module';
import { GeofencesModule } from './modules/geofences/geofences.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SafetyModule } from './modules/safety/safety.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TransitModule } from './modules/transit/transit.module';
import { TripsModule } from './modules/trips/trips.module';
import { UsersModule } from './modules/users/users.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    CommonModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    TripsModule,
    GeofencesModule,
    LocationsModule,
    SafetyModule,
    ChatModule,
    NotificationsModule,
    AiModule,
    SubscriptionsModule,
    TransitModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requestContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
