"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import HalfDuplexPTT from "@/components/HalfDuplexPTT";
import PrompterDisplay from "@/components/PrompterDisplay";
import { PatientLang, SpeakerRole, PTTState, TranslateResponse } from "@/types";

// -- Timer hook --
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

// -- Audio recording hook --
function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.start();
  }, []);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      mr.stop();
    });
  }, []);

  return { start, stop };
}

// -- Audio playback --
async function playBase64Audio(base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioCtx = new AudioContext();
      audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          audioCtx.close();
          resolve();
        };
        source.start();
      }, (err) => {
        audioCtx.close();
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// -- Prompter state --
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

  const [staffPTTState, setStaffPTTState] = useState<PTTState>("idle");
  const [patientPTTState, setPatientPTTState] = useState<PTTState>("idle");
  const [patientPrompter, setPatientPrompter] = useState<PrompterState>(EMPTY_PROMPTER);
  const [staffPrompter, setStaffPrompter] = useState<PrompterState>(EMPTY_PROMPTER);
  const [error, setError] = useState<string | null>(null);

  const timer = useSessionTimer();
  const recorder = useAudioRecorder();

  // Request mic permission on mount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      stream.getTracks().forEach((t) => t.stop()); // Just checking permission
    }).catch(() => {
      setError("마이크 권한이 필요합니다.");
    });
  }, []);

  const langLabel = patientLang === "th" ? "태국어" : "베트남어";

  const isAnyActive = staffPTTState !== "idle" || patientPTTState !== "idle";

  // Core recording + translate flow
  const handleStartRecording = useCallback(async (speaker: SpeakerRole) => {
    if (isAnyActive) return;
    setError(null);

    if (speaker === "staff") setStaffPTTState("recording");
    else setPatientPTTState("recording");

    try {
      await recorder.start();
    } catch {
      setError("마이크를 시작할 수 없습니다.");
      if (speaker === "staff") setStaffPTTState("idle");
      else setPatientPTTState("idle");
    }
  }, [isAnyActive, recorder]);

  const handleStopRecording = useCallback(async (speaker: SpeakerRole) => {
    const currentState = speaker === "staff" ? staffPTTState : patientPTTState;
    if (currentState !== "recording") return;

    if (speaker === "staff") setStaffPTTState("processing");
    else setPatientPTTState("processing");

    try {
      const base64Audio = await recorder.stop();

      const body = {
        audioData: base64Audio,
        sourceLang: speaker === "staff" ? "ko" : patientLang,
        targetLang: speaker === "staff" ? patientLang : "ko",
        speaker,
        sessionId,
      };

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: TranslateResponse = await res.json();

      if (!result.success || !result.data) {
        throw new Error(result.error ?? "번역 실패");
      }

      const { originalText, translatedText, audioData, glossaryTerms } = result.data;

      // Update prompters: staff speaks → patient sees translation; patient speaks → staff sees translation
      if (speaker === "staff") {
        setPatientPrompter({ text: translatedText, glossaryTerms, speaker: "staff" });
        setStaffPrompter({ text: originalText, glossaryTerms: [], speaker: "staff" });
      } else {
        setStaffPrompter({ text: translatedText, glossaryTerms, speaker: "patient" });
        setPatientPrompter({ text: originalText, glossaryTerms: [], speaker: "patient" });
      }

      // Play TTS — both buttons disabled during playback
      if (speaker === "staff") setStaffPTTState("playing");
      else setPatientPTTState("playing");

      try {
        await playBase64Audio(audioData);
      } catch {
        // Silently ignore audio decode errors (API may return empty for dev)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      if (speaker === "staff") setStaffPTTState("idle");
      else setPatientPTTState("idle");
    }
  }, [staffPTTState, patientPTTState, recorder, patientLang, sessionId]);

  const handleEndSession = async () => {
    if (!confirm("통역을 종료하시겠습니까?")) return;
    try {
      await fetch(`/api/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      });
    } catch {
      // Ignore — navigate regardless
    }
    router.push("/dashboard");
  };

  const bothDisabled = staffPTTState === "playing" || patientPTTState === "playing";

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-gray-300 font-medium">
            연결됨 &bull; {langLabel} ↔ 한국어
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
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Patient area (top 45%) */}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        {/* Patient PTT */}
        <div className="flex-none">
          <HalfDuplexPTT
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            staffState={staffPTTState}
            patientState={patientPTTState}
            patientLang={patientLang}
            disabled={bothDisabled}
          />
        </div>

        {/* Patient prompter */}
        <div className="flex-1 min-h-0">
          <PrompterDisplay
            text={patientPrompter.text}
            glossaryTerms={patientPrompter.glossaryTerms}
            speaker={patientPrompter.speaker}
            lang={patientLang}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="flex-none h-px bg-gray-700 mx-4" />

      {/* Staff area (bottom 45%) */}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        {/* Staff prompter */}
        <div className="flex-1 min-h-0">
          <PrompterDisplay
            text={staffPrompter.text}
            glossaryTerms={staffPrompter.glossaryTerms}
            speaker={staffPrompter.speaker}
            lang={patientLang}
          />
        </div>
      </div>

      {/* Timer footer */}
      <div className="flex-none flex items-center justify-center py-2 bg-gray-900 border-t border-gray-800">
        <span className="text-xs text-gray-500 font-mono">{timer}</span>
      </div>
    </div>
  );
}
