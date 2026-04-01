"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import PrompterDisplay from "@/components/PrompterDisplay";
import { PatientLang, SpeakerRole } from "@/types";
import {
  GeminiLiveSession,
  GeminiLiveConfig,
  arrayBufferToBase64,
} from "@/lib/gemini-client";

// ---------------------------------------------------------------------------
// Session timer hook
// ---------------------------------------------------------------------------
function useSessionTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// AudioStreamer — matches Google's reference audio-streamer.ts
// Accepts raw PCM16 ArrayBuffer chunks and plays them via Web Audio API.
// ---------------------------------------------------------------------------
class AudioStreamer {
  private sampleRate = 24000; // Gemini outputs 24kHz PCM
  private bufferSize = 7680;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private isStreamComplete = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private scheduledTime = 0;
  private initialBufferTime = 0.1; // 100ms initial buffer
  private gainNode: GainNode;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;
  public onComplete = () => {};

  constructor(public context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  /**
   * Convert PCM16 Uint8Array to normalized Float32Array.
   * Matches _processPCM16Chunk from the reference exactly.
   */
  private processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const float32 = new Float32Array(chunk.length / 2);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }
    return float32;
  }

  addPCM16(chunk: Uint8Array) {
    this.isStreamComplete = false;
    let buf = this.processPCM16Chunk(chunk);
    while (buf.length >= this.bufferSize) {
      this.audioQueue.push(buf.slice(0, this.bufferSize));
      buf = buf.slice(this.bufferSize);
    }
    if (buf.length > 0) this.audioQueue.push(buf);

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      this.scheduleNextBuffer();
    }
  }

  private createAudioBuffer(data: Float32Array): AudioBuffer {
    const buf = this.context.createBuffer(1, data.length, this.sampleRate);
    buf.getChannelData(0).set(data);
    return buf;
  }

  private scheduleNextBuffer() {
    const SCHEDULE_AHEAD = 0.2;
    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD
    ) {
      const data = this.audioQueue.shift()!;
      const audioBuf = this.createAudioBuffer(data);
      const source = this.context.createBufferSource();

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) this.endOfQueueAudioSource.onended = null;
        this.endOfQueueAudioSource = source;
        source.onended = () => {
          if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
            this.endOfQueueAudioSource = null;
            this.onComplete();
          }
        };
      }

      source.buffer = audioBuf;
      source.connect(this.gainNode);
      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuf.duration;
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      } else if (!this.checkInterval) {
        this.checkInterval = setInterval(() => {
          if (this.audioQueue.length > 0) this.scheduleNextBuffer();
        }, 100);
      }
    } else {
      const nextCheck = (this.scheduledTime - this.context.currentTime) * 1000;
      setTimeout(() => this.scheduleNextBuffer(), Math.max(0, nextCheck - 50));
    }
  }

  stop() {
    this.isPlaying = false;
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.1);
    setTimeout(() => {
      this.gainNode.disconnect();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
    }, 200);
  }

  async resume() {
    if (this.context.state === "suspended") await this.context.resume();
    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  complete() {
    this.isStreamComplete = true;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

interface PrompterState {
  text: string;
  glossaryTerms: string[];
  speaker: SpeakerRole;
}

const EMPTY_PROMPTER: PrompterState = { text: "", glossaryTerms: [], speaker: "staff" };

// ---------------------------------------------------------------------------
// SessionPage component
// ---------------------------------------------------------------------------
export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = params.id as string;
  const patientLang = (searchParams.get("lang") ?? "th") as PatientLang;

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [patientPrompter, setPatientPrompter] = useState<PrompterState>(EMPTY_PROMPTER);
  const [staffPrompter, setStaffPrompter] = useState<PrompterState>(EMPTY_PROMPTER);
  const [error, setError] = useState<string | null>(null);
  // Network online/offline state (displayed via OfflineOverlay in layout)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isOnline, setIsOnline] = useState(true);

  const timer = useSessionTimer();
  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastInputWasKoreanRef = useRef(true); // Track last input language for echo filter
  const isPlayingAudioRef = useRef(false); // True while TTS audio is playing — mute mic to prevent echo
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  // Token expiry timestamp (ms since epoch) from /api/gemini-token
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const tokenExpiresAtRef = useRef<number | null>(null);
  // Ref to connection state to read it inside interval without stale closure
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const connectionStateRef = useRef<ConnectionState>("connecting");

  // End session when user closes tab, navigates away, or switches apps
  useEffect(() => {
    const endSession = () => {
      // sendBeacon with Blob to set correct Content-Type (JSON)
      const blob = new Blob([JSON.stringify({ id: sessionId })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/session/end", blob);
    };

    // Tab close / browser close / URL change
    window.addEventListener("beforeunload", endSession);

    // Mobile: app switch / tab switch (visibilitychange fires more reliably on mobile)
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        endSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeunload", endSession);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [sessionId]);

  // Initialize Gemini Live connection + audio capture
  // Matches the pattern from LiveAPIContext.tsx + AudioRecorder.ts in the reference
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 0. Validate session ID exists in DB (prevent invalid/fake sessions)
        const sessionCheck = await fetch(`/api/session?id=${sessionId}`);
        const sessionData = await sessionCheck.json();
        if (!sessionData.success) {
          throw new Error("유효하지 않은 세션입니다. 대시보드에서 다시 시작해주세요.");
        }

        // 1. Get connection config from server (API key or ephemeral token)
        const tokenRes = await fetch("/api/gemini-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLang: "ko", targetLang: patientLang }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.success) throw new Error(tokenData.error ?? "Failed to get token");
        if (cancelled) return;

        // Store token expiry for proactive refresh (expiresAt is epoch ms)
        if (tokenData.data?.expiresAt) {
          tokenExpiresAtRef.current = tokenData.data.expiresAt;
        }

        const config: GeminiLiveConfig = tokenData.data;

        // 2. Create AudioContext at 16kHz — the reference AudioRecorder sets sampleRate: 16000
        //    so no downsampling is needed in the worklet.
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        // 3. Create AudioStreamer for playback (reference audio-streamer.ts)
        const streamer = new AudioStreamer(new AudioContext({ sampleRate: 24000 }));
        audioStreamerRef.current = streamer;
        // Unmute mic when TTS playback finishes
        streamer.onComplete = () => {
          isPlayingAudioRef.current = false;
        };
        await streamer.resume();

        // 4. Create Gemini Live session with callbacks
        const session = new GeminiLiveSession(config, {
          onOriginalText: (text) => {
            const isKorean = /[\uac00-\ud7af]/.test(text);
            lastInputWasKoreanRef.current = isKorean;
            // Accumulate text — Gemini sends fragments, append to build full sentence
            if (isKorean) {
              setStaffPrompter((prev) => ({
                text: prev.speaker === "staff" ? prev.text + text : text,
                glossaryTerms: [],
                speaker: "staff",
              }));
            } else {
              setPatientPrompter((prev) => ({
                text: prev.speaker === "patient" ? prev.text + text : text,
                glossaryTerms: [],
                speaker: "patient",
              }));
            }
          },
          onTranslatedText: (text) => {
            const isKorean = /[\uac00-\ud7af]/.test(text);
            const lastInputKorean = lastInputWasKoreanRef.current;

            // FILTER: suppress same-language echo
            if (lastInputKorean && isKorean) {
              console.log("[Filter] Suppressed ko→ko echo:", text.slice(0, 30));
              return;
            }
            if (!lastInputKorean && !isKorean) {
              console.log("[Filter] Suppressed foreign→foreign echo:", text.slice(0, 30));
              return;
            }

            // Accumulate translated text
            if (isKorean) {
              setStaffPrompter((prev) => ({
                ...prev,
                text: prev.speaker === "patient" ? prev.text + text : text,
                speaker: "patient",
              }));
            } else {
              setPatientPrompter((prev) => ({
                ...prev,
                text: prev.speaker === "staff" ? prev.text + text : text,
                speaker: "staff",
              }));
            }
          },
          onAudio: (data: ArrayBuffer) => {
            // Mute mic input while playing TTS to prevent echo feedback loop
            isPlayingAudioRef.current = true;
            // Ensure AudioContext is active (Chrome autoplay policy may suspend it)
            if (streamer.context.state === "suspended") {
              streamer.context.resume();
            }
            streamer.addPCM16(new Uint8Array(data));
          },
          onInterrupt: () => {
            // Confirmed interrupt (3+ chars of new speech) — stop current playback
            audioStreamerRef.current?.stop();
          },
          onError: (err) => setError(err),
          onStateChange: (state) => {
            const cs = state as ConnectionState;
            connectionStateRef.current = cs;
            setConnectionState(cs);
          },
        });

        geminiSessionRef.current = session;
        await session.connect();
        if (cancelled) { session.disconnect(); return; }

        // 5. Start microphone capture
        //    Reference AudioRecorder uses { audio: true } without extra constraints
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const source = audioContext.createMediaStreamSource(stream);

        // 6. Load AudioWorklet — matches reference audio-recorder.ts pattern
        //    The worklet sends { event: "chunk", data: { int16arrayBuffer } }
        await audioContext.audioWorklet.addModule("/audio-processor.js");
        const workletNode = new AudioWorkletNode(audioContext, "audio-processor");
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e: MessageEvent) => {
          const int16Buffer: ArrayBuffer = e.data?.data?.int16arrayBuffer;
          if (!int16Buffer) return;

          // ECHO PREVENTION: skip sending mic data while TTS audio is playing
          // This prevents the speaker output from being picked up and re-translated
          if (isPlayingAudioRef.current) return;

          // Convert to base64 and send — matches arrayBufferToBase64 in reference
          const base64 = arrayBufferToBase64(int16Buffer);
          session.sendAudio(base64);

          // Audio chunk sent to Gemini
        };

        // Connect: mic source → worklet (do NOT connect to destination to avoid echo)
        source.connect(workletNode);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "연결에 실패했습니다.");
          setConnectionState("disconnected");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      workletNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      audioStreamerRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      geminiSessionRef.current?.disconnect();
    };
  }, [patientLang]);

  // ---------------------------------------------------------------------------
  // Network state detection — show overlay when offline, reconnect when back online
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // If the Gemini session lost connection while we were offline, reconnect
      if (
        connectionStateRef.current === "disconnected" &&
        geminiSessionRef.current
      ) {
        console.log("[Network] Back online — triggering Gemini reconnect");
        geminiSessionRef.current.connect();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Token refresh — proactively re-fetch token 1 minute before expiry
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const CHECK_INTERVAL_MS = 30_000; // check every 30 seconds
    const REFRESH_THRESHOLD_MS = 60_000; // refresh 1 minute before expiry

    const intervalId = setInterval(async () => {
      const expiresAt = tokenExpiresAtRef.current;
      if (!expiresAt) return;

      const timeLeft = expiresAt - Date.now();
      if (timeLeft > REFRESH_THRESHOLD_MS) return; // still plenty of time

      console.log("[TokenRefresh] Token expiring soon, refreshing…");
      try {
        const res = await fetch("/api/gemini-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLang: "ko", targetLang: patientLang }),
        });
        const data = await res.json();
        if (data.success && data.data?.expiresAt) {
          tokenExpiresAtRef.current = data.data.expiresAt;
          console.log("[TokenRefresh] Token refreshed successfully");
          // Note: the current Gemini session continues using the existing connection;
          // the new token will be used on the next reconnect attempt if needed.
        } else {
          // Refresh failed — warn but keep the current session alive
          console.warn("[TokenRefresh] Refresh failed:", data.error);
          setError("토큰 갱신에 실패했습니다. 연결이 끊길 수 있습니다.");
        }
      } catch (err) {
        // Network error during refresh — session may still be alive, just warn
        console.warn("[TokenRefresh] Network error during refresh:", err);
        setError("토큰 갱신 중 네트워크 오류가 발생했습니다.");
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [patientLang]);

  const langNames: Record<string, string> = {
    th: "태국어", vi: "베트남어", en: "영어", id: "인도네시아어",
    es: "스페인어", mn: "몽골어", yue: "광동어", zh: "북경어",
    ja: "일본어", fr: "프랑스어", de: "독일어",
  };
  const langLabel = langNames[patientLang] ?? patientLang;

  const handleEndSession = async () => {
    if (!confirm("통역을 종료하시겠습니까?")) return;
    geminiSessionRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await fetch("/api/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, status: "ended" }),
      });
    } catch {
      // Navigate regardless
    }
    router.push("/dashboard");
  };

  const stateLabel =
    connectionState === "connecting"
      ? "연결 중..."
      : connectionState === "connected"
      ? "듣는 중..."
      : connectionState === "reconnecting"
      ? "재연결 중..."
      : "연결 끊김";

  const stateColor =
    connectionState === "connected"
      ? "bg-green-400"
      : connectionState === "connecting" || connectionState === "reconnecting"
      ? "bg-yellow-400"
      : "bg-red-400";

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">
      {/* Offline overlay — shown when the device has no network connection */}
      {!isOnline && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl px-8 py-6 text-center max-w-xs mx-4">
            <p className="text-white text-lg font-semibold mb-2">인터넷 연결이 끊겼습니다</p>
            <p className="text-gray-400 text-sm">네트워크 연결을 확인해 주세요. 연결되면 자동으로 재연결됩니다.</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${stateColor} ${
              connectionState === "connected" || connectionState === "reconnecting" ? "animate-pulse" : ""
            }`}
          />
          <span className="text-sm text-gray-300 font-medium">
            {langLabel} ↔ 한국어
          </span>
        </div>
        <button
          onClick={handleEndSession}
          className="text-sm text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg hover:bg-red-950 transition"
        >
          종료
        </button>
      </div>

      {/* Error / debug banner */}
      {error && (
        <div className="flex-none bg-red-900/80 text-red-200 text-sm px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Patient area (top half) */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
        <PrompterDisplay
          text={patientPrompter.text}
          glossaryTerms={patientPrompter.glossaryTerms}
          speaker={patientPrompter.speaker}
          lang={patientLang}
        />
      </div>

      {/* Divider */}
      <div className="flex-none h-px bg-gray-700 mx-4" />

      {/* Staff area (bottom half) */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
        <PrompterDisplay
          text={staffPrompter.text}
          glossaryTerms={staffPrompter.glossaryTerms}
          speaker={staffPrompter.speaker}
          lang={patientLang}
        />
      </div>

      {/* Status footer */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-gray-900 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${stateColor} ${
              connectionState === "connected" || connectionState === "reconnecting" ? "animate-pulse" : ""
            }`}
          />
          <span className="text-xs text-gray-400">🎤 {stateLabel}</span>
        </div>
        <span className="text-xs text-gray-500 font-mono">{timer}</span>
      </div>
    </div>
  );
}
