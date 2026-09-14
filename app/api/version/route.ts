/**
 * GET /api/version
 * Returns the deployed build's short commit SHA so clients can detect when a
 * newer build has gone live and trigger a reload.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function GET() {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
  return NextResponse.json({ sha }, { headers: NO_CACHE });
}
