import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator,
  signInAnonymously,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

const env = import.meta.env;
const useEmulator = env.VITE_USE_EMULATOR === 'true';

// Firebase web config is public by design (it ships in the bundle); Firestore rules protect the data.
// Any VITE_FIREBASE_* env var overrides these defaults, e.g. to point at a different project.
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyD75wHBAi4vTodKceXttByqdLWqMPa8mN4',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'splitter-61a04.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || (useEmulator ? 'demo-splitter' : 'splitter-61a04'),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'splitter-61a04.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '523496592517',
  appId: env.VITE_FIREBASE_APP_ID || '1:523496592517:web:d2e8ffcf2696262fb045ec',
};

export const isConfigured = Boolean(config.projectId);

// App Check (reCAPTCHA Enterprise / "Fraud Defense", invisible) proves requests come from the real
// site, so a script can't burn the free Firestore quota. The site key is public by design, like the
// API key; Enterprise keys have no secret. No billing on the project = free tier (10k checks/month,
// errors past that, never a charge), so keep the App Check token TTL long (about 1 day).
// Empty key = App Check off. Once enforcement is on in the Firebase console, untokened requests fail.
const RECAPTCHA_SITE_KEY = env.VITE_RECAPTCHA_SITE_KEY ?? '6LcjSC0uAAAAAG1h5NpWSu2LTV20BXykI_ZrQ0MU';

const app = initializeApp(config);

if (RECAPTCHA_SITE_KEY && !useEmulator) {
  // Must run before Firestore makes its first request.
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

let firestore;
try {
  // Offline cache so the trip still opens without network; syncs when back online.
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Plain HTTP long-polling instead of a streaming connection: slightly slower, but works on
    // mobile networks, proxies and antivirus software that silently break streaming.
    experimentalForceLongPolling: true,
  });
} catch {
  firestore = initializeFirestore(app, { experimentalForceLongPolling: true });
}
if (useEmulator) {
  connectFirestoreEmulator(firestore, '127.0.0.1', Number(env.VITE_EMULATOR_PORT || 8080));
}

export const db = firestore;

// Silent anonymous sign-in: no login screen, but every device gets a stable uid that the rules
// require for writes and stamp onto what it writes (createdUid/updatedUid).
// No popup/redirect resolver, so the auth iframe from firebaseapp.com is never loaded.
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
if (useEmulator) {
  connectAuthEmulator(auth, `http://127.0.0.1:${Number(env.VITE_AUTH_EMULATOR_PORT || 9099)}`, { disableWarnings: true });
}

let signingIn = null;
/**
 * Resolves with the signed-in user, signing in anonymously the first time. A device that has
 * signed in before resolves straight from local storage, even offline. Retries after a failure.
 */
export async function ensureUser() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  signingIn ??= signInAnonymously(auth)
    .then((cred) => cred.user)
    .finally(() => { signingIn = null; });
  return signingIn;
}

/** The current device's uid (call after ensureUser). */
export const currentUid = () => auth.currentUser?.uid ?? null;

// Start signing in right away so the first write doesn't wait. Offline is fine: writes retry it.
ensureUser().catch(() => {});
if (typeof window !== 'undefined') window.addEventListener('online', () => ensureUser().catch(() => {}));
