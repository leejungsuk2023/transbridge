# MedTranslate — 구현 현황 (v3)

> 최종 업데이트: 2026-03-24
> 현재 버전: v3.0 (Gemini Live API + Supabase + Vercel)

---

## 완료된 구현

### 인프라 / 백엔드
- [x] **Supabase 마이그레이션** — Firebase/Firestore 완전 제거, Supabase Auth + PostgreSQL 도입
- [x] **Vercel 배포** — Docker/Cloud Run 제거, vercel.json (icn1 서울 리전) 설정 완료
- [x] **supabase/schema.sql** — hospitals, sessions 테이블 + RLS 정책
- [x] **supabase/migrations/20260316_add_languages.sql** — en, id 언어 추가
- [x] **supabase/migrations/20260324_add_all_languages.sql** — 11개 언어 전체 (es, mn, yue, zh, ja, fr, de) 추가
- [x] **lib/supabase.ts** — 브라우저/서버 클라이언트 분리 (getSupabaseBrowserClient / getSupabaseAdmin)

### API Routes
- [x] **POST /api/gemini-token** — Gemini ephemeral token 발급 (5분 만료), 실패 시 API key 직접 fallback, buildSystemPrompt() 포함
- [x] **POST/GET/PATCH/PUT /api/session** — Supabase 기반 세션 CRUD, duration_sec 자동 계산, PUT은 PATCH 대체용
- [x] **GET /api/session/list** — 병원별 세션 목록 조회
- [x] **POST /api/translate** — 서버 사이드 Gemini Live 번역 (JSON body, base64 audio, PTT 모드용 보조 엔드포인트)
- [x] **POST /api/auth** — 인증 유틸

### Gemini Live 통합
- [x] **lib/gemini-client.ts** — GeminiLiveSession 클래스 (@google/genai SDK, 클라이언트 사이드 WebSocket)
  - sendAudio(): PCM 16kHz base64 → Gemini Live 실시간 전송
  - onOriginalText / onTranslatedText / onAudio / onError / onStateChange 콜백
  - thinkingConfig: { thinkingBudget: 0 } — thinking 비활성화로 지연시간 최소화
- [x] **lib/gemini-live.ts** — translateWithGeminiLive() (서버 사이드 단발성 번역)
- [x] **public/audio-processor.js** — AudioWorklet 프로세서 (PCM Int16 16kHz 캡처)

### Glossary 시스템
- [x] **lib/glossary.ts** — loadGlossary(), buildSystemPrompt(), findGlossaryTermsInText()
  - GlossaryEntry: { ko, th?, vi?, en?, id?, es?, mn?, yue?, zh?, ja?, fr?, de?, category }
  - 11개 언어 lang pair 지원 (ko-th ~ ko-de)
  - Gemini system_instruction에 용어집 자동 주입
- [x] **glossary/ko-th.json** — 태국어 용어집 (피부과/미용 시술 27개 이상)
- [x] **glossary/ko-vi.json** — 베트남어 용어집
- [x] **glossary/ko-en.json** — 영어 용어집
- [x] **glossary/ko-id.json** — 인도네시아어 용어집
- [x] **glossary/ko-es.json** — 스페인어 용어집
- [x] **glossary/ko-mn.json** — 몽골어 용어집
- [x] **glossary/ko-yue.json** — 광동어 용어집
- [x] **glossary/ko-zh.json** — 북경어 용어집
- [x] **glossary/ko-ja.json** — 일본어 용어집
- [x] **glossary/ko-fr.json** — 프랑스어 용어집
- [x] **glossary/ko-de.json** — 독일어 용어집

### 프론트엔드
- [x] **app/page.tsx** — 로그인 페이지 (Supabase signInWithPassword, 자동 리디렉션)
- [x] **app/dashboard/page.tsx** — 대시보드
  - 11개 언어 선택 UI (국기 이모지 + 자국어 표기)
  - POST /api/session → /session/[id]?lang=xx 이동
  - Supabase auth session으로 Bearer 토큰 전달
  - 통계 카드 (mock 데이터), 최근 세션 목록 (mock 데이터)
- [x] **app/session/[id]/page.tsx** — 통역 세션 페이지 (Full-Duplex)
  - Gemini Live WebSocket 상시 연결
  - AudioWorklet (audio-processor.js) → PCM 16kHz 상시 캡처
  - AudioStreamer — PCM 24kHz 실시간 재생 (Google 공식 reference 구현 기반)
  - 상하 분할 프롬프터 UI (환자 영역 / 직원 영역)
  - 언어 감지 (한글 정규식 /[\uac00-\ud7af]/)
  - 세션 타이머 (MM:SS)
  - 종료 버튼 → PUT /api/session {status:'ended'} → /dashboard
- [x] **components/PrompterDisplay.tsx** — 프롬프터 컴포넌트
  - 반응형 폰트 크기 (텍스트 길이 기반)
  - GlossaryHighlight 통합
  - 화자 라벨 (직원 발화 / 환자 발화)
  - 빈 상태 플레이스홀더 ("한국어로 말하세요" / "{언어}로 말하세요")
- [x] **components/GlossaryHighlight.tsx** — Glossary 용어 하이라이팅
- [x] **types/index.ts** — 공유 타입 정의
  - PatientLang: 11개 언어 코드 유니언
  - PTTState: 'idle' | 'recording' | 'processing' | 'playing' (정의만, 현재 Full-Duplex에서 미사용)

---

## 알려진 문제 / 미완성 항목

### 기능 미완성
- [ ] **대시보드 통계 카드** — mock 데이터 (32건 등). Supabase sessions 테이블 실제 데이터 연동 필요
- [ ] **최근 세션 목록** — mock 데이터. GET /api/session/list로 실제 데이터 연동 필요
- [ ] **세션 페이지 langLabel 하드코딩** — `patientLang === "th" ? "태국어" : "베트남어"` (line 305). 11개 언어 전체 대응 필요
- [ ] **PrompterDisplay langNames** — mn, yue, zh, ja, fr, de 6개 언어가 langNames 맵에 누락. 해당 언어 선택 시 lang 코드 그대로 표시됨

### 구현 주의사항
- [ ] **에러 배너 과다 출력** — onError 콜백이 오디오 전송 중 상태 메시지에도 호출됨 (디버그용 코드 정리 필요)
- [ ] **audioChunkCountRef 디버그 로그** — 세션 페이지에 20청크마다 setError() 호출하는 디버그 코드 잔존 (제거 필요)
- [ ] **GlossaryEntry 타입 불일치** — types/index.ts의 GlossaryEntry는 th, vi만 포함. lib/glossary.ts의 GlossaryEntry (11개 언어)와 중복 정의됨. types/index.ts 쪽 정리 필요

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

1. **세션 페이지 langLabel 수정** — 11개 언어 전체 매핑 테이블 추가 (5분 작업)
2. **PrompterDisplay langNames 수정** — 누락된 6개 언어 추가 (5분 작업)
3. **디버그 코드 제거** — audioChunkCountRef setError() 호출 제거 (5분 작업)
4. **대시보드 실제 데이터 연동** — Supabase sessions 조회로 통계/목록 교체
5. **types/index.ts GlossaryEntry 정리** — lib/glossary.ts 타입과 통합
