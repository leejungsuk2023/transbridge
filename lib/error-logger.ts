/**
 * Client-side error logger.
 * Fire-and-forget: sends errors to /api/log-error without blocking the caller.
 * Uses keepalive: true so the request survives page unload.
 * Never throws — any internal failure is silently swallowed (console.warn only).
 */

type ErrorType =
  | 'websocket_close'       // WS closed with non-1000 code
  | 'websocket_error'       // onerror fired
  | 'gemini_connect_failed' // initial connect threw
  | 'reconnect_exhausted'   // hit maxReconnectAttempts
  | 'mic_permission'        // getUserMedia denied/failed
  | 'audio_context'         // AudioContext failure (suspended/resume failed)
  | 'audio_worklet'         // AudioWorklet load/init failure
  | 'token_fetch'           // /api/gemini-token failed
  | 'session_fetch'         // /api/session failed
  | 'dbg_in'                // [DEBUG-TEMP] input transcription trace
  | 'dbg_out'               // [DEBUG-TEMP] output transcription + suppression trace
  | 'dbg_play'             // [DEBUG-TEMP] TTS playback start/end trace
  | 'unknown';

export interface LogErrorParams {
  sessionId?: string;
  hospitalId?: string;
  errorType: ErrorType;
  errorMessage?: string;
  errorCode?: string | number;
  context?: Record<string, unknown>;
  patientLang?: string;
}

export function logError(params: LogErrorParams): void {
  // Server-side guard — this helper is client-only
  if (typeof window === 'undefined') return;

  try {
    const body = JSON.stringify({
      sessionId: params.sessionId,
      hospitalId: params.hospitalId,
      errorType: params.errorType,
      errorMessage: params.errorMessage,
      errorCode: params.errorCode != null ? String(params.errorCode) : undefined,
      context: params.context,
      patientLang: params.patientLang,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });

    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Silently ignore network errors — logging must never affect user flow
    });
  } catch (err) {
    console.warn('[logError] Failed to send error log:', err);
  }
}
