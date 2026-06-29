import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Instantiates a Razorpay client dynamically.
   * Uses studio owner custom credentials if configured, otherwise falls back to platform environment keys.
   */
  private getClient(customKeyId?: string | null, customKeySecret?: string | null): Razorpay {
    const keyId = customKeyId || this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = customKeySecret || this.config.get<string>('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      this.logger.error('Razorpay key_id or key_secret is missing.');
      throw new Error('Razorpay API keys are not configured');
    }

    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  /**
   * Creates an order on Razorpay
   */
  async createOrder(
    amount: number,
    receiptId: string,
    customKeyId?: string | null,
    customKeySecret?: string | null,
  ): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
    const keyId = customKeyId || this.config.get<string>('RAZORPAY_KEY_ID') || '';
    const client = this.getClient(customKeyId, customKeySecret);

    // Razorpay expects amount in paise (1 INR = 100 paise)
    const options = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: receiptId,
    };

    try {
      const order = await client.orders.create(options);
      return {
        orderId: order.id,
        amount: order.amount as number,
        currency: order.currency,
        keyId: keyId,
      };
    } catch (error) {
      this.logger.error(`Failed to create Razorpay order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Verifies the Razorpay payment signature
   */
  verifySignature(
    orderId: string,
    paymentId: string,
    signature: string,
    customKeySecret?: string | null,
  ): boolean {
    const keySecret = customKeySecret || this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      this.logger.error('Razorpay key_secret is missing for verification.');
      throw new Error('Razorpay API secret is not configured');
    }

    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(text)
      .digest('hex');

    return generatedSignature === signature;
  }
}
