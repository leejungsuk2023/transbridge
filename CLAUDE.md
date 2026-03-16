# MedTranslate

1-Device 대면형 실시간 의료 통역 서비스 (한국어 ↔ 태국어/베트남어)

## v3 아키텍처 (Gemini Live API + Supabase)
- 단일 안드로이드 디바이스 + 오픈핏 이어폰
- Half-Duplex PTT 2개 (직원/환자)
- 프롬프터 UI (1문장 크게 + Glossary 하이라이팅)
- Gemini Live API 단일 통합 (STT + 번역 + TTS를 1개 API로 처리)
- Supabase (Auth + PostgreSQL DB) — Firebase 대체

## 기술 스택
- Frontend: Next.js 14 (App Router) + Tailwind CSS + Zustand
- Backend: Next.js API Routes (HTTPS)
- DB: Supabase PostgreSQL
- Auth: Supabase Auth (이메일/비밀번호)
- 번역: Gemini Live API (gemini-2.5-flash-native-audio) — STT + 번역 + TTS 통합
- Audio: Web Audio API + MediaRecorder

## 핵심 흐름 (v3)
PTT 버튼 누름 → MediaRecorder 캡처 → HTTPS POST /api/translate → Gemini Live API (STT+번역+TTS 단일 호출) → JSON 응답 → 이어폰/스피커 재생 + 프롬프터 표시

## 폴더 구조
- app/ : Next.js 페이지 (login, dashboard, session)
- app/api/ : API Routes (auth, session, translate)
- components/ : UI 컴포넌트
- lib/ : Gemini Live 클라이언트, Supabase 클라이언트, Glossary 유틸
- glossary/ : 의료 용어 JSON (ko-th.json, ko-vi.json)
- types/ : TypeScript 타입 정의
- store/ : Zustand 상태 관리

## v1 잔존 코드 (미사용, 향후 제거 가능)
- server/websocket.ts, lib/socket.ts — WebSocket 서버/클라이언트
- app/join/[id]/ — QR 기반 환자 입장 페이지

## 환경 변수
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
GEMINI_API_KEY, NEXT_PUBLIC_APP_URL

## 실행
npm run dev (Next.js 개발 서버)
npm run build (프로덕션 빌드)

## 배포
Vercel (서울 리전 icn1)
- vercel.json: 프레임워크, 리전 설정
- Vercel 대시보드에서 환경 변수 등록 (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY)
- Docker/Cloud Run 파일 삭제됨 (Dockerfile, docker-compose.yml, cloudbuild.yaml, .dockerignore)
