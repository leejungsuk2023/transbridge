/**
 * POST /api/session/end
 * Receives sendBeacon requests from the client during page unload.
 * Marks an active session as ended and calculates duration.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from('sessions')
      .select('started_at, status')
      .eq('id', id)
      .single();

    if (!session || session.status === 'ended') {
      return NextResponse.json({ success: true });
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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
