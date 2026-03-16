# MedTranslate

1-Device 대면형 실시간 의료 통역 서비스 (한국어 ↔ 태국어/베트남어)

## v2 아키텍처 (1-Device STS)
- 단일 안드로이드 디바이스 + 오픈핏 이어폰
- Half-Duplex PTT 2개 (직원/환자)
- 프롬프터 UI (1문장 크게 + Glossary 하이라이팅)
- WebSocket 미사용 → HTTPS API Routes로 번역 파이프라인 호출

## 기술 스택
- Frontend: Next.js 14 (App Router) + Tailwind CSS + Zustand
- Backend: Next.js API Routes (HTTPS, no WebSocket for v2)
- DB: Firebase Firestore
- Auth: Firebase Auth (이메일/비밀번호)
- STT: Google Cloud Speech-to-Text v2
- Translation: Google Cloud Translation API (Advanced) + Glossary
- TTS: Google Cloud Text-to-Speech (WaveNet)
- Audio: Web Audio API + AudioWorklet/MediaRecorder

## 핵심 흐름 (v2)
PTT 버튼 누름 → 마이크 캡처 → HTTPS POST /api/translate → 서버 STT → Glossary 교정 → 번역 → TTS → JSON 응답 → 이어폰/스피커 재생 + 프롬프터 표시

## 폴더 구조
- app/ : Next.js 페이지 (login, dashboard, session)
- app/api/ : API Routes (auth, session, translate)
- components/ : UI 컴포넌트
- lib/ : Google Cloud API 클라이언트, Firebase
- server/ : translation-pipeline (서버 사이드 로직)
- glossary/ : 의료 용어 JSON
- types/ : TypeScript 타입 정의
- store/ : Zustand 상태 관리

## v1 잔존 코드 (미사용, 향후 제거 가능)
- server/websocket.ts, lib/socket.ts — WebSocket 서버/클라이언트
- app/join/[id]/ — QR 기반 환자 입장 페이지
- components/QRGenerator.tsx, QRScanner.tsx — QR 관련

## 환경 변수
NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY,
GEMINI_API_KEY, NEXT_PUBLIC_APP_URL

## 실행
npm run dev (Next.js 개발 서버)
npm run build (프로덕션 빌드)

## 배포
Vercel (서울 리전 icn1)
- vercel.json: 프레임워크, 리전, 환경 변수 시크릿 설정
- Vercel 대시보드에서 환경 변수를 시크릿(@접두사)으로 등록
- Docker/Cloud Run 파일은 삭제됨 (Dockerfile, docker-compose.yml, cloudbuild.yaml, .dockerignore)
