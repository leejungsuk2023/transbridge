/**
 * Firebase Admin SDK initialization (server-side only)
 * Uses service account env vars. Import this ONLY in API routes and server code.
 * Lazily initialized via Proxy + dynamic require to avoid webpack bundling
 * Node.js modules (http2, fs) into client bundles.
 */

import type { App as AdminApp } from 'firebase-admin/app';
import type { Auth as AdminAuthType } from 'firebase-admin/auth';
import type { Firestore as AdminFirestoreType } from 'firebase-admin/firestore';

let _adminApp: AdminApp | undefined;
let _adminAuth: AdminAuthType | undefined;
let _adminDb: AdminFirestoreType | undefined;

function initAdmin() {
  if (_adminApp) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeApp: adminInitializeApp, getApps: adminGetApps, cert } = require('firebase-admin/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuth: adminGetAuth } = require('firebase-admin/auth');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getFirestore: adminGetFirestore } = require('firebase-admin/firestore');

  if (!adminGetApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : cert({
          projectId,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        });

    _adminApp = adminInitializeApp({
      credential,
      projectId,
    });
  } else {
    _adminApp = adminGetApps()[0];
  }

  _adminAuth = adminGetAuth(_adminApp);
  _adminDb = adminGetFirestore(_adminApp);
}

export const adminApp: AdminApp = new Proxy({} as AdminApp, {
  get(_target, prop) {
    if (typeof window !== 'undefined') throw new Error('Admin SDK not available on client');
    initAdmin();
    return (_adminApp as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const adminAuth: AdminAuthType = new Proxy({} as AdminAuthType, {
  get(_target, prop) {
    if (typeof window !== 'undefined') throw new Error('Admin SDK not available on client');
    initAdmin();
    return (_adminAuth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const adminDb: AdminFirestoreType = new Proxy({} as AdminFirestoreType, {
  get(_target, prop) {
    if (typeof window !== 'undefined') throw new Error('Admin SDK not available on client');
    initAdmin();
    return (_adminDb as unknown as Record<string | symbol, unknown>)[prop];
  },
});
