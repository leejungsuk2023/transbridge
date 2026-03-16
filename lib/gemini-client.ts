/**
 * Client-side Gemini Live API helper.
 * Uses @google/genai SDK's live.connect() — matches Google's official reference implementation.
 * Ref: https://github.com/google-gemini/live-api-web-console/blob/main/src/lib/genai-live-client.ts
 */

import {
  GoogleGenAI,
  LiveConnectConfig,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";

export interface GeminiLiveConfig {
  apiKey?: string;
  ephemeralToken?: string;
  model: string;
  systemPrompt: string;
  // wsUrl is kept in the interface for backward compatibility but is no longer used.
  // The SDK derives the endpoint from the model name and API key.
  wsUrl?: string;
}

export interface GeminiLiveCallbacks {
  onOriginalText: (text: string) => void;
  onTranslatedText: (text: string) => void;
  onAudio: (data: ArrayBuffer) => void;
  onError: (error: string) => void;
  onStateChange: (state: "connecting" | "connected" | "disconnected") => void;
}

/**
 * Converts a base64 string to an ArrayBuffer.
 * Matches base64ToArrayBuffer from the reference utils.ts exactly.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a base64 string.
 * Matches arrayBufferToBase64 from the reference audio-recorder.ts exactly.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class GeminiLiveSession {
  private client: GoogleGenAI;
  private session: Session | null = null;
  private callbacks: GeminiLiveCallbacks;
  private config: GeminiLiveConfig;

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    // The SDK accepts either an API key or an ephemeral token (access_token).
    // For ephemeral tokens, we pass it as apiKey — the SDK sends it as the key param.
    const key = config.ephemeralToken ?? config.apiKey ?? "";
    this.client = new GoogleGenAI({ apiKey: key });
  }

  async connect(): Promise<void> {
    this.callbacks.onStateChange("connecting");

    // LiveConnectConfig matches Google's reference exactly.
    const liveConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{ text: this.config.systemPrompt }],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };

    try {
      this.session = await this.client.live.connect({
        model: this.config.model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            this.callbacks.onError("setup 전송 완료, 응답 대기중...");
          },
          onmessage: (message: LiveServerMessage) => {
            this._handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            this.callbacks.onError(`Gemini error: ${e.message || "unknown"}`);
            this.callbacks.onStateChange("disconnected");
          },
          onclose: (e: CloseEvent) => {
            this.callbacks.onError(
              `WS close: code=${e.code} reason=${e.reason || "none"}`
            );
            if (e.code !== 1000) {
              this.callbacks.onStateChange("disconnected");
            }
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Connect failed: ${msg}`);
      this.callbacks.onStateChange("disconnected");
      throw err;
    }
  }

  private _handleMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.callbacks.onStateChange("connected");
      return;
    }

    if (message.toolCall) {
      return;
    }

    if (message.serverContent) {
      const { serverContent } = message;

      if ("interrupted" in serverContent) {
        return;
      }

      // Input audio transcription (what the user said)
      if (serverContent.inputTranscription?.text) {
        this.callbacks.onOriginalText(serverContent.inputTranscription.text);
      }

      // Output audio transcription (what Gemini is saying)
      if (serverContent.outputTranscription?.text) {
        this.callbacks.onTranslatedText(serverContent.outputTranscription.text);
      }

      if (serverContent.modelTurn) {
        const parts = serverContent.modelTurn.parts || [];

        // Extract audio parts — mimeType starts with "audio/pcm"
        for (const part of parts) {
          if (
            part.inlineData &&
            part.inlineData.mimeType?.startsWith("audio/pcm") &&
            part.inlineData.data
          ) {
            const audioBuffer = base64ToArrayBuffer(part.inlineData.data);
            this.callbacks.onAudio(audioBuffer);
          }
        }
      }
    }
  }

  /**
   * Send a PCM audio chunk to Gemini.
   * Matches sendRealtimeInput from the reference genai-live-client.ts exactly.
   * @param base64PcmChunk Base64-encoded Int16 PCM at 16kHz mono
   */
  sendAudio(base64PcmChunk: string): void {
    if (!this.session) return;
    // The SDK's sendRealtimeInput takes { media: { mimeType, data } }
    this.session.sendRealtimeInput({
      media: {
        mimeType: "audio/pcm;rate=16000",
        data: base64PcmChunk,
      },
    });
  }

  disconnect(): void {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
