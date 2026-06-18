import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationStatus, NotificationType } from '@prisma/client';

/** Payload emitted by GalleriesService.assign() */
interface GalleryAssignedPayload {
  galleryId: string;
  customerId: string;
  galleryName: string;
  studioOwnerId: string;
}

/** FCM error codes that warrant a retry */
const RETRYABLE_FCM_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

/** Exponential back-off delays in milliseconds (1 s, 2 s, 4 s) */
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Event listener ───────────────────────────────────────────────────────

  /**
   * Requirements 16.1, 16.2 — triggered whenever a gallery is assigned to a
   * customer.  Fires-and-forgets so the HTTP response is not delayed.
   */
  @OnEvent('gallery.assigned')
  handleGalleryAssigned(payload: GalleryAssignedPayload): void {
    this.sendGalleryReadyNotification(
      payload.customerId,
      payload.galleryId,
    ).catch((err: unknown) => {
      // Errors must never bubble up to the event emitter — log only
      this.logger.error('[notifications] unhandled error in event handler', err);
    });
  }

  // ─── Core method ──────────────────────────────────────────────────────────

  /**
   * Requirements 16.1, 16.2, 16.4
   *
   * 1. Looks up the customer's FCM tokens.
   * 2. Resolves gallery name and studio-owner name.
   * 3. Creates a Notification record (PENDING).
   * 4. Sends an FCM message for every token.
   * 5. On retryable FCM error: up to 3 attempts with exponential back-off.
   * 6. Updates the record to SENT / FAILED accordingly.
   */
  async sendGalleryReadyNotification(
    customerId: string,
    galleryId: string,
  ): Promise<void> {
    // ── 1. Look up FCM tokens for the customer ──────────────────────────────
    const fcmTokenRows = await this.prisma.fcmToken.findMany({
      where: { customerId },
      select: { token: true },
    });

    if (fcmTokenRows.length === 0) {
      this.logger.warn(
        `[notifications] no FCM tokens for customerId=${customerId}; skipping`,
      );
      return;
    }

    // ── 2. Resolve gallery and studio-owner names ───────────────────────────
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      select: {
        name: true,
        studioOwner: { select: { name: true } },
      },
    });

    if (!gallery) {
      this.logger.warn(
        `[notifications] gallery galleryId=${galleryId} not found; skipping`,
      );
      return;
    }

    const galleryName = gallery.name;
    const studioName = gallery.studioOwner.name;

    // ── 3. Create PENDING Notification record ───────────────────────────────
    const notification = await this.prisma.notification.create({
      data: {
        customerId,
        galleryId,
        type: NotificationType.GALLERY_READY,
        status: NotificationStatus.PENDING,
        attempts: 0,
        payload: {
          type: 'GALLERY_READY',
          galleryId,
          galleryName,
          studioName,
        },
      },
    });

    // ── 4 & 5. Send to each token with retry logic ──────────────────────────
    const tokens = fcmTokenRows.map((r) => r.token);
    let lastError: unknown = null;
    let totalAttempts = 0;
    let sent = false;

    for (const token of tokens) {
      const message = {
        token,
        notification: {
          title: `Your gallery is ready`,
          body: `${studioName} has shared "${galleryName}" with you`,
        },
        data: {
          type: 'GALLERY_READY',
          galleryId,
          galleryName,
          studioName,
        },
      };

      let tokenSent = false;

      for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
        totalAttempts += 1;

        try {
          await getMessaging().send(message);
          tokenSent = true;
          sent = true;
          break; // success — move to next token
        } catch (err: unknown) {
          const code = this.extractFcmErrorCode(err);
          const isRetryable = code !== null && RETRYABLE_FCM_CODES.has(code);

          if (!isRetryable) {
            // Non-retryable — give up on this token immediately
            lastError = err;
            this.logger.warn(
              `[notifications] non-retryable FCM error code=${code ?? 'unknown'} attempt=${attempt + 1}`,
            );
            break;
          }

          // Retryable — back off if there are remaining attempts
          const backoffIndex = attempt; // 0→1s, 1→2s, 2→4s
          if (backoffIndex < BACKOFF_DELAYS_MS.length) {
            const delay = BACKOFF_DELAYS_MS[backoffIndex];
            this.logger.warn(
              `[notifications] retryable FCM error code=${code} attempt=${attempt + 1}; retrying in ${delay}ms`,
            );
            await this.sleep(delay);
          } else {
            // Exhausted all retries for this token
            lastError = err;
            this.logger.error(
              `[notifications] FCM delivery failed after ${totalAttempts} attempt(s) for notificationId=${notification.id}`,
            );
          }
        }
      }

      if (tokenSent) {
        // At least one token succeeded — mark overall as sent
        break;
      }
    }

    // ── 6. Update Notification record ──────────────────────────────────────
    const now = new Date();

    if (sent) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          attempts: totalAttempts,
          sentAt: now,
        },
      });
    } else {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          attempts: totalAttempts,
          failedAt: now,
        },
      });

      // Requirement 16.4 — log failure without PII
      this.logger.error(
        `[notifications] notification FAILED notificationId=${notification.id} galleryId=${galleryId} attempts=${totalAttempts}`,
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Extracts the FCM error code from a firebase-admin error, if present. */
  private extractFcmErrorCode(err: unknown): string | null {
    if (
      err !== null &&
      typeof err === 'object' &&
      'errorInfo' in err &&
      typeof (err as Record<string, unknown>).errorInfo === 'object'
    ) {
      const errorInfo = (err as Record<string, unknown>).errorInfo as Record<
        string,
        unknown
      >;
      if (typeof errorInfo.code === 'string') {
        return errorInfo.code;
      }
    }
    return null;
  }

  /** Returns a promise that resolves after `ms` milliseconds. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
