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
  /**
   * When set, connects using the dedicated gemini-3.5-live-translate-preview
   * translationConfig path instead of the general native-audio model path (see
   * _openConnection). One session only ever produces audio in targetLanguageCode —
   * bidirectional interpretation needs two sessions, one per direction.
   */
  translation?: { targetLanguageCode: string; voiceName?: string };
  /** Overrides the default VAD end-of-speech silence window (ms). Default stays 1000. */
  silenceDurationMs?: number;
}

export interface GeminiLiveCallbacks {
  onOriginalText: (text: string) => void;
  onTranslatedText: (text: string) => void;
  onAudio: (data: ArrayBuffer, base64: string) => void;
  onError: (error: string) => void;
  onStateChange: (
    state: "connecting" | "connected" | "disconnected" | "reconnecting"
  ) => void;
  /** Called for a server interrupt or 3+ chars of new input during playback. */
  onInterrupt?: () => void;
  /** Called when reconnect attempts are exhausted — lets the UI offer a manual retry button. */
  onReconnectExhausted?: () => void;
  /** Called on serverContent.turnComplete — lets callers key transcript accumulation per turn. */
  onTurnComplete?: () => void;
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

interface LiveConnection {
  session: Session | null;
  ready: boolean;
  closed: boolean;
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

  private activeConnection: LiveConnection | null = null;
  private pendingConnection: LiveConnection | null = null;

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
   * Promotes only after both setupComplete and the SDK session are available.
   */
  private async _openConnection(isHandover: boolean): Promise<Session | null> {
    const silenceDurationMs = this.config.silenceDurationMs ?? 1000;

    // VAD tuning for medical interpretation — speakers pause mid-sentence, so
    // we don't want to cut them off, but 1.8s felt sluggish in practice. 1.0s
    // is a balance: snappy end-of-turn while still tolerating short pauses.
    // Shared by both config branches below; silenceDurationMs is overridable
    // per-config (dual-engine tuning) via GeminiLiveConfig.silenceDurationMs.
    const realtimeInputConfig = {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        silenceDurationMs,
        prefixPaddingMs: 300,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    };

    let liveConfig: LiveConnectConfig;
    if (this.config.translation) {
      // Dedicated translate model (gemini-3.5-live-translate-preview) path: this model
      // is a purpose-built one-target-per-session interpreter, not a general assistant,
      // so the system-prompt role-lock and anti-hallucination sampling knobs used below
      // for the native-audio model don't apply here — worse, sending systemInstruction
      // to this model breaks translationConfig.echoTargetLanguage:false (the wrong-
      // direction session starts echoing the input instead of staying silent).
      liveConfig = {
        responseModalities: [Modality.AUDIO],
        translationConfig: {
          targetLanguageCode: this.config.translation.targetLanguageCode,
          echoTargetLanguage: false,
        },
        ...(this.config.translation.voiceName
          ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.translation.voiceName } } } }
          : {}),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig,
      };
    } else {
      // LiveConnectConfig matches Google's reference exactly.
      // temperature=0 + topP=0.1 + topK=1: maximally deterministic output —
      // reduces creative/LLM behavior so the model sticks to literal translation
      // rather than generating explanations or answers.
      // These fields are set directly on LiveConnectConfig (not nested under
      // generationConfig) per @google/genai SDK types (LiveConnectConfig interface).
      liveConfig = {
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
        realtimeInputConfig,
      };
    }

    const connection: LiveConnection = { session: null, ready: false, closed: false };
    if (isHandover) this.pendingConnection = connection;
    else this.activeConnection = connection;

    const isCurrent = () => !this.manuallyDisconnected && !connection.closed &&
      (this.activeConnection === connection || this.pendingConnection === connection);

    try {
      const session = await this.client.live.connect({
        model: this.config.model,
        config: liveConfig,
        callbacks: {
          onopen: () => {},
          onmessage: (message: LiveServerMessage) => {
            if (!isCurrent()) return;
            if (message.setupComplete) {
              connection.ready = true;
              this._activateConnection(connection);
              return;
            }
            if (this.activeConnection === connection && connection.ready) {
              this._handleMessage(message);
            }
          },
          onerror: (e: ErrorEvent) => {
            if (!isCurrent()) return;
            this.callbacks.onError(`Gemini error: ${e.message || "unknown"}`);
            logError({
              errorType: 'websocket_error',
              errorMessage: e.message || 'unknown',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
            });
          },
          onclose: (e: CloseEvent) => {
            if (!isCurrent()) return;
            connection.closed = true;
            if (this.pendingConnection === connection) {
              this.pendingConnection = null;
              return; // Keep the active socket when a replacement fails.
            }
            this.activeConnection = null;
            this.session = null;
            logError({
              errorType: 'websocket_close',
              errorCode: e.code,
              errorMessage: e.reason || 'none',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
            });
            // Even code 1000 can be a server-initiated close during a conversation.
            this._scheduleReconnect();
          },
        },
      });
      connection.session = session;
      if (!isCurrent()) {
        session.close();
      } else {
        // setupComplete can arrive before live.connect() resolves.
        this._activateConnection(connection);
      }
      return session;
    } catch (err) {
      const current = isCurrent();
      connection.closed = true;
      if (this.pendingConnection === connection) this.pendingConnection = null;
      if (this.activeConnection === connection) this.activeConnection = null;
      if (current) throw err;
      // A cancelled connection must not restart the session or affect a newer one.
      return null;
    }
  }

  private _activateConnection(connection: LiveConnection): void {
    if (!connection.ready || !connection.session || connection.closed || this.manuallyDisconnected) return;
    if (this.pendingConnection === connection) {
      const old = this.activeConnection;
      this.pendingConnection = null;
      this.activeConnection = connection;
      if (old) {
        old.closed = true;
        try { old.session?.close(); } catch { /* already closed */ }
      }
    }
    if (this.activeConnection !== connection) return;
    this.session = connection.session;
    this.reconnectAttempts = 0;
    this.isOutputPlaying = false;
    this.pendingTranscriptLength = 0;
    this.callbacks.onStateChange("connected");
  }

  async connect(): Promise<void> {
    if (this.manuallyDisconnected || this.activeConnection || this.reconnectTimer) return;
    this.callbacks.onStateChange("connecting");
    try {
      await this._openConnection(false);
    } catch (err) {
      if (this.manuallyDisconnected) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Connect failed: ${msg}`);
      logError({ errorType: 'gemini_connect_failed', errorMessage: msg,
        sessionId: this.config.sessionId, patientLang: this.config.patientLang });
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delays: 1s → 2s → 4s → 8s → 16s (capped at 30s).
   */
  private _scheduleReconnect(): void {
    if (this.manuallyDisconnected || this.reconnectTimer) return;

    if (this.pendingConnection) {
      this.pendingConnection.closed = true;
      try { this.pendingConnection.session?.close(); } catch {}
      this.pendingConnection = null;
    }
    if (this.activeConnection) this.activeConnection.closed = true;
    this.activeConnection = null;

    // Close stale session before reconnecting
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // Ignore errors from closing an already-broken session
      }
      this.session = null;
    }

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
      if (serverContent.interrupted === true) {
        this.pendingTranscriptLength = 0;
        this.isOutputPlaying = false;
        this.callbacks.onInterrupt?.();
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
            this.callbacks.onAudio(audioBuffer, part.inlineData.data);
          }
        }
      }

      // Model turn complete — reset playback and interrupt tracking state
      if (serverContent.turnComplete) {
        this.isOutputPlaying = false;
        this.pendingTranscriptLength = 0;
        this.callbacks.onTurnComplete?.();
        // Keep the same connection for subsequent utterances. Rotating here can
        // close the socket while the next speaker's audio is already arriving.
      }
    }
  }

  /** Pre-open a replacement only when the server requests a handover. */
  private async _handleGoAway(): Promise<void> {
    if (this.pendingConnection || this.manuallyDisconnected) return;
    try {
      await this._openConnection(true);
    } catch (err) {
      logError({ errorType: 'gemini_connect_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        sessionId: this.config.sessionId, patientLang: this.config.patientLang,
        context: { handover: true } });
    }
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
    try {
      this.session.sendRealtimeInput({
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64PcmChunk,
        },
      });
    } catch (err) {
      this.callbacks.onError(`Audio send failed: ${err instanceof Error ? err.message : String(err)}`);
      this._scheduleReconnect();
    }
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

    for (const connection of [this.activeConnection, this.pendingConnection]) {
      if (!connection) continue;
      connection.closed = true;
      try { connection.session?.close(); } catch { /* already closed */ }
    }
    this.activeConnection = null;
    this.pendingConnection = null;
    this.session = null;
    this.isOutputPlaying = false;
    this.pendingTranscriptLength = 0;
  }
}
