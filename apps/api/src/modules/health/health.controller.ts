import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live(): Record<string, unknown> {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<Record<string, unknown>> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (this.redis.optional) {
        // Single-instance Phase 0 hosting: Redis is not a readiness dependency.
        return { status: 'ready', checks: { database: 'up', redis: 'disabled' } };
      }
      await this.redis.connect();
      await this.redis.client.ping();
      return { status: 'ready', checks: { database: 'up', redis: 'up' } };
    } catch {
      throw new ServiceUnavailableException('Service dependencies are unavailable');
    }
  }
}
