/**
 * POST /api/gemini-token
 * Generates a short-lived ephemeral token for client-side Gemini Live WebSocket access.
 * Falls back to returning the API key directly if ephemeral token API is unavailable
 * (acceptable for controlled hospital device environment).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt } from '@/lib/glossary';

export async function POST(req: NextRequest) {
  try {
    const { sourceLang, targetLang } = await req.json();

    if (!sourceLang || !targetLang) {
      return NextResponse.json({ error: 'sourceLang and targetLang required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

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

    if (!response.ok) {
      // Ephemeral token API unavailable — fall back to direct API key
      const systemPrompt = buildSystemPrompt(sourceLang, targetLang);
      return NextResponse.json({
        success: true,
        data: {
          apiKey: apiKey,
          model: 'gemini-2.0-flash-live-001',
          systemPrompt,
          wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
        },
      });
    }

    const tokenData = await response.json();
    const systemPrompt = buildSystemPrompt(sourceLang, targetLang);

    return NextResponse.json({
      success: true,
      data: {
        ephemeralToken: tokenData.ephemeralToken?.token,
        model: 'gemini-2.0-flash-live-001',
        systemPrompt,
        wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
