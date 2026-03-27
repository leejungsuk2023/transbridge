"use client";

import { SpeakerRole, PatientLang } from "@/types";
import GlossaryHighlight from "./GlossaryHighlight";
import { useRef, useEffect } from "react";

interface PrompterDisplayProps {
  text: string;
  glossaryTerms: string[];
  speaker: SpeakerRole;
  lang: PatientLang;
}

// Auto-scale font size based on text length to fit container
function getFontSizeClass(text: string): string {
  const len = text.length;
  if (len === 0) return "text-2xl";
  if (len < 15) return "text-2xl";
  if (len < 30) return "text-xl";
  if (len < 60) return "text-lg";
  if (len < 100) return "text-base";
  if (len < 200) return "text-sm";
  return "text-xs";
}

const LANG_NAMES: Record<string, string> = {
  th: "ภาษาไทย",
  vi: "Tiếng Việt",
  en: "English",
  id: "Bahasa Indonesia",
  es: "Español",
  mn: "Монгол хэл",
  yue: "廣東話",
  zh: "普通话",
  ja: "日本語",
  fr: "Français",
  de: "Deutsch",
};

export default function PrompterDisplay({ text, glossaryTerms, speaker, lang }: PrompterDisplayProps) {
  const isEmpty = !text;
  const fontSizeClass = getFontSizeClass(text);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const speakerLabel = speaker === "staff" ? "직원 발화" : "환자 발화";
  const targetName = LANG_NAMES[lang] ?? lang;
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
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {speakerLabel}
        </span>
        <span className="text-xs text-gray-300">{langLabel}</span>
      </div>

      {/* Prompter text area — scrollable, auto-scrolls to bottom */}
      <div
        ref={scrollRef}
        className={`
          flex-1 overflow-y-auto
          rounded-2xl px-4 py-3
          ${speaker === "staff" ? "bg-blue-950/50" : "bg-indigo-950/50"}
          transition-all duration-200
        `}
      >
        {isEmpty ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-500 text-lg italic">
              {speaker === "staff" ? "한국어로 말하세요" : `${targetName}로 말하세요`}
            </span>
          </div>
        ) : (
          <p
            className={`
              ${fontSizeClass}
              font-bold leading-relaxed text-white break-words
            `}
          >
            <GlossaryHighlight text={text} glossaryTerms={glossaryTerms} />
          </p>
        )}
      </div>
    </div>
  );
}
