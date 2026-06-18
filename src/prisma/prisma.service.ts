import { INestApplication, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * PrismaService — wraps PrismaClient with a pg connection pool adapter.
 *
 * Prisma v7 removed schema-level `url` from datasource blocks.
 * The connection URL must now be passed via an adapter in the client constructor.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly _pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool, { schema: 'studio_gallery' });

    // Pass the adapter so PrismaClient knows how to connect.
    super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

    this._pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this._pool.end();
  }

  /**
   * Gracefully shuts down the Nest app on Prisma `beforeExit`.
   * Call this once during bootstrap.
   */
  enableShutdownHooks(app: INestApplication): void {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
