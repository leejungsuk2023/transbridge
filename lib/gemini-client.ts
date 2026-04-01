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
  onStateChange: (
    state: "connecting" | "connected" | "disconnected" | "reconnecting"
  ) => void;
  /** Called when a confirmed interrupt is detected (3+ chars of new input during playback). */
  onInterrupt?: () => void;
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

  // Interrupt threshold tracking: accumulate input chars while output is playing.
  // Only fire onInterrupt once 3+ characters of new speech are confirmed.
  private pendingTranscriptLength = 0;
  private isOutputPlaying = false;

  // Reconnection state
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set to true on an explicit disconnect() call to distinguish intentional closes. */
  private manuallyDisconnected = false;

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
    // temperature=0 + topP=0.1 + topK=1: maximally deterministic output —
    // reduces creative/LLM behavior so the model sticks to literal translation
    // rather than generating explanations or answers.
    // These fields are set directly on LiveConnectConfig (not nested under
    // generationConfig) per @google/genai SDK types (LiveConnectConfig interface).
    const liveConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      systemInstruction: {
        parts: [{ text: this.config.systemPrompt }],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Disable thinking to minimize latency — translate immediately
      thinkingConfig: { thinkingBudget: 0 },
      // Balanced sampling: enough flexibility for STT context-aware correction
      // while still suppressing hallucination and LLM assistant behavior.
      temperature: 0.2,
      topP: 0.3,
      topK: 5,
    };

    try {
      this.session = await this.client.live.connect({
        model: this.config.model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            // Setup message sent, waiting for setupComplete
          },
          onmessage: (message: LiveServerMessage) => {
            this._handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            this.callbacks.onError(`Gemini error: ${e.message || "unknown"}`);
            // Don't call onStateChange("disconnected") here — onclose follows
          },
          onclose: (e: CloseEvent) => {
            if (e.code === 1000 || this.manuallyDisconnected) {
              // Normal close or user-initiated — no reconnect
              this.callbacks.onStateChange("disconnected");
              return;
            }
            this.callbacks.onError(
              `WS close: code=${e.code} reason=${e.reason || "none"}`
            );
            this._scheduleReconnect();
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Connect failed: ${msg}`);
      if (!this.manuallyDisconnected) {
        this._scheduleReconnect();
      } else {
        this.callbacks.onStateChange("disconnected");
      }
      // Do NOT rethrow — reconnect will handle recovery
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delays: 1s → 2s → 4s → 8s → 16s (capped at 30s).
   */
  private _scheduleReconnect(): void {
    if (this.manuallyDisconnected) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onStateChange("disconnected");
      this.callbacks.onError(
        "재연결 한도 초과. 페이지를 새로고침 해주세요."
      );
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts += 1;
    console.log(
      `[GeminiLiveSession] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );
    this.callbacks.onStateChange("reconnecting");

    // Close stale session before reconnecting
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // Ignore errors from closing an already-broken session
      }
      this.session = null;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyDisconnected) {
        this.connect();
      }
    }, delay);
  }

  private _handleMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      // Successful setup — reset reconnect counter
      this.reconnectAttempts = 0;
      this.callbacks.onStateChange("connected");
      return;
    }

    if (message.toolCall) {
      return;
    }

    if (message.serverContent) {
      const { serverContent } = message;

      // Gemini signals that its own output was interrupted by new speaker input.
      // Don't stop playback immediately — wait until 3+ chars of real speech are
      // confirmed via inputTranscription to filter out coughs/noise.
      if ("interrupted" in serverContent) {
        this.pendingTranscriptLength = 0;
        return;
      }

      // Input audio transcription — used only for interrupt detection
      // Corrected original text now comes from model text output instead
      if (serverContent.inputTranscription?.text) {
        const inputText = serverContent.inputTranscription.text;

        // Accumulate transcript length during playback for interrupt threshold check
        if (this.isOutputPlaying) {
          this.pendingTranscriptLength += inputText.length;

          // Confirmed interrupt: 3+ characters of real speech detected
          if (this.pendingTranscriptLength >= 3) {
            this.callbacks.onInterrupt?.();
            this.isOutputPlaying = false;
            this.pendingTranscriptLength = 0;
          }
        }
      }

      // Output audio transcription (what Gemini is saying)
      if (serverContent.outputTranscription?.text) {
        this.callbacks.onTranslatedText(serverContent.outputTranscription.text);
      }

      if (serverContent.modelTurn) {
        const parts = serverContent.modelTurn.parts || [];

        // Mark output as playing when Gemini starts sending audio
        this.isOutputPlaying = true;

        for (const part of parts) {
          // Corrected original text (TEXT modality) — show on prompter
          if (part.text) {
            this.callbacks.onOriginalText(part.text);
          }
          // Audio translation
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

      // Model turn complete — reset playback and interrupt tracking state
      if (serverContent.turnComplete) {
        this.isOutputPlaying = false;
        this.pendingTranscriptLength = 0;
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
    // Mark as intentional so onclose does not trigger reconnect
    this.manuallyDisconnected = true;

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
