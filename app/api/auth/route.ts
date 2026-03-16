/**
 * POST /api/auth
 * Authenticates a hospital user with Firebase email/password and returns a token.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Firebase Admin SDK does not support sign-in directly.
    // We use the Firebase REST API to verify credentials, then create a custom token.
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    if (!signInRes.ok) {
      const err = await signInRes.json();
      const message = err?.error?.message || 'Invalid credentials';
      return NextResponse.json(
        { success: false, error: message },
        { status: 401 }
      );
    }

    const { idToken, localId: uid } = await signInRes.json();

    // Fetch the hospital document linked to this Firebase user UID
    const hospitalDoc = await adminDb.collection('hospitals').doc(uid).get();

    if (!hospitalDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Hospital account not found' },
        { status: 404 }
      );
    }

    const hospitalData = hospitalDoc.data()!;
    const hospital = {
      id: hospitalDoc.id,
      name: hospitalData.name,
      email: hospitalData.email,
      plan: hospitalData.plan,
    };

    return NextResponse.json({
      success: true,
      data: { token: idToken, hospital },
    });
  } catch (error) {
    console.error('[POST /api/auth] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
