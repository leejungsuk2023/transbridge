/**
 * Firebase Client SDK initialization
 * Uses NEXT_PUBLIC_FIREBASE_* env vars (safe for browser)
 * Lazily initialized to avoid errors during Next.js build-time page data collection.
 *
 * For Admin SDK (server-side only), import from '@/lib/firebase-admin'.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

function getClientApp(): FirebaseApp {
  if (getApps().length) return getApp();
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  return initializeApp(firebaseConfig);
}

// Lazy getters — evaluated on first use, not at module import time
export const app: FirebaseApp = new Proxy({} as FirebaseApp, {
  get(_target, prop) {
    return (getClientApp() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    return (getAuth(getClientApp()) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    return (getFirestore(getClientApp()) as unknown as Record<string | symbol, unknown>)[prop];
  },
});
