/**
 * Session CRUD endpoints
 * POST   /api/session  — create new session (auth required)
 * GET    /api/session?id=xxx — get session by ID
 * PATCH  /api/session  — update session status / patientLang
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Session } from '@/types';

/** Verify Firebase ID token from Authorization header and return the UID */
async function verifyToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// ── POST: Create session ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = uuidv4();
    const now = new Date();

    const sessionData = {
      id: sessionId,
      hospitalId: uid,
      patientLang: null,
      status: 'waiting' as const,
      startedAt: now,
    };

    await adminDb.collection('sessions').doc(sessionId).set({
      ...sessionData,
      startedAt: now.toISOString(),
    });

    return NextResponse.json({ success: true, data: { session: sessionData } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ── GET: Fetch session by ID ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
    }

    const doc = await adminDb.collection('sessions').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const data = doc.data()!;
    const session: Session = {
      id: doc.id,
      hospitalId: data.hospitalId,
      patientLang: data.patientLang,
      status: data.status,
      startedAt: new Date(data.startedAt),
      ...(data.endedAt && { endedAt: new Date(data.endedAt) }),
      ...(data.durationSec !== undefined && { durationSec: data.durationSec }),
    };

    return NextResponse.json({ success: true, data: { session } });
  } catch (error) {
    console.error('[GET /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH: Update session ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, patientLang } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'id and status are required' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('sessions').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { status };

    if (patientLang) {
      updates.patientLang = patientLang;
    }

    if (status === 'ended') {
      const startedAt = new Date(doc.data()!.startedAt);
      const endedAt = new Date();
      const durationSec = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      updates.endedAt = endedAt.toISOString();
      updates.durationSec = durationSec;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    const data = updated.data()!;
    const session: Session = {
      id: updated.id,
      hospitalId: data.hospitalId,
      patientLang: data.patientLang,
      status: data.status,
      startedAt: new Date(data.startedAt),
      ...(data.endedAt && { endedAt: new Date(data.endedAt) }),
      ...(data.durationSec !== undefined && { durationSec: data.durationSec }),
    };

    return NextResponse.json({ success: true, data: { session } });
  } catch (error) {
    console.error('[PATCH /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
