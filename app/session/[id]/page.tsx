"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import PrompterDisplay from "@/components/PrompterDisplay";
import { PatientLang, SpeakerRole } from "@/types";
import { GeminiLiveSession, GeminiLiveConfig } from "@/lib/gemini-client";

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

// Convert Float32 audio samples to base64-encoded Int16 PCM
function float32ToBase64Pcm(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type ConnectionState = "connecting" | "connected" | "disconnected";

interface PrompterState {
  text: string;
  glossaryTerms: string[];
  speaker: SpeakerRole;
}

const EMPTY_PROMPTER: PrompterState = { text: "", glossaryTerms: [], speaker: "staff" };

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
  const audioChunkCountRef = useRef(0);

  const timer = useSessionTimer();
  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);

  // Play received audio (base64 PCM 24kHz from Gemini → AudioContext)
  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Gemini returns PCM 16-bit mono 24kHz
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 0x8000;
      }

      const ctx = new AudioContext({ sampleRate: 24000 });
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => ctx.close();
    } catch {
      // Ignore audio playback errors
    }
  }, []);

  // Initialize Gemini Live connection + audio capture
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Get Gemini connection config from server
        const tokenRes = await fetch("/api/gemini-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceLang: "ko", // Primary language (staff)
            targetLang: patientLang,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.success) throw new Error(tokenData.error ?? "Failed to get token");

        if (cancelled) return;

        const config: GeminiLiveConfig = tokenData.data;

        // 2. Create Gemini Live session with callbacks
        const session = new GeminiLiveSession(config, {
          onOriginalText: (text) => {
            // Korean detected → staff speaking; otherwise → patient speaking
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
              // Translation is Korean → patient was speaking, staff sees translation
              setStaffPrompter((prev) => ({ ...prev, text, speaker: "patient" }));
            } else {
              // Translation is Thai/Vi → staff was speaking, patient sees translation
              setPatientPrompter((prev) => ({ ...prev, text, speaker: "staff" }));
            }
          },
          onAudio: (base64Audio) => {
            playAudio(base64Audio);
          },
          onError: (err) => setError(err),
          onStateChange: (state) => setConnectionState(state as ConnectionState),
        });

        geminiSessionRef.current = session;
        await session.connect();

        if (cancelled) {
          session.disconnect();
          return;
        }

        // 3. Start audio capture
        // Note: avoid specifying sampleRate in constraints — mobile browsers may
        // ignore or reject it. The AudioWorklet handles downsampling to 16kHz.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        // Don't constrain sampleRate on AudioContext either — use native rate
        // (typically 44100 or 48000) and let the worklet downsample to 16kHz.
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);

        if (audioContext.audioWorklet) {
          // Modern path: AudioWorkletNode (non-deprecated, works on mobile)
          await audioContext.audioWorklet.addModule('/audio-processor.js');
          const workletNode = new AudioWorkletNode(audioContext, 'audio-processor', {
            processorOptions: { targetSampleRate: 16000 },
          });
          processorRef.current = workletNode;

          workletNode.port.onmessage = (e: MessageEvent<{ pcmData: ArrayBuffer }>) => {
            const bytes = new Uint8Array(e.data.pcmData);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64Chunk = btoa(binary);
            session.sendAudio(base64Chunk);
            audioChunkCountRef.current++;
            if (audioChunkCountRef.current % 20 === 1) {
              setError(`오디오 전송 중: ${audioChunkCountRef.current}청크, ${bytes.length}bytes`);
            }
          };

          source.connect(workletNode);
          // Do NOT connect workletNode to destination — avoids echo from mic
        } else {
          // Legacy fallback: ScriptProcessorNode for browsers without AudioWorklet
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const base64Chunk = float32ToBase64Pcm(inputData);
            session.sendAudio(base64Chunk);
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        }
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
      processorRef.current?.disconnect();
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      geminiSessionRef.current?.disconnect();
    };
  }, [patientLang, playAudio]);

  const langLabel = patientLang === "th" ? "태국어" : "베트남어";

  const handleEndSession = async () => {
    if (!confirm("통역을 종료하시겠습니까?")) return;
    geminiSessionRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await fetch("/api/session", {
        method: "PATCH",
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

      {/* Error banner */}
      {error && (
        <div className="flex-none bg-red-900/80 text-red-200 text-sm px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Patient area (top 45%) */}
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

      {/* Staff area (bottom 45%) */}
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
