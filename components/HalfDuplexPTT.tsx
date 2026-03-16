"use client";

import { PTTState, SpeakerRole, PatientLang } from "@/types";

interface HalfDuplexPTTProps {
  onStartRecording: (speaker: SpeakerRole) => void;
  onStopRecording: (speaker: SpeakerRole) => void;
  staffState: PTTState;
  patientState: PTTState;
  patientLang: PatientLang;
  disabled: boolean;
}

interface PTTButtonConfig {
  state: PTTState;
  label: string;
  sublabel: string;
  isDisabled: boolean;
  onStart: () => void;
  onStop: () => void;
  colorScheme: "blue" | "purple";
}

function PTTButton({ state, label, sublabel, isDisabled, onStart, onStop, colorScheme }: PTTButtonConfig) {
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isPlaying = state === "playing";

  const baseColors = {
    blue: {
      idle: "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-900/40",
      ring: "ring-blue-400",
    },
    purple: {
      idle: "bg-violet-600 hover:bg-violet-500 active:bg-violet-700 shadow-violet-900/40",
      ring: "ring-violet-400",
    },
  };

  const colors = baseColors[colorScheme];

  let buttonClass = "";
  let buttonContent: React.ReactNode = null;

  if (isDisabled) {
    buttonClass = "bg-gray-700 opacity-40 cursor-not-allowed";
  } else if (isRecording) {
    buttonClass = `bg-red-500 scale-105 shadow-red-900/60 ring-4 ${colors.ring} animate-pulse`;
  } else if (isProcessing) {
    buttonClass = "bg-yellow-500";
  } else if (isPlaying) {
    buttonClass = "bg-green-600";
  } else {
    buttonClass = `${colors.idle} shadow-lg`;
  }

  if (isRecording) {
    buttonContent = (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    );
  } else if (isProcessing) {
    buttonContent = (
      <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  } else if (isPlaying) {
    buttonContent = (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
      </svg>
    );
  } else {
    buttonContent = (
      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    );
  }

  function getStateLabel() {
    if (isRecording) return "녹음 중...";
    if (isProcessing) return "처리 중...";
    if (isPlaying) return "재생 중...";
    return sublabel;
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <button
        onClick={isDisabled ? undefined : () => {
          if (state === 'recording') {
            onStop();
          } else if (state === 'idle') {
            onStart();
          }
        }}
        disabled={isDisabled}
        className={`
          w-full min-h-[80px] rounded-2xl flex items-center justify-center gap-4
          transition-all duration-150 select-none touch-none
          ${buttonClass}
        `}
        style={{ WebkitUserSelect: "none" }}
      >
        {buttonContent}
        <div className="text-left">
          <p className="text-white font-bold text-xl leading-tight">{label}</p>
          <p className="text-white/70 text-sm">{getStateLabel()}</p>
        </div>
      </button>
    </div>
  );
}

export default function HalfDuplexPTT({
  onStartRecording,
  onStopRecording,
  staffState,
  patientState,
  patientLang,
  disabled,
}: HalfDuplexPTTProps) {
  const anyActive = staffState !== "idle" || patientState !== "idle";

  const patientLabel = patientLang === "th" ? "🎤 ภาษาไทย" : "🎤 Tiếng Việt";
  const patientSublabel = patientLang === "th" ? "누르고 말하세요" : "Nhấn và nói";

  const staffDisabled = disabled || patientState !== "idle";
  const patientDisabled = disabled || staffState !== "idle";

  return (
    <div className="flex flex-col gap-3 w-full px-4">
      {/* Half-duplex status indicator */}
      {anyActive && !disabled && (
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs text-red-400 font-medium">
            {staffState !== "idle" ? "직원 채널 사용 중" : "환자 채널 사용 중"}
          </span>
        </div>
      )}

      <PTTButton
        state={patientState}
        label={patientLabel}
        sublabel={patientSublabel}
        isDisabled={patientDisabled}
        onStart={() => onStartRecording("patient")}
        onStop={() => onStopRecording("patient")}
        colorScheme="purple"
      />

      <PTTButton
        state={staffState}
        label="🎤 한국어"
        sublabel="누르고 말하세요"
        isDisabled={staffDisabled}
        onStart={() => onStartRecording("staff")}
        onStop={() => onStopRecording("staff")}
        colorScheme="blue"
      />
    </div>
  );
}
