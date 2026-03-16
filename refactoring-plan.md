# MedTranslate 리팩토링 기획서: Gemini Live API 전환

> 작성일: 2026-03-16
> 참조: claude_code_prompt.md, PRD.md, work.md
> 버전: v2.0 → v3.0 (Gemini Live 전환)

---

## 1. 변경 개요

### 현재 아키텍처 (v2.0 — Google 3-Step Pipeline)

```
[단일 디바이스]
PTT 버튼 누름
    → MediaRecorder (audio/webm;codecs=opus)
    → base64 인코딩
    → POST /api/translate (HTTPS, JSON body)

[서버 — Next.js API Route]
    → server/translation-pipeline.ts
        → Google Cloud STT v2 (오디오 → 텍스트)
        → Google Cloud Translation API (텍스트 → 번역 텍스트, Custom Glossary)
        → Google Cloud TTS WaveNet (번역 텍스트 → 오디오)
    → JSON 응답 { originalText, translatedText, audioData: base64, glossaryTerms }

[단일 디바이스]
    → base64 디코딩 → AudioContext 재생
    → PrompterDisplay 업데이트
```

**문제점**: API 3개 직렬 호출 → 총 지연시간 ~2~3초, 파이프라인 복잡성 높음

---

### 변경 후 아키텍처 (v3.0 — Gemini Live API 단일 통합)

```
[단일 디바이스]
PTT 버튼 누름
    → MediaRecorder 또는 AudioWorklet (PCM 16kHz)
    → POST /api/translate (오디오 청크 + 메타데이터)

[서버 — Next.js API Route]
    → lib/gemini-live.ts
        → Gemini Live API (gemini-2.5-flash-native-audio)
        → WebSocket 세션 (system_instruction에 glossary 주입)
        → 단일 API 호출로 STT + 번역 + TTS 동시 처리
    → JSON 응답 { originalText, translatedText, audioData: base64, glossaryTerms }

[단일 디바이스]
    → 동일: base64 디코딩 → AudioContext 재생
    → PrompterDisplay 업데이트 (변경 없음)
```

**효과**: API 1개, 지연시간 <1초, 파이프라인 대폭 단순화

---

### 변경 이유 요약

| 항목 | 현재 (v2) | 변경 후 (v3) |
|------|-----------|--------------|
| API 수 | 3개 (STT + Translation + TTS) | 1개 (Gemini Live) |
| 지연시간 | ~2~3초 | <1초 |
| Glossary 방식 | Google Translation API Custom Glossary | system_instruction 텍스트 주입 |
| 환경변수 | GOOGLE_CLOUD_PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY | GEMINI_API_KEY |
| 파이프라인 복잡도 | 높음 (retry 로직, 3단계 에러 처리) | 낮음 (단일 연결) |
| 언어 지원 | ko/th/vi 3개 | 70개 이상 언어 |

---

## 2. 제거 대상

### 2.1 삭제할 파일

| 파일 | 이유 |
|------|------|
| `lib/google-stt.ts` | Google Cloud STT 클라이언트 — Gemini Live로 대체 |
| `lib/google-translate.ts` | Google Cloud Translation 클라이언트 — Gemini Live로 대체 |
| `lib/google-tts.ts` | Google Cloud TTS 클라이언트 — Gemini Live로 대체 |
| `server/translation-pipeline.ts` | 3단계 파이프라인 오케스트레이터 — 제거 (Gemini Live가 단일로 처리) |

### 2.2 수정 (대폭 변경)할 파일

| 파일 | 변경 내용 |
|------|-----------|
| `lib/glossary.ts` | `uploadGlossaryToGoogle()` 제거, `createGlossary` import 제거, `buildSystemPrompt()` 함수 추가 |
| `app/api/translate/route.ts` | `processTranslation()` 호출 대신 `translateWithGeminiLive()` 호출로 교체 |

### 2.3 제거할 npm 패키지

```bash
npm uninstall @google-cloud/speech @google-cloud/translate @google-cloud/text-to-speech
```

| 패키지 | 이유 |
|--------|------|
| `@google-cloud/speech` | Google STT — Gemini Live로 대체 |
| `@google-cloud/translate` | Google Translation API — Gemini Live로 대체 |
| `@google-cloud/text-to-speech` | Google TTS — Gemini Live로 대체 |

### 2.4 추가할 npm 패키지

```bash
npm install @google/genai
```

| 패키지 | 이유 |
|--------|------|
| `@google/genai` | Gemini Live API 공식 Node.js SDK (최신 버전: 1.45.0+) |

### 2.5 제거할 환경변수

```bash
# 제거 대상
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=
FIREBASE_ADMIN_CLIENT_EMAIL=    # Firebase Admin 인증 방식 검토 필요 (유지 가능)
FIREBASE_ADMIN_PRIVATE_KEY=     # Firebase Admin 인증 방식 검토 필요 (유지 가능)
```

> **주의**: Firebase Admin SDK는 여전히 세션 관리에 필요하므로, `FIREBASE_ADMIN_*` 변수는 Firebase Admin 인증 방식에 따라 유지 여부 결정. Google Cloud 서비스 계정이 Firebase Admin과 분리되어 있다면 `GOOGLE_CLOUD_*` 변수만 제거.

### 2.6 Firestore에서 제거

- `glossary` 컬렉션: system prompt 방식으로 대체. 로컬 JSON 파일(`glossary/ko-th.json`, `glossary/ko-vi.json`)만 사용.

---

## 3. 신규 구현

### 3.1 `lib/gemini-live.ts` — 신규 생성

Gemini Live API 클라이언트 모듈. 서버 사이드에서 실행되며, API Route에서 호출된다.

**핵심 설계 결정**: Gemini Live API는 WebSocket 기반 스트리밍이지만, MedTranslate v2는 **PTT(Half-Duplex) 방식**이므로 발화 완료 후 단발성 요청으로 처리한다. 즉, 매 PTT 발화마다 새로운 Gemini Live 세션을 열고 오디오를 전송한 뒤 응답을 받아 닫는 **단발성 세션 방식**을 사용한다.

> **Full-Duplex 전환 고려**: Gemini Live API는 실시간 양방향 스트리밍을 지원하므로, 향후 Half-Duplex PTT를 제거하고 Full-Duplex 연속 대화 모드로 전환할 수 있다. 그러나 의료 환경에서는 하울링 방지와 발화 구분의 명확성을 위해 Half-Duplex PTT 방식이 여전히 적합하다고 판단, v3에서는 PTT 방식을 유지한다.

```typescript
// lib/gemini-live.ts

import { GoogleGenAI, Modality } from '@google/genai';
import { buildSystemPrompt } from './glossary';

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface GeminiTranslateInput {
  audioChunk: Buffer;           // MediaRecorder webm/opus 오디오
  sourceLang: 'ko' | 'th' | 'vi';
  targetLang: 'ko' | 'th' | 'vi';
  speaker: 'staff' | 'patient';
  sessionId: string;
}

export interface GeminiTranslateOutput {
  originalText: string;
  translatedText: string;
  audioData: string;            // base64 MP3/PCM
  glossaryTerms: string[];
  processingTimeMs: number;
}

const LANG_NAMES: Record<string, string> = {
  ko: '한국어',
  th: '태국어 (Thai)',
  vi: '베트남어 (Vietnamese)',
};

export async function translateWithGeminiLive(
  input: GeminiTranslateInput
): Promise<GeminiTranslateOutput> {
  const { audioChunk, sourceLang, targetLang, speaker, sessionId } = input;
  const start = Date.now();

  // Gemini Live API 세션 생성
  const session = await genai.live.connect({
    model: 'gemini-2.5-flash-native-audio',
    config: {
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      systemInstruction: buildSystemPrompt(sourceLang, targetLang),
      inputAudioTranscription: {},   // 원문 텍스트 반환 요청
      outputAudioTranscription: {},  // 번역 텍스트 반환 요청
    },
  });

  // 오디오 전송 (base64 인코딩)
  const base64Audio = audioChunk.toString('base64');
  session.sendRealtimeInput({
    audio: {
      data: base64Audio,
      mimeType: 'audio/webm;codecs=opus',
    },
  });

  // 응답 수집
  let originalText = '';
  let translatedText = '';
  let audioData = '';

  for await (const message of session) {
    // 원문 텍스트 (입력 음성의 STT 결과)
    if (message.serverContent?.inputTranscription?.text) {
      originalText += message.serverContent.inputTranscription.text;
    }
    // 번역 텍스트 (출력 음성의 텍스트)
    if (message.serverContent?.outputTranscription?.text) {
      translatedText += message.serverContent.outputTranscription.text;
    }
    // 번역 음성 오디오
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData?.mimeType?.startsWith('audio/')) {
          audioData = part.inlineData.data ?? '';
        }
      }
    }
    // 턴 완료 신호
    if (message.serverContent?.turnComplete) {
      break;
    }
  }

  session.close();

  // Glossary 단어 매칭 (번역 결과에서 glossary 단어 찾기)
  const { findGlossaryTermsInText } = await import('./glossary');
  const glossaryTerms = findGlossaryTermsInText(translatedText, sourceLang, targetLang);

  return {
    originalText,
    translatedText,
    audioData,
    glossaryTerms,
    processingTimeMs: Date.now() - start,
  };
}
```

---

### 3.2 `lib/glossary.ts` — 대폭 수정

**현재**: Google Translation API Custom Glossary에 업로드하는 로직 포함
**변경**: Gemini system_instruction에 주입할 텍스트 생성 로직으로 교체

```typescript
// lib/glossary.ts (변경 후)

import fs from 'fs';
import path from 'path';

export interface GlossaryEntry {
  ko: string;
  th?: string;
  vi?: string;
  category: string;
}

const glossaryCache: Record<string, GlossaryEntry[]> = {};

// 기존 유지: JSON 파일 로딩 (변경 없음)
export function loadGlossary(langPair: 'ko-th' | 'ko-vi'): GlossaryEntry[] {
  if (glossaryCache[langPair]) return glossaryCache[langPair];
  const filePath = path.join(process.cwd(), 'glossary', `${langPair}.json`);
  const entries: GlossaryEntry[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  glossaryCache[langPair] = entries;
  return entries;
}

// 신규: Gemini system_instruction 텍스트 생성
export function buildSystemPrompt(
  sourceLang: 'ko' | 'th' | 'vi',
  targetLang: 'ko' | 'th' | 'vi'
): string {
  const langPair: 'ko-th' | 'ko-vi' | null =
    (sourceLang === 'ko' && targetLang === 'th') || (sourceLang === 'th' && targetLang === 'ko')
      ? 'ko-th'
      : (sourceLang === 'ko' && targetLang === 'vi') || (sourceLang === 'vi' && targetLang === 'ko')
        ? 'ko-vi'
        : null;

  const srcName = { ko: '한국어', th: 'Thai (태국어)', vi: 'Vietnamese (베트남어)' }[sourceLang];
  const tgtName = { ko: '한국어', th: 'Thai (태국어)', vi: 'Vietnamese (베트남어)' }[targetLang];

  const baseInstruction = `You are a professional real-time medical interpreter.
Your task: Listen to the ${srcName} audio input, then respond with the translated speech in ${tgtName}.
Rules:
- Translate ONLY. Do not add explanations, greetings, or commentary.
- Preserve the speaker's tone (formal/informal).
- Respond with spoken ${tgtName} audio output only.
- The context is a hospital reception/examination setting in Korea.`;

  if (!langPair) return baseInstruction;

  const entries = loadGlossary(langPair);
  const glossaryLines = entries
    .filter(e => e.ko && (langPair === 'ko-th' ? e.th : e.vi))
    .map(e => `  ${e.ko} = ${langPair === 'ko-th' ? e.th : e.vi}`)
    .join('\n');

  return `${baseInstruction}

Critical medical terminology — always use these exact translations:
${glossaryLines}`;
}

// 신규: 번역 결과에서 Glossary 단어 매칭 (프롬프터 하이라이팅용)
export function findGlossaryTermsInText(
  translatedText: string,
  sourceLang: 'ko' | 'th' | 'vi',
  targetLang: 'ko' | 'th' | 'vi'
): string[] {
  if (!translatedText.trim()) return [];
  const langPair: 'ko-th' | 'ko-vi' | null =
    (sourceLang === 'ko' && targetLang === 'th') || (sourceLang === 'th' && targetLang === 'ko')
      ? 'ko-th'
      : (sourceLang === 'ko' && targetLang === 'vi') || (sourceLang === 'vi' && targetLang === 'ko')
        ? 'ko-vi'
        : null;
  if (!langPair) return [];

  const entries = loadGlossary(langPair);
  const lower = translatedText.toLowerCase();
  const matched: string[] = [];
  for (const entry of entries) {
    const term = targetLang === 'th' ? entry.th : targetLang === 'vi' ? entry.vi : entry.ko;
    if (term && lower.includes(term.toLowerCase())) matched.push(term);
  }
  return matched;
}

// 제거: uploadGlossaryToGoogle(), getGlossaryId() — Gemini 전환 후 불필요
// (google-translate.ts 삭제와 함께 이 함수들도 제거)
```

---

### 3.3 `app/api/translate/route.ts` — 교체

**현재**: `processTranslation()` (server/translation-pipeline.ts) 호출
**변경**: `translateWithGeminiLive()` (lib/gemini-live.ts) 호출

```typescript
// app/api/translate/route.ts (변경 후)
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { translateWithGeminiLive } from '../../../lib/gemini-live';
import { TranslateRequest, TranslateResponse } from '../../../types';

export async function POST(req: NextRequest): Promise<NextResponse<TranslateResponse>> {
  const requestStart = Date.now();

  let body: TranslateRequest;
  try {
    body = (await req.json()) as TranslateRequest;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { audioData, sourceLang, targetLang, speaker, sessionId } = body;

  // 기존 유효성 검사 유지
  if (!audioData || !sourceLang || !targetLang || !speaker || !sessionId) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  const audioBuffer = Buffer.from(audioData, 'base64');

  try {
    const result = await translateWithGeminiLive({
      audioChunk: audioBuffer,
      sourceLang,
      targetLang,
      speaker,
      sessionId,
    });

    console.log(`[Translate API] Done in ${Date.now() - requestStart}ms`);

    return NextResponse.json({
      success: true,
      data: {
        originalText: result.originalText,
        translatedText: result.translatedText,
        audioData: result.audioData,
        glossaryTerms: result.glossaryTerms,
        processingTimeMs: result.processingTimeMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Translate API] Gemini Live error:', message);
    return NextResponse.json({ success: false, error: `Translation failed: ${message}` }, { status: 500 });
  }
}
```

**변경 포인트**: import 경로 1개만 변경 (`translation-pipeline` → `gemini-live`). API 인터페이스(`TranslateRequest`/`TranslateResponse` 타입)는 그대로 유지되므로 **프론트엔드 코드 변경 불필요**.

---

### 3.4 `types/index.ts` — 최소 변경

현재 `TranslateRequest` / `TranslateResponse` 타입은 변경하지 않는다. API 인터페이스가 동일하게 유지되어 프론트엔드(session 페이지, HalfDuplexPTT)의 변경이 최소화된다.

```typescript
// 현재 유지 (변경 없음)
export interface TranslateRequest {
  audioData: string;          // base64 audio (webm/opus)
  sourceLang: 'ko' | 'th' | 'vi';
  targetLang: 'ko' | 'th' | 'vi';
  speaker: SpeakerRole;
  sessionId: string;
}

export interface TranslateResponse {
  success: boolean;
  data?: {
    originalText: string;
    translatedText: string;
    audioData: string;        // base64 — Gemini Live 출력 형식으로 변경될 수 있음
    glossaryTerms: string[];
    processingTimeMs: number;
  };
  error?: string;
}
```

> **주의**: Gemini Live API의 오디오 출력 형식은 PCM 24kHz (또는 MP3)이다. 현재 프론트엔드의 `playBase64Audio()`는 `AudioContext.decodeAudioData()`를 사용하므로, 출력 포맷이 달라져도 Web Audio API가 자동으로 처리한다. 단, PCM raw 포맷의 경우 별도 처리가 필요할 수 있으므로 통합 테스트 단계에서 확인 필요.

---

## 4. Glossary 처리 방식 변경

### 기존 방식 (v2)
```
Google Translation API Custom Glossary
  ← lib/glossary.ts:uploadGlossaryToGoogle()
  ← Google Cloud Translation API: createGlossary()
  → 번역 시 glossaryId 파라미터로 적용
```
- 초기 Glossary 등록이 별도로 필요
- Google Cloud Translation API 계정, 프로젝트, 서비스 계정 키 필요
- 업데이트 시 API 재호출 필요

### 변경 방식 (v3 — System Prompt 주입)
```
lib/glossary.ts:buildSystemPrompt(sourceLang, targetLang)
  → glossary/ko-th.json 또는 ko-vi.json 로드 (캐시)
  → 의료 용어 텍스트 목록 생성
  → Gemini Live 세션 system_instruction에 주입
```

### System Prompt 예시 (ko → th 번역 시)

```
You are a professional real-time medical interpreter.
Your task: Listen to the 한국어 audio input, then respond with the translated speech in Thai (태국어).
Rules:
- Translate ONLY. Do not add explanations, greetings, or commentary.
- Preserve the speaker's tone (formal/informal).
- Respond with spoken Thai (태국어) audio output only.
- The context is a hospital reception/examination setting in Korea.

Critical medical terminology — always use these exact translations:
  접수 = การลงทะเบียน
  대기실 = ห้องรอ
  진료실 = ห้องตรวจ
  예약 = การนัดหมาย
  수납 = การชำระเงิน
  통증 = ความเจ็บปวด
  발열 = ไข้
  두통 = ปวดหัว
  복통 = ปวดท้อง
  내시경 = การส่องกล้อง
  마취 = การดมยาสลบ
  수술 = การผ่าตัด
  입원 = การรับตัวผู้ป่วย
  처방전 = ใบสั่งยา
  ...
```

### 글로서리 파일 유지

`glossary/ko-th.json`, `glossary/ko-vi.json` 파일은 **그대로 유지**한다. 사용 방식만 변경:
- **제거**: Translation API Custom Glossary 업로드 (`uploadGlossaryToGoogle()`)
- **유지**: 로컬 파일 로드 (`loadGlossary()`)
- **추가**: system prompt 텍스트 변환 (`buildSystemPrompt()`)
- **유지**: 번역 결과에서 용어 매칭 (`findGlossaryTermsInText()` — 기존 `findGlossaryTerms()` 함수명만 변경)

---

## 5. 환경변수 변경

### 제거할 변수

```bash
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=
# 위 4개는 Google Cloud STT/Translation/TTS 서비스 계정 인증용 → 제거
```

### 추가할 변수

```bash
GEMINI_API_KEY=          # Google AI Studio (https://aistudio.google.com) 에서 발급
```

### 유지할 변수

```bash
# Firebase 클라이언트 SDK (변경 없음)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (세션 관리에 여전히 필요)
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# 앱 설정
NEXT_PUBLIC_APP_URL=https://medtranslate.kr
PORT=3000
NODE_ENV=production
```

### `.env.example` 업데이트 내용

```bash
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (서버 사이드 — 세션 인증)
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Gemini API (Google AI Studio에서 발급: https://aistudio.google.com)
GEMINI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://medtranslate.kr
PORT=3000
NODE_ENV=production
```

---

## 6. 의존성 변경 상세

### package.json 변경

```json
// 제거
"@google-cloud/speech": "^7.3.0",
"@google-cloud/text-to-speech": "^6.4.0",
"@google-cloud/translate": "^9.3.0",

// 추가
"@google/genai": "^1.45.0"
```

### 유지하는 의존성

```json
"firebase": "^12.10.0",       // Firebase 클라이언트 SDK
"firebase-admin": "^13.7.0",  // Firebase Admin SDK (세션 관리)
"next": "14.2.35",
"react": "^18",
"react-dom": "^18",
"uuid": "^13.0.0",
"zustand": "^5.0.11"
```

### 제거 가능한 의존성 (v1 잔존)

아키텍처 전환과 별개로, 아래는 v2에서 이미 미사용 상태이므로 함께 정리 가능:
- `socket.io`, `socket.io-client` — WebSocket 서버 (v1 잔존)
- `html5-qrcode`, `qrcode.react` — QR 관련 (v1 잔존)

---

## 7. 에이전트별 작업 분배

### Backend 에이전트 (핵심 작업)

**담당 파일**:
- `lib/gemini-live.ts` (신규 생성)
- `lib/glossary.ts` (대폭 수정)
- `app/api/translate/route.ts` (교체)

**태스크 상세**:

1. **`lib/gemini-live.ts` 신규 생성**
   - `@google/genai` SDK import
   - `translateWithGeminiLive(input: GeminiTranslateInput): Promise<GeminiTranslateOutput>` 구현
   - Gemini Live 세션 생성 → 오디오 전송 → 응답 수집 → 세션 종료
   - 오디오 입력: webm/opus base64
   - 오디오 출력: base64 인코딩하여 반환

2. **`lib/glossary.ts` 수정**
   - `buildSystemPrompt(sourceLang, targetLang): string` 함수 추가
   - `findGlossaryTermsInText()` 함수 추가 (기존 `findGlossaryTerms()` 이동)
   - `uploadGlossaryToGoogle()` 및 `getGlossaryId()` 제거
   - `import { createGlossary } from './google-translate'` import 제거

3. **`app/api/translate/route.ts` 수정**
   - import 경로: `'../../../server/translation-pipeline'` → `'../../../lib/gemini-live'`
   - 호출 함수: `processTranslation()` → `translateWithGeminiLive()`
   - 나머지 유효성 검사, 에러 처리, 응답 포맷 유지

4. **삭제**
   - `lib/google-stt.ts`
   - `lib/google-translate.ts`
   - `lib/google-tts.ts`
   - `server/translation-pipeline.ts`

**완료 기준**: `curl -X POST /api/translate -H 'Content-Type: application/json' -d '{"audioData":"<base64>","sourceLang":"ko","targetLang":"th","speaker":"staff","sessionId":"test"}'` 로 Gemini Live를 통한 번역 음성 응답 반환

---

### Integration 에이전트

**담당 파일**:
- `package.json`
- `.env.example`
- `Dockerfile`

**태스크 상세**:

1. **`package.json` 의존성 변경**
   - `@google-cloud/speech`, `@google-cloud/translate`, `@google-cloud/text-to-speech` 제거
   - `@google/genai` 추가
   - `npm install` 실행

2. **`.env.example` 업데이트**
   - `GOOGLE_CLOUD_*` 변수 제거
   - `GEMINI_API_KEY=` 추가

3. **`Dockerfile` 환경변수 주석 업데이트**
   - 빌드 시 더미 env vars 주석에서 `GOOGLE_CLOUD_*` → `GEMINI_API_KEY` 언급 변경
   - `GOOGLE_APPLICATION_CREDENTIALS` 관련 설정 제거

4. **빌드 검증**
   - `node node_modules/next/dist/bin/next build` 실행
   - TypeScript 에러, import 에러 없는지 확인

**완료 기준**: `npm run build` 성공 (빌드 에러 없음)

---

### Frontend 에이전트

**이번 변경에서 프론트엔드 수정은 최소화**한다. API 인터페이스가 동일하게 유지되므로 `app/session/[id]/page.tsx`, `components/HalfDuplexPTT.tsx`, `components/PrompterDisplay.tsx`는 **변경 없음**.

잠재적 작업: Gemini Live 오디오 출력 포맷이 PCM raw인 경우 `playBase64Audio()` 함수 수정 필요. 통합 테스트 후 결정.

---

## 8. 구현 순서 (Phase별)

### Phase 1 — 기존 파이프라인 제거 + Gemini 클라이언트 구현 (1~2일)

**목표**: 서버 사이드에서 Gemini Live API를 통한 번역 동작

1. `npm uninstall @google-cloud/speech @google-cloud/translate @google-cloud/text-to-speech`
2. `npm install @google/genai`
3. `lib/glossary.ts` 수정 (google-translate import 제거, `buildSystemPrompt` 추가)
4. `lib/gemini-live.ts` 신규 생성 (`translateWithGeminiLive()` 구현)
5. `app/api/translate/route.ts` — import 교체
6. `lib/google-stt.ts`, `lib/google-translate.ts`, `lib/google-tts.ts`, `server/translation-pipeline.ts` 삭제
7. `.env.example` 업데이트
8. `GEMINI_API_KEY` 발급 후 `.env.local`에 추가

**완료 기준**: API route curl 테스트 성공 (로컬 환경)

---

### Phase 2 — 빌드 확인 + 오디오 포맷 검증 (반나절)

**목표**: 빌드 성공, 오디오 재생 정상 동작

1. `node node_modules/next/dist/bin/next build` 빌드 확인
2. TypeScript 에러 수정
3. 브라우저에서 PTT → 번역 → 오디오 재생 end-to-end 테스트
4. Gemini Live 출력 오디오 포맷 확인 (PCM/MP3) → `playBase64Audio()` 수정 여부 결정

**완료 기준**: 단일 디바이스에서 PTT → 한국어 발화 → 태국어 번역 음성 재생

---

### Phase 3 — 배포 + 검증 (1일)

**목표**: Cloud Run 배포 후 전체 플로우 동작

1. Cloud Run 환경변수에서 `GOOGLE_CLOUD_*` 제거, `GEMINI_API_KEY` 추가
2. `docker build` 테스트
3. Cloud Run 배포
4. 프로덕션 환경 end-to-end 테스트

**완료 기준**: `https://medtranslate.kr` 에서 Gemini Live 기반 번역 정상 동작

---

## 9. 리스크 및 고려사항

### 9.1 Gemini Live API 가용성 및 모델명

- 현재 모델명: `gemini-2.5-flash-native-audio` (정식 출시) 또는 `gemini-live-2.5-flash-native-audio` (미리보기: `gemini-2.5-flash-native-audio-preview-12-2025`)
- **대응**: 구현 전 Google AI Studio에서 최신 모델명 확인 필요. `lib/gemini-live.ts`에서 모델명을 상수로 분리하여 변경 용이하게 설계
- GitHub issue `googleapis/js-genai #1212`에서 `gemini-2.5-flash-native-audio` 관련 버그 보고됨 → SDK 최신 버전 사용

### 9.2 오디오 입력 포맷

- Gemini Live API는 입력 오디오로 **PCM 16-bit, 16kHz, Mono**를 권장
- 현재 프론트엔드는 `MediaRecorder`로 `audio/webm;codecs=opus` 전송
- **대응 옵션 A**: `mimeType: 'audio/webm;codecs=opus'`로 전송 시도 (SDK가 변환 처리 가능 여부 테스트)
- **대응 옵션 B**: 프론트엔드에서 AudioWorklet으로 PCM 16kHz 다운샘플링 후 전송 (더 안정적)
- 초기 구현은 옵션 A 시도 후, 인식률이 낮으면 옵션 B로 전환

### 9.3 오디오 출력 포맷

- Gemini Live API 출력: PCM 16-bit, 24kHz, Mono
- 현재 `playBase64Audio()`는 `AudioContext.decodeAudioData()` 사용 → PCM raw는 직접 디코딩 불가
- **대응**: PCM raw 포맷 수신 시 `AudioContext.createBuffer()`로 수동 파싱 필요 또는 서버에서 MP3 변환 후 반환
- 서버에서 PCM → MP3 변환: `ffmpeg` 또는 `speaker` npm 패키지 활용 검토

### 9.4 Half-Duplex vs Full-Duplex 전환

- Gemini Live API는 실시간 양방향 스트리밍 지원
- **현재 결정**: Half-Duplex PTT 방식 유지 (의료 환경 특성상 명확한 발화 구분 필요, 하울링 방지)
- **향후 고려**: PTT 없이 자동 발화 감지(VAD, Voice Activity Detection) 기반 Full-Duplex 전환 가능
  - Gemini Live API의 `endOfTurnInterrupt` 설정으로 구현 가능
  - 단, 의료 현장에서는 명확한 발화 제어가 더 중요하므로 PTT 방식이 적합

### 9.5 의료 용어 정확도 — system prompt vs 전용 glossary

- Google Translation API Custom Glossary는 정확한 용어 강제 적용이 가능했음
- Gemini system_instruction의 glossary는 "권고" 수준으로, 반드시 지켜지지 않을 수 있음
- **대응**: system prompt에서 "Critical", "must use these exact translations" 등 강조 표현 사용
- **모니터링**: 번역 결과 샘플 검수로 의료 용어 정확도 지속 확인 필요
- **미래 대안**: Gemini의 Tool Use 기능으로 glossary 조회 API 연동 검토

### 9.6 비용 변경

| 서비스 | 현재 비용 (예상) | 변경 후 비용 |
|--------|-----------------|-------------|
| Google STT | $0.016/분 | 제거 |
| Google Translation | $20/백만자 | 제거 |
| Google TTS WaveNet | $16/백만자 | 제거 |
| Gemini Live API | - | 요청당 과금 (토큰 + 오디오 초당) |

- Gemini Live API 비용: 출시 초기 프리 티어 및 AI Studio 크레딧 활용 가능
- 상세 비용은 Google AI Studio 요금표에서 확인 필요

### 9.7 세션 관리 방식

- PTT마다 새 Gemini Live 세션 → 각 발화가 독립적 컨텍스트
- 장점: 구현 단순, 상태 관리 불필요
- 단점: 이전 발화 컨텍스트 공유 불가
- **현재 결정**: 단발성 세션 방식 유지 (의료 통역은 문장 단위 처리가 적합)

---

## 10. PRD.md 수정 필요 사항

### 버전 및 날짜
- `버전: v1.0` → `버전: v3.0`
- `작성일: 2026-03-03` → `업데이트: 2026-03-16`

### 1. 제품 개요
- 마지막 bullet: `Google Cloud STT/Translation/TTS를 활용한` → `Gemini Live API를 활용한 단일 API 기반` 으로 교체

### 3. 핵심 사용자 흐름 — 흐름 C
- 전체 교체: `AudioWorklet`, `STT`, `Glossary 교정`, `Translation`, `TTS` 각 단계 → Gemini Live API 단일 호출로 통합 다이어그램

### 4. 기능 요구사항 — FR-8 의료 용어 사전
- `Firestore glossary 컬렉션에 저장` → `로컬 JSON 파일로 관리` 변경
- `Google Cloud Translation API의 Custom Glossary 기능에 연동` → `Gemini Live API system_instruction에 주입` 변경

### 5. 비기능 요구사항 — 성능
- `번역 전체 지연시간: 2초 이내` → `1초 이내` 상향

### 6. 기술 아키텍처
- 기술 스택 테이블: STT/Translation/TTS 행 삭제, Gemini Live API 행 추가
- 시스템 아키텍처 다이어그램: 3개 Google Cloud API 박스 → Gemini Live 단일 박스로 교체
- 언어 코드 매핑 테이블: 삭제 (Gemini Live는 자동 언어 감지)
- 번역 파이프라인 상세 흐름: 전면 교체 (Gemini Live 단일 흐름으로)

### 9. 프로젝트 구조
- `lib/google-stt.ts`, `lib/google-translate.ts`, `lib/google-tts.ts` 제거
- `server/translation-pipeline.ts` 제거
- `lib/gemini-live.ts` 추가

### 10. 개발 로드맵
- Phase 4 재작성: `Google STT + Translation + TTS` → `Gemini Live API` (3~5일로 단축)
- 전체 개발 기간 업데이트: 4~6주 → 2~3주

### 11. 환경 설정
- Google Cloud Console 설정: Speech/Translation/TTS API 활성화 항목 삭제, Gemini API 키 발급 항목 추가
- 환경 변수 목록: `GOOGLE_CLOUD_*` 삭제, `GEMINI_API_KEY` 추가

### 12. 비용 분석
- Google STT/Translation/TTS 비용 행 삭제
- Gemini Live API 비용 추가 (요금표 확인 후 업데이트)

### 14. 성공 지표
- `전체 응답 지연시간: 2초 이내` → `1초 이내`

### 15. 리스크
- `STT 의료 용어 인식 부정확` 리스크 → Gemini system prompt 정확도 리스크로 교체
- `iOS Safari AudioWorklet 미지원` → 오디오 포맷 호환성 리스크로 교체
- `Google API 할당량 초과` → `Gemini API 할당량` 으로 수정

---

## 참고 자료

- [Gemini Live API overview — Google AI for Developers](https://ai.google.dev/gemini-api/docs/live-api)
- [Live API capabilities guide](https://ai.google.dev/gemini-api/docs/live-guide)
- [Get started with Live API SDK](https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk)
- [@google/genai npm package](https://www.npmjs.com/package/@google/genai)
- [Gemini 2.5 Flash Live API — Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-live-api)
- [Gemini Live API — Next.js 통합 예시 (Medium)](https://felipelujan.medium.com/gemini-live-api-proactive-in-next-js-and-react-native-expo-26d070dafff9)
