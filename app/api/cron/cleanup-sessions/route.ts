/**
 * GET /api/cron/cleanup-sessions
 *
 * Vercel Cron target — registered in vercel.json as "0 * * * *" (hourly).
 * Ends all sessions that are still active or waiting more than 1 hour after
 * they were started. Runs on Vercel's scheduler, completely traffic-independent
 * and global (covers every hospital, not just those that happen to load the
 * session list).
 *
 * Safe by design: the update only touches rows whose started_at is more than
 * 1 hour in the past and whose status is not already 'ended', so calling this
 * endpoint manually or more frequently than scheduled is harmless.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    // Optional auth: if CRON_SECRET is configured, require the matching Bearer token.
    // Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" when the
    // env var is set on the project, so this requires zero extra client wiring.
    // If CRON_SECRET is not set the check is skipped — safe for initial deploys.
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization') || '';
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    // Sessions started more than 1 hour ago that are still open are considered zombies.
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const supabase = getSupabaseAdmin();

    // Bulk-end all stale sessions globally (no hospital_id filter — covers every hospital).
    // duration_sec is intentionally left NULL: a session orphaned for hours/days has no
    // meaningful real duration; this matches the behaviour in /api/session/list's stale cleanup.
    const { data, error } = await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: nowIso })
      .neq('status', 'ended')
      .lt('started_at', cutoff)
      .select('id');

    if (error) {
      console.error('[cron/cleanup-sessions] error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const count = data?.length ?? 0;
    console.log(`[cron/cleanup-sessions] ended ${count} stale session(s)`);
    return NextResponse.json({ success: true, ended: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/cleanup-sessions] error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
