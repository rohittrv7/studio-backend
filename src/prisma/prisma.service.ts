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
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }

    try {
      const parsedUrl = new URL(connectionString);
      parsedUrl.searchParams.set('schema', 'studio_gallery');
      parsedUrl.searchParams.delete('options');
      connectionString = parsedUrl.toString();
    } catch (e) {
      // Fallback
    }

    const pool = new Pool({ connectionString });
    
    // Set search_path on connection startup, fully compatible with Neon pooler.
    pool.on('connect', (client) => {
      client.query('SET search_path TO studio_gallery, public;').catch((err) => {
        console.error('Failed to set search_path on client connect:', err);
      });
    });

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
