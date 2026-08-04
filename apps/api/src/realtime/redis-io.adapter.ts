import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import type { Environment } from '../config/environment';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private publishClient?: Redis;
  private subscribeClient?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService<Environment, true>,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    this.publishClient = new Redis(url, { lazyConnect: true });
    this.subscribeClient = this.publishClient.duplicate();
    await Promise.all([this.publishClient.connect(), this.subscribeClient.connect()]);
    this.adapterConstructor = createAdapter(this.publishClient, this.subscribeClient);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as {
      adapter: (adapter: ReturnType<typeof createAdapter>) => void;
    };
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
