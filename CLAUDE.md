# MedTranslate

1-Device 대면형 실시간 의료 통역 서비스 (한국어 ↔ 11개 언어)

## v3 아키텍처 (Gemini Live API + Supabase)
- 단일 안드로이드 디바이스 + 오픈핏 이어폰
- Full-Duplex 상시 마이크 — PTT 버튼 없음, 항상 켜진 마이크로 자동 감지
- 프롬프터 UI (상하 분할: 환자 영역 / 직원 영역, Glossary 하이라이팅)
- Gemini Live API 단일 통합 (STT + 번역 + TTS를 1개 WebSocket 연결로 처리)
- @google/genai SDK — 클라이언트가 직접 Gemini Live WebSocket에 연결
- /api/gemini-token — 서버에서 ephemeral token 또는 API key 발급
- Supabase (Auth + PostgreSQL DB) — Firebase 완전 대체

## 지원 언어 (11개)
태국어(th), 베트남어(vi), 영어(en), 인도네시아어(id), 스페인어(es),
몽골어(mn), 광동어(yue), 북경어(zh), 일본어(ja), 프랑스어(fr), 독일어(de)

## 기술 스택
- Frontend: Next.js 14 (App Router) + Tailwind CSS + Zustand
- Backend: Next.js API Routes (HTTPS)
- DB: Supabase PostgreSQL
- Auth: Supabase Auth (이메일/비밀번호)
- 번역: @google/genai SDK — Gemini Live API (gemini-2.5-flash-native-audio-preview-12-2025)
  - STT + 번역 + TTS를 단일 WebSocket 세션으로 처리
  - 클라이언트 사이드: GeminiLiveSession (lib/gemini-client.ts)
  - 서버 사이드: translateWithGeminiLive (lib/gemini-live.ts, PTT 모드용 보조)
- Audio: Web Audio API + AudioWorklet (PCM 16kHz) + AudioStreamer (PCM 24kHz 재생)

## 핵심 흐름 (v3 Full-Duplex)
1. 대시보드에서 환자 언어 선택 → POST /api/session → /session/[id]?lang=xx 이동
2. 세션 페이지 로드 시 GET /api/session?id=xxx 로 세션 유효성 검증
3. POST /api/gemini-token (sourceLang=ko, targetLang={patientLang}) → ephemeral token + expiresAt
4. GeminiLiveSession.connect() — Gemini Live WebSocket 연결 수립
5. AudioWorklet (audio-processor.js) 로드 → 마이크 상시 캡처 (PCM 16kHz)
6. 오디오 청크 → base64 → session.sendAudio() → Gemini Live 실시간 전송
7. Gemini 응답: inputTranscription(원문) + outputTranscription(번역) + audio/pcm(TTS)
8. 언어 감지(한글 여부): 한국어 → 직원 프롬프터, 외국어 → 환자 프롬프터
9. AudioStreamer.addPCM16() → Web Audio API로 즉시 재생
10. 세션 종료: "종료" 버튼 → PUT /api/session {id, status:'ended'} → /dashboard
    탭 닫기/앱 전환: navigator.sendBeacon("/api/session/end") 자동 호출

## 폴더 구조
- app/ : Next.js 페이지
  - app/page.tsx : 로그인 (Supabase Auth signInWithPassword)
  - app/dashboard/page.tsx : 대시보드 (11개 언어 선택, 세션 생성, Supabase 실시간 통계)
  - app/session/[id]/page.tsx : 통역 세션 (Full-Duplex, AudioWorklet, 프롬프터)
  - app/error.tsx : 전역 React 에러 바운더리
  - app/session/[id]/error.tsx : 세션 전용 에러 바운더리
  - app/join/[id]/ : v1 잔존 코드 (미사용)
- app/api/ : API Routes
  - app/api/auth/route.ts : 인증 유틸
  - app/api/session/route.ts : 세션 CRUD (POST/GET/PATCH/PUT)
  - app/api/session/end/route.ts : sendBeacon 전용 세션 종료 엔드포인트
  - app/api/session/list/route.ts : 세션 목록 조회 (zombie 자동 정리 포함)
  - app/api/gemini-token/route.ts : Gemini ephemeral token 발급 (expiresAt 포함)
  - app/api/translate/route.ts : PTT 모드용 번역 (JSON body, base64 audio)
- components/ : UI 컴포넌트
  - PrompterDisplay.tsx : 프롬프터 (상하 분할, 화자 라벨, 반응형 폰트, 자동 스크롤)
  - GlossaryHighlight.tsx : Glossary 용어 하이라이팅
  - OfflineOverlay.tsx : 네트워크 오프라인 감지 오버레이
  - HalfDuplexPTT.tsx : 구 PTT 컴포넌트 (미사용 — 향후 제거 가능)
  - AudioRecorder.tsx, AudioPlayer.tsx, TranscriptDisplay.tsx : v1 잔존 (미사용)
  - ConnectionStatus.tsx, LanguageSelector.tsx : v1 잔존 (미사용)
- lib/ : 라이브러리
  - lib/gemini-client.ts : GeminiLiveSession 클래스 (클라이언트 사이드 WebSocket, 자동 재연결)
  - lib/gemini-live.ts : translateWithGeminiLive() (서버 사이드, PTT 모드용)
  - lib/supabase.ts : Supabase 클라이언트 (브라우저 싱글톤 + 서버 admin)
  - lib/glossary.ts : Glossary 로드, buildSystemPrompt(), findGlossaryTermsInText()
  - lib/fetch-with-retry.ts : fetch 재시도 유틸 (3회, 10초 타임아웃, 지수 백오프)
  - lib/env-check.ts : 환경 변수 유효성 검사 (validateEnv())
- glossary/ : 의료 용어 JSON (11개 언어, 각 95개 항목)
  - ko-th.json, ko-vi.json, ko-en.json, ko-id.json, ko-es.json, ko-mn.json
  - ko-yue.json, ko-zh.json, ko-ja.json, ko-fr.json, ko-de.json
- types/index.ts : TypeScript 타입 (Session, TranslateRequest/Response, PatientLang 등)
- store/ : Zustand 상태 관리
  - store/sessionStore.ts : 세션 상태
  - store/transcriptStore.ts : 트랜스크립트 상태 (현재 미사용)
- supabase/ : DB 스키마 및 마이그레이션
  - supabase/schema.sql : 초기 스키마 (hospitals, sessions 테이블 + RLS)
  - supabase/migrations/20260316_add_languages.sql : en, id 언어 추가
  - supabase/migrations/20260324_add_all_languages.sql : 11개 언어 전체 추가
  - supabase/migrations/20260325_add_new_languages.sql : patient_lang CHECK 제약 최종 갱신
  - supabase/migrations/20260326_zombie_cleanup.sql : cleanup_zombie_sessions() 함수 (pg_cron 연동 가능)
- public/audio-processor.js : AudioWorklet 프로세서 (PCM 16kHz 캡처)

## 환경 변수
NEXT_PUBLIC_SUPABASE_URL         # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY        # Supabase service role key (서버 전용)
GEMINI_API_KEY                   # Google AI Studio API key
NEXT_PUBLIC_APP_URL              # 앱 URL (예: https://medtranslate.kr)

## 실행
npm run dev   (Next.js 개발 서버, port 3000)
npm run build (프로덕션 빌드)
npm run start (프로덕션 서버)

## 배포
Vercel (서울 리전 icn1)
- vercel.json: framework=nextjs, regions=[icn1]
- Vercel 대시보드에서 환경 변수 등록
- Docker/Cloud Run 파일 삭제됨 (Dockerfile, docker-compose.yml, cloudbuild.yaml, .dockerignore)

## Supabase 스키마 주요 사항
- hospitals 테이블: id(uuid), auth_user_id, name, email, plan, created_at
- sessions 테이블: id(uuid), hospital_id, patient_lang(11개 언어 CHECK), status, started_at, ended_at, duration_sec
- RLS 활성화 — 서버 사이드 API는 service_role key로 RLS 우회
- /api/session은 인증 토큰 없어도 첫 번째 병원으로 fallback (단일 병원 설정)
- cleanup_zombie_sessions(): 1시간 이상 active 상태인 세션 자동 종료 (DB 함수)
- /api/session/list: 2시간 이상 stale 세션을 조회 시점에 자동 ended 처리

## Glossary 시스템
- 피부과/미용 시술 용어 위주 (보톡스, 필러, 레이저 등 95개 항목 × 11개 언어)
- buildSystemPrompt(): Gemini Live system_instruction에 용어집 주입 + TRANSLATION MACHINE 역할 고정
- findGlossaryTermsInText(): 번역문에서 매칭 용어 추출 → 프론트 하이라이팅
- GlossaryEntry 타입: { ko, th?, vi?, en?, id?, es?, mn?, yue?, zh?, ja?, fr?, de?, category }

## 주요 기술 패턴
- AudioWorklet: public/audio-processor.js, PCM Int16 → base64 → Gemini Live
- AudioStreamer: PCM 24kHz 실시간 스케줄링 재생 (Google 공식 reference 구현 기반)
- 언어 감지: /[\uac00-\ud7af]/.test(text) — 한글이면 직원, 아니면 환자 프롬프터
- 동일 언어 에코 필터: ko→ko 또는 foreign→foreign 출력 억제
- 스마트 인터럽트: 3자 이상 새 발화 감지 시 현재 TTS 재생 중단 (onInterrupt 콜백)
- WebSocket 자동 재연결: 지수 백오프 (1s → 2s → 4s → 8s → 16s, 최대 5회)
- 토큰 proactive 갱신: expiresAt 기준 1분 전 자동 재발급 (30초 주기 체크)
- Zombie 세션 정리: sendBeacon(beforeunload/visibilitychange) + list API 2시간 stale 정리
- 에러 바운더리: app/error.tsx (전역) + app/session/[id]/error.tsx (세션 전용)
- 오프라인 오버레이: OfflineOverlay.tsx — window online/offline 이벤트 감지
- fetchWithRetry: lib/fetch-with-retry.ts — 3회 재시도, 10초 타임아웃, 5xx만 재시도
- 환경 변수 검증: lib/env-check.ts — validateEnv() API 라우트 진입 시 호출
- 세션 페이지: useEffect 1개에서 init/cleanup 처리 (cancelled flag 패턴)
- Gemini ephemeral token 만료 5분, 실패 시 API key 직접 fallback
- Anti-hallucination: temperature=0.2, topP=0.3, topK=5, thinkingBudget=0
- STT 보정: 화자 역할 컨텍스트(직원/환자) 기반 불명확 음성 최적 해석
- 중복 발화 처리: 한국어·외국어 동시 입력 시 순차 번역 지시
