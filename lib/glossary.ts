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
  category: string;
}

// In-memory cache to avoid repeated disk reads
const glossaryCache: Record<string, GlossaryEntry[]> = {};

/**
 * Loads glossary entries from the local JSON file.
 * Caches in memory after first load.
 */
export function loadGlossary(langPair: 'ko-th' | 'ko-vi'): GlossaryEntry[] {
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
function resolveLangPair(
  sourceLang: 'ko' | 'th' | 'vi',
  targetLang: 'ko' | 'th' | 'vi'
): 'ko-th' | 'ko-vi' | null {
  if (
    (sourceLang === 'ko' && targetLang === 'th') ||
    (sourceLang === 'th' && targetLang === 'ko')
  ) {
    return 'ko-th';
  }
  if (
    (sourceLang === 'ko' && targetLang === 'vi') ||
    (sourceLang === 'vi' && targetLang === 'ko')
  ) {
    return 'ko-vi';
  }
  return null;
}

/**
 * Builds a Gemini Live API system_instruction string that:
 * 1. Instructs the model to act as a real-time medical interpreter.
 * 2. Injects all glossary terms as required translation mappings.
 */
export function buildSystemPrompt(
  sourceLang: 'ko' | 'th' | 'vi',
  targetLang: 'ko' | 'th' | 'vi'
): string {
  const langNames: Record<string, string> = {
    ko: '한국어 (Korean)',
    th: 'Thai (태국어)',
    vi: 'Vietnamese (베트남어)',
  };

  const srcName = langNames[sourceLang];
  const tgtName = langNames[targetLang];

  const baseInstruction = `You are a professional real-time medical interpreter working at a hospital reception desk in Korea.
Your task: Listen to the ${srcName} audio input and immediately respond with the spoken translation in ${tgtName}.

Rules:
- Translate ONLY. Do not add explanations, greetings, filler words, or commentary.
- Preserve the speaker's tone (formal/informal) and sentence structure as closely as possible.
- Respond with spoken ${tgtName} audio output only.
- The context is hospital reception, examination, and payment — use appropriate medical register.
- If the input is unclear or silent, output nothing.`;

  const langPair = resolveLangPair(sourceLang, targetLang);
  if (!langPair) return baseInstruction;

  let entries: GlossaryEntry[] = [];
  try {
    entries = loadGlossary(langPair);
  } catch (err) {
    console.warn('[Glossary] Failed to load glossary for system prompt:', (err as Error).message);
    return baseInstruction;
  }

  const targetKey = langPair === 'ko-th' ? 'th' : 'vi';
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
  sourceLang: 'ko' | 'th' | 'vi',
  targetLang: 'ko' | 'th' | 'vi'
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
    const term =
      targetLang === 'th' ? entry.th
      : targetLang === 'vi' ? entry.vi
      : entry.ko;

    if (term && lower.includes(term.toLowerCase())) {
      matched.push(term);
    }
  }

  return matched;
}
