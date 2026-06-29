// Prisma config — generated for Prisma v7 compatibility
// This file is auto-used by Prisma CLI for schema/migration paths.
// DATABASE_URL is resolved from the environment (set via .env or runtime).

require('dotenv/config');
const { defineConfig, env } = require('prisma/config');

const config = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres?schema=studio_gallery',
  },
});

module.exports = config;
