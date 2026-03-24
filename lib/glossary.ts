/**
 * Medical glossary loading and management utilities.
 * Entries are loaded from local JSON files and cached in memory.
 * Used to build Gemini Live API system_instruction prompts and to
 * highlight matched terms in the frontend prompter display.
 */

import fs from 'fs';
import path from 'path';

export interface GlossaryEntry {
  ko: string;
  th?: string;
  vi?: string;
  en?: string;
  id?: string;
  es?: string;
  mn?: string;
  category: string;
  [key: string]: string | undefined;
}

// In-memory cache to avoid repeated disk reads
const glossaryCache: Record<string, GlossaryEntry[]> = {};

/**
 * Loads glossary entries from the local JSON file.
 * Caches in memory after first load.
 */
export function loadGlossary(langPair: string): GlossaryEntry[] {
  if (glossaryCache[langPair]) {
    return glossaryCache[langPair];
  }

  const filePath = path.join(process.cwd(), 'glossary', `${langPair}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries: GlossaryEntry[] = JSON.parse(raw);
  glossaryCache[langPair] = entries;
  return entries;
}

/**
 * Resolves the lang pair key ('ko-th' | 'ko-vi') from source/target language codes.
 * Returns null if neither language is Korean (unsupported pair).
 */
type LangPair = 'ko-th' | 'ko-vi' | 'ko-en' | 'ko-id' | 'ko-es' | 'ko-mn';

const SUPPORTED_TARGETS = ['th', 'vi', 'en', 'id', 'es', 'mn'];

function resolveLangPair(
  sourceLang: string,
  targetLang: string
): LangPair | null {
  const other = sourceLang === 'ko' ? targetLang : targetLang === 'ko' ? sourceLang : null;
  if (other && SUPPORTED_TARGETS.includes(other)) {
    return `ko-${other}` as LangPair;
  }
  return null;
}

/**
 * Builds a Gemini Live API system_instruction string that:
 * 1. Instructs the model to act as a real-time medical interpreter.
 * 2. Injects all glossary terms as required translation mappings.
 */
export function buildSystemPrompt(
  sourceLang: string,
  targetLang: string
): string {
  const langNames: Record<string, string> = {
    ko: '한국어 (Korean)',
    th: 'Thai (태국어)',
    vi: 'Vietnamese (베트남어)',
    en: 'English (영어)',
    id: 'Indonesian (인도네시아어)',
    es: 'Spanish (스페인어)',
    mn: 'Mongolian (몽골어)',
  };

  const srcName = langNames[sourceLang];
  const tgtName = langNames[targetLang];

  const baseInstruction = `You are a real-time bidirectional medical interpreter at a Korean hospital reception desk.

CRITICAL RULE — Language detection and translation direction:
- When the speaker uses ${srcName}: You MUST respond in ${tgtName}.
- When the speaker uses ${tgtName}: You MUST respond in ${srcName}.
- NEVER respond in the same language as the input. ALWAYS switch to the other language.

Translation rules:
- Translate the COMPLETE sentence. Do not stop mid-sentence. Wait for the speaker to finish, then translate the full utterance.
- Translate ONLY — no explanations, no thinking out loud, no filler words, no commentary, no internal reasoning.
- Do NOT output text like "Translating..." or thinking process. Output ONLY the spoken translation audio.
- Speak naturally and fluently in the target language.
- Medical context: hospital reception, examination, diagnosis, treatment, payment, insurance.
- If input is silent or unclear, say nothing.`;

  const langPair = resolveLangPair(sourceLang, targetLang);
  if (!langPair) return baseInstruction;

  let entries: GlossaryEntry[] = [];
  try {
    entries = loadGlossary(langPair);
  } catch (err) {
    console.warn('[Glossary] Failed to load glossary for system prompt:', (err as Error).message);
    return baseInstruction;
  }

  // Extract target language code from lang pair (e.g. 'ko-th' → 'th')
  const targetKey = langPair.split('-')[1] as keyof GlossaryEntry;
  const glossaryLines = entries
    .filter(e => e.ko && e[targetKey])
    .map(e => `  ${e.ko} = ${e[targetKey]}`)
    .join('\n');

  if (!glossaryLines) return baseInstruction;

  return `${baseInstruction}

Critical medical terminology — always use these exact translations:
${glossaryLines}`;
}

/**
 * Finds which glossary terms (in the target language) appear in the translated text.
 * Returns matched target-language term strings for frontend highlighting.
 */
export function findGlossaryTermsInText(
  translatedText: string,
  sourceLang: string,
  targetLang: string
): string[] {
  if (!translatedText.trim()) return [];

  const langPair = resolveLangPair(sourceLang, targetLang);
  if (!langPair) return [];

  let entries: GlossaryEntry[] = [];
  try {
    entries = loadGlossary(langPair);
  } catch {
    return [];
  }

  const lower = translatedText.toLowerCase();
  const matched: string[] = [];

  for (const entry of entries) {
    const term = entry[targetLang] ?? entry.ko;

    if (term && lower.includes(term.toLowerCase())) {
      matched.push(term);
    }
  }

  return matched;
}
