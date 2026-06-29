import {
  initializeApp,
  getApp,
  getApps,
  App,
  cert,
  ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { ConfigService } from '@nestjs/config';

/**
 * Initialises the Firebase Admin SDK once, using credentials from environment
 * variables. Subsequent calls return the already-initialised instance.
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID      – Firebase project identifier
 *   FIREBASE_CLIENT_EMAIL    – Service-account client e-mail
 *   FIREBASE_PRIVATE_KEY     – PEM private key (use \n for newlines in .env)
 */
export function initFirebaseAdmin(configService: ConfigService): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
  const clientEmail = configService.getOrThrow<string>('FIREBASE_CLIENT_EMAIL');
  // .env stores newlines as literal \n — replace them with real newlines
  const privateKey = configService
    .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
    .replace(/\\n/g, '\n');

  const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey };

  return initializeApp({ credential: cert(serviceAccount) });
}

/** Returns the Firebase Admin Auth service. */
export function getFirebaseAdmin(): Auth {
  return getAuth();
}

export { App, Auth };
