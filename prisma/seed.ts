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
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80',
  'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&q=80',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=800&q=80',
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&q=80',
];

const PHOTO_URLS = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=90',
  'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=1200&q=90',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=1200&q=90',
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&q=90',
  'https://images.unsplash.com/photo-1494972308805-463bc619d34e?w=1200&q=90',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1200&q=90',
  'https://images.unsplash.com/photo-1439539698758-ba2680ecadb9?w=1200&q=90',
  'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=1200&q=90',
  'https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?w=1200&q=90',
  'https://images.unsplash.com/photo-1525772764200-be829a350797?w=1200&q=90',
  'https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=1200&q=90',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1200&q=90',
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
      phone: '+911234567890',
      firebaseUid: 'demo_owner_uid',
      name: 'Rohit Sharma',
      role: 'STUDIO_OWNER',
    },
  });
  console.log(`✅ Studio owner: ${owner.name} (${owner.phone})`);

  // ── Customer ──────────────────────────────────────────────────────────────
  const customer = await prisma.customer.create({
    data: {
      studioOwnerId: owner.id,
      phone: '+919876543210',
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
  console.log('  Studio Owner → +911234567890');
  console.log('  Customer     → +919876543210');
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
