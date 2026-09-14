"use client";

import { useEffect, useMemo, useRef } from "react";
import { PatientLang } from "@/types";
import { Turn, Speaker, LANG_NAMES } from "@/lib/turn-log";
import GlossaryHighlight from "./GlossaryHighlight";

interface ConversationLogProps {
  turns: Turn[];
  side: "patient" | "staff";
  lang: PatientLang;
}

type DisplayKind = "other" | "self" | "listening";

interface DisplayEntry {
  turn: Turn;
  kind: DisplayKind;
  text: string;
}

function otherOf(side: "patient" | "staff"): Speaker {
  return side === "patient" ? "staff" : "patient";
}

/**
 * Resolves what (if anything) a turn should show on a given side.
 * - "other" (the other party's speech, translated into this reader's language):
 *   large/bold main content.
 * - "self" (this reader's own speech, in their own words): small/dimmed.
 * - "listening": the turn's speaker hasn't resolved yet (single-mode turn
 *   started from inputTranscription before any output arrived) — shown as a
 *   transient placeholder on both sides since we don't yet know whose it is.
 * Returns null when there is nothing worth rendering for this side (a
 * completed turn with empty relevant text is dropped entirely).
 */
function computeDisplay(turn: Turn, side: "patient" | "staff"): DisplayEntry | null {
  if (turn.speaker === side) {
    if (turn.original || !turn.done) return { turn, kind: "self", text: turn.original };
    return null;
  }
  if (turn.speaker === otherOf(side)) {
    if (turn.translated || !turn.done) return { turn, kind: "other", text: turn.translated };
    return null;
  }
  // speaker === null: still ambiguous. Only show while in progress.
  if (!turn.done) return { turn, kind: "listening", text: turn.original };
  return null;
}

function labelFor(side: "patient" | "staff", kind: DisplayKind): string {
  // Icon-only on the patient side — icons carry meaning across languages,
  // so no Korean text label is needed there.
  if (side === "patient") return kind === "other" ? "🧑‍⚕️" : "🎤";
  return kind === "other" ? "🙋 환자" : "🎤 나";
}

export default function ConversationLog({ turns, side, lang }: ConversationLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () =>
      turns
        .map((t) => computeDisplay(t, side))
        .filter((e): e is DisplayEntry => e !== null),
    [turns, side]
  );

  const lastText = entries[entries.length - 1]?.text;

  // Auto-scroll to bottom whenever the log grows or the in-progress entry updates.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, lastText]);

  const isEmpty = entries.length === 0;
  const targetName = LANG_NAMES[lang] ?? lang;
  const bg = side === "staff" ? "bg-blue-950/50" : "bg-indigo-950/50";

  return (
    <div className="flex flex-col h-full w-full">
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto rounded-2xl px-4 py-3 ${bg} transition-all duration-200 flex flex-col gap-3`}
      >
        {isEmpty ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-500 text-lg italic">
              {side === "staff" ? "한국어로 말하세요" : `${targetName}로 말하세요`}
            </span>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const isLatest = idx === entries.length - 1;
            const label = labelFor(side, entry.kind);
            const inProgress = !entry.turn.done;

            if (entry.kind === "other") {
              const sizeClass = isLatest ? "text-2xl" : "text-lg";
              const opacityClass = isLatest ? "" : "opacity-70";
              return (
                <div key={entry.turn.id} className={opacityClass}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    <span className="text-xs font-semibold text-gray-400">{label}</span>
                  </div>
                  <p className={`${sizeClass} font-bold leading-relaxed text-white break-words`}>
                    <GlossaryHighlight text={entry.text} glossaryTerms={[]} />
                    {inProgress && <span className="animate-pulse text-gray-400">…</span>}
                  </p>
                </div>
              );
            }

            // "self" and "listening" share the small/dimmed/mic-labelled style.
            const sizeClass = isLatest ? "text-base" : "text-sm";
            const opacityClass = isLatest ? "opacity-70" : "opacity-50";
            // Placeholder while the speaker is still unresolved. Korean text only on
            // the staff side; the patient side gets a language-neutral ellipsis.
            const text =
              entry.kind === "listening" && !entry.text
                ? side === "staff" ? "듣는 중" : "…"
                : entry.text;
            return (
              <div key={entry.turn.id} className={opacityClass}>
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  <span className="text-xs font-semibold text-gray-400">{label}</span>
                </div>
                <p className={`${sizeClass} text-gray-300 leading-relaxed break-words`}>
                  {text}
                  {inProgress && <span className="animate-pulse text-gray-500">…</span>}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
