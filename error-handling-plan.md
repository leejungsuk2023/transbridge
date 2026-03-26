# MedTranslate 프로덕션 에러 처리 기획서

> 작성일: 2026-03-26

---

## 개요

현재 MedTranslate는 Gemini Live API와 Supabase를 연동한 실시간 의료 통역 서비스다. 코드베이스 분석 결과, 네트워크 불안정/브라우저 탭 이탈/서버 오류 등 실사용 환경에서 필수적인 에러 처리가 전무하다. 본 기획서는 9개 항목으로 나누어 구체적인 수정 방안과 에이전트 분배를 정의한다.

---

## 1. WebSocket 자동 재연결

### 현재 문제

`lib/gemini-client.ts`의 `GeminiLiveSession` 클래스 내 `onclose` 콜백(128~130줄)은 WebSocket이 비정상 종료(e.code !== 1000)되면 단순히 `onStateChange("disconnected")`만 호출하고 재연결을 시도하지 않는다. `onerror` 콜백(118~121줄)도 에러 메시지 전달 후 연결 복구 시도가 없다. 한번 끊기면 의료 현장에서 통역이 완전 중단된다.

### 구현 방안

**지수 백오프 재연결 로직을 `GeminiLiveSession` 클래스에 추가:**

- 내부 상태 변수 추가: `private reconnectAttempts = 0`, `private maxReconnectAttempts = 5`, `private reconnectTimer: ReturnType<typeof setTimeout> | null = null`
- 지연 시간 계산: `Math.min(1000 * 2 ** reconnectAttempts, 30000)` — 1초 → 2초 → 4초 → 8초 → 16초 → 최대 30초
- `onclose` 콜백에서 `e.code !== 1000`이고 재연결이 가능한 상태(`!this.manuallyDisconnected`)이면 `scheduleReconnect()` 호출
- `scheduleReconnect()` 메서드: 현재 세션 닫기 → 타이머 설정 → `connect()` 재호출
- 5회 초과 시 `onStateChange("disconnected")` + `onError("재연결 한도 초과. 페이지를 새로고침 해주세요.")` 호출
- `disconnect()` 호출 시 `manuallyDisconnected = true`로 설정해 의도적 종료와 구분
- 재연결 성공(setupComplete 수신) 시 `reconnectAttempts = 0` 초기화
- `app/session/[id]/page.tsx`의 `onStateChange` 콜백에서 `"reconnecting"` 상태 추가 지원 (ConnectionState 타입 확장)

### 수정 파일

- `lib/gemini-client.ts` — `GeminiLiveSession` 클래스 수정 (재연결 로직, `manuallyDisconnected` 플래그, `scheduleReconnect()` 메서드)
- `app/session/[id]/page.tsx` — `ConnectionState` 타입에 `"reconnecting"` 추가, 상태 표시 UI 업데이트 (`stateLabel`, `stateColor`)

### 에이전트 할당

**Agent 1 (네트워크 레이어)**

### 구현 순서

우선순위 1 (다른 항목의 기반이 됨)

---

## 2. 좀비 세션 자동 정리

### 현재 문제

`app/session/[id]/page.tsx`의 cleanup 함수(312~319줄)는 `useEffect` unmount 시 실행되지만, 브라우저 강제 종료/탭 닫기/네트워크 끊김 시에는 실행되지 않는다. `handleEndSession`(329~343줄)도 사용자가 "종료" 버튼을 누를 때만 `PUT /api/session` 호출한다. 결과적으로 Supabase `sessions` 테이블에 `status='active'` 상태로 무한 남는 좀비 세션이 누적된다. 대시보드의 "이번달 통역" 통계가 오염되고, active 세션 판별이 불가능해진다.

### 구현 방안

**클라이언트 사이드:**

- `app/session/[id]/page.tsx`에 `beforeunload` 이벤트 리스너 추가
  - `navigator.sendBeacon("/api/session/end", JSON.stringify({ id: sessionId }))` 사용 (fetch는 beforeunload에서 신뢰할 수 없음)
  - `/api/session/end` — 새 API Route 필요 (POST, body: `{ id }`, 세션 status를 'ended'로 업데이트)
- `visibilitychange` 이벤트로 탭 백그라운드 감지
  - `document.hidden === true`일 때 타이머 시작 (예: 30초 후 세션 종료 경고 표시)
  - 탭 복귀 시 타이머 취소

**서버 사이드 (Supabase):**

- `supabase/migrations/` 에 마이그레이션 파일 추가: 1시간 이상 `status='active'`인 세션을 `'ended'`로 자동 변환하는 Supabase Edge Function 또는 pg_cron 설정
- SQL: `UPDATE sessions SET status='ended', ended_at=NOW(), duration_sec=EXTRACT(EPOCH FROM (NOW()-started_at))::int WHERE status='active' AND started_at < NOW() - INTERVAL '1 hour'`
- Supabase Edge Function 이름: `cleanup-zombie-sessions`, 트리거: pg_cron (매시간 실행)

### 수정 파일

- `app/session/[id]/page.tsx` — `beforeunload`/`visibilitychange` 이벤트 리스너 추가 (useEffect 내 cleanup에 포함)
- `app/api/session/end/route.ts` (신규) — `sendBeacon` 전용 POST endpoint
- `supabase/migrations/20260326_cleanup_zombie_sessions.sql` (신규) — pg_cron 또는 scheduled function 설정 SQL

### 에이전트 할당

**Agent 3 (서버 + 데이터)**

### 구현 순서

우선순위 2

---

## 3. React 에러 바운더리

### 현재 문제

현재 `app/` 디렉토리에 `error.tsx`가 없다. `app/session/[id]/page.tsx` 내 렌더링 오류(예: `patientPrompter.glossaryTerms`가 undefined인 경우)가 발생하면 전체 페이지가 흰 화면으로 무너진다. 의료 현장에서 화면이 갑자기 흰색이 되면 극도의 혼란을 야기한다. Next.js App Router의 `error.tsx`/`loading.tsx` 메커니즘이 활용되지 않고 있다.

### 구현 방안

**전역 에러 바운더리:**

- `app/error.tsx` 신규 생성
  - `"use client"` 필수 (Next.js App Router 요구사항)
  - `reset()` 함수 props로 받아 "다시 시도" 버튼 구현
  - 에러 메시지는 사용자 친화적으로 표시 (`"예상치 못한 오류가 발생했습니다"`)
  - 개발 환경에서는 `error.message` 노출, 프로덕션에서는 숨김 (`process.env.NODE_ENV === 'development'`)
  - "대시보드로 돌아가기" 링크 포함

**세션 전용 에러 바운더리:**

- `app/session/[id]/error.tsx` 신규 생성
  - 세션 컨텍스트에 맞는 UI ("통역 세션에 오류가 발생했습니다")
  - "세션 재시작" 버튼 (reset() 호출)
  - "대시보드로 이동" 버튼 (router.push("/dashboard"))
  - 세션 ID를 URL params에서 읽어 `/api/session`에 status:'ended' 업데이트 시도

**로딩 상태:**

- `app/session/[id]/loading.tsx` 신규 생성 — 세션 초기화 중 스켈레톤 UI

### 수정 파일

- `app/error.tsx` (신규) — 전역 에러 바운더리
- `app/session/[id]/error.tsx` (신규) — 세션 전용 에러 바운더리
- `app/session/[id]/loading.tsx` (신규) — 세션 로딩 스켈레톤

### 에이전트 할당

**Agent 2 (UI/UX 에러 처리)**

### 구현 순서

우선순위 3

---

## 4. 네트워크 상태 감지

### 현재 문제

`app/session/[id]/page.tsx`는 네트워크 상태를 전혀 감지하지 않는다. Wi-Fi가 끊기면 WebSocket도 끊기지만 사용자는 화면이 멈춘 것인지 오프라인인지 알 수 없다. 재연결 로직(항목 1)이 구현되더라도 오프라인 상태에서는 재연결이 불가능하므로 명시적 오프라인 피드백이 필요하다.

### 구현 방안

**커스텀 훅 `useNetworkStatus` 구현:**

- `lib/hooks/use-network-status.ts` (신규) — `navigator.onLine` + `window.addEventListener('online'/'offline')` 활용
- 반환값: `{ isOnline: boolean, wasOffline: boolean }` — `wasOffline`은 복귀 후 재연결 시도 안내에 활용

**오프라인 오버레이 컴포넌트:**

- `components/OfflineOverlay.tsx` (신규)
  - `isOnline === false` 일 때 화면 전체를 덮는 반투명 오버레이
  - 메시지: "인터넷 연결이 끊겼습니다. 연결을 확인해주세요."
  - 오버레이 표시 중 마이크 입력 차단 (workletNode 연결 해제)
  - 온라인 복귀 감지 시 자동으로 오버레이 해제 + WebSocket 재연결 시도

**세션 페이지 통합:**

- `app/session/[id]/page.tsx`에 `useNetworkStatus()` 훅 추가
- `isOnline === false`이면 `<OfflineOverlay />` 렌더링
- 온라인 복귀 시 (`wasOffline === true`) `geminiSessionRef.current?.reconnect()` 호출 — 항목 1의 재연결 로직과 연동

### 수정 파일

- `lib/hooks/use-network-status.ts` (신규) — 네트워크 상태 훅
- `components/OfflineOverlay.tsx` (신규) — 오프라인 오버레이 컴포넌트
- `app/session/[id]/page.tsx` — `useNetworkStatus` 훅 통합, `OfflineOverlay` 렌더링 추가

### 에이전트 할당

**Agent 2 (UI/UX 에러 처리)** — OfflineOverlay 컴포넌트
**Agent 1 (네트워크 레이어)** — `useNetworkStatus` 훅 + 세션 페이지 통합

### 구현 순서

우선순위 3 (항목 1 WebSocket 재연결 완료 후)

---

## 5. 재시도 로직 (fetch + API)

### 현재 문제

현재 모든 `fetch` 호출에 재시도 로직이 없다:

- `app/session/[id]/page.tsx` 204줄: `/api/gemini-token` fetch — 실패 시 즉시 에러
- `app/dashboard/page.tsx` 78줄: `/api/session/list` fetch — 실패 시 catch에서 `console.error`만 하고 UI는 정상처럼 보임
- `app/dashboard/page.tsx` 141줄: `/api/session` POST fetch — 실패 시 `alert()`으로 대응 (UX 불량)
- `app/session/[id]/page.tsx` 334줄: `/api/session` PUT fetch — 완전히 무시됨 (catch 블록이 비어있음)
- `app/api/gemini-token/route.ts` 26줄: 외부 Google API fetch — 실패 시 fallback은 있으나 타임아웃 없음

### 구현 방안

**공통 fetch 유틸리티 `lib/fetch-with-retry.ts` 신규 생성:**

```
fetchWithRetry(url, options, retryOptions):
  - maxRetries: 3 (기본값)
  - baseDelay: 500ms (기본값)
  - timeout: 10000ms (기본값, AbortController 사용)
  - retryOn: [500, 502, 503, 504] (재시도할 HTTP 상태 코드)
  - 지수 백오프: baseDelay * 2^attempt + jitter (랜덤 0~200ms)
  - 네트워크 에러(TypeError)도 재시도 대상
  - 4xx 에러는 재시도 안함 (클라이언트 오류이므로)
```

**적용 대상:**

1. `app/session/[id]/page.tsx` — `/api/gemini-token` POST 호출을 `fetchWithRetry`로 교체 (maxRetries: 3, timeout: 10초)
2. `app/dashboard/page.tsx` — `/api/session/list` GET 호출을 `fetchWithRetry`로 교체 (maxRetries: 2)
3. `app/dashboard/page.tsx` — `/api/session` POST 호출을 `fetchWithRetry`로 교체 (maxRetries: 2)
4. `app/api/gemini-token/route.ts` — 외부 Google API fetch에 AbortController로 8초 타임아웃 추가

### 수정 파일

- `lib/fetch-with-retry.ts` (신규) — 재시도 fetch 유틸리티
- `app/session/[id]/page.tsx` — gemini-token fetch를 fetchWithRetry로 교체
- `app/dashboard/page.tsx` — session/list, session POST fetch를 fetchWithRetry로 교체
- `app/api/gemini-token/route.ts` — 외부 Google API fetch에 타임아웃 추가

### 에이전트 할당

**Agent 1 (네트워크 레이어)** — `lib/fetch-with-retry.ts` 작성 + 세션 페이지 적용
**Agent 2 (UI/UX 에러 처리)** — 대시보드 fetch 교체

### 구현 순서

우선순위 2 (항목 1과 병렬 진행 가능)

---

## 6. Gemini 토큰 만료 관리

### 현재 문제

`app/api/gemini-token/route.ts` 36줄에서 ephemeral token을 5분 만료로 발급한다. 그러나 `app/session/[id]/page.tsx`는 세션 시작 시 토큰을 한 번만 발급받고(`useEffect` 199줄) 이후 갱신하지 않는다. 5분 이상 지속되는 통역 세션(실제로 흔함)에서 토큰이 만료되면 WebSocket이 인증 에러로 끊기고 재연결도 불가능하다. `app/api/gemini-token/route.ts`는 토큰 발급 시각을 응답에 포함하지 않아 클라이언트가 만료 시각을 알 수 없다.

### 구현 방안

**서버 사이드 (`app/api/gemini-token/route.ts`):**

- 응답에 `expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()` 추가
- `GeminiLiveConfig` 인터페이스에 `expiresAt?: string` 필드 추가 (`lib/gemini-client.ts`)

**클라이언트 사이드 (`app/session/[id]/page.tsx`):**

- `tokenExpiresAtRef = useRef<Date | null>(null)` 추가
- 토큰 발급 후 `tokenExpiresAtRef.current = new Date(tokenData.data.expiresAt)` 저장
- `useEffect`로 1분 간격 타이머 실행: 만료 1분 전(`expiresAt - Date.now() < 60000`) 감지 시 자동 갱신 로직 실행
- 갱신 로직 (`refreshToken` 함수):
  1. `/api/gemini-token` POST 재호출 (fetchWithRetry 사용)
  2. 새 토큰으로 `GeminiLiveSession` 재생성 (기존 세션 disconnect → 새 세션 connect)
  3. AudioWorklet 재연결 (마이크 스트림은 유지, worklet만 재연결)
  4. 갱신 실패 시 화면 상단에 경고 배너 표시: "토큰 갱신 실패. 통역이 곧 중단될 수 있습니다."

**fallback 토큰(apiKey 직접 사용) 시에는 만료 관리 불필요** — `tokenData.data.apiKey`가 있으면 타이머 설정 안함

### 수정 파일

- `app/api/gemini-token/route.ts` — 응답에 `expiresAt` 추가
- `lib/gemini-client.ts` — `GeminiLiveConfig`에 `expiresAt?: string` 추가
- `app/session/[id]/page.tsx` — `tokenExpiresAtRef`, `refreshToken` 함수, 만료 타이머 추가

### 에이전트 할당

**Agent 1 (네트워크 레이어)**

### 구현 순서

우선순위 3 (항목 5 재시도 로직 완료 후, refreshToken 내부에서 fetchWithRetry 사용)

---

## 7. 대시보드 로딩 에러 처리

### 현재 문제

`app/dashboard/page.tsx`의 `fetchData` 함수(68~118줄)에는 다음 문제가 있다:

1. **로딩 타임아웃 없음**: fetch가 무한 대기 가능. `loading: true` 상태에서 UI는 "불러오는 중..."만 표시하고 언제까지나 기다린다.
2. **에러 시 무음 실패**: catch 블록(111~113줄)에서 `console.error`만 하고 `setLoading(false)` 미호출 시 — 실제로는 finally에서 호출하지만 에러 상태를 사용자에게 알리지 않는다. 에러가 나도 UI는 "아직 통역 이력이 없습니다"로 표시되어 실제 에러인지 빈 데이터인지 구분 불가.
3. **부분 실패 미처리**: 인증 세션 조회(`supabase.auth.getSession()`)가 실패해도 아무 에러도 표시하지 않고 그냥 `setLoading(false)`로 끝난다.
4. **alert() 사용**: `handleNewSession`(155줄, 162줄)에서 `alert()`을 사용해 UX가 불량하다.

### 구현 방안

**로딩 상태 개선:**

- `const [loadError, setLoadError] = useState<string | null>(null)` 추가
- `fetchData` 내 `AbortController`로 10초 타임아웃 설정 (AbortSignal.timeout(10000))
- 타임아웃/에러 발생 시 `setLoadError("데이터를 불러올 수 없습니다")` 호출
- UI에 에러 상태 표시: 빈 테이블 대신 에러 메시지 + "다시 시도" 버튼 (`fetchData()` 재호출)

**세션 생성 에러 처리:**

- `starting` 상태에 `startError: string | null` 추가
- `alert()` 제거 → 인라인 에러 메시지 표시 (언어 선택 그리드 아래에 붉은 텍스트)
- 5초 후 자동으로 에러 메시지 사라짐 (`setTimeout`)

**부분 로딩 실패 처리:**

- 통계 로딩 실패 시에도 세션 목록은 별도 표시 (독립적 상태 관리)
- auth 세션 없으면 즉시 로그인 페이지로 리다이렉트

### 수정 파일

- `app/dashboard/page.tsx` — `loadError` 상태 추가, 타임아웃 처리, alert 제거, 에러 UI 추가

### 에이전트 할당

**Agent 2 (UI/UX 에러 처리)**

### 구현 순서

우선순위 2 (독립적으로 진행 가능)

---

## 8. 환경변수 검증

### 현재 문제

`lib/supabase.ts` 17~35줄에서 `process.env.NEXT_PUBLIC_SUPABASE_URL!`처럼 non-null assertion(`!`)으로 환경변수를 사용한다. Vercel 환경변수가 누락되면 런타임에 `createClient(undefined, undefined)` 호출로 조용히 실패하고, 이후 모든 Supabase 쿼리가 이상한 에러를 반환한다. `app/api/gemini-token/route.ts` 20~22줄도 마찬가지로 `GEMINI_API_KEY`가 없으면 500 에러를 반환하지만 로그 메시지가 불명확하다. Vercel 배포 시 환경변수 누락으로 인한 디버깅이 매우 어렵다.

### 구현 방안

**`lib/env-check.ts` 신규 생성:**

```
필수 환경변수 목록 정의:
서버 전용: GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY
클라이언트+서버: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

validateEnv(scope: 'server' | 'client'):
  - 누락된 변수 목록 수집
  - 누락 시 명확한 에러 메시지: "필수 환경변수가 누락되었습니다: GEMINI_API_KEY, ..."
  - 서버 사이드: throw new Error (앱 시작 불가)
  - 클라이언트 사이드: console.error + return false (빌드 불가 방지)
```

**적용 위치:**

- `lib/supabase.ts` — `getSupabaseAdmin()` 함수 상단에 `validateEnv('server')` 호출
- `app/api/gemini-token/route.ts` — POST 핸들러 상단에 명시적 환경변수 체크 추가 (현재보다 더 명확한 에러 메시지)
- `next.config.mjs` (또는 별도 스크립트) — 빌드 타임 환경변수 체크 추가

**개발 환경 친화적 출력:**

- 누락 시 에러 메시지에 설정 방법 안내: `"Vercel 대시보드 > Settings > Environment Variables에서 설정하세요"`
- `.env.example` 파일이 이미 있다면 해당 파일을 참조하는 링크 메시지 추가

### 수정 파일

- `lib/env-check.ts` (신규) — 환경변수 검증 유틸
- `lib/supabase.ts` — `getSupabaseAdmin()` 내 환경변수 검증 추가
- `app/api/gemini-token/route.ts` — 환경변수 검증 메시지 개선

### 에이전트 할당

**Agent 3 (서버 + 데이터)**

### 구현 순서

우선순위 1 (다른 모든 항목보다 먼저 — 누락 시 디버깅 불가)

---

## 9. 에이전트 팀 구성 + 작업 분배

### 전체 구현 순서 (의존성 기준)

```
Phase 1 (병렬 진행):
  Agent 3: 항목 8 환경변수 검증 (lib/env-check.ts 신규)
  Agent 1: 항목 1 WebSocket 재연결 (lib/gemini-client.ts 수정)
  Agent 1: 항목 5 재시도 로직 (lib/fetch-with-retry.ts 신규)

Phase 2 (Phase 1 완료 후):
  Agent 2: 항목 3 React 에러 바운더리 (app/error.tsx, app/session/[id]/error.tsx 신규)
  Agent 2: 항목 7 대시보드 로딩 에러 처리 (app/dashboard/page.tsx 수정)
  Agent 3: 항목 2 좀비 세션 정리 (app/api/session/end/route.ts 신규, 마이그레이션)

Phase 3 (Phase 2 완료 후):
  Agent 1: 항목 4 네트워크 상태 감지 (Phase 1 재연결 로직에 의존)
  Agent 1: 항목 6 토큰 만료 관리 (Phase 1 fetch-with-retry에 의존)
  Agent 2: OfflineOverlay 컴포넌트 (Agent 1 훅에 의존)
```

---

### Agent 1: 네트워크 레이어

**담당 항목:** 1(WebSocket 재연결), 4(네트워크 감지), 5(재시도 로직), 6(토큰 만료)

**담당 파일:**

- `lib/gemini-client.ts` — 재연결 로직 추가
  - `private reconnectAttempts = 0`, `private maxReconnectAttempts = 5`
  - `private manuallyDisconnected = false`
  - `scheduleReconnect()` 메서드 추가
  - `onclose` 콜백 수정 (재연결 트리거)
  - `GeminiLiveConfig`에 `expiresAt?: string` 추가
- `lib/fetch-with-retry.ts` (신규) — fetchWithRetry 유틸리티
- `lib/hooks/use-network-status.ts` (신규) — navigator.onLine 훅
- `app/session/[id]/page.tsx` — 수정사항:
  - `ConnectionState`에 `"reconnecting"` 추가
  - `useNetworkStatus` 훅 통합
  - gemini-token fetch를 fetchWithRetry로 교체
  - `tokenExpiresAtRef` + `refreshToken` 함수 추가
  - `OfflineOverlay` 렌더링 추가
  - `stateLabel`/`stateColor`에 reconnecting 상태 추가
- `app/api/gemini-token/route.ts` — 외부 API fetch 타임아웃 추가, `expiresAt` 응답 추가

---

### Agent 2: UI/UX 에러 처리

**담당 항목:** 3(에러 바운더리), 4(오프라인 오버레이), 7(대시보드 에러)

**담당 파일:**

- `app/error.tsx` (신규) — 전역 에러 바운더리
  - `"use client"` 선언
  - `{ error, reset }` props 타입 정의
  - "다시 시도" 버튼, "대시보드로 이동" 링크
  - 개발 환경에서만 error.message 노출
- `app/session/[id]/error.tsx` (신규) — 세션 에러 바운더리
  - `"use client"` 선언
  - "세션 재시작" 버튼 (reset())
  - "대시보드로 이동" 버튼
  - 세션 종료 API 호출 시도 (useEffect 내 sendBeacon)
- `app/session/[id]/loading.tsx` (신규) — 세션 로딩 스켈레톤
  - 분할 화면 형태의 스켈레톤 (상하 두 영역)
- `components/OfflineOverlay.tsx` (신규)
  - `isOnline: boolean` props
  - 전체 화면 반투명 오버레이 (z-index 최상위)
  - "인터넷 연결이 끊겼습니다" 메시지
  - 온라인 복귀 감지 시 자동 숨김
- `app/dashboard/page.tsx` — 수정사항:
  - `loadError` 상태 추가
  - 10초 타임아웃 (AbortController)
  - "다시 시도" 버튼
  - `alert()` 제거 → 인라인 에러 메시지
  - `/api/session/list` fetch를 fetchWithRetry로 교체 (Agent 1 lib 활용)

---

### Agent 3: 서버 + 데이터

**담당 항목:** 2(좀비 세션), 8(환경변수 검증)

**담당 파일:**

- `lib/env-check.ts` (신규) — 환경변수 검증 유틸
  - `validateServerEnv()` — 서버 전용 변수 검증
  - `validateClientEnv()` — 클라이언트 변수 검증
  - 누락 시 명확한 에러 메시지
- `lib/supabase.ts` — `getSupabaseAdmin()` 내 `validateServerEnv()` 호출
- `app/api/session/end/route.ts` (신규) — sendBeacon 전용 POST endpoint
  - body: `{ id: string }`
  - `sessions` 테이블 status를 'ended'로 업데이트
  - `Content-Type: text/plain` 수락 (sendBeacon은 application/x-www-form-urlencoded 또는 text/plain 전송)
- `app/session/[id]/page.tsx` — `beforeunload`/`visibilitychange` 리스너 추가 (Agent 1과 조율 필요)
- `supabase/migrations/20260326_cleanup_zombie_sessions.sql` (신규)
  - pg_cron extension 활성화 확인
  - `cleanup_zombie_sessions()` PostgreSQL 함수 정의
  - cron 스케줄: `SELECT cron.schedule('0 * * * *', $$...$$)` (매시간)
- `app/api/gemini-token/route.ts` — 환경변수 검증 메시지 개선

---

## 10. 테스트 계획

### 10.1 린트/빌드 검증 (각 항목 구현 후)

- `npm run lint` 실행 — TypeScript 에러 및 ESLint 위반 없음 확인
- `node node_modules/next/dist/bin/next build` 실행 — 빌드 성공 확인
- 새로 생성된 `app/error.tsx`, `app/session/[id]/error.tsx`가 `"use client"` 선언 포함 여부 확인

### 10.2 항목별 테스트 시나리오

**항목 1 — WebSocket 재연결:**
- Chrome DevTools > Network 탭 > WebSocket 연결 강제 차단 (chrome://flags 또는 DevTools throttle)
- 예상: `"reconnecting..."` 상태 표시, 1초/2초/4초 간격으로 재연결 시도
- 재연결 성공 후 `reconnectAttempts` 초기화 확인
- 5회 실패 후 `"연결 끊김"` 상태 + 에러 메시지 표시 확인

**항목 2 — 좀비 세션 정리:**
- 브라우저 탭 강제 닫기 → Supabase 대시보드에서 세션 status가 'ended'로 변경됨 확인
- 1시간 이상된 active 세션이 cron 실행 후 자동 ended 처리 확인 (Supabase SQL Editor에서 수동 실행 테스트)

**항목 3 — React 에러 바운더리:**
- `app/session/[id]/page.tsx`에 의도적 throw 추가 → `error.tsx` 렌더링 확인
- "다시 시도" 버튼 클릭 → `reset()` 호출로 컴포넌트 재마운트 확인
- 전역 `app/error.tsx`가 세션 외 페이지에서도 동작 확인

**항목 4 — 네트워크 상태 감지:**
- Chrome DevTools > Network 탭 > Offline 모드 활성화
- 예상: `OfflineOverlay` 즉시 표시
- Offline → Online 전환 후 오버레이 사라지고 재연결 시도 확인

**항목 5 — 재시도 로직:**
- `/api/gemini-token` 엔드포인트를 일시 차단 (hosts 파일 또는 mock) 후 세션 진입
- 예상: 최대 3회 재시도, 각 시도 간격 지수 증가
- 10초 타임아웃 후 에러 상태 전환 확인

**항목 6 — 토큰 만료 관리:**
- `app/api/gemini-token/route.ts`의 만료 시간을 30초로 임시 변경 후 테스트
- 세션 시작 후 25초 경과 시 자동 갱신 시도 로그 확인
- 갱신 실패 시 경고 배너 표시 확인

**항목 7 — 대시보드 로딩 에러:**
- `/api/session/list` 응답을 15초 지연으로 설정 (Next.js route handler에 `await new Promise(r => setTimeout(r, 15000))` 추가)
- 예상: 10초 후 "데이터를 불러올 수 없습니다" + "다시 시도" 버튼 표시
- "다시 시도" 클릭 후 정상 데이터 로딩 확인

**항목 8 — 환경변수 검증:**
- `.env.local`에서 `GEMINI_API_KEY` 제거 후 서버 재시작
- 예상: `getSupabaseAdmin()` 또는 gemini-token API 호출 시 명확한 에러 메시지 출력
- `NEXT_PUBLIC_SUPABASE_URL` 제거 후 빌드 → 빌드 타임 경고 확인

### 10.3 통합 테스트 시나리오

1. **전체 흐름 정상 동작**: 로그인 → 언어 선택 → 통역 시작 → 5분 이상 통역 (토큰 갱신 발생) → 정상 종료
2. **네트워크 불안정 시나리오**: 통역 중 Wi-Fi 끊김 → 오프라인 오버레이 → Wi-Fi 복구 → 자동 재연결 → 통역 재개
3. **비정상 종료 시나리오**: 통역 중 브라우저 강제 종료 → sendBeacon으로 세션 종료 처리 → 대시보드에서 'ended' 상태 확인
4. **환경변수 누락 시나리오**: 불완전한 환경에서의 명확한 에러 메시지 확인

---

## 부록: 수정/신규 파일 목록 요약

| 파일 | 신규/수정 | 담당 에이전트 |
|------|----------|-------------|
| `lib/gemini-client.ts` | 수정 | Agent 1 |
| `lib/fetch-with-retry.ts` | 신규 | Agent 1 |
| `lib/hooks/use-network-status.ts` | 신규 | Agent 1 |
| `lib/env-check.ts` | 신규 | Agent 3 |
| `lib/supabase.ts` | 수정 | Agent 3 |
| `app/session/[id]/page.tsx` | 수정 | Agent 1 + Agent 3 |
| `app/session/[id]/error.tsx` | 신규 | Agent 2 |
| `app/session/[id]/loading.tsx` | 신규 | Agent 2 |
| `app/error.tsx` | 신규 | Agent 2 |
| `app/dashboard/page.tsx` | 수정 | Agent 2 |
| `app/api/gemini-token/route.ts` | 수정 | Agent 1 + Agent 3 |
| `app/api/session/end/route.ts` | 신규 | Agent 3 |
| `components/OfflineOverlay.tsx` | 신규 | Agent 2 |
| `supabase/migrations/20260326_cleanup_zombie_sessions.sql` | 신규 | Agent 3 |
