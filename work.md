# MedTranslate v1→v2 마이그레이션 구현 계획

> 작성일: 2026-03-03
> 참조: PRD.md (v1.0)

---

## 개요

v1(QR 기반 2-Device WebSocket 모델) → v2(1-Device 대면형 STS) 전환.
단일 Android 기기에서 직원·환자가 PTT 버튼을 번갈아 눌러 실시간 음성 통역을 수행한다.

---

## 변경 요약

| 항목 | v1 (현재) | v2 (목표) |
|------|-----------|-----------|
| 디바이스 수 | 2대 (직원 + 환자) | 1대 (접수대 고정) |
| 오디오 입력 | 각 디바이스 마이크 | 단일 마이크, PTT 2개로 화자 전환 |
| 통신 방식 | socket.io WebSocket | HTTPS POST /api/translate |
| UI 패러다임 | 말풍선 대화 (chat bubble) | 프롬프터 (1문장 대형 표시) |
| 환자 입장 | QR 스캔 → 별도 브라우저 | 동일 화면 상단 절반 |
| Glossary | Translation API 연동 (계획) | 서버 측 적용 + 화면 하이라이팅 |
| 세션 동기화 | Firestore 실시간 리스너 + socket.io room | 단순 Firestore CRUD |
| 오디오 출력 | 각 디바이스 스피커 | 이어폰 (Bluetooth) + 스피커 동시 |

---

## 재사용 가능 코드 (변경 없이 사용)

| 파일 | 이유 |
|------|------|
| `types/index.ts` | `Session`, `TranslationMessage`, `GlossaryEntry` 타입 그대로 사용 |
| `server/translation-pipeline.ts` | `processTranslation()`, `PipelineInput/Output` 인터페이스 완성됨 |
| `lib/google-stt.ts` | STT 클라이언트 완성 — pipeline이 의존 |
| `lib/google-translate.ts` | Translation 클라이언트 완성 |
| `lib/google-tts.ts` | TTS 클라이언트 완성 |
| `lib/glossary.ts` | `getGlossaryId()` 유틸 완성 |
| `lib/firebase.ts` | Lazy Proxy 초기화 — 빌드 안전 |
| `glossary/ko-th.json` | 의료 용어 사전 데이터 |
| `glossary/ko-vi.json` | 의료 용어 사전 데이터 |
| `app/api/session/route.ts` | 세션 생성/조회/종료 API — 소폭 수정만 필요 |
| `app/api/auth/route.ts` | 인증 API — 변경 없음 |
| `app/page.tsx` | 로그인 페이지 — 변경 없음 |
| `store/sessionStore.ts` | 세션 상태 — 재사용 가능 |
| `components/ConnectionStatus.tsx` | 연결 상태 표시 — 재사용 가능 |
| `components/LanguageSelector.tsx` | 언어 선택 UI — 재사용 가능 |
| `next.config.mjs` | standalone output 설정 유지 |
| `Dockerfile`, `docker-compose.yml`, `cloudbuild.yaml` | WebSocket CMD만 제거하면 됨 |

---

## 수정 필요 코드

### `app/dashboard/page.tsx`
- **현재**: “새 통역 시작” → QR 생성 → 환자 스캔 대기 UI
- **변경**: “새 통역 시작” → 언어 선택(th/vi) → `/session/[id]?lang=th` 바로 이동
- QR 관련 UI 블록 제거 (`QRGenerator` import 제거)
- 통계 카드는 실제 Firestore 데이터로 연결 (현재 mock)
- 세션 목록 Firestore 실시간 리스너 연결

### `app/api/translate/route.ts`
- **현재**: placeholder (`{ message: 'to be implemented' }`)
- **변경**: `processTranslation()` 호출로 실제 STT→번역→TTS 파이프라인 연결
- 요청: `multipart/form-data` (audio blob + sourceLang + targetLang + sessionId + speaker)
- 응답: `{ originalText, translatedText, audioData: base64, processingTimeMs }`
- Firebase Auth ID 토큰 검증 미들웨어 추가

### `app/session/[id]/page.tsx`
- **현재**: 말풍선 대화 UI, mock 메시지, 단일 PTT 버튼, 단일 화자(role 파라미터)
- **변경**: 전면 재작성 (아래 “신규 구현 필요” 섹션 참고)

### `store/transcriptStore.ts`
- **현재**: 말풍선 목록 관리
- **변경**: `lastMessage` (프롬프터용 최신 메시지 1개) + `history` (기록용) 구조로 확장

### `Dockerfile` / `docker-compose.yml`
- **현재**: `CMD sh -c “node server/websocket.js & node server.js”` 형태로 WebSocket 병렬 실행
- **변경**: WebSocket 서버 실행 제거 → `CMD node server.js`만 유지

---

## 신규 구현 필요

### 1. `app/session/[id]/page.tsx` — 전면 재작성

v2 세션 페이지는 아래 레이아웃으로 전면 재작성:

```
+------------------------------------------+
|  상단 (환자 영역 — 화면 50%)              |
|  [환자 언어 라벨]                         |
|  [ 환자 PTT 버튼 (대형, 화면 중앙) ]      |
+------------------------------------------+
|  중앙 프롬프터 영역                       |
|  “번역된 문장이 여기 크게 표시됩니다”     |
|  (Glossary 단어 하이라이팅)               |
+------------------------------------------+
|  하단 (직원 영역 — 화면 50%)              |
|  [한국어 라벨]                            |
|  [ 직원 PTT 버튼 (대형, 화면 중앙) ]      |
|  [세션 종료 버튼]                         |
+------------------------------------------+
```

**상태 머신 (Half-Duplex)**:
- `idle`: 양쪽 PTT 활성, 프롬프터는 이전 문장 표시
- `recording_staff`: 직원 PTT 누름 → 마이크 캡처 중, 환자 PTT 비활성
- `recording_patient`: 환자 PTT 누름 → 마이크 캡처 중, 직원 PTT 비활성
- `translating`: API 요청 중, 양쪽 PTT 비활성, 로딩 인디케이터
- `playing`: TTS 재생 중, 양쪽 PTT 비활성

**구현 포인트**:
- PTT는 `onPointerDown`/`onPointerUp` 이벤트 사용 (touch + mouse 통합)
- `MediaRecorder` API로 오디오 캡처 (`audio/webm;codecs=opus` 또는 `audio/wav`)
- PTT 뗄 때 `Blob` → `FormData` → `POST /api/translate`
- 응답 `audioData`(base64) → `AudioContext.decodeAudioData()` → 재생
- 재생 완료 콜백에서 state를 `idle`로 전환

### 2. `components/PrompterDisplay.tsx` — 신규

프롬프터 UI 컴포넌트:
- props: `{ text: string; glossaryTerms: string[]; speakerLabel: string }`
- Glossary 단어를 `<mark>` 태그로 강조 (금색/굵기)
- 텍스트 크기: `text-4xl` ~ `text-5xl` (가독성 최우선)
- 발화자 라벨 (상단 소형 텍스트): “직원 발화” / “환자 발화”

### 3. `components/PTTButton.tsx` — 신규

PTT 버튼 컴포넌트:
- props: `{ label: string; lang: string; disabled: boolean; onStart: () => void; onStop: () => void; state: 'idle' | 'active' | 'disabled' }`
- 상태별 색상: idle=파란색, active=빨간색+펄스 애니메이션, disabled=회색
- 크기: 최소 120×120px, 원형 버튼
- 버튼 내부: 마이크 아이콘 + 언어명

### 4. `lib/glossary-client.ts` — 신규 (또는 기존 `lib/glossary.ts` 확장)

클라이언트 사이드 Glossary 하이라이팅용:
- `glossary/ko-th.json`, `glossary/ko-vi.json` 로드
- `getGlossaryTerms(lang: 'th' | 'vi'): string[]` — 해당 언어 번역어 목록 반환
- 번역된 문장에서 Glossary 단어를 찾아 배열로 반환하는 유틸

### 5. `app/api/translate/route.ts` — 실제 구현

```typescript
// POST /api/translate
// Content-Type: multipart/form-data
// Fields: audio (Blob), sourceLang, targetLang, sessionId, speaker
// Response: { originalText, translatedText, audioData, processingTimeMs }
```

- `formData.get('audio')` → `Buffer` 변환
- `processTranslation()` 호출 (server/translation-pipeline.ts)
- Firebase Auth ID 토큰 검증 (`Authorization: Bearer <token>`)
- `export const dynamic = 'force-dynamic'` 필수 (빌드 시 Firebase 크래시 방지)

---

## 제거/비활성화 대상

> 아래 파일들은 v2에서 미사용. 즉시 삭제하지 않고 향후 정리 가능.

| 파일 | 이유 |
|------|------|
| `server/websocket.ts` | WebSocket 서버 — v2 미사용 |
| `lib/socket.ts` | socket.io 클라이언트 — v2 미사용 |
| `app/join/[id]/page.tsx` | QR 기반 환자 입장 페이지 — v2 미사용 |
| `components/QRGenerator.tsx` | QR 생성 — v2 미사용 |
| `components/QRScanner.tsx` | QR 스캔 — v2 미사용 |
| `components/TranscriptDisplay.tsx` | 말풍선 UI — 프롬프터로 대체 |
| `components/AudioPlayer.tsx` | 별도 플레이어 — 세션 페이지 내 인라인 AudioContext로 대체 |
| `store/transcriptStore.ts` | 말풍선 목록 — 구조 변경 필요 (수정 후 재사용 가능) |

---

## 구현 순서

### Phase 1 — Backend+Pipeline: `/api/translate` 실제 구현
**완료 기준**: `curl -X POST /api/translate -F audio=@test.wav -F sourceLang=ko ...` 로 STT→번역→TTS 응답 반환

1. `app/api/translate/route.ts` — `multipart/form-data` 파싱 + `processTranslation()` 연결
2. Firebase Auth 토큰 검증 로직 추가
3. 로컬 `.env.local` 환경 변수 설정 확인

### Phase 2 — Frontend: 세션 페이지 재작성
**완료 기준**: 단일 디바이스에서 직원 PTT → 한국어 발화 → 태국어 번역 음성 재생 + 프롬프터 표시

1. `components/PTTButton.tsx` 신규 생성
2. `components/PrompterDisplay.tsx` 신규 생성
3. `app/session/[id]/page.tsx` 전면 재작성 (Half-Duplex 상태 머신 + API 연동)
4. `store/transcriptStore.ts` 구조 수정 (`lastMessage` 추가)

### Phase 3 — Dashboard 수정
**완료 기준**: “새 통역 시작” → 언어 선택 → 세션 생성 → 세션 페이지 바로 이동

1. `app/dashboard/page.tsx` — QR 관련 제거, 언어 선택 모달 추가
2. `app/api/session/route.ts` — 세션 생성 시 `patientLang` 파라미터 처리 확인
3. Firestore 실시간 리스너 연결 (통계 카드 + 세션 목록)

### Phase 4 — Integration: Docker 단순화 + 빌드 확인
**완료 기준**: `docker build` 성공, Cloud Run 배포 후 전체 플로우 동작

1. `Dockerfile` — WebSocket 서버 CMD 제거
2. `docker-compose.yml` — WebSocket 포트(3001) 제거
3. `node node_modules/next/dist/bin/next build` 빌드 확인
4. Cloud Run 배포 확인

---

## 각 에이전트별 상세 태스크

### Frontend 에이전트

**담당 파일**:
- `app/session/[id]/page.tsx` (전면 재작성)
- `app/dashboard/page.tsx` (QR 제거, 언어 선택 추가)
- `components/PTTButton.tsx` (신규)
- `components/PrompterDisplay.tsx` (신규)
- `store/transcriptStore.ts` (구조 수정)

**태스크 상세**:

1. **PTTButton 컴포넌트 생성** (`components/PTTButton.tsx`)
   - `onPointerDown`/`onPointerUp` 이벤트 핸들러
   - 상태: `idle`(파란색) / `active`(빨간색, animate-pulse) / `disabled`(회색, opacity-50)
   - 크기 최소 120×120px, 원형, 마이크 아이콘 포함

2. **PrompterDisplay 컴포넌트 생성** (`components/PrompterDisplay.tsx`)
   - props: `text`, `glossaryTerms: string[]`, `speakerLabel`
   - Glossary 단어는 `<mark className=”text-yellow-500 font-bold bg-transparent”>` 스타일
   - 텍스트 크기: `text-4xl font-bold text-center`
   - 빈 text일 때: “번역 대기 중...” 플레이스홀더

3. **세션 페이지 재작성** (`app/session/[id]/page.tsx`)
   - URL: `/session/[id]?lang=th` (role 파라미터 제거, 단일 디바이스이므로 둘 다 표시)
   - 화면 상하 분할 (각 50vh), 중앙 프롬프터 영역
   - Half-Duplex 상태 머신: `'idle' | 'recording_staff' | 'recording_patient' | 'translating' | 'playing'`
   - MediaRecorder로 오디오 캡처 → PTT 뗄 때 `POST /api/translate`
   - 응답 base64 → Web Audio API 재생
   - 재생 완료 → `idle` 상태 전환
   - TTS 재생 중 양쪽 PTT 비활성화

4. **Dashboard 수정** (`app/dashboard/page.tsx`)
   - QR 관련 코드/임포트 제거
   - “새 통역 시작” 클릭 → 언어 선택 모달 (태국어/베트남어)
   - 언어 선택 → `POST /api/session { patientLang }` → 응답 sessionId → `/session/[id]?lang=th` 이동
   - 통계 카드: mock 데이터 → Firestore 실제 데이터 (sessionId, status 기반 집계)

---

### Backend+Pipeline 에이전트

**담당 파일**:
- `app/api/translate/route.ts` (실제 구현)
- `app/api/session/route.ts` (patientLang 파라미터 처리 확인)

**태스크 상세**:

1. **`/api/translate` 실제 구현**
   - `export const dynamic = 'force-dynamic'` 선언 (빌드 시 Firebase 크래시 방지)
   - 요청: `multipart/form-data`
     - `audio`: Blob (webm/opus 또는 wav)
     - `sourceLang`: `'ko' | 'th' | 'vi'`
     - `targetLang`: `'ko' | 'th' | 'vi'`
     - `sessionId`: string
     - `speaker`: `'staff' | 'patient'`
   - 처리 흐름:
     1. `Authorization: Bearer <idToken>` 헤더 검증 (Firebase Admin SDK)
     2. `formData.get('audio')` → `arrayBuffer()` → `Buffer`
     3. `processTranslation({ audioChunk, sourceLang, targetLang, sessionId, speaker })` 호출
     4. 응답: `{ success: true, data: { originalText, translatedText, audioData, processingTimeMs } }`
   - 에러 처리: 401 (인증 실패), 400 (파라미터 누락), 500 (파이프라인 실패)

2. **`/api/session` 확인 및 수정**
   - `POST /api/session`: `patientLang` 파라미터 받아 Firestore에 저장
   - `GET /api/session/[id]`: 세션 정보 조회
   - `PATCH /api/session/[id]`: `{ status: 'ended' }` 세션 종료

---

### Integration 에이전트

**담당 파일**:
- `Dockerfile`
- `docker-compose.yml`
- `cloudbuild.yaml`

**태스크 상세**:

1. **Dockerfile WebSocket 제거**
   - `CMD sh -c “...”` 에서 `node server/websocket.js &` 부분 제거
   - WebSocket 관련 포트(3001) EXPOSE 제거

2. **docker-compose.yml 정리**
   - `ports: - “3001:3001”` 제거
   - WebSocket 환경 변수 (`NEXT_PUBLIC_WEBSOCKET_URL`) 제거

3. **빌드 검증**
   - `node node_modules/next/dist/bin/next build` 실행 (Node v24 이슈 우회)
   - 빌드 성공 확인 후 `docker build` 테스트

4. **Cloud Run 배포 확인**
   - 최소 인스턴스 1개 유지 설정 (`--min-instances=1`)
   - `/api/translate` 엔드포인트 헬스체크 추가 고려

---

## 환경 변수 체크리스트

```bash
# Firebase 클라이언트 SDK (NEXT_PUBLIC_*)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Google Cloud (서버 사이드 — JSON 키 직접 주입 방식)
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=        # “-----BEGIN PRIVATE KEY-----\n...” 형태, 줄바꿈 \n으로 인코딩

# 앱 설정
NEXT_PUBLIC_APP_URL=https://medtranslate.kr
```

> `NEXT_PUBLIC_WEBSOCKET_URL`은 v2에서 제거.
> `GOOGLE_APPLICATION_CREDENTIALS` (파일 경로 방식)는 Cloud Run에서 직접 값 주입 방식으로 대체.

---

## 주요 기술적 고려사항

### 오디오 포맷
- `MediaRecorder` 기본 포맷: `audio/webm;codecs=opus` (Android Chrome)
- Google Cloud STT v2는 WebM/Opus 지원 — `encoding: 'WEBM_OPUS'`, `sampleRateHertz: 48000`
- 또는 AudioWorklet으로 PCM 16kHz 다운샘플링 후 전송 (더 높은 정확도)
- 권장: MediaRecorder 먼저 시도 → 인식률 낮으면 AudioWorklet PCM으로 전환

### Half-Duplex 구현
- TTS 재생 중 PTT 비활성화는 `AudioBufferSourceNode.onended` 콜백으로 처리
- PTT는 `onPointerDown`/`onPointerUp` 사용 (모바일 touch 이벤트와 통합)
- 긴 발화 지원: MediaRecorder `timeslice` 없이 PTT 뗄 때 전체 Blob 전송 (단순화)

### 보안
- 모든 API 요청에 Firebase Auth ID 토큰 포함 (`Authorization: Bearer`)
- 음성 데이터는 서버 메모리에서만 처리 후 즉시 폐기 — Firestore에 저장 금지
- HTTPS 강제 (Cloud Run 기본값)

