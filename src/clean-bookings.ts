import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Bypass TLS self-signed cert issue for script
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool, { schema: 'studio_gallery' });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Cleaning bookings and payments data...');
  
  // Delete all booking payments first due to foreign keys
  const paymentsResult = await prisma.bookingPayment.deleteMany();
  console.log(`Deleted ${paymentsResult.count} booking payments.`);
  
  // Delete all bookings
  const bookingsResult = await prisma.booking.deleteMany();
  console.log(`Deleted ${bookingsResult.count} bookings.`);
  
  // Delete audit logs
  const logsResult = await prisma.auditLog.deleteMany();
  console.log(`Deleted ${logsResult.count} audit logs.`);

  console.log('Database clean completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error cleaning database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
