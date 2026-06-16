/**
 * Client-side Gemini Live API helper.
 * Uses @google/genai SDK's live.connect() — matches Google's official reference implementation.
 * Ref: https://github.com/google-gemini/live-api-web-console/blob/main/src/lib/genai-live-client.ts
 */

import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  LiveConnectConfig,
  LiveServerMessage,
  Modality,
  Session,
  StartSensitivity,
} from "@google/genai";
import { logError } from "./error-logger";

export interface GeminiLiveConfig {
  apiKey?: string;
  ephemeralToken?: string;
  model: string;
  systemPrompt: string;
  // wsUrl is kept in the interface for backward compatibility but is no longer used.
  // The SDK derives the endpoint from the model name and API key.
  wsUrl?: string;
  sessionId?: string;
  hospitalId?: string;
  patientLang?: string;
  /** Short glossary instruction for translation-only models (e.g. gemini-3.5-live-translate-preview). */
  glossaryInstruction?: string;
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
  /** Called when reconnect attempts are exhausted — lets the UI offer a manual retry button. */
  onReconnectExhausted?: () => void;
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
  private readonly maxReconnectAttempts = 8;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set to true on an explicit disconnect() call to distinguish intentional closes. */
  private manuallyDisconnected = false;

  /** Pre-opened next session after GoAway is received. Promoted to `this.session` once setupComplete arrives. */
  private nextSession: Session | null = null;
  /** True while a handover is in flight — used to suppress reconnect when the old session closes. */
  private isHandingOver = false;

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    // The SDK accepts either an API key or an ephemeral token (access_token).
    // For ephemeral tokens, we pass it as apiKey — the SDK sends it as the key param.
    const key = config.ephemeralToken ?? config.apiKey ?? "";
    this.client = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Opens a new Gemini Live WebSocket connection.
   * When isHandover=true, the connection is a pre-opened next session for GoAway handover.
   * Messages on a handover connection are held until setupComplete, then the session is promoted.
   */
  private async _openConnection(isHandover: boolean): Promise<Session> {
    // LiveConnectConfig matches Google's reference exactly.
    // temperature=0 + topP=0.1 + topK=1: maximally deterministic output —
    // reduces creative/LLM behavior so the model sticks to literal translation
    // rather than generating explanations or answers.
    // These fields are set directly on LiveConnectConfig (not nested under
    // generationConfig) per @google/genai SDK types (LiveConnectConfig interface).
    const liveConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
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
      // VAD tuning for medical interpretation — speakers (especially patients
      // in a foreign language) frequently pause mid-sentence. Defaults are too
      // eager and cut speakers off; require 1.8s of silence before committing
      // end-of-turn so natural pauses don't trigger premature translation.
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          silenceDurationMs: 1800,
          prefixPaddingMs: 300,
        },
        activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      },
    };

    // Local flag in closure: tracks whether this handover connection has been promoted.
    // After promotion, subsequent messages should flow through _handleMessage normally.
    let promoted = false;

    return await this.client.live.connect({
      model: this.config.model,
      config: liveConfig,
      callbacks: {
        onopen: () => {
          // Setup message sent, waiting for setupComplete — same for both paths
        },
        onmessage: (message: LiveServerMessage) => {
          if (!isHandover) {
            // Primary connection: route all messages through the normal handler
            this._handleMessage(message);
          } else {
            // Handover connection: different routing before vs after promotion
            if (!promoted) {
              // Before promotion: only act on setupComplete; ignore everything else
              if (message.setupComplete) {
                promoted = true;
                this._promoteNextSession();
                // After promotion, this connection IS the current session.
                // The setupComplete itself is handled inside _promoteNextSession/
                // _handleMessage after swap — no need to forward it here since
                // the state is already "connected" from the original session.
              }
              // Ignore all other messages before promotion (stray audio/transcription not expected)
            } else {
              // After promotion: forward all messages through the normal handler
              this._handleMessage(message);
            }
          }
        },
        onerror: (e: ErrorEvent) => {
          if (isHandover && !promoted) {
            // Handover pre-open failed — abort handover silently; old session will fall
            // back to normal reconnect on close
            logError({
              errorType: 'websocket_error',
              errorMessage: e.message || 'unknown',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
              context: { handover: true },
            });
            this.isHandingOver = false;
            this.nextSession = null;
          } else {
            // Primary connection (or post-promotion): existing behavior
            this.callbacks.onError(`Gemini error: ${e.message || "unknown"}`);
            logError({
              errorType: 'websocket_error',
              errorMessage: e.message || 'unknown',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
              context: { model: this.config.model },
            });
            // Don't call onStateChange("disconnected") here — onclose follows
          }
        },
        onclose: (e: CloseEvent) => {
          if (isHandover && !promoted) {
            // Handover connection closed before promotion — abort handover silently
            logError({
              errorType: 'websocket_close',
              errorCode: e.code,
              errorMessage: e.reason || 'none',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
              context: { handover: true },
            });
            this.isHandingOver = false;
            this.nextSession = null;
            return;
          }

          // Primary connection close (or post-promotion, i.e. the old session closing after handover)
          if (this.isHandingOver) {
            // This is the OLD session closing after a successful handover — suppress reconnect
            this.isHandingOver = false;
            return;
          }

          if (e.code === 1000 || this.manuallyDisconnected) {
            // Normal close or user-initiated — no reconnect
            this.callbacks.onStateChange("disconnected");
            return;
          }
          this.callbacks.onError(
            `WS close: code=${e.code} reason=${e.reason || "none"}`
          );
          logError({
            errorType: 'websocket_close',
            errorCode: e.code,
            errorMessage: e.reason || 'none',
            sessionId: this.config.sessionId,
            patientLang: this.config.patientLang,
            context: { wasClean: e.wasClean, model: this.config.model, attempt: this.reconnectAttempts },
          });
          this._scheduleReconnect();
        },
      },
    });
  }

  async connect(): Promise<void> {
    this.callbacks.onStateChange("connecting");
    try {
      this.session = await this._openConnection(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Connect failed: ${msg}`);
      logError({
        errorType: 'gemini_connect_failed',
        errorMessage: msg,
        sessionId: this.config.sessionId,
        patientLang: this.config.patientLang,
      });
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
      logError({
        errorType: 'reconnect_exhausted',
        sessionId: this.config.sessionId,
        patientLang: this.config.patientLang,
        context: { attempts: this.reconnectAttempts },
      });
      this.callbacks.onReconnectExhausted?.();
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

    if (message.goAway) {
      const timeLeft = message.goAway.timeLeft ?? 'unknown';
      console.log(`[GeminiLiveSession] GoAway received. timeLeft=${timeLeft}. Pre-opening next session.`);
      this._handleGoAway().catch(() => {});  // fire-and-forget, internal method swallows errors
      return;
    }

    if (message.toolCall) {
      return;
    }

    if (message.serverContent) {
      const { serverContent } = message;

      // Gemini's server-side VAD detected the user speaking over the model's
      // output (barge-in). This is the authoritative interrupt signal — stop our
      // playback immediately so the new turn can flow, exactly like ChatGPT/Gemini
      // voice mode. (The mic is kept open during TTS so this can happen at all.)
      if ("interrupted" in serverContent) {
        this.pendingTranscriptLength = 0;
        this.isOutputPlaying = false;
        this.callbacks.onInterrupt?.();
        return;
      }

      // Input audio transcription (what the user said)
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

        this.callbacks.onOriginalText(inputText);
      }

      // Output audio transcription (what Gemini is saying)
      if (serverContent.outputTranscription?.text) {
        this.callbacks.onTranslatedText(serverContent.outputTranscription.text);
      }

      if (serverContent.modelTurn) {
        const parts = serverContent.modelTurn.parts || [];

        // Mark output as playing when Gemini starts sending audio
        this.isOutputPlaying = true;

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

      // Model turn complete — reset playback and interrupt tracking state
      if (serverContent.turnComplete) {
        this.isOutputPlaying = false;
        this.pendingTranscriptLength = 0;
      }
    }
  }

  /**
   * Handles a GoAway message by pre-opening the next WebSocket connection.
   * The new connection is held in nextSession until setupComplete arrives,
   * at which point _promoteNextSession() atomically swaps it to this.session.
   */
  private async _handleGoAway(): Promise<void> {
    // Already handing over — ignore duplicate GoAway
    if (this.isHandingOver || this.nextSession) return;
    if (this.manuallyDisconnected) return;

    this.isHandingOver = true;
    try {
      this.nextSession = await this._openConnection(true);
    } catch (err) {
      // Pre-open failed — abort handover; old session will fall back to normal reconnect on close
      this.isHandingOver = false;
      this.nextSession = null;
      const msg = err instanceof Error ? err.message : String(err);
      logError({
        errorType: 'gemini_connect_failed',
        errorMessage: msg,
        sessionId: this.config.sessionId,
        patientLang: this.config.patientLang,
        context: { handover: true },
      });
    }
  }

  /**
   * Atomically swaps nextSession → this.session after the handover setupComplete arrives.
   * Closes the old session (triggering its onclose which will silently no-op due to isHandingOver).
   * isHandingOver stays true until the old session's onclose fires and clears it.
   */
  private _promoteNextSession(): void {
    if (!this.nextSession) return;
    const oldSession = this.session;
    this.session = this.nextSession;
    this.nextSession = null;
    // Note: isHandingOver remains TRUE until the old session's onclose fires,
    // so that we suppress the reconnect path for the expected old-session close.
    console.log('[GeminiLiveSession] Handover complete. Swapped to new session.');
    try { oldSession?.close(); } catch {}
    // Reset reconnect counter since the new session is healthy
    this.reconnectAttempts = 0;
    this.callbacks.onStateChange("connected");
  }

  /**
   * Send a PCM audio chunk to Gemini.
   * Matches sendRealtimeInput from the reference genai-live-client.ts exactly.
   * @param base64PcmChunk Base64-encoded Int16 PCM at 16kHz mono
   */
  sendAudio(base64PcmChunk: string): void {
    if (!this.session) return;
    // gemini-3.1-flash-live-preview deprecates realtime_input.media_chunks
    // (the field the SDK fills when given { media: ... }). Use { audio: ... }
    // which maps to the new realtime_input.audio field.
    this.session.sendRealtimeInput({
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: base64PcmChunk,
      },
    });
  }

  /**
   * Manual retry after reconnect attempts were exhausted.
   * Resets the reconnect counter and the manuallyDisconnected flag,
   * then attempts a fresh connection.
   */
  retryConnect(): Promise<void> {
    this.reconnectAttempts = 0;
    this.manuallyDisconnected = false;
    return this.connect();
  }

  disconnect(): void {
    // Mark as intentional so onclose does not trigger reconnect
    this.manuallyDisconnected = true;

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Abort any in-flight handover
    if (this.nextSession) {
      try { this.nextSession.close(); } catch {}
      this.nextSession = null;
    }
    this.isHandingOver = false;

    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
