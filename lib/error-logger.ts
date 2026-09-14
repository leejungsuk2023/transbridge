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
  | 'dual_routing'          // dual-channel native audio start() succeeded — logs the DeviceReport
  | 'dual_fallback'         // dual-channel native audio start() rejected — fell back to single mode
  // TEMPORARY (native single-mode only, gated by DEBUG_TRACE in page.tsx): traces
  // input/output transcript fragments and turn/playback events to diagnose a
  // reported Vietnamese-echo bug (native app answered in Vietnamese instead of
  // Korean). Remove these three once that's root-caused.
  | 'dbg_in'                // onOriginalText fragment
  | 'dbg_out'               // onTranslatedText fragment
  | 'dbg_evt'               // interrupt / turnComplete / playbackState change
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
