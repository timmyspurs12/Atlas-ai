import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Environment } from '../config/environment';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Environment, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 20,
    });
    super({
      adapter,
      log:
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? ['warn', 'error']
          : config.get('NODE_ENV', { infer: true }) === 'test'
            ? []
            : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
