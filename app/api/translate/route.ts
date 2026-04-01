/**
 * POST /api/translate
 * Accepts base64-encoded webm audio from the browser MediaRecorder,
 * sends to Gemini Live API for real-time speech-to-speech translation,
 * and returns the result as JSON.
 * Audio data is NEVER stored (privacy requirement).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { translateWithGeminiLive } from '../../../lib/gemini-live';
import { TranslateRequest, TranslateResponse } from '../../../types';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(req: NextRequest): Promise<NextResponse<TranslateResponse>> {
  const requestStart = Date.now();

  let body: TranslateRequest;
  try {
    body = (await req.json()) as TranslateRequest;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400, headers: NO_CACHE });
  }

  const { audioData, sourceLang, targetLang, speaker, sessionId } = body;

  // Validate required fields
  if (!audioData || typeof audioData !== 'string') {
    return NextResponse.json({ success: false, error: 'audioData is required (base64 string)' }, { status: 400, headers: NO_CACHE });
  }
  if (!sourceLang || !['ko', 'th', 'vi'].includes(sourceLang)) {
    return NextResponse.json({ success: false, error: 'sourceLang must be ko, th, or vi' }, { status: 400, headers: NO_CACHE });
  }
  if (!targetLang || !['ko', 'th', 'vi'].includes(targetLang)) {
    return NextResponse.json({ success: false, error: 'targetLang must be ko, th, or vi' }, { status: 400, headers: NO_CACHE });
  }
  if (!speaker || !['staff', 'patient'].includes(speaker)) {
    return NextResponse.json({ success: false, error: 'speaker must be staff or patient' }, { status: 400, headers: NO_CACHE });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400, headers: NO_CACHE });
  }

  // Decode base64 audio to a Buffer (webm/opus from browser MediaRecorder)
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioData, 'base64');
  } catch {
    return NextResponse.json({ success: false, error: 'audioData is not valid base64' }, { status: 400, headers: NO_CACHE });
  }

  try {
    const result = await translateWithGeminiLive({
      audioChunk: audioBuffer,
      sourceLang,
      targetLang,
      speaker,
      sessionId,
    });

    const totalMs = Date.now() - requestStart;
    console.log(`[Translate API] Done in ${totalMs}ms (gemini: ${result.processingTimeMs}ms)`);

    return NextResponse.json({
      success: true,
      data: {
        originalText: result.originalText,
        translatedText: result.translatedText,
        audioData: result.audioData,
        glossaryTerms: result.glossaryTerms,
        processingTimeMs: result.processingTimeMs,
      },
    }, { headers: NO_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Translate API] Gemini Live error:', message);
    return NextResponse.json({ success: false, error: `Translation failed: ${message}` }, { status: 500, headers: NO_CACHE });
  }
}
