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
  if (text.length === 0) return "text-3xl";
  if (text.length < 20) return "text-3xl";
  if (text.length < 50) return "text-2xl";
  if (text.length < 100) return "text-xl";
  if (text.length < 200) return "text-lg";
  return "text-base";
}

export default function PrompterDisplay({ text, glossaryTerms, speaker, lang }: PrompterDisplayProps) {
  const isEmpty = !text;
  const fontSizeClass = getFontSizeClass(text);

  const speakerLabel = speaker === "staff" ? "직원 발화" : "환자 발화";
  const langNames: Record<string, string> = {
    th: "ภาษาไทย",
    vi: "Tiếng Việt",
    en: "English",
    id: "Bahasa Indonesia",
    es: "Español",
    mn: "Монгол хэл",
  };
  const targetName = langNames[lang] ?? lang;
  const langLabel = speaker === "staff" ? `→ ${targetName}` : "→ 한국어";

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
          flex-1 overflow-y-auto
          rounded-2xl px-4 py-3
          ${speaker === "staff" ? "bg-blue-950/50" : "bg-indigo-950/50"}
          transition-all duration-500
        `}
      >
        <div className="flex items-center justify-center min-h-full">
          {isEmpty ? (
            <span className="text-gray-500 text-lg italic">
              {speaker === "staff" ? "한국어로 말하세요" : `${targetName}로 말하세요`}
            </span>
          ) : (
            <p
              key={text}
              className={`
                ${fontSizeClass}
                font-bold leading-relaxed text-center text-white
                animate-fade-in break-words
              `}
            >
              <GlossaryHighlight text={text} glossaryTerms={glossaryTerms} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
