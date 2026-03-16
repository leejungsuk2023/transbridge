"use client";

import { SpeakerRole, PatientLang } from "@/types";
import GlossaryHighlight from "./GlossaryHighlight";

interface PrompterDisplayProps {
  text: string;
  glossaryTerms: string[];
  speaker: SpeakerRole;
  lang: PatientLang;
}

function getFontSizeClass(text: string): string {
  if (text.length === 0) return "text-4xl";
  if (text.length < 20) return "text-5xl";
  if (text.length < 40) return "text-4xl";
  if (text.length < 80) return "text-3xl";
  return "text-2xl";
}

export default function PrompterDisplay({ text, glossaryTerms, speaker, lang }: PrompterDisplayProps) {
  const isEmpty = !text;
  const fontSizeClass = getFontSizeClass(text);

  const speakerLabel = speaker === "staff" ? "직원 발화" : "환자 발화";
  const langLabel =
    lang === "th"
      ? speaker === "staff"
        ? "→ ภาษาไทย"
        : "→ 한국어"
      : speaker === "staff"
      ? "→ Tiếng Việt"
      : "→ 한국어";

  return (
    <div
      className={`
        flex flex-col h-full w-full
        transition-all duration-300
        ${isEmpty ? "opacity-40" : "opacity-100"}
      `}
    >
      {/* Speaker label */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {speakerLabel}
        </span>
        <span className="text-xs text-gray-300">{langLabel}</span>
      </div>

      {/* Prompter text area */}
      <div
        className={`
          flex-1 flex items-center justify-center
          rounded-2xl px-6 py-4
          ${speaker === "staff" ? "bg-blue-950/50" : "bg-indigo-950/50"}
          transition-all duration-500
        `}
      >
        {isEmpty ? (
          <span className="text-gray-500 text-lg italic">
            {speaker === "staff" ? "한국어로 말하세요" : lang === "th" ? "พูดภาษาไทย" : "Nói bằng tiếng Việt"}
          </span>
        ) : (
          <p
            key={text} // key change triggers re-render / fade-in via animation
            className={`
              ${fontSizeClass}
              font-bold leading-tight text-center text-white
              animate-fade-in
            `}
          >
            <GlossaryHighlight text={text} glossaryTerms={glossaryTerms} />
          </p>
        )}
      </div>
    </div>
  );
}
