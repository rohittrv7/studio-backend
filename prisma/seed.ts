/**
 * Demo seed — inserts realistic sample data for the Studio Gallery demo.
 *
 * Run with:  npx ts-node --project tsconfig.json -e "require('./prisma/seed')"
 * Or:        npx tsx prisma/seed.ts
 *
 * Demo credentials:
 *   Studio Owner — phone: +911234567890  (use this on the login screen)
 *   Customer     — phone: +919876543210
 *
 * NOTE: Firebase OTP is bypassed in demo mode. The backend's sendOtp route
 * returns success for any registered phone, and verifyOtp accepts the magic
 * idToken "DEMO_TOKEN" for these demo accounts.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool, { schema: 'studio_gallery' });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// ── Cloudinary sample images (public, no auth needed) ──────────────────────
const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80', // Sunset couple
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&q=80', // Bride laughing
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80', // Groom getting ready
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=800&q=80', // Table detail
];

const PHOTO_URLS = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=90', // Sunset couple
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&q=90', // Bride laughing
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=90', // Groom getting ready
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200&q=90', // Table detail
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1200&q=90', // Portrait close
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=90', // Dreamy outdoor portrait
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200&q=90', // Fashion model
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=90', // Mountain couple
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&q=90', // Jewelry hands detail
  'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1200&q=90', // Rings closeup
  'https://images.unsplash.com/photo-1519225495810-7517c2965a7d?w=1200&q=90', // Couple holding hands
  'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1200&q=90', // Romantic sparklers
];

const THUMB_URLS = PHOTO_URLS.map((u) => u.replace('w=1200', 'w=400'));

async function main() {
  console.log('🌱 Seeding demo data...');

  // ── Clean previous demo data ──────────────────────────────────────────────
  await prisma.mediaFile.deleteMany({});
  await prisma.folder.deleteMany({});
  await prisma.qrLink.deleteMany({});
  await prisma.galleryView.deleteMany({});
  await prisma.favorite.deleteMany({});
  await prisma.gallery.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.fcmToken.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.user.deleteMany({});

  // ── Studio Owner ──────────────────────────────────────────────────────────
  const owner = await prisma.user.create({
    data: {
      phone: '1234567890',
      firebaseUid: 'demo_owner_uid',
      name: 'Rohit Sharma',
      role: 'STUDIO_OWNER',
      studioName: 'Rohit Studio',
      location: 'Mumbai',
      description: 'Premium photography studio',
    },
  });
  console.log(`✅ Studio owner: ${owner.name} (${owner.phone})`);

  // ── Customer ──────────────────────────────────────────────────────────────
  const customer = await prisma.customer.create({
    data: {
      studioOwnerId: owner.id,
      phone: '9876543210',
      name: 'Priya Kapoor',
      firebaseUid: 'demo_customer_uid',
    },
  });
  console.log(`✅ Customer: ${customer.name} (${customer.phone})`);

  // ── Gallery 1 — Wedding ───────────────────────────────────────────────────
  const wedding = await prisma.gallery.create({
    data: {
      studioOwnerId: owner.id,
      customerId: customer.id,
      name: 'Sharma — Kapoor Wedding',
      downloadEnabled: true,
    },
  });

  const weddingCeremonyFolder = await prisma.folder.create({
    data: { galleryId: wedding.id, name: 'Ceremony', depth: 0 },
  });
  const weddingReceptionFolder = await prisma.folder.create({
    data: { galleryId: wedding.id, name: 'Reception', depth: 0 },
  });
  const weddingDetailsFolder = await prisma.folder.create({
    data: {
      galleryId: wedding.id,
      parentId: weddingCeremonyFolder.id,
      name: 'Details',
      depth: 1,
    },
  });

  // Add photos to ceremony folder
  for (let i = 0; i < 5; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: wedding.id,
        folderId: weddingCeremonyFolder.id,
        cloudinaryPublicId: `demo/wedding_ceremony_${i}`,
        secureUrl: PHOTO_URLS[i % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[i % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 2_500_000 + i * 100_000,
        width: 1920,
        height: 1280,
      },
    });
  }

  // Add photos to reception folder
  for (let i = 5; i < 9; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: wedding.id,
        folderId: weddingReceptionFolder.id,
        cloudinaryPublicId: `demo/wedding_reception_${i}`,
        secureUrl: PHOTO_URLS[i % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[i % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 3_000_000 + i * 80_000,
        width: 1920,
        height: 1280,
      },
    });
  }

  // Add photos to details sub-folder
  for (let i = 9; i < 12; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: wedding.id,
        folderId: weddingDetailsFolder.id,
        cloudinaryPublicId: `demo/wedding_details_${i}`,
        secureUrl: PHOTO_URLS[i % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[i % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 1_800_000 + i * 50_000,
        width: 1280,
        height: 1920,
      },
    });
  }

  console.log(`✅ Gallery: "${wedding.name}" — 12 photos in 3 folders`);

  // ── Gallery 2 — Pre-wedding Shoot ─────────────────────────────────────────
  const prewedding = await prisma.gallery.create({
    data: {
      studioOwnerId: owner.id,
      customerId: customer.id,
      name: 'Pre-Wedding Shoot — Goa',
      downloadEnabled: false,
    },
  });

  const beachFolder = await prisma.folder.create({
    data: { galleryId: prewedding.id, name: 'Beach Sunset', depth: 0 },
  });
  const forestFolder = await prisma.folder.create({
    data: { galleryId: prewedding.id, name: 'Forest Walk', depth: 0 },
  });

  for (let i = 0; i < 4; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: prewedding.id,
        folderId: beachFolder.id,
        cloudinaryPublicId: `demo/prewedding_beach_${i}`,
        secureUrl: PHOTO_URLS[(i + 4) % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[(i + 4) % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 2_200_000 + i * 120_000,
        width: 1920,
        height: 1280,
      },
    });
  }

  for (let i = 0; i < 3; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: prewedding.id,
        folderId: forestFolder.id,
        cloudinaryPublicId: `demo/prewedding_forest_${i}`,
        secureUrl: PHOTO_URLS[(i + 8) % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[(i + 8) % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 2_000_000 + i * 90_000,
        width: 1280,
        height: 1920,
      },
    });
  }

  console.log(`✅ Gallery: "${prewedding.name}" — 7 photos in 2 folders`);

  // ── Gallery 3 — Baby Shower (unassigned — owner only) ─────────────────────
  const babyShower = await prisma.gallery.create({
    data: {
      studioOwnerId: owner.id,
      name: 'Baby Shower — Ananya',
      downloadEnabled: true,
    },
  });

  const babyRoot = await prisma.folder.create({
    data: { galleryId: babyShower.id, name: 'Highlights', depth: 0 },
  });

  for (let i = 0; i < 6; i++) {
    await prisma.mediaFile.create({
      data: {
        galleryId: babyShower.id,
        folderId: babyRoot.id,
        cloudinaryPublicId: `demo/baby_shower_${i}`,
        secureUrl: PHOTO_URLS[(i + 2) % PHOTO_URLS.length],
        thumbnailUrl: THUMB_URLS[(i + 2) % THUMB_URLS.length],
        mediaType: 'PHOTO',
        mimeType: 'image/jpeg',
        fileSize: 1_900_000 + i * 70_000,
        width: 1920,
        height: 1280,
      },
    });
  }

  console.log(`✅ Gallery: "${babyShower.name}" — 6 photos (owner only)`);

  // ── Update gallery cover thumbnails ───────────────────────────────────────
  // (first media file per gallery becomes the cover)
  await prisma.$executeRawUnsafe(`
    UPDATE studio_gallery.galleries g
    SET updated_at = NOW()
    WHERE g.studio_owner_id = '${owner.id}'
  `);

  console.log('\n🎉 Demo seed complete!');
  console.log('─────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Studio Owner → 1234567890');
  console.log('  Customer     → 9876543210');
  console.log('  Demo bypass  → use phone number only (no real OTP needed)');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
