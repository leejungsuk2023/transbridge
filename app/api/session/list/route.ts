/**
 * GET /api/session/list?limit=20&offset=0
 * Returns paginated sessions for the authenticated hospital, ordered by started_at descending.
 * Auth required.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateEnv } from '@/lib/env-check';
import type { Session } from '@/types';

/** Verify Supabase JWT from Authorization header and return the user id */
async function verifyToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const env = validateEnv();
    if (!env.valid) {
      return NextResponse.json(
        { success: false, error: `Server misconfiguration: missing ${env.missing.join(', ')}` },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Try to resolve hospital from auth token first
    let hospitalId: string | null = null;
    const authUserId = await verifyToken(req);

    if (authUserId) {
      const { data: hospital } = await supabase
        .from('hospitals')
        .select('id')
        .eq('auth_user_id', authUserId)
        .single();
      hospitalId = hospital?.id ?? null;
    }

    // Fallback: single-device setup — use first hospital record
    if (!hospitalId) {
      const { data: firstHospital } = await supabase
        .from('hospitals')
        .select('id')
        .limit(1)
        .single();
      hospitalId = firstHospital?.id ?? null;
    }

    if (!hospitalId) {
      return NextResponse.json({ success: false, error: 'Hospital not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Auto-close stale sessions: any session still active/waiting after 2 hours is orphaned.
    // This handles cases where the client disconnected without calling the end endpoint.
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: staleSessions } = await supabase
      .from('sessions')
      .select('id, started_at')
      .eq('hospital_id', hospitalId)
      .in('status', ['active', 'waiting'])
      .lt('started_at', staleThreshold);

    if (staleSessions && staleSessions.length > 0) {
      // Bulk-update each stale session: cap ended_at at started_at + 2h and compute real duration_sec
      await Promise.all(
        staleSessions.map((s) => {
          const startMs = new Date(s.started_at).getTime();
          const endedAt = new Date(startMs + 2 * 60 * 60 * 1000);
          const durationSec = Math.floor((endedAt.getTime() - startMs) / 1000);
          return supabase
            .from('sessions')
            .update({
              status: 'ended',
              ended_at: endedAt.toISOString(),
              duration_sec: durationSec,
            })
            .eq('id', s.id);
        })
      );
    }

    // Count total matching sessions
    const { count: total } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId);

    // Fetch paginated sessions ordered by started_at descending
    const { data: rows, error: listError } = await supabase
      .from('sessions')
      .select('id, hospital_id, patient_lang, status, started_at, ended_at, duration_sec')
      .eq('hospital_id', hospitalId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (listError) {
      console.error('[GET /api/session/list] Query error:', listError);
      return NextResponse.json({ success: false, error: 'Failed to fetch sessions' }, { status: 500 });
    }

    const sessions: Session[] = (rows ?? []).map((row) => ({
      id: row.id,
      hospitalId: row.hospital_id,
      patientLang: row.patient_lang,
      status: row.status,
      startedAt: new Date(row.started_at),
      ...(row.ended_at && { endedAt: new Date(row.ended_at) }),
      ...(row.duration_sec !== null && row.duration_sec !== undefined && { durationSec: row.duration_sec }),
    }));

    return NextResponse.json({ success: true, data: { sessions, total: total ?? 0 } });
  } catch (error) {
    console.error('[GET /api/session/list] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
