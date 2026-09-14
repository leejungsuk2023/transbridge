/**
 * Pure data-model helpers for the Doubao-style conversation log.
 * No React imports here — this module only manipulates plain Turn[] arrays
 * immutably, so it can be unit-tested (or reasoned about) without a DOM.
 *
 * Speaker resolution: the input transcript (`original`) is fragmentary and
 * unreliable — see the removed same-language echo filter in
 * app/session/[id]/page.tsx (a trailing punctuation-only fragment used to flip
 * the detected input language and delete valid translations). The OUTPUT
 * language is authoritative instead: Gemini only ever produces Korean when
 * translating FOR the staff (i.e. the patient spoke), and produces the target
 * language when translating FOR the patient (i.e. the staff spoke).
 */

import { PatientLang } from "@/types";

export type Speaker = "staff" | "patient";

export interface Turn {
  id: string;
  speaker: Speaker | null;
  original: string;
  translated: string;
  done: boolean;
  startedAt: number;
}

/** Max turns retained in the log — oldest are dropped once exceeded. */
const MAX_TURNS = 60;

/** Korean Hangul syllable range — same regex used throughout the app for language detection. */
const KOREAN_RE = /[가-힯]/;

/** Display names for each patient language, shared by ConversationLog and (formerly) PrompterDisplay. */
export const LANG_NAMES: Record<PatientLang, string> = {
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

/** crypto.randomUUID isn't available in every WebView — fall back to a simple unique id. */
function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Drop the oldest turns beyond MAX_TURNS, keeping the array newest-at-end. */
function trim(turns: Turn[]): Turn[] {
  if (turns.length <= MAX_TURNS) return turns;
  return turns.slice(turns.length - MAX_TURNS);
}

/**
 * Starts a new turn and appends it to the log.
 * `speaker` may be null when the speaker isn't known yet (single-session mode
 * resolves it later from the output language via appendTranslated).
 */
export function startTurn(turns: Turn[], speaker: Speaker | null): { turns: Turn[]; id: string } {
  const id = makeId();
  const turn: Turn = {
    id,
    speaker,
    original: "",
    translated: "",
    done: false,
    startedAt: Date.now(),
  };
  return { turns: trim([...turns, turn]), id };
}

/** Concatenates a fragment onto a turn's original (source-language) transcript. */
export function appendOriginal(turns: Turn[], id: string, text: string): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, original: t.original + text } : t));
}

/**
 * Concatenates a fragment onto a turn's translated transcript. If the turn's
 * speaker is not yet known, resolves it from the OUTPUT language of the
 * accumulated translated text: Korean output means the patient was the
 * speaker (Gemini translates the patient's speech into Korean for staff);
 * any other output language means the staff was the speaker.
 */
export function appendTranslated(turns: Turn[], id: string, text: string): Turn[] {
  return turns.map((t) => {
    if (t.id !== id) return t;
    const translated = t.translated + text;
    const speaker = t.speaker ?? (KOREAN_RE.test(translated) ? "patient" : "staff");
    return { ...t, translated, speaker };
  });
}

/** Marks a turn as complete (no more fragments will be appended). */
export function completeTurn(turns: Turn[], id: string): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, done: true } : t));
}

/** Explicitly sets a turn's speaker (used by dual mode, where the speaker is known up front). */
export function setSpeaker(turns: Turn[], id: string, speaker: Speaker): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, speaker } : t));
}
