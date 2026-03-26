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

  constructor(private context: AudioContext) {
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
type ConnectionState = "connecting" | "connected" | "disconnected";

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
  // Debug chunk counter removed (was audioChunkCountRef)

  const timer = useSessionTimer();
  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Initialize Gemini Live connection + audio capture
  // Matches the pattern from LiveAPIContext.tsx + AudioRecorder.ts in the reference
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Get connection config from server (API key or ephemeral token)
        const tokenRes = await fetch("/api/gemini-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLang: "ko", targetLang: patientLang }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.success) throw new Error(tokenData.error ?? "Failed to get token");
        if (cancelled) return;

        const config: GeminiLiveConfig = tokenData.data;

        // 2. Create AudioContext at 16kHz — the reference AudioRecorder sets sampleRate: 16000
        //    so no downsampling is needed in the worklet.
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        // 3. Create AudioStreamer for playback (reference audio-streamer.ts)
        const streamer = new AudioStreamer(new AudioContext({ sampleRate: 24000 }));
        audioStreamerRef.current = streamer;
        await streamer.resume();

        // 4. Create Gemini Live session with callbacks
        const session = new GeminiLiveSession(config, {
          onOriginalText: (text) => {
            const isKorean = /[\uac00-\ud7af]/.test(text);
            if (isKorean) {
              setStaffPrompter({ text, glossaryTerms: [], speaker: "staff" });
            } else {
              setPatientPrompter({ text, glossaryTerms: [], speaker: "patient" });
            }
          },
          onTranslatedText: (text) => {
            const isKorean = /[\uac00-\ud7af]/.test(text);
            if (isKorean) {
              setStaffPrompter((prev) => ({ ...prev, text, speaker: "patient" }));
            } else {
              setPatientPrompter((prev) => ({ ...prev, text, speaker: "staff" }));
            }
          },
          onAudio: (data: ArrayBuffer) => {
            // Feed raw PCM16 ArrayBuffer into the streamer queue
            streamer.addPCM16(new Uint8Array(data));
          },
          onInterrupt: () => {
            // Confirmed interrupt (3+ chars of new speech) — stop current playback
            audioStreamerRef.current?.stop();
          },
          onError: (err) => setError(err),
          onStateChange: (state) => setConnectionState(state as ConnectionState),
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
      : "연결 끊김";

  const stateColor =
    connectionState === "connected"
      ? "bg-green-400"
      : connectionState === "connecting"
      ? "bg-yellow-400"
      : "bg-red-400";

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${stateColor} ${
              connectionState === "connected" ? "animate-pulse" : ""
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
              connectionState === "connected" ? "animate-pulse" : ""
            }`}
          />
          <span className="text-xs text-gray-400">🎤 {stateLabel}</span>
        </div>
        <span className="text-xs text-gray-500 font-mono">{timer}</span>
      </div>
    </div>
  );
}
