/**
 * POST /api/log-error
 * Persists client-side runtime errors to the error_logs table.
 * Always returns 200 — logging failures must never break the user flow.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

const MAX_MESSAGE_LEN = 2000;
const MAX_CODE_LEN = 100;
const MAX_CONTEXT_LEN = 4000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const errorType: string | undefined = body?.errorType;
    if (!errorType) {
      // Still return 200 — never error to client
      console.error('[log-error] Missing errorType in request body');
      return NextResponse.json({ ok: true }, { headers: NO_CACHE });
    }

    const userAgent = req.headers.get('user-agent') ?? undefined;
    const referer = req.headers.get('referer') ?? undefined;

    const errorMessage = typeof body.errorMessage === 'string'
      ? body.errorMessage.slice(0, MAX_MESSAGE_LEN)
      : undefined;

    const errorCode = body.errorCode != null
      ? String(body.errorCode).slice(0, MAX_CODE_LEN)
      : undefined;

    const rawContext = body.context != null
      ? JSON.stringify(body.context).slice(0, MAX_CONTEXT_LEN)
      : null;
    const context = rawContext != null ? JSON.parse(rawContext) : undefined;

    const url: string | undefined = (typeof body.url === 'string' && body.url)
      ? body.url
      : referer;

    const record = {
      session_id: body.sessionId ?? null,
      hospital_id: body.hospitalId ?? null,
      error_type: errorType,
      error_message: errorMessage ?? null,
      error_code: errorCode ?? null,
      context: context ?? null,
      user_agent: userAgent ?? null,
      url: url ?? null,
      patient_lang: body.patientLang ?? null,
      source: 'client' as const,
    };

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('error_logs').insert(record);

    if (error) {
      console.error('[log-error] Supabase insert failed:', error.message);
    }
  } catch (err) {
    console.error('[log-error] Unexpected error:', err);
  }

  // Always return 200 regardless of success or failure
  return NextResponse.json({ ok: true }, { headers: NO_CACHE });
}
