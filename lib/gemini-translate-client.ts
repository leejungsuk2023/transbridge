/**
 * Client-side Gemini Translate API helper.
 * Uses the gemini-3.5-live-translate-preview model with translationConfig.
 *
 * Architecture: the translate model is UNIDIRECTIONAL per session (one target language).
 * Since the app is bidirectional (Korean staff <-> foreign patient), this engine runs
 * TWO concurrent sessions fed by the SAME mic audio:
 *   - sessionForeign: targetLanguageCode = patientLang — translates Korean → foreign; silent on foreign input
 *   - sessionKorean:  targetLanguageCode = 'ko'        — translates foreign → Korean; silent on Korean input
 *
 * Both sessions share the same callbacks as GeminiLiveSession so the page can swap engines
 * without changing its callback wiring.
 */

import {
  GoogleGenAI,
  LiveConnectConfig,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";
import { GeminiLiveConfig, GeminiLiveCallbacks, base64ToArrayBuffer } from "./gemini-client";
import { logError } from "./error-logger";

type SessionRole = 'foreign' | 'korean';

const GATE_CLOSE_DELAY_MS = 1500;
const AUDIO_BUFFER_CAP = 50;

interface PerSessionState {
  session: Session | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  setupComplete: boolean;
  /** Transcript-gated audio: true once outputTranscription arrives for this session. */
  gateOpen: boolean;
  /** Buffered audio chunks received before the gate opened. Capped at AUDIO_BUFFER_CAP. */
  audioBuffer: ArrayBuffer[];
  /** Timer that closes the gate 1500ms after the last outputTranscription. */
  gateCloseTimer: ReturnType<typeof setTimeout> | null;
}

export class GeminiTranslateSession {
  private config: GeminiLiveConfig;
  private callbacks: GeminiLiveCallbacks;
  private client: GoogleGenAI;

  private foreign: PerSessionState = {
    session: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    setupComplete: false,
    gateOpen: false,
    audioBuffer: [],
    gateCloseTimer: null,
  };
  private korean: PerSessionState = {
    session: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    setupComplete: false,
    gateOpen: false,
    audioBuffer: [],
    gateCloseTimer: null,
  };

  private readonly maxReconnectAttempts = 8;
  private manuallyDisconnected = false;

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    const key = config.ephemeralToken ?? config.apiKey ?? "";
    this.client = new GoogleGenAI({ apiKey: key });
  }

  // ---------------------------------------------------------------------------
  // Public API (mirrors GeminiLiveSession)
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.manuallyDisconnected = false;
    this.callbacks.onStateChange("connecting");
    try {
      await Promise.all([
        this._openSession('foreign'),
        this._openSession('korean'),
      ]);
    } catch (err) {
      // Individual session errors are handled inside _openSession.
      // If Promise.all rejects it means something catastrophic (e.g. invalid key) —
      // individual handlers will already have fired onError and scheduled reconnects.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GeminiTranslateSession] connect() parallel open error:', msg);
    }
  }

  sendAudio(base64PcmChunk: string): void {
    const payload = {
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: base64PcmChunk,
      },
    } as const;

    if (this.foreign.session) {
      try {
        this.foreign.session.sendRealtimeInput(payload);
      } catch {
        // Session may be mid-reconnect; silently drop this chunk
      }
    }
    if (this.korean.session) {
      try {
        this.korean.session.sendRealtimeInput(payload);
      } catch {
        // Session may be mid-reconnect; silently drop this chunk
      }
    }
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this._clearTimer('foreign');
    this._clearTimer('korean');
    this._resetGate('foreign');
    this._resetGate('korean');
    this._closeSession('foreign');
    this._closeSession('korean');
  }

  async retryConnect(): Promise<void> {
    this.foreign.reconnectAttempts = 0;
    this.korean.reconnectAttempts = 0;
    this.manuallyDisconnected = false;
    return this.connect();
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  private _buildLiveConfig(role: SessionRole): LiveConnectConfig {
    const targetLanguageCode = role === 'foreign'
      ? (this.config.patientLang ?? 'th')
      : 'ko';

    // TranslationConfig is typed in @google/genai 2.8.0 as a field on LiveConnectConfig.
    // echoTargetLanguage: false => model stays silent when input is already in the target lang.
    //
    // systemInstruction is intentionally omitted: sending it to gemini-3.5-live-translate-preview
    // breaks echoTargetLanguage:false suppression, causing the wrong-direction session to echo
    // input audio.
    return {
      responseModalities: [Modality.AUDIO],
      translationConfig: {
        targetLanguageCode,
        echoTargetLanguage: false,
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    } as LiveConnectConfig;
  }

  private async _openSession(role: SessionRole): Promise<void> {
    const state = this._state(role);
    try {
      state.setupComplete = false;
      const session = await this.client.live.connect({
        model: this.config.model,
        config: this._buildLiveConfig(role),
        callbacks: {
          onopen: () => {
            // Connected at WS level — waiting for setupComplete
          },
          onmessage: (message: LiveServerMessage) => {
            this._handleMessage(role, message);
          },
          onerror: (e: ErrorEvent) => {
            this.callbacks.onError(`Translate [${role}] error: ${e.message || 'unknown'}`);
            logError({
              errorType: 'websocket_error',
              errorMessage: e.message || 'unknown',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
              context: { model: this.config.model, session: role },
            });
            // onclose will follow, which schedules reconnect
          },
          onclose: (e: CloseEvent) => {
            if (e.code === 1000 || this.manuallyDisconnected) {
              // Normal / intentional close — no reconnect
              this._maybeSignalDisconnected();
              return;
            }
            this.callbacks.onError(
              `Translate [${role}] WS close: code=${e.code} reason=${e.reason || 'none'}`
            );
            logError({
              errorType: 'websocket_close',
              errorCode: e.code,
              errorMessage: e.reason || 'none',
              sessionId: this.config.sessionId,
              patientLang: this.config.patientLang,
              context: { wasClean: e.wasClean, model: this.config.model, session: role, attempt: state.reconnectAttempts },
            });
            this._scheduleReconnect(role);
          },
        },
      });
      state.session = session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Translate [${role}] connect failed: ${msg}`);
      logError({
        errorType: 'gemini_connect_failed',
        errorMessage: msg,
        sessionId: this.config.sessionId,
        patientLang: this.config.patientLang,
        context: { model: this.config.model, session: role },
      });
      if (!this.manuallyDisconnected) {
        this._scheduleReconnect(role);
      } else {
        this._maybeSignalDisconnected();
      }
    }
  }

  private _handleMessage(role: SessionRole, message: LiveServerMessage): void {
    if (message.setupComplete) {
      const state = this._state(role);
      state.setupComplete = true;
      state.reconnectAttempts = 0;
      // Only fire 'connected' once both sessions are ready
      if (this.foreign.setupComplete && this.korean.setupComplete) {
        this.callbacks.onStateChange('connected');
      }
      return;
    }

    if (message.serverContent) {
      const { serverContent } = message;

      if ('interrupted' in serverContent) {
        this._resetGate(role);
        this.callbacks.onInterrupt?.();
        return;
      }

      // inputTranscription: emit only from sessionForeign to avoid duplicate firing.
      // The translate model transcribes all input regardless of language direction.
      if (role === 'foreign' && serverContent.inputTranscription?.text) {
        this.callbacks.onOriginalText(serverContent.inputTranscription.text);
      }

      // outputTranscription: emit from BOTH sessions.
      // sessionForeign emits foreign-language text; sessionKorean emits Korean text.
      // The page routes by content (Korean-char detection).
      // Also: open the audio gate for this session and flush any buffered chunks.
      if (serverContent.outputTranscription?.text) {
        this.callbacks.onTranslatedText(serverContent.outputTranscription.text);
        this._openGate(role);
      }

      if (serverContent.modelTurn) {
        const parts = serverContent.modelTurn.parts || [];
        for (const part of parts) {
          if (
            part.inlineData &&
            part.inlineData.mimeType?.startsWith('audio/') &&
            part.inlineData.data
          ) {
            const audioChunk = base64ToArrayBuffer(part.inlineData.data);
            this._routeAudio(role, audioChunk);
          }
        }
      }

      // turnComplete: translate model may not send this consistently, but handle if present
      // (no state to reset here since we don't track isOutputPlaying in this engine)
    }
  }

  // ---------------------------------------------------------------------------
  // Transcript-gated audio helpers
  // ---------------------------------------------------------------------------

  /** Open the audio gate for a session: flush buffered chunks and arm the close timer. */
  private _openGate(role: SessionRole): void {
    const state = this._state(role);
    state.gateOpen = true;

    // Flush all buffered audio chunks in order
    for (const chunk of state.audioBuffer) {
      this.callbacks.onAudio(chunk);
    }
    state.audioBuffer = [];

    // (Re)start the gate-close timer
    if (state.gateCloseTimer !== null) {
      clearTimeout(state.gateCloseTimer);
    }
    state.gateCloseTimer = setTimeout(() => {
      state.gateOpen = false;
      state.audioBuffer = [];
      state.gateCloseTimer = null;
    }, GATE_CLOSE_DELAY_MS);
  }

  /** Route an audio chunk: forward immediately if gate is open, otherwise buffer it. */
  private _routeAudio(role: SessionRole, chunk: ArrayBuffer): void {
    const state = this._state(role);
    if (state.gateOpen) {
      this.callbacks.onAudio(chunk);
    } else {
      state.audioBuffer.push(chunk);
      // Cap buffer to prevent unbounded growth
      if (state.audioBuffer.length > AUDIO_BUFFER_CAP) {
        state.audioBuffer.shift();
      }
    }
  }

  /** Reset gate state (on interrupt / disconnect / session close). */
  private _resetGate(role: SessionRole): void {
    const state = this._state(role);
    if (state.gateCloseTimer !== null) {
      clearTimeout(state.gateCloseTimer);
      state.gateCloseTimer = null;
    }
    state.gateOpen = false;
    state.audioBuffer = [];
  }

  // ---------------------------------------------------------------------------
  // Reconnection
  // ---------------------------------------------------------------------------

  private _scheduleReconnect(role: SessionRole): void {
    if (this.manuallyDisconnected) return;

    const state = this._state(role);

    if (state.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onStateChange('disconnected');
      this.callbacks.onError(
        `재연결 한도 초과 [${role}]. 페이지를 새로고침 해주세요.`
      );
      logError({
        errorType: 'reconnect_exhausted',
        sessionId: this.config.sessionId,
        patientLang: this.config.patientLang,
        context: { attempts: state.reconnectAttempts, session: role },
      });
      this.callbacks.onReconnectExhausted?.();
      return;
    }

    const delay = Math.min(1000 * 2 ** state.reconnectAttempts, 30000);
    state.reconnectAttempts += 1;
    console.log(
      `[GeminiTranslateSession] [${role}] Reconnect attempt ${state.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );
    this.callbacks.onStateChange('reconnecting');

    // Close stale session handle before reconnecting
    if (state.session) {
      try { state.session.close(); } catch { /* already closed */ }
      state.session = null;
    }

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (!this.manuallyDisconnected) {
        this._openSession(role);
      }
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _state(role: SessionRole): PerSessionState {
    return role === 'foreign' ? this.foreign : this.korean;
  }

  private _clearTimer(role: SessionRole): void {
    const state = this._state(role);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  private _closeSession(role: SessionRole): void {
    const state = this._state(role);
    if (state.session) {
      try { state.session.close(); } catch { /* already closed */ }
      state.session = null;
    }
    state.setupComplete = false;
    this._resetGate(role);
  }

  /** Fire 'disconnected' only if BOTH sessions are no longer active (normal close path). */
  private _maybeSignalDisconnected(): void {
    if (!this.foreign.session && !this.korean.session) {
      this.callbacks.onStateChange('disconnected');
    }
  }
}
