/**
 * POST /api/auth
 * Authenticates a hospital user with Supabase Auth and returns a session token.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateEnv } from '@/lib/env-check';

export async function POST(req: NextRequest) {
  try {
    const env = validateEnv();
    if (!env.valid) {
      return NextResponse.json(
        { success: false, error: `Server misconfiguration: missing ${env.missing.join(', ')}` },
        { status: 500 }
      );
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: authError?.message ?? 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Get the hospital record linked to this auth user
    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, name, email, plan')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (hospitalError || !hospital) {
      return NextResponse.json(
        { success: false, error: 'Hospital account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        token: authData.session?.access_token,
        user: { id: authData.user.id, email: authData.user.email },
        hospital,
      },
    });
  } catch (error) {
    console.error('[POST /api/auth] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
