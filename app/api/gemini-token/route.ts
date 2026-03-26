/**
 * POST /api/gemini-token
 * Generates a short-lived ephemeral token for client-side Gemini Live WebSocket access.
 * Falls back to returning the API key directly if ephemeral token API is unavailable
 * (acceptable for controlled hospital device environment).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt } from '@/lib/glossary';
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

    const { sourceLang, targetLang } = await req.json();

    if (!sourceLang || !targetLang) {
      return NextResponse.json({ success: false, error: 'sourceLang and targetLang required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY!;

    // Request ephemeral token from Google AI
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-preview-12-2025:generateEphemeralToken`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          ephemeralToken: {
            expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
          },
        }),
      }
    );

    // Token lifetime: 5 minutes. expiresAt is used by the client for proactive refresh.
    const TOKEN_TTL_MS = 5 * 60 * 1000;
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    if (!response.ok) {
      // Ephemeral token API unavailable — fall back to direct API key
      const systemPrompt = buildSystemPrompt(sourceLang, targetLang);
      return NextResponse.json({
        success: true,
        data: {
          apiKey: apiKey,
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          systemPrompt,
          wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
          expiresAt,
        },
      });
    }

    const tokenData = await response.json();
    const systemPrompt = buildSystemPrompt(sourceLang, targetLang);

    return NextResponse.json({
      success: true,
      data: {
        ephemeralToken: tokenData.ephemeralToken?.token,
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        systemPrompt,
        wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
        expiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
