/**
 * POST /api/session/end
 * Receives sendBeacon requests from the client during page unload.
 * Marks an active session as ended and calculates duration.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: NO_CACHE });

    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from('sessions')
      .select('started_at, status')
      .eq('id', id)
      .single();

    if (!session || session.status === 'ended') {
      return NextResponse.json({ success: true }, { headers: NO_CACHE });
    }

    const endedAt = new Date();
    const durationSec = Math.floor(
      (endedAt.getTime() - new Date(session.started_at).getTime()) / 1000
    );

    await supabase
      .from('sessions')
      .update({
        status: 'ended',
        ended_at: endedAt.toISOString(),
        duration_sec: durationSec,
      })
      .eq('id', id);

    return NextResponse.json({ success: true }, { headers: NO_CACHE });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: NO_CACHE });
  }
}
