import { INestApplication, Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
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
  private readonly logger: Logger;
  private readonly _pool: Pool;

  constructor() {
    const logger = new Logger(PrismaService.name);
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }

    try {
      const parsedUrl = new URL(connectionString);
      logger.log(`Prisma connecting to database: "${parsedUrl.pathname.replace('/', '')}" on host: "${parsedUrl.host}" as user: "${parsedUrl.username}"`);
      parsedUrl.searchParams.set('schema', 'studio_gallery');
      parsedUrl.searchParams.delete('options');
      connectionString = parsedUrl.toString();
    } catch (e) {
      // Fallback
    }

    const pool = new Pool({ connectionString });
    
    // Set search_path on connection startup, fully compatible with Neon pooler.
    pool.on('connect', (client) => {
      logger.log('Database connection pool established a new physical connection.');
      client.query('SET search_path TO studio_gallery, public;')
        .then(() => {
          logger.log('Successfully set search_path to studio_gallery, public on connection.');
        })
        .catch((err) => {
          logger.error('Failed to set search_path on client connect:', err);
        });
    });

    const adapter = new PrismaPg(pool, { schema: 'studio_gallery' });

    // Pass the adapter so PrismaClient knows how to connect.
    super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

    this.logger = logger;
    this._pool = pool;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma Client connected successfully to PostgreSQL database.');
    } catch (err) {
      this.logger.error('Prisma Client failed to connect to PostgreSQL database:', err);
      throw err;
    }
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
