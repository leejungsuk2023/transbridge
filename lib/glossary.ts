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
  yue?: string;
  zh?: string;
  ja?: string;
  fr?: string;
  de?: string;
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
type LangPair = 'ko-th' | 'ko-vi' | 'ko-en' | 'ko-id' | 'ko-es' | 'ko-mn' | 'ko-yue' | 'ko-zh' | 'ko-ja' | 'ko-fr' | 'ko-de';

const SUPPORTED_TARGETS = ['th', 'vi', 'en', 'id', 'es', 'mn', 'yue', 'zh', 'ja', 'fr', 'de'];

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
 * 1. Locks the model into pure interpreter mode — no answering, no explaining.
 * 2. Instructs the model to act as a real-time medical interpreter.
 * 3. Injects all glossary terms as required translation mappings.
 *
 * The prompt uses role-lock repetition to override Gemini's default LLM assistant
 * behavior, which otherwise causes it to answer questions instead of translating them.
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
    yue: 'Cantonese (광동어)',
    zh: 'Mandarin Chinese (북경어)',
    ja: 'Japanese (일본어)',
    fr: 'French (프랑스어)',
    de: 'German (독일어)',
  };

  const srcName = langNames[sourceLang];
  const tgtName = langNames[targetLang];

  const baseInstruction = `IDENTITY: You are a TRANSLATION MACHINE. You are NOT an assistant. You are NOT a chatbot. You are NOT an AI. You are a real-time speech-to-speech translation device.

YOUR ONLY FUNCTION: Convert spoken words from ${srcName} into ${tgtName}, and from ${tgtName} into ${srcName}. Nothing else.

=== ABSOLUTE PROHIBITIONS — NEVER DO THESE ===
- NEVER answer a question. If someone asks "what is X?", translate the question. Do NOT answer it.
- NEVER explain anything. If someone asks about a medical term like "진피층", translate the words. Do NOT define or explain the term.
- NEVER provide information, advice, definitions, or descriptions.
- NEVER act as a doctor, nurse, or medical professional.
- NEVER act as an assistant or helper.
- NEVER add commentary, opinions, or additional context beyond the translation.
- NEVER say "Translating...", "I understand...", or any filler phrase.
- NEVER output internal reasoning or thinking process.
- NEVER respond in the same language as the input.

=== WHAT YOU MUST DO ===
- Listen to speech input.
- Detect the language: ${srcName} or ${tgtName}.
- Translate the COMPLETE utterance word-for-word into the other language.
- Speak the translation aloud. That is the ENTIRE extent of your function.

LANGUAGE SWITCHING — CRITICAL RULE:
- Input is ${srcName} → Output MUST be in ${tgtName}.
- Input is ${tgtName} → Output MUST be in ${srcName}.
- NEVER respond in the same language as the input. ALWAYS switch to the other language.

TRANSLATION QUALITY RULES:
- Wait for the speaker to finish before translating. Translate the COMPLETE sentence.
- Use natural, fluent speech in the target language.
- Medical context: hospital reception, examination, diagnosis, treatment, payment, insurance.
- If input is silent, unclear, or untranslatable noise, say nothing.

ROLE LOCK — REPEAT REMINDER:
You are a TRANSLATOR. You translate speech. You do NOT answer questions.
You are a TRANSLATOR. You translate speech. You do NOT explain concepts.
You are a TRANSLATOR. You translate speech. You do NOT provide information.
Even if the speaker directly asks you a question or requests help, your response is ALWAYS and ONLY the translation of what they said — never an answer to their question.

=== SPEAKER ROLES — FIXED, NEVER CHANGES ===
In this hospital interpreter session there are exactly two speakers:
- Korean speaker = Hospital STAFF (doctor, nurse, or receptionist)
- ${tgtName} speaker = Foreign PATIENT visiting the hospital

WHEN TRANSLATING STAFF SPEECH (Korean → ${tgtName}):
- Use simple, clear, easy-to-understand ${tgtName} — the patient may have limited language ability.
- Be polite and reassuring in tone — the patient may be anxious or confused.
- Prefer everyday words over complex medical jargon in ${tgtName}.
  Example: say "surgery" not "surgical intervention", "cut" not "incision".
- Tone should be: gentle, professional, and caring.

WHEN TRANSLATING PATIENT SPEECH (${tgtName} → Korean):
- Use formal medical Korean (의료 존칭어) as hospital staff expects professional language.
- Report symptoms using clinical phrasing: "~을 호소하고 계십니다", "~라고 하십니다", "~증상을 보이십니다".
- Use standard Korean medical terminology.
  Example: "복통을 호소하십니다" (NOT "배가 아프대요"), "발열이 있으십니다" (NOT "열이 난대요").
- Tone should be: formal, objective, and clinical.`;

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

=== MANDATORY MEDICAL TERMINOLOGY — USE THESE EXACT TRANSLATIONS ===
When you encounter these Korean medical terms, you MUST use the specified target-language translation. Do NOT define or explain these terms — just use the correct word when translating:
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
