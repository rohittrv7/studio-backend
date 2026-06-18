import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

interface StoredOtp {
  hash: string;
  expiresAt: Date;
}

/**
 * In-memory OTP store for local development only.
 * OTP codes are never returned in HTTP responses — only logged server-side.
 */
@Injectable()
export class DevOtpService {
  private readonly store = new Map<string, StoredOtp>();

  generate(phone: string): string {
    const otp = '000000';
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    this.store.set(phone, { hash, expiresAt });
    this.purgeExpired();

    return otp;
  }

  verify(phone: string, otp: string): boolean {
    const entry = this.store.get(phone);
    if (!entry || entry.expiresAt <= new Date()) {
      this.store.delete(phone);
      return false;
    }

    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    if (hash !== entry.hash) return false;

    this.store.delete(phone);
    return true;
  }

  private purgeExpired(): void {
    const now = new Date();
    for (const [phone, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) this.store.delete(phone);
    }
  }
}
