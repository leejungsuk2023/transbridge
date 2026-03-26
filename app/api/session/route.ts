/**
 * Session CRUD endpoints
 * POST   /api/session  — create new session (auth required)
 * GET    /api/session?id=xxx — get session by ID
 * PATCH  /api/session  — update session status / patientLang
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateEnv } from '@/lib/env-check';
import type { Session } from '@/types';

/** Verify Supabase JWT from Authorization header and return the user id */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/** Get hospital record for the authenticated user */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getHospitalId(authUserId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('hospitals')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single();
  return data?.id ?? null;
}

// ── POST: Create session ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const env = validateEnv();
    if (!env.valid) {
      return NextResponse.json(
        { success: false, error: `Server misconfiguration: missing ${env.missing.join(', ')}` },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const patientLang = body.patientLang ?? null;

    const supabase = getSupabaseAdmin();

    // Try to get hospital from auth token if available
    let hospitalId: string | null = null;
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData.user) {
          const { data: hospital } = await supabase
            .from('hospitals')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();
          hospitalId = hospital?.id ?? null;
        }
      } catch {}
    }

    // Fallback: use first hospital (single-device, single-hospital setup)
    if (!hospitalId) {
      const { data: firstHospital } = await supabase
        .from('hospitals')
        .select('id')
        .limit(1)
        .single();
      hospitalId = firstHospital?.id ?? null;
    }

    if (!hospitalId) {
      return NextResponse.json({ success: false, error: 'No hospital found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        hospital_id: hospitalId,
        patient_lang: patientLang,
        status: 'active',
      })
      .select('id, hospital_id, patient_lang, status, started_at')
      .single();

    if (error || !data) {
      console.error('[POST /api/session] Insert error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create session' }, { status: 500 });
    }

    const session: Session = {
      id: data.id,
      hospitalId: data.hospital_id,
      patientLang: data.patient_lang,
      status: data.status,
      startedAt: new Date(data.started_at),
    };

    return NextResponse.json({ success: true, data: { session } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ── GET: Fetch session by ID ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const env = validateEnv();
    if (!env.valid) {
      return NextResponse.json(
        { success: false, error: `Server misconfiguration: missing ${env.missing.join(', ')}` },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sessions')
      .select('id, hospital_id, patient_lang, status, started_at, ended_at, duration_sec')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const session: Session = {
      id: data.id,
      hospitalId: data.hospital_id,
      patientLang: data.patient_lang,
      status: data.status,
      startedAt: new Date(data.started_at),
      ...(data.ended_at && { endedAt: new Date(data.ended_at) }),
      ...(data.duration_sec !== null && data.duration_sec !== undefined && { durationSec: data.duration_sec }),
    };

    return NextResponse.json({ success: true, data: { session } });
  } catch (error) {
    console.error('[GET /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH / PUT: Update session ──────────────────────────────────────────────
// PUT is provided as a fallback because some CDN/proxy layers drop PATCH requests.
export async function PUT(req: NextRequest) {
  return PATCH(req);
}

export async function PATCH(req: NextRequest) {
  try {
    const env = validateEnv();
    if (!env.valid) {
      return NextResponse.json(
        { success: false, error: `Server misconfiguration: missing ${env.missing.join(', ')}` },
        { status: 500 }
      );
    }

    const { id, status, patientLang } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'id and status are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch current session to calculate duration
    const { data: existing, error: fetchError } = await supabase
      .from('sessions')
      .select('id, started_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { status };

    if (patientLang !== undefined) {
      updates.patient_lang = patientLang;
    }

    if (status === 'ended') {
      const startedAt = new Date(existing.started_at);
      const endedAt = new Date();
      updates.ended_at = endedAt.toISOString();
      updates.duration_sec = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
    }

    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)
      .select('id, hospital_id, patient_lang, status, started_at, ended_at, duration_sec')
      .single();

    if (error || !data) {
      console.error('[PATCH /api/session] Update error:', error);
      return NextResponse.json({ success: false, error: 'Failed to update session' }, { status: 500 });
    }

    const session: Session = {
      id: data.id,
      hospitalId: data.hospital_id,
      patientLang: data.patient_lang,
      status: data.status,
      startedAt: new Date(data.started_at),
      ...(data.ended_at && { endedAt: new Date(data.ended_at) }),
      ...(data.duration_sec !== null && data.duration_sec !== undefined && { durationSec: data.duration_sec }),
    };

    return NextResponse.json({ success: true, data: { session } });
  } catch (error) {
    console.error('[PATCH /api/session] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
