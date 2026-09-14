"use client";

import { useEffect, useMemo, useRef } from "react";
import { PatientLang } from "@/types";
import { Turn, LANG_NAMES } from "@/lib/turn-log";
import GlossaryHighlight from "./GlossaryHighlight";

interface ChatThreadProps {
  turns: Turn[];
  lang: PatientLang;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ChatThread({ turns, lang }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleTurns = useMemo(
    () => turns.filter((t) => !(t.done && !t.original && !t.translated)),
    [turns]
  );

  const lastTurn = visibleTurns[visibleTurns.length - 1];

  // Auto-scroll to bottom whenever the thread grows or the in-progress turn updates.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleTurns.length, lastTurn?.original, lastTurn?.translated]);

  const targetName = LANG_NAMES[lang] ?? lang;
  const isEmpty = visibleTurns.length === 0;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5"
    >
      {isEmpty ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-500 text-base italic text-center">
            한국어 또는 {targetName}로 말하세요
          </span>
        </div>
      ) : (
        visibleTurns.map((turn) => {
          if (turn.speaker === null) {
            return (
              <div key={turn.id} className="self-center">
                <span className="px-3 py-1 rounded-full text-xs text-gray-400 bg-gray-900/60">
                  🎤 듣는 중…
                </span>
              </div>
            );
          }

          const isStaff = turn.speaker === "staff";
          const align = isStaff ? "self-end" : "self-start";
          const bubbleBg = isStaff ? "bg-blue-900/70" : "bg-indigo-900/70";
          const bubbleCorner = isStaff ? "rounded-tr-sm" : "rounded-tl-sm";
          const labelColor = isStaff ? "text-blue-200" : "text-indigo-200";
          const label = isStaff ? "🧑‍⚕️ 직원" : `🙋 환자 · ${targetName}`;

          const original = turn.original;
          const translated = turn.translated;
          const stillStreaming = !turn.done;

          // Decide which piece of text (if any) still shows the pulsing ellipsis.
          const originalPulsing = stillStreaming && !translated;
          const translatedPulsing = stillStreaming && !!translated;

          let body;
          if (!original && translated) {
            // Native audio input transcript is sometimes empty — show translation only.
            body = (
              <p className="text-sm font-bold text-white break-words">
                <GlossaryHighlight text={translated} glossaryTerms={[]} />
                {translatedPulsing && <span className="animate-pulse text-gray-300">…</span>}
              </p>
            );
          } else if (original && !translated && turn.done) {
            body = (
              <p className="text-xs text-gray-300 break-words">
                {original}
                <span className="text-gray-500 text-[10px] ml-1">(번역 없음)</span>
              </p>
            );
          } else {
            body = (
              <>
                <p className="text-xs text-gray-300 break-words">
                  {original}
                  {originalPulsing && <span className="animate-pulse text-gray-300">…</span>}
                </p>
                {(translated || translatedPulsing) && (
                  <p className="text-sm font-bold text-white break-words mt-0.5">
                    <GlossaryHighlight text={translated} glossaryTerms={[]} />
                    {translatedPulsing && <span className="animate-pulse text-gray-300">…</span>}
                  </p>
                )}
              </>
            );
          }

          return (
            <div
              key={turn.id}
              className={`${align} max-w-[80%] ${bubbleBg} ${bubbleCorner} rounded-xl px-2.5 py-1.5`}
            >
              <div className={`flex items-center gap-1.5 mb-0.5 text-[10px] ${labelColor}`}>
                <span className="font-semibold">{label}</span>
                <span className="text-[9px] text-gray-500 ml-auto">
                  {formatTime(turn.startedAt)}
                </span>
              </div>
              {body}
            </div>
          );
        })
      )}
    </div>
  );
}
