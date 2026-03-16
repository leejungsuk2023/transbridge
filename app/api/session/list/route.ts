/**
 * GET /api/session/list?hospitalId=xxx&limit=20&offset=0
 * Returns paginated sessions for a hospital, ordered by startedAt descending.
 * Auth required.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Session } from '@/types';

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

export async function GET(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const hospitalId = searchParams.get('hospitalId') || uid;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Count total matching sessions
    const countSnap = await adminDb
      .collection('sessions')
      .where('hospitalId', '==', hospitalId)
      .count()
      .get();
    const total = countSnap.data().count;

    // Fetch paginated sessions ordered by startedAt descending
    const snap = await adminDb
      .collection('sessions')
      .where('hospitalId', '==', hospitalId)
      .orderBy('startedAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    const sessions: Session[] = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        hospitalId: data.hospitalId,
        patientLang: data.patientLang,
        status: data.status,
        startedAt: new Date(data.startedAt),
        ...(data.endedAt && { endedAt: new Date(data.endedAt) }),
        ...(data.durationSec !== undefined && { durationSec: data.durationSec }),
      };
    });

    return NextResponse.json({ success: true, data: { sessions, total } });
  } catch (error) {
    console.error('[GET /api/session/list] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
