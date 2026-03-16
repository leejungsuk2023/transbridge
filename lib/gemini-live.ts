/**
 * Gemini Live API client for real-time speech-to-speech translation.
 * Replaces the 3-step pipeline (Google STT + Translation + TTS) with a single API call.
 * Audio data is NEVER persisted to disk or database (privacy).
 */

import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, Session } from '@google/genai';
import { buildSystemPrompt, findGlossaryTermsInText } from './glossary';

const MODEL = 'gemini-2.5-flash-native-audio';

export interface GeminiTranslateInput {
  audioChunk: Buffer;             // webm/opus audio from MediaRecorder
  sourceLang: 'ko' | 'th' | 'vi';
  targetLang: 'ko' | 'th' | 'vi';
  speaker: 'staff' | 'patient';
  sessionId: string;
}

export interface GeminiTranslateOutput {
  originalText: string;
  translatedText: string;
  audioData: string;              // base64 encoded audio
  glossaryTerms: string[];
  processingTimeMs: number;
}

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');
  return new GoogleGenAI({ apiKey });
}

/**
 * Translates speech audio using Gemini Live API (single session per PTT press).
 * Opens a Gemini Live session, sends audio, collects audio + text response, closes session.
 */
export async function translateWithGeminiLive(
  input: GeminiTranslateInput
): Promise<GeminiTranslateOutput> {
  const { audioChunk, sourceLang, targetLang, speaker, sessionId } = input;
  const start = Date.now();

  console.log(
    `[Gemini Live] Request: sessionId=${sessionId} speaker=${speaker} ${sourceLang}→${targetLang} audioSize=${audioChunk.length}B`
  );

  const genai = getGenAI();
  const systemInstruction = buildSystemPrompt(sourceLang, targetLang);

  return new Promise<GeminiTranslateOutput>((resolve, reject) => {
    let session: Session | null = null;
    let originalText = '';
    let translatedText = '';
    const audioChunks: string[] = [];
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      try { session?.close(); } catch { /* ignore */ }

      const audioData = audioChunks.join('');
      const glossaryTerms = findGlossaryTermsInText(translatedText, sourceLang, targetLang);
      const processingTimeMs = Date.now() - start;

      console.log(
        `[Gemini Live] Done in ${processingTimeMs}ms: "${originalText}" → "${translatedText}"`
      );

      resolve({ originalText, translatedText, audioData, glossaryTerms, processingTimeMs });
    }

    function fail(err: unknown) {
      if (settled) return;
      settled = true;
      try { session?.close(); } catch { /* ignore */ }
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    genai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO, Modality.TEXT],
        systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          if (!session) return;
          try {
            // Send audio chunk as realtime input
            const base64Audio = audioChunk.toString('base64');
            session.sendRealtimeInput({
              audio: {
                data: base64Audio,
                mimeType: 'audio/webm;codecs=opus',
              },
            });
            // Signal end of utterance
            session.sendRealtimeInput({ audioStreamEnd: true });
          } catch (e) {
            fail(e);
          }
        },
        onmessage: (msg: LiveServerMessage) => {
          const content = msg.serverContent;
          if (!content) return;

          // Input transcription (original speech → text)
          if (content.inputTranscription?.text) {
            originalText += content.inputTranscription.text;
          }

          // Output transcription (translated speech → text)
          if (content.outputTranscription?.text) {
            translatedText += content.outputTranscription.text;
          }

          // Audio output parts
          if (content.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
                audioChunks.push(part.inlineData.data);
              }
            }
          }

          // Turn complete: done
          if (content.turnComplete) {
            finish();
          }
        },
        onerror: (e: ErrorEvent) => {
          fail(new Error(`Gemini Live WebSocket error: ${e.message ?? e}`));
        },
        onclose: () => {
          // If we haven't finished via turnComplete, resolve with what we have
          finish();
        },
      },
    }).then((s) => {
      session = s;
    }).catch(fail);
  });
}
