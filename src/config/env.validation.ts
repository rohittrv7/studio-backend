import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WEAK_JWT_SECRETS = new Set([
  'changeme',
  'replace_with_a_long_random_secret_at_least_32_chars',
  'your_jwt_secret',
]);

/**
 * Validates critical environment variables at startup.
 * Throws in production when secrets are missing or weak.
 */
export function validateEnvironment(configService: ConfigService): void {
  const logger = new Logger('EnvValidation');
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = configService.get<string>('JWT_SECRET') ?? '';
  if (!jwtSecret || jwtSecret.length < 32 || WEAK_JWT_SECRETS.has(jwtSecret)) {
    const message =
      'JWT_SECRET must be a random string of at least 32 characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';

    if (isProduction) {
      throw new Error(message);
    }
    logger.warn(`${message} (allowed in ${nodeEnv} only)`);
  }

  if (isProduction && configService.get<string>('ENABLE_DEV_OTP') === 'true') {
    throw new Error('ENABLE_DEV_OTP must not be enabled in production');
  }

  if (isProduction && configService.get<string>('ALLOW_DEMO_AUTH') === 'true') {
    throw new Error('ALLOW_DEMO_AUTH must not be enabled in production');
  }
}
