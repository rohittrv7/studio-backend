const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool, { schema: 'studio_gallery' });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log('Prisma connected successfully.');

    const phone = '+919999999999';
    console.log(`Checking for user with phone: ${phone}`);
    
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    console.log('User found:', user);

    if (!user) {
      console.log('User not found. Attempting auto-create...');
      user = await prisma.user.create({
        data: {
          phone: phone,
          firebaseUid: `pending_${phone}`,
          name: 'Studio Owner',
          role: 'STUDIO_OWNER',
        },
      });
      console.log('User created successfully:', user);
    }
  } catch (err) {
    console.error('DATABASE ERROR STACK TRACE:');
    console.error(err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
