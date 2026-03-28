# MedTranslate — 구현 현황 (v3)

> 최종 업데이트: 2026-03-28
> 현재 버전: v3.0 (Gemini Live API + Supabase + Vercel)

---

## 완료된 구현

### 인프라 / 백엔드
- [x] **Supabase 마이그레이션** — Firebase/Firestore 완전 제거, Supabase Auth + PostgreSQL 도입
- [x] **Vercel 배포** — Docker/Cloud Run 제거, vercel.json (icn1 서울 리전) 설정 완료
- [x] **supabase/schema.sql** — hospitals, sessions 테이블 + RLS 정책
- [x] **supabase/migrations/20260316_add_languages.sql** — en, id 언어 추가
- [x] **supabase/migrations/20260324_add_all_languages.sql** — 11개 언어 전체 (es, mn, yue, zh, ja, fr, de) 추가
- [x] **supabase/migrations/20260325_add_new_languages.sql** — patient_lang CHECK 제약 최종 갱신
- [x] **supabase/migrations/20260326_zombie_cleanup.sql** — cleanup_zombie_sessions() DB 함수 (1시간 이상 active 세션 자동 종료, pg_cron 연동 가능)
- [x] **lib/supabase.ts** — 브라우저 싱글톤 클라이언트 (getSupabaseBrowserClient) + 서버 admin 클라이언트 (getSupabaseAdmin), SSR/빌드 타임 안전
- [x] **lib/fetch-with-retry.ts** — fetch 재시도 유틸 (3회, 10초 타임아웃, 지수 백오프, 5xx만 재시도)
- [x] **lib/env-check.ts** — validateEnv() — API 라우트 진입 시 필수 환경 변수 검증

### API Routes
- [x] **POST /api/gemini-token** — Gemini ephemeral token 발급 (5분 만료), 실패 시 API key 직접 fallback, buildSystemPrompt() 포함, expiresAt(epoch ms) 반환
- [x] **POST /api/session** — 세션 생성 (patientLang 유효성 검증, auth 토큰 없으면 첫 번째 병원 fallback)
- [x] **GET /api/session?id=xxx** — 세션 조회 (세션 페이지 진입 시 유효성 검증용)
- [x] **PATCH/PUT /api/session** — 세션 상태 업데이트, status='ended' 시 duration_sec 자동 계산
- [x] **POST /api/session/end** — sendBeacon 전용 종료 엔드포인트 (탭 닫기/앱 전환 시 호출)
- [x] **GET /api/session/list** — 병원별 세션 목록 (페이지네이션, 2시간 stale 세션 자동 ended 처리, Cache-Control: no-store)
- [x] **POST /api/translate** — 서버 사이드 Gemini Live 번역 (JSON body, base64 audio, PTT 모드용 보조 엔드포인트)
- [x] **POST /api/auth** — 인증 유틸

### Gemini Live 통합
- [x] **lib/gemini-client.ts** — GeminiLiveSession 클래스 (@google/genai SDK, 클라이언트 사이드 WebSocket)
  - sendAudio(): PCM 16kHz base64 → Gemini Live 실시간 전송 (sendRealtimeInput)
  - onOriginalText / onTranslatedText / onAudio / onError / onStateChange / onInterrupt 콜백
  - 자동 재연결: 지수 백오프 (1s → 2s → 4s → 8s → 16s, 최대 5회, 30s 상한)
  - 스마트 인터럽트: isOutputPlaying 중 3자 이상 inputTranscription 확인 시 onInterrupt 발화
  - Anti-hallucination: temperature=0.2, topP=0.3, topK=5
  - thinkingConfig: { thinkingBudget: 0 } — thinking 비활성화로 지연시간 최소화
  - manuallyDisconnected 플래그: 의도적 종료와 비정상 종료 구분
- [x] **lib/gemini-live.ts** — translateWithGeminiLive() (서버 사이드 단발성 번역)
- [x] **public/audio-processor.js** — AudioWorklet 프로세서 (PCM Int16 16kHz 캡처)

### Glossary 시스템
- [x] **lib/glossary.ts** — loadGlossary(), buildSystemPrompt(), findGlossaryTermsInText()
  - GlossaryEntry: { ko, th?, vi?, en?, id?, es?, mn?, yue?, zh?, ja?, fr?, de?, category }
  - 11개 언어 lang pair 지원 (ko-th ~ ko-de)
  - Gemini system_instruction에 용어집 자동 주입
  - TRANSLATION MACHINE 역할 고정 프롬프트: anti-hallucination, 화자 역할 컨텍스트, STT 보정, 중복 발화 처리
- [x] **glossary/ko-th.json** 이하 11개 파일 — 각 95개 용어 (피부과/미용 시술 위주)

### 프론트엔드
- [x] **app/page.tsx** — 로그인 페이지 (Supabase signInWithPassword, 자동 리디렉션)
- [x] **app/dashboard/page.tsx** — 대시보드
  - 11개 언어 선택 UI (국기 이모지 + 자국어 표기)
  - POST /api/session → /session/[id]?lang=xx 이동
  - Supabase auth session으로 Bearer 토큰 전달
  - GET /api/session/list 실제 데이터 연동 — 이번달 통계 카드 (건수, 총 시간, 언어별 건수)
  - 최근 세션 목록 테이블 (실제 Supabase 데이터)
  - 동적 병원명 — Supabase hospitals 테이블에서 로그인 사용자 병원명 표시
  - 10초 AbortController 타임아웃, fetchTick 기반 재시도 UI
- [x] **app/session/[id]/page.tsx** — 통역 세션 페이지 (Full-Duplex)
  - 세션 ID DB 유효성 검증 (GET /api/session) — 무효 세션 진입 차단
  - Gemini Live WebSocket 상시 연결 + 자동 재연결
  - AudioWorklet (audio-processor.js) → PCM 16kHz 상시 캡처
  - AudioStreamer — PCM 24kHz 실시간 재생 (Google 공식 reference 구현 기반)
  - 상하 분할 프롬프터 UI (환자 영역 / 직원 영역)
  - 언어 감지 (한글 정규식 /[\uac00-\ud7af]/)
  - 동일 언어 에코 필터: ko→ko, foreign→foreign 출력 억제
  - 스마트 인터럽트: 3자 이상 새 발화 감지 시 TTS 재생 중단
  - 텍스트 누적: Gemini 응답 fragment를 같은 화자 방향으로 append
  - 토큰 proactive 갱신: expiresAt 기준 1분 전 자동 재발급 (30초 주기 체크)
  - 오프라인 감지: window online/offline 이벤트 → 복구 시 Gemini 자동 재연결
  - Zombie 정리: beforeunload + visibilitychange 이벤트 → sendBeacon("/api/session/end")
  - 세션 타이머 (MM:SS)
  - 11개 언어 전체 langLabel 지원 (langNames 맵)
  - 종료 버튼 → PUT /api/session {status:'ended'} → /dashboard
- [x] **app/error.tsx** — 전역 React 에러 바운더리 (Next.js App Router)
- [x] **app/session/[id]/error.tsx** — 세션 전용 에러 바운더리
- [x] **components/PrompterDisplay.tsx** — 프롬프터 컴포넌트
  - 반응형 폰트 크기 (텍스트 길이 기반)
  - GlossaryHighlight 통합
  - 화자 라벨 (직원 발화 / 환자 발화)
  - 빈 상태 플레이스홀더 ("한국어로 말하세요" / "{언어}로 말하세요")
  - 11개 언어 langNames 맵 완비
- [x] **components/GlossaryHighlight.tsx** — Glossary 용어 하이라이팅
- [x] **components/OfflineOverlay.tsx** — 네트워크 오프라인 감지 오버레이 (window online/offline)
- [x] **types/index.ts** — 공유 타입 정의
  - PatientLang: 11개 언어 코드 유니언
  - PTTState: 'idle' | 'recording' | 'processing' | 'playing' (정의만, 현재 Full-Duplex에서 미사용)

---

## 알려진 문제 / 미완성 항목

### 구현 주의사항
- [ ] **types/index.ts GlossaryEntry 타입 불일치** — types/index.ts의 GlossaryEntry는 th, vi만 포함 (id, extra 필드 없음). lib/glossary.ts의 GlossaryEntry (11개 언어)와 중복 정의됨. types/index.ts 쪽 정리 또는 제거 필요
- [ ] **TranslateRequest sourceLang/targetLang** — types/index.ts의 TranslateRequest는 'ko'|'th'|'vi' 3개 언어만 타입에 포함. PTT 모드용이므로 현재 미사용이지만 정리 필요

### v1 잔존 코드 (향후 제거 가능)
| 파일 | 이유 |
|------|------|
| app/join/[id]/page.tsx | QR 기반 환자 입장 페이지 — v3 미사용 |
| components/HalfDuplexPTT.tsx | 구 PTT 버튼 컴포넌트 — Full-Duplex로 교체됨 |
| components/AudioRecorder.tsx | v1 오디오 레코더 — AudioWorklet으로 대체됨 |
| components/AudioPlayer.tsx | v1 오디오 플레이어 — AudioStreamer로 대체됨 |
| components/TranscriptDisplay.tsx | 말풍선 UI — PrompterDisplay로 대체됨 |
| components/ConnectionStatus.tsx | v1 연결 상태 — 세션 페이지 인라인 처리 |
| components/LanguageSelector.tsx | v1 언어 선택 — dashboard 인라인으로 대체됨 |
| store/transcriptStore.ts | 말풍선 목록 — 현재 미사용 |

---

## 다음 작업 우선순위

1. **types/index.ts 정리** — GlossaryEntry 타입을 lib/glossary.ts 버전으로 통합, TranslateRequest 언어 범위 확장 또는 deprecated 처리
2. **v1 잔존 코드 제거** — app/join/, components/HalfDuplexPTT.tsx 등 정리
