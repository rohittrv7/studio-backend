import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { getFirebaseAdmin } from '../../config/firebase.config';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { DevOtpService } from './dev-otp.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;
const REFRESH_TOKEN_DAYS = 30;
const ACCESS_TOKEN_SECONDS = 3600;

function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.substring(2);
  }
  return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
}

/** Demo accounts seeded in prisma/seed.ts — dev bypass only. */
const DEMO_PHONES = new Set(['1234567890', '9876543210']);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly devOtpService: DevOtpService,
  ) {}

  // ─── Send OTP ─────────────────────────────────────────────────────────────

  /**
   * Validates that the account exists (auto-creating it if new) and is not
   * locked, then returns a confirmation message.  The actual OTP SMS is
   * triggered client-side via the Firebase SDK — the backend only needs to
   * confirm/create the account.
   *
   * Self-registration policy: all self-registering users (both studio_owner
   * and customer user-types) are created as STUDIO_OWNER accounts in the User
   * table.  Customers added by a studio owner via the admin API continue to
   * live in the Customer table and can still log in as 'customer'.
   */
  async sendOtp(dto: SendOtpDto): Promise<{ message: string; expiresInSeconds: number }> {
    dto.phone = sanitizePhone(dto.phone);
    if (dto.userType === 'studio_owner') {
      // Find or auto-create the studio owner account.
      let user = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });

      if (!user) {
        // Auto-register: new user signing up for the first time.
        // firebaseUid is set to a placeholder and updated on verifyOtp.
        user = await this.prisma.user.create({
          data: {
            phone: dto.phone,
            firebaseUid: `pending_${dto.phone}`,
            name: 'Studio Owner',
            role: 'STUDIO_OWNER',
          },
        });
        this.logger.log(`Auto-created studio owner account for ${dto.phone}`);
      }

      this.assertNotLocked(user.isLocked, user.lockedUntil);
    } else {
      // For 'customer' userType: first check the Customer table (assigned by a
      // studio owner), then fall back to the User table (self-registered).
      const customer = await this.prisma.customer.findFirst({
        where: { phone: dto.phone, deletedAt: null },
      });

      if (customer) {
        this.assertNotLocked(customer.isLocked, customer.lockedUntil);
      } else {
        // Not a studio-assigned customer — check/create in the User table.
        let user = await this.prisma.user.findUnique({
          where: { phone: dto.phone },
        });

        if (!user) {
          user = await this.prisma.user.create({
            data: {
              phone: dto.phone,
              firebaseUid: `pending_${dto.phone}`,
              name: 'User',
              role: 'CUSTOMER',
            },
          });
          this.logger.log(`Auto-created user account for customer self-registration: ${dto.phone}`);
        }

        this.assertNotLocked(user.isLocked, user.lockedUntil);
      }
    }

    if (this.isDevOtpEnabled()) {
      const otp = this.devOtpService.generate(dto.phone);
      // Never include OTP in the HTTP response — server logs only.
      this.logger.warn(
        `[DEV OTP] ${dto.phone} → ${otp} (valid 5 min — check backend terminal, not API response)`,
      );
    }

    return { message: 'OTP sent successfully', expiresInSeconds: 300 };
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      id: string;
      name: string;
      email?: string | null;
      profilePhoto?: string | null;
      role: string;
      galleryIds: string[];
      studioName?: string | null;
      location?: string | null;
      description?: string | null;
      upiId?: string | null;
      upiQrCode?: string | null;
    };
  }> {
    dto.phone = sanitizePhone(dto.phone);
    // 1. Verify the Firebase ID token, dev OTP, or demo bypass (dev only).
    let firebaseUid: string;
    const isDemoBypass = this.isDemoBypassAllowed(dto.idToken, dto.phone);
    const isDevOtpVerify =
      this.isDevOtpEnabled() && dto.otp != null && dto.otp.length === 6;

    if (isDevOtpVerify) {
      if (!this.devOtpService.verify(dto.phone, dto.otp!)) {
        if (dto.userType === 'studio_owner') {
          await this.incrementFailedAttempts(dto.phone, 'studio_owner');
        } else {
          await this.incrementFailedAttempts(dto.phone, 'customer');
        }
        throw new UnauthorizedException('Invalid or expired OTP');
      }
      firebaseUid = `dev_${dto.phone.replace(/\D/g, '')}`;
    } else if (isDemoBypass) {
      firebaseUid = `demo_${dto.userType}_uid`;
    } else {
      if (!dto.idToken) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }
      try {
        const decoded = await getFirebaseAdmin().verifyIdToken(dto.idToken);
        firebaseUid = decoded.uid;
      } catch (err) {
        this.logger.warn(`Firebase token verification failed: ${String(err)}`);
        if (dto.userType === 'studio_owner') {
          await this.incrementFailedAttempts(dto.phone, 'studio_owner');
        } else {
          await this.incrementFailedAttempts(dto.phone, 'customer');
        }
        throw new UnauthorizedException('Invalid or expired OTP');
      }
    }

    // 2. Resolve the account and build JWT payload
    if (dto.userType === 'studio_owner') {
      let user = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });

      if (!user) throw new NotFoundException('No account found for this phone number');
      this.assertNotLocked(user.isLocked, user.lockedUntil);

      // Seed a sample gallery if they don't have any
      if (user.galleries.length === 0) {
        await this.createSampleGallery(user.id);
        user = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
        }) ?? user;
      }

      // Update firebaseUid if needed, and reset failed attempts
      await this.prisma.user.update({
        where: { id: user.id },
        data: { firebaseUid, failedOtpAttempts: 0, isLocked: false, lockedUntil: null },
      });

      const galleryIds = user.galleries.map((g) => g.id);
      const accessToken = this.signAccessToken(user.id, 'studio_owner', galleryIds);
      const { token: refreshToken } = await this.createRefreshToken({
        userId: user.id,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_SECONDS,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profilePhoto: user.profilePhoto,
          role: 'studio_owner',
          galleryIds,
          studioName: user.studioName,
          location: user.location,
          description: user.description,
          upiId: user.upiId,
          upiQrCode: user.upiQrCode,
        },
      };
    } else {
      const customer = await this.prisma.customer.findFirst({
        where: { phone: dto.phone, deletedAt: null },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });

      if (customer) {
        this.assertNotLocked(customer.isLocked, customer.lockedUntil);

        // Update firebaseUid if needed, and reset failed attempts
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { firebaseUid, failedOtpAttempts: 0, isLocked: false, lockedUntil: null },
        });

        // Ensure they also have a User record in the `users` table so bookings work
        let customerUser = await this.prisma.user.findFirst({
          where: { phone: dto.phone },
        });
        if (!customerUser) {
          customerUser = await this.prisma.user.create({
            data: {
              phone: dto.phone,
              firebaseUid: firebaseUid || `customer_${customer.id}`,
              name: customer.name,
              email: customer.email,
              profilePhoto: customer.profilePhoto,
              role: 'CUSTOMER',
            },
          });
        }

        // Fetch all galleries where customer.phone == dto.phone
        const allCustomerGalleries = await this.prisma.gallery.findMany({
          where: { customer: { phone: dto.phone }, deletedAt: null },
          select: { id: true },
        });
        const galleryIds = allCustomerGalleries.map((g) => g.id);

        const accessToken = this.signAccessToken(customerUser.id, 'customer', galleryIds);
        const { token: refreshToken } = await this.createRefreshToken({
          userId: customerUser.id,
        });

        return {
          accessToken,
          refreshToken,
          expiresIn: ACCESS_TOKEN_SECONDS,
          user: { 
            id: customerUser.id, 
            name: customerUser.name, 
            email: customerUser.email, 
            profilePhoto: customerUser.profilePhoto, 
            role: 'customer', 
            galleryIds 
          },
        };
      }

      // Fall back to User table for self-registered 'customer' userType users.
      let user = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });

      if (!user) throw new NotFoundException('No account found for this phone number');
      this.assertNotLocked(user.isLocked, user.lockedUntil);

      // Seed a sample gallery if they don't have any
      if (user.galleries.length === 0) {
        await this.createSampleGallery(user.id);
        user = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
        }) ?? user;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { firebaseUid, failedOtpAttempts: 0, isLocked: false, lockedUntil: null },
      });

      const roleMapped = user.role === 'CUSTOMER' ? 'customer' : 'studio_owner';
      
      // Fetch all galleries by phone for customer role
      let galleryIds: string[] = [];
      if (roleMapped === 'customer') {
        const allCustomerGalleries = await this.prisma.gallery.findMany({
          where: { customer: { phone: dto.phone }, deletedAt: null },
          select: { id: true },
        });
        galleryIds = allCustomerGalleries.map((g) => g.id);
      } else {
        galleryIds = user.galleries.map((g) => g.id);
      }

      const accessToken = this.signAccessToken(user.id, roleMapped, galleryIds);
      const { token: refreshToken } = await this.createRefreshToken({
        userId: user.id,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_SECONDS,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profilePhoto: user.profilePhoto,
          role: roleMapped,
          galleryIds,
          studioName: user.studioName,
          location: user.location,
          description: user.description,
        },
      };
    }
  }

  // ─── Refresh ──────────────────────────────────────────────────────────────

  async refresh(
    dto: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke the old token
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    // Determine identity and build new tokens
    if (existing.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: existing.userId },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });
      if (!user) throw new UnauthorizedException('User not found');

      const roleMapped = user.role === 'CUSTOMER' ? 'customer' : 'studio_owner';
      const galleryIds = user.galleries.map((g) => g.id);
      const accessToken = this.signAccessToken(user.id, roleMapped, galleryIds);
      const { token: refreshToken } = await this.createRefreshToken({ userId: user.id });

      return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_SECONDS };
    } else if (existing.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: existing.customerId, deletedAt: null },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });
      if (!customer) throw new UnauthorizedException('Customer not found');

      const galleryIds = customer.galleries.map((g) => g.id);
      const accessToken = this.signAccessToken(customer.id, 'customer', galleryIds);
      const { token: refreshToken } = await this.createRefreshToken({
        customerId: customer.id,
      });

      return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_SECONDS };
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(dto: RefreshTokenDto): Promise<{ message: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });

    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    // Always return success to avoid token-existence oracle
    return { message: 'Logged out successfully' };
  }

  // ─── Register FCM Token ───────────────────────────────────────────────────

  async registerFcmToken(
    userId: string,
    role: 'studio_owner' | 'customer',
    dto: RegisterFcmTokenDto,
  ): Promise<{ message: string }> {
    if (role === 'studio_owner') {
      await this.prisma.fcmToken.upsert({
        where: { token: dto.token },
        update: { platform: dto.platform, userId, customerId: null },
        create: { token: dto.token, platform: dto.platform, userId },
      });
    } else {
      await this.prisma.fcmToken.upsert({
        where: { token: dto.token },
        update: { platform: dto.platform, customerId: userId, userId: null },
        create: { token: dto.token, platform: dto.platform, customerId: userId },
      });
    }

    return { message: 'FCM token registered' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private isDevOtpEnabled(): boolean {
    return (
      this.configService.get<string>('NODE_ENV') !== 'production' &&
      this.configService.get<string>('ENABLE_DEV_OTP') === 'true'
    );
  }

  /** Demo login bypass — disabled in production, restricted to seeded demo phones. */
  private isDemoBypassAllowed(idToken: string | undefined, phone: string): boolean {
    if (!idToken || idToken !== 'DEMO_TOKEN') return false;
    if (this.configService.get<string>('NODE_ENV') === 'production') return false;
    if (this.configService.get<string>('ALLOW_DEMO_AUTH') === 'false') return false;
    return DEMO_PHONES.has(phone);
  }

  private assertNotLocked(isLocked: boolean, lockedUntil: Date | null): void {
    if (!isLocked) return;

    // Auto-unlock when the lock window has passed
    if (lockedUntil && lockedUntil <= new Date()) return;

    throw new HttpException(
      'Account is temporarily locked due to too many failed attempts',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private signAccessToken(
    sub: string,
    role: 'studio_owner' | 'customer',
    galleryIds: string[],
  ): string {
    return this.jwtService.sign({ sub, role, galleryIds });
  }

  private async createRefreshToken(
    owner: { userId?: string; customerId?: string },
  ): Promise<{ token: string }> {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        token,
        expiresAt,
        userId: owner.userId ?? null,
        customerId: owner.customerId ?? null,
      },
    });

    return { token };
  }

  /** Increments failed OTP attempts and locks the account on the 5th failure. */
  private async incrementFailedAttempts(
    phone: string,
    userType: 'studio_owner' | 'customer',
  ): Promise<void> {
    if (userType === 'studio_owner') {
      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) return;

      const newCount = user.failedOtpAttempts + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedOtpAttempts: newCount,
          isLocked: shouldLock,
          lockedUntil,
        },
      });

      if (shouldLock) {
        throw new HttpException(
          'Too many failed attempts. Account locked for 30 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } else {
      const customer = await this.prisma.customer.findFirst({
        where: { phone, deletedAt: null },
      });
      if (customer) {
        const newCount = customer.failedOtpAttempts + 1;
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
        const lockedUntil = shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
          : null;

        await this.prisma.customer.update({
          where: { id: customer.id },
          data: {
            failedOtpAttempts: newCount,
            isLocked: shouldLock,
            lockedUntil,
          },
        });

        if (shouldLock) {
          throw new HttpException(
            'Too many failed attempts. Account locked for 30 minutes.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      } else {
        const user = await this.prisma.user.findUnique({ where: { phone } });
        if (!user) return;

        const newCount = user.failedOtpAttempts + 1;
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
        const lockedUntil = shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
          : null;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedOtpAttempts: newCount,
            isLocked: shouldLock,
            lockedUntil,
          },
        });

        if (shouldLock) {
          throw new HttpException(
            'Too many failed attempts. Account locked for 30 minutes.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }
  }

  private async createSampleGallery(userId: string): Promise<void> {
    try {
      const gallery = await this.prisma.gallery.create({
        data: {
          studioOwnerId: userId,
          name: 'Sample Portfolio Gallery',
          downloadEnabled: true,
        },
      });

      const photoshootFolder = await this.prisma.folder.create({
        data: { galleryId: gallery.id, name: 'Photoshoot Highlights', depth: 0 },
      });

      const videoFolder = await this.prisma.folder.create({
        data: { galleryId: gallery.id, name: 'Video Reels', depth: 0 },
      });

      // Add sample photos
      const samplePhotos = [
        'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=90',
        'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&q=90',
        'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=90',
        'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200&q=90',
      ];

      for (let i = 0; i < samplePhotos.length; i++) {
        await this.prisma.mediaFile.create({
          data: {
            galleryId: gallery.id,
            folderId: photoshootFolder.id,
            cloudinaryPublicId: `sample/photo_${i}_${Date.now()}`,
            secureUrl: samplePhotos[i],
            thumbnailUrl: samplePhotos[i].replace('w=1200', 'w=400'),
            mediaType: 'PHOTO',
            mimeType: 'image/jpeg',
            fileSize: 2000000,
            width: 1200,
            height: 800,
          },
        });
      }

      // Add sample video
      await this.prisma.mediaFile.create({
        data: {
          galleryId: gallery.id,
          folderId: videoFolder.id,
          cloudinaryPublicId: `sample/video_1_${Date.now()}`,
          secureUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&q=80',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSize: 15000000,
          width: 1280,
          height: 720,
          durationSeconds: 15.0,
        },
      });

      this.logger.log(`Created sample gallery for user ${userId}`);
    } catch (e) {
      this.logger.error(`Failed to create sample gallery: ${String(e)}`);
    }
  }

  async updateProfile(
    userId: string,
    role: string,
    dto: UpdateProfileDto,
  ): Promise<{
    id: string;
    name: string;
    email: string | null;
    profilePhoto: string | null;
    role: string;
    galleryIds: string[];
    studioName?: string | null;
    location?: string | null;
    description?: string | null;
    razorpayKeyId?: string | null;
    razorpayKeySecret?: string | null;
    upiId?: string | null;
    upiQrCode?: string | null;
  }> {
    const userExists = await this.prisma.user.findUnique({ where: { id: userId } });

    if (userExists) {
      if (dto.phone && dto.phone !== userExists.phone) {
        const phoneTaken = await this.prisma.user.findFirst({
          where: { phone: dto.phone, id: { not: userId } },
        });
        if (phoneTaken) {
          throw new BadRequestException('Phone number is already in use');
        }
      }

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          profilePhoto: dto.profilePhoto,
          studioName: dto.studioName,
          location: dto.location,
          description: dto.description,
          upiId: dto.upiId,
          upiQrCode: dto.upiQrCode,
        },
        include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto,
        role: user.role.toLowerCase(),
        galleryIds: user.galleries.map((g) => g.id),
        studioName: user.studioName,
        location: user.location,
        description: user.description,
        upiId: user.upiId,
        upiQrCode: user.upiQrCode,
      };
    }

    const customerExists = await this.prisma.customer.findFirst({ where: { id: userId, deletedAt: null } });
    if (!customerExists) throw new NotFoundException('Account not found');

    if (dto.phone && dto.phone !== customerExists.phone) {
      const phoneTaken = await this.prisma.customer.findFirst({
        where: { phone: dto.phone, studioOwnerId: customerExists.studioOwnerId, id: { not: userId } },
      });
      if (phoneTaken) {
        throw new BadRequestException('Phone number is already in use by another customer in this studio');
      }
    }

    const customer = await this.prisma.customer.update({
      where: { id: userId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        profilePhoto: dto.profilePhoto,
      },
      include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
    });
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      profilePhoto: customer.profilePhoto,
      role: 'customer',
      galleryIds: customer.galleries.map((g) => g.id),
    };
  }

  async getProfile(
    userId: string,
    role: string,
  ): Promise<{
    id: string;
    name: string;
    email: string | null;
    profilePhoto: string | null;
    role: string;
    galleryIds: string[];
    studioName?: string | null;
    location?: string | null;
    description?: string | null;
    upiId?: string | null;
    upiQrCode?: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
    });

    if (user) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto,
        role: user.role.toLowerCase(),
        galleryIds: user.galleries.map((g) => g.id),
        studioName: user.studioName,
        location: user.location,
        description: user.description,
        upiId: user.upiId,
        upiQrCode: user.upiQrCode,
      };
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: userId, deletedAt: null },
      include: { galleries: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!customer) throw new NotFoundException('Account not found');

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      profilePhoto: customer.profilePhoto,
      role: 'customer',
      galleryIds: customer.galleries.map((g) => g.id),
    };
  }
}
