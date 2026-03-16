# Claude Code 프롬프트 — PRD.md 아키텍처 변경

PRD.md 파일을 아래 아키텍처 변경사항에 맞게 전면 수정해줘.

## 핵심 변경사항: Google 3단계 파이프라인 → Gemini Live API 단일 통합

### 제거할 기술 스택
- Google Cloud STT (Speech-to-Text)
- Google Cloud Translation API
- Google Cloud TTS (Text-to-Speech)
- AudioWorklet 기반 오디오 스트리밍 파이프라인
- translation-pipeline.ts
- lib/google-stt.ts, lib/google-translate.ts, lib/google-tts.ts
- Firestore glossary 컬렉션 (별도 Glossary API 연동 불필요)

### 추가할 기술 스택
- **Gemini Live API** (모델: gemini-2.5-flash-native-audio)
  - WebSocket 기반 실시간 음성↔음성 직통 번역
  - 한국어↔태국어, 한국어↔베트남어 양방향 지원
  - 70개 이상 언어, 2000개 언어 쌍 지원
  - 자동 언어 감지, 화자 자동 식별
  - 지연시간 1초 이내
- **의료 용어 Glossary → System Prompt 주입 방식으로 변경**
  - Firestore glossary 컬렉션 대신 glossary/ko-th.json, glossary/ko-vi.json 파일 유지
  - Gemini Live API 세션 시작 시 system_instruction에 의료 용어 사전을 텍스트로 주입
  - 예시: "다음 의료 용어를 반드시 정확히 번역하세요: 내시경=ส่องกล้อง, 마취=ยาสลบ ..."

### 아키텍처 변경 요약

**기존:**
마이크 → AudioWorklet → WebSocket → 서버 → Google STT → Google Translation → Google TTS → 음성출력
(3개 API, 지연시간 ~3초, 복잡한 파이프라인)

**변경 후:**
마이크 → Gemini Live API (WebSocket, 단일 연결) → 음성출력
(1개 API, 지연시간 <1초, 단순한 구조)

### 환경변수 변경

제거:
- GOOGLE_CLOUD_PROJECT_ID
- GOOGLE_CLOUD_CLIENT_EMAIL
- GOOGLE_CLOUD_PRIVATE_KEY

추가:
- GEMINI_API_KEY (Google AI Studio에서 발급)

### 프로젝트 구조 변경

제거할 파일:
- lib/google-stt.ts
- lib/google-translate.ts
- lib/google-tts.ts
- server/translation-pipeline.ts

추가할 파일:
- lib/gemini-live.ts (Gemini Live API WebSocket 클라이언트)
- lib/glossary.ts (glossary JSON 로드 → system prompt 텍스트로 변환)

Firestore 컬렉션에서 제거:
- glossary 컬렉션 (system prompt로 대체)

### 개발 로드맵 변경

Phase 4 (번역 파이프라인) 재작성:
- 기존: Google STT + Translation + TTS 각각 연동 (1~2주)
- 변경: Gemini Live API WebSocket 연결 + 양방향 오디오 스트림 라우팅 (3~5일)
- 전체 개발 기간: 기존 4~6주 → 2~3주로 단축

### 성공지표 수정
- 번역 전체 지연시간 목표: 기존 2초 이내 → 1초 이내로 상향

---

## 수정 시 주의사항

1. 버전을 v1.0 → v2.0으로 올리고 작성일을 2026-03-16으로 업데이트
2. 기존에 v1(2-Device, QR 기반) 관련 주석으로 남겨둔 내용들도 정리
3. 문서 전체에서 "Google Cloud STT", "Google Cloud Translation", "Google Cloud TTS", "AudioWorklet" 언급을 모두 찾아서 Gemini Live API 기준으로 교체
4. 기술 스택 테이블, 환경설정 섹션, 프로젝트 구조 섹션, 개발 로드맵 섹션을 반드시 업데이트
5. 한국어로 작성 유지
