# MedTranslate — Product Requirements Document (PRD)

> 작성일: 2026-03-03
> 최종 업데이트: 2026-03-28
> 버전: v3.1

---

## 목차

1. [제품 개요](#1-제품-개요-product-overview)
2. [목표 사용자](#2-목표-사용자-target-users)
3. [핵심 사용자 흐름](#3-핵심-사용자-흐름-core-user-flows)
4. [기능 요구사항](#4-기능-요구사항-functional-requirements)
5. [비기능 요구사항](#5-비기능-요구사항-non-functional-requirements)
6. [기술 아키텍처](#6-기술-아키텍처-technical-architecture)
7. [데이터 모델](#7-데이터-모델-data-model)
8. [화면 설계](#8-화면-설계-screen-design)
9. [프로젝트 구조](#9-프로젝트-구조-project-structure)
10. [개발 로드맵](#10-개발-로드맵-development-roadmap)
11. [환경 설정](#11-환경-설정-environment-setup)
12. [비용 분석](#12-비용-분석-cost-analysis)
13. [의료 용어 사전 초기 데이터](#13-의료-용어-사전-초기-데이터-glossary-initial-data)
14. [성공 지표](#14-성공-지표-success-metrics)
15. [리스크 및 대응 방안](#15-리스크-및-대응-방안-risks--mitigation)

---

## 1. 제품 개요 (Product Overview)

### 프로젝트명

**MedTranslate** — 1-Device 대면형 실시간 의료 통역 서비스

### 한 줄 설명

병원 접수대에 비치된 안드로이드 기기 1대와 오픈핏 이어폰을 이용해, 병원 직원과 외국인 환자가 마이크를 항상 켠 상태(Full-Duplex)로 Gemini Live API를 통해 실시간 양방향 음성 통역과 프롬프터 자막을 주고받는 대면 통역 솔루션

### 배경 및 동기

국내 외국인 환자 수는 지속적으로 증가하고 있으나, 의료 현장에서의 언어 장벽은 여전히 큰 문제다. 기존 통역사 파견 서비스는 비용이 높고(월 ₩600만원 이상), 즉각적인 대응이 어렵다. 특히 태국인 및 베트남인 환자 비율이 높은 병원에서 실시간 통역 수요가 높음에도 불구하고, 별도 앱 설치 없이 즉시 사용할 수 있는 솔루션이 부재한 상황이다.

### 목표

- 병원 접수부터 진료, 수납까지 전 과정에서 언어 장벽 없이 원활한 의사소통 제공
- **단일 디바이스** 기반 대면 통역으로, 기기 관리·교육 복잡도 최소화
- 통역사 파견 대비 10배 이상의 비용 절감
- 환자 경험 향상 및 병원 서비스 품질 제고
- Gemini Live API를 활용한 정확도 높은 실시간 음성 통역(STS) 제공 (STT+번역+TTS 단일 API 호출)
- 피부과/미용 클리닉 특화 Glossary (보톡스, 필러, 레이저 등 95개 시술 용어 × 11개 언어)

---

## 2. 목표 사용자 (Target Users)

### 페르소나 A — 병원 실장 (Hospital Staff)

| 항목 | 내용 |
|------|------|
| 역할 | 병원 접수 담당자, 실장, 간호사 |
| 환경 | 병원 접수대, PC 또는 스마트폰 |
| 기술 수준 | 평균적인 스마트폰 사용자 수준 |
| 주요 언어 | 한국어 |

**니즈 (Needs)**
- 외국인 환자와 즉각적으로 의사소통하고 싶다.
- 복잡한 설치나 설정 없이 바로 사용할 수 있어야 한다.
- 진료 내용 및 보험, 수납 관련 용어가 정확하게 전달되어야 한다.
- 세션 이력 및 사용량 통계를 확인하고 싶다.

**페인포인트 (Pain Points)**
- 외국인 환자가 왔을 때 즉각 대응할 수단이 없어 당황스럽다.
- 번역 앱으로 문자를 주고받는 방식은 시간이 너무 걸린다.
- 통역사 예약은 사전 준비가 필요하고 비용도 부담된다.
- 의료 전문 용어를 일반 번역 앱이 잘못 번역하는 경우가 많다.

---

### 페르소나 B — 외국인 환자 (Foreign Patient)

| 항목 | 내용 |
|------|------|
| 역할 | 외국인 환자 (태국어, 베트남어, 영어, 인도네시아어, 스페인어, 몽골어, 광동어, 북경어, 일본어, 프랑스어, 독일어 등) |
| 환경 | 병원 접수대 (직원 디바이스 화면 공유) |
| 기술 수준 | 별도 조작 불필요 — 직원이 세션을 시작하면 자동으로 연결됨 |
| 주요 언어 | 11개 지원 언어 중 해당 언어 |

**니즈 (Needs)**
- 한국어를 몰라도 병원 직원과 자유롭게 대화하고 싶다.
- 앱을 설치하거나 회원가입을 하지 않아도 바로 사용할 수 있어야 한다.
- 증상, 의료 기록, 처방 내용을 정확하게 이해하고 싶다.
- 음성으로 말하면 자동으로 통역되는 편리한 방식을 원한다.

**페인포인트 (Pain Points)**
- 한국어를 전혀 몰라 병원에서 기본적인 의사소통조차 어렵다.
- 통역 앱 사용법이 복잡하거나 앱 설치 자체를 꺼린다.
- 의료 용어를 잘못 이해하면 건강에 직접적인 위험이 생길 수 있다.
- 병원 직원이 답답해할까봐 눈치를 보게 된다.

---

## 3. 핵심 사용자 흐름 (Core User Flows)

> v3.0: 단일 디바이스 + Gemini Live API Full-Duplex 모델. PTT 버튼 없음, 마이크 상시 켜짐.

### 흐름 A — 병원 실장(직원) 흐름

```
1. 웹앱 접속 (medtranslate.kr) — 병원 접수대에 고정 비치된 안드로이드 기기
        |
2. 이메일 + 비밀번호로 로그인 (Supabase Auth)
        |
3. 대시보드에서 환자 언어(11개 중 선택) 후 "통역 시작" 버튼 클릭
        |
4. 화면이 상·하단으로 분할 렌더링 (상단: 환자 프롬프터, 하단: 직원 프롬프터)
        |
5. 환자에게 소독된 오픈핏(Open-ear) 이어폰 제공 및 착용 안내
        |
6. 마이크가 항상 켜진 상태 — 직원이 한국어로 발화하면 Gemini Live가 자동 감지
        |
7. Gemini Live API: STT + 번역 + TTS를 단일 WebSocket 세션에서 실시간 처리
           의료 용어 사전(Glossary)이 system_instruction에 주입되어 번역 정확도 향상
        |
8. 환자 이어폰으로 번역 음성 출력 (PCM 24kHz)
        |
9. 하단 직원 프롬프터에 원문 한국어 + 번역 결과 표시 (Glossary 단어 하이라이팅)
        |
10. 필요 시 통역 반복, 종료 시 화면 상단 "종료" 버튼 클릭
```

---

### 흐름 B — 외국인 환자 흐름

```
1. 병원 접수대에서 안내를 받고, 오픈핏 이어폰을 착용
        |
2. 직원이 세션을 시작하면, 환자는 상단 화면에 자신의 언어 프롬프터를 확인
        |
3. 직원 발화 후, 본인 언어의 번역 음성이 이어폰으로 자동 재생
        |
4. 동시에 상단 환자 프롬프터에 번역 텍스트가 크게 표시되어 내용을 시각적으로 확인
        |
5. 본인이 말하면 마이크가 자동으로 감지 — 별도 버튼 조작 불필요
        |
6. Gemini Live가 역방향 번역(외국어 → 한국어) 실행
        |
7. 직원 쪽 스피커/이어폰으로 한국어 음성 출력 + 하단 직원 프롬프터에 표시
        |
8. 진료/접수 흐름이 종료되면 이어폰 회수 및 소독
```

---

### 흐름 C — Gemini Live API 번역 파이프라인

```
[단일 디바이스 (안드로이드 웹앱)]
        |
1. /api/gemini-token POST → ephemeral token (5분) 또는 API key 직접 발급
        |
2. @google/genai SDK live.connect() — Gemini Live WebSocket 연결 수립
        |
3. AudioWorklet (audio-processor.js) — PCM 16kHz 마이크 상시 캡처
        |
4. 오디오 청크 → base64 → session.sendRealtimeInput() → Gemini Live 전송
        |
[Gemini Live API — 단일 WebSocket 세션]
        |
5. 음성 자동 감지 + STT → 원문 텍스트 (inputTranscription)
        |
6. system_instruction의 Glossary 용어집 적용 → 번역 (bidirectional: ko↔외국어)
        |
7. TTS 합성 → PCM 24kHz 오디오 스트림 (audio/pcm;rate=24000)
        |
[단일 디바이스]
        |
8. AudioStreamer: PCM 24kHz → Web Audio API 실시간 재생
        |
9. inputTranscription → 원문 프롬프터 표시
   outputTranscription → 번역 프롬프터 표시 (Glossary 하이라이팅)
        |
10. 오디오·텍스트는 서버에 저장하지 않음 (개인정보 보호)
```

---

## 4. 기능 요구사항 (Functional Requirements)

### FR-1: Full-Duplex 상시 마이크 오디오 제어

| 항목 | 내용 |
|------|------|
| 목적 | 자연스러운 대화 흐름 — PTT 버튼 없이 Gemini Live가 양방향 발화를 자동 감지 |
| 방식 | AudioWorklet으로 마이크를 항상 켜고, PCM 16kHz 청크를 Gemini Live WebSocket에 실시간 전송 |

**상세 요구사항**
- PTT 버튼 없음 — 마이크는 세션 시작부터 종료까지 항상 켜진 상태를 유지한다.
- Gemini Live API의 bidirectional system_instruction으로 발화 언어를 자동 감지하여 번역 방향을 결정한다.
- AudioWorklet (public/audio-processor.js) 이 PCM Int16 청크를 캡처하여 base64로 인코딩 후 sendRealtimeInput()으로 전송한다.
- TTS 출력은 AudioStreamer(PCM 24kHz)를 통해 Web Audio API로 실시간 재생한다.
- 연결 상태(connecting / connected / disconnected)를 상태바 색상과 텍스트로 명확히 구분한다.

---

### FR-2: 대형 프롬프터 UI 및 용어 하이라이팅

| 항목 | 내용 |
|------|------|
| 목적 | 청취·시청이 어려운 상황에서도 의료 정보를 명확하게 전달 |
| 구성 | 화면 중앙에 현재 발화에 대한 번역 문장 1줄만 크게 표시 |

**상세 요구사항**
- 이전 버전의 **대화형 말풍선 UI는 사용하지 않는다.**
- 현재 완료된 **마지막 문장 1개만** 전체 화면에 가까운 크기로 표시한다.
- `glossary/ko-th.json` 등 11개 언어 JSON 파일에 정의된 의료 용어 (피부과/미용 시술 용어 위주, 27개 이상)는:
  - 색상(예: 금색/강조색)과 굵기(Bold)를 사용해 시각적으로 돋보이게 렌더링한다.
  - 필요 시 하단에 원문/번역 용어를 작은 툴팁/설명으로 함께 표기할 수 있다.
- 프롬프터 문장은 직원·환자 어느 쪽 발화이든 동일한 형식으로 표시하되,
  - 상단에는 **“직원 발화 / 환자 발화”** 라벨을 부가적으로 명시한다.

---

> 아래 FR-1~FR-8(기존 번호)은 **v1(QR 기반 2-Device) 설계를 참고용으로 유지**한다.
> v3에서는 Firebase/Firestore → Supabase, Google Cloud STT/Translation/TTS → Gemini Live API로 교체됨.
> QR 코드 생성/스캔, WebSocket 기반 다중 디바이스 동기화, socket.io는 v3에서 사용하지 않는다.

### FR-1: 병원 계정 관리 [v1 참고용 — v3에서는 Supabase Auth로 교체됨]

| 항목 | 내용 |
|------|------|
| 인증 수단 | 이메일 + 비밀번호 (Supabase Auth) |
| 계정 생성 | Supabase 대시보드 Authentication에서 직접 생성 |
| 로그인 유지 | Supabase 세션 기반, 브라우저 재시작 후에도 유지 |
| 로그아웃 | 대시보드에서 로그아웃 버튼 제공 |

**상세 요구사항**
- 로그인 실패 시 명확한 에러 메시지 표시
- 비인가 접근 시 로그인 페이지로 자동 리디렉션
- Supabase Auth JWT 토큰으로 API Route 인증 처리

---

### FR-2: 세션 관리

**세션 생성**
- 병원 실장이 언어 선택 후 "통역 시작" 버튼 클릭 시 세션 자동 생성
- 세션 ID는 UUID v4로 생성 (Supabase gen_random_uuid())
- Supabase `sessions` 테이블에 저장
- 세션 상태: `waiting` → `active` → `ended`

**QR 코드 생성**
- 세션 생성 즉시 QR코드 렌더링 (qrcode.react 사용)
- QR코드에 인코딩되는 URL: `https://medtranslate.kr/join/[sessionId]`
- 대시보드 화면에 QR코드 크게 표시
- 인쇄 버튼 제공 (접수대 비치용)

**세션 상태 관리**
- `waiting`: 환자 접속 대기 중
- `active`: 양쪽 연결 완료, 통역 진행 중
- `ended`: 세션 종료 (실장이 종료 버튼 클릭 또는 타임아웃)
- Supabase sessions 테이블 폴링 또는 Realtime으로 상태 변화 감지

---

### FR-3: QR 기반 세션 참여

**QR 스캔**
- 환자가 카메라로 QR 스캔 시 브라우저에서 join 페이지 자동 오픈
- html5-qrcode 라이브러리 사용 (브라우저 내장 카메라 접근)
- 앱 설치 불필요, 모바일 브라우저에서 즉시 동작

**언어 선택**
- 태국어 (TH) / 베트남어 (VI) 선택 UI 제공
- 각 언어를 해당 언어의 자국 문자로 표기 (ภาษาไทย / Tiếng Việt)
- 선택 즉시 세션 언어 설정 확정

**마이크 허용**
- 브라우저 마이크 권한 요청 전 안내 화면 표시
- 권한 거부 시 명확한 안내 메시지와 재시도 방법 제공
- iOS Safari, Android Chrome 모두 지원

---

### FR-4: 실시간 음성 통역

**STT (Speech-to-Text)**
- Google Cloud STT v2 스트리밍 API 사용
- 음성 인식 언어: ko-KR, th-TH, vi-VN
- AudioWorklet으로 마이크 오디오를 실시간 캡처하여 서버에 스트리밍
- 중간 결과(interim result)와 최종 결과(final result) 구분 처리

**번역 (Translation)**
- Google Cloud Translation API 사용
- 번역 방향:
  - 한국어 → 태국어 또는 베트남어 (세션 언어에 따라 자동 결정)
  - 태국어/베트남어 → 한국어
- 의료 용어 사전(Glossary)을 Translation API에 적용하여 정확도 향상

**TTS (Text-to-Speech)**
- Google Cloud TTS WaveNet 음성 합성
- 음성 코드: ko-KR-Wavenet-A, th-TH-Standard-A, vi-VN-Wavenet-A
- 합성된 오디오를 Base64로 인코딩하여 WebSocket으로 전송

**자동 재생**
- 수신된 번역 음성 자동 재생 (Web Audio API)
- 재생 중 파형 애니메이션 표시
- 음성 재생 완료 후 다음 발화 수신 대기

---

### FR-5: 실시간 통신 (WebSocket)

- socket.io 기반 양방향 실시간 통신
- 각 세션은 독립적인 Room으로 관리
- 전송 데이터 유형:
  - `audio-stream`: 마이크 오디오 청크 (ArrayBuffer)
  - `transcript`: STT 결과 텍스트
  - `translation`: 번역 텍스트 + TTS 오디오 (Base64)
  - `session-status`: 세션 상태 변경 이벤트
- 연결 끊김 시 자동 재연결 (socket.io 내장 기능 활용)
- 네트워크 불안정 시 재연결 중 UI 상태 표시
> v2.0 1-Device 모델에서는 WebSocket 기반 다중 디바이스 통신 대신, 단일 디바이스 → 서버 간 HTTPS API 호출로 대체된다.

---

### FR-6: 통역 세션 UI

**말풍선 대화 (Transcript)**
- 실장 발화: 오른쪽 정렬, 파란색 말풍선
- 환자 발화: 왼쪽 정렬, 초록색 말풍선
- 각 말풍선에 원문 텍스트 + 번역 텍스트 함께 표시
- 새 메시지 수신 시 자동 스크롤

**파형 애니메이션 (Waveform Animation)**
- 발화 중: 실시간 음성 파형 애니메이션 표시
- 번역 음성 재생 중: 파형 애니메이션으로 재생 상태 시각화

**상태 표시**
- 연결 상태: 연결 중 / 연결됨 / 끊김 아이콘 표시
- 상대방 발화 상태: "상대방이 말하는 중..." 표시
- 번역 진행 상태: 번역 중 로딩 인디케이터

---

### FR-7: 대시보드

**주요 구성 요소**
- "새 통역 시작" 버튼 (크고 명확한 CTA)
- 현재 활성 세션의 QR코드 표시 영역
- 사용량 통계 카드:
  - 이번 달 통역 건수
  - 이번 달 총 통역 시간 (분)
  - 언어별 통역 건수 (태국어 / 베트남어)
- 최근 세션 목록 (날짜, 언어, 시간, 상태)

---

### FR-8: 의료 용어 사전 (Glossary)

- DB 미사용 — `glossary/ko-{lang}.json` 로컬 파일로 관리 (11개 언어)
- 한국어 기준 키로 각 언어 번역 제공
- buildSystemPrompt()가 Gemini Live system_instruction에 자동 주입하여 번역 정확도 향상
- 카테고리별 분류: 안내, 시술, 증상, 약품, 보험 등 (피부과/미용 클리닉 특화)
- 현재 95개 용어 제공 (ko-th 기준, §13 참고), 11개 언어 JSON 파일 전체 적용

---

## 5. 비기능 요구사항 (Non-Functional Requirements)

### 성능 (Performance)

| 항목 | 목표 |
|------|------|
| 번역 전체 지연시간 (Latency) | 2초 이내 (발화 종료 → 번역 음성 출력) |
| STT 응답 시간 | 1초 이내 |
| WebSocket 연결 수립 시간 | 3초 이내 |
| 페이지 초기 로드 시간 | 3초 이내 (LTE 환경) |
| 동시 세션 처리 | Vercel Serverless 자동 스케일링으로 대응 |

---

### 보안 (Security)

- 음성 데이터는 DB에 저장하지 않음 — 실시간 처리 후 즉시 폐기 (개인정보 보호법 준수)
- 모든 통신은 HTTPS / WSS (WebSocket Secure) 사용
- Supabase Auth JWT로 API Route 접근 인증 (서버 사이드: service_role key)
- 세션 URL은 추측 불가능한 UUID v4 형태
- Supabase RLS(Row Level Security)로 데이터 접근 제어
- 환경 변수에 API 키 저장, 코드에 하드코딩 금지

---

### 확장성 (Scalability)

- Vercel Serverless: 요청량에 따른 자동 스케일 업/다운
- Supabase PostgreSQL: 관리형 DB, 자동 백업
- 서울 리전 (icn1) 배포로 국내 사용자 지연시간 최소화
- Gemini Live API는 클라이언트가 직접 WebSocket 연결 — 서버 통과 불필요

---

### 가용성 (Availability)

- 서비스 목표 가용성: 99.5% 이상
- Vercel의 자동 재배포 및 에러 모니터링 활용
- Supabase 99.9% SLA 활용

---

### 호환성 (Compatibility)

- 병원 직원 환경: PC 브라우저 (Chrome 최신 버전), 모바일 Chrome
- 환자 환경: 모바일 브라우저 (Android Chrome, iOS Safari)
- 앱 설치 불필요 — 브라우저만으로 전체 기능 동작
- 최소 지원: iOS 15+, Android 9+

---

### 접근성 (Accessibility)

- 큰 버튼과 명확한 아이콘 (외국인 환자 대상)
- 언어 선택 화면: 자국어 표기 병기 (한국어/ภาษาไทย/Tiếng Việt)
- 다국어 안내 문구 제공 (태국어, 베트남어 안내문 포함)
- 색상 대비 WCAG AA 기준 이상
- 터치 영역 최소 44x44px 이상

---

## 6. 기술 아키텍처 (Technical Architecture)

### v1(2-Device) → v2(1-Device STS) 아키텍처 변경

- **이전(v1)**:
  - 구조: 직원 디바이스 ↔ WebSocket 서버(socket.io) ↔ 환자 디바이스
  - 역할: 각자의 브라우저에서 마이크를 켜고, WebSocket으로 오디오 스트림을 서버에 전송한 뒤, 상대 디바이스로 중계
  - 요구사항: QR 세션 생성, 세션 Room 관리, 다중 브라우저 상태 동기화

- **이전(v2)**:
  - 구조: **단일 디바이스** → Next.js API Routes → Google Cloud(STT → Translation → TTS) 3단계 파이프라인
  - 방식: Half-Duplex PTT 버튼 2개로 발화 제어
  - 인증: Firebase Auth

- **현재(v3)**:
  - 구조: **단일 디바이스** → @google/genai SDK → Gemini Live API WebSocket (Full-Duplex)
  - 역할: 마이크를 항상 켠 상태에서 Gemini Live가 STT + 번역 + TTS를 단일 WebSocket 세션에서 처리
  - 인증: Supabase Auth
  - 배포: Vercel (서울 icn1), Supabase PostgreSQL
  - 효과: 3단계 파이프라인이 1개 API 호출로 통합, PTT 조작 불필요, 11개 언어 지원

---

### 기술 스택 테이블

| 영역 | 기술 | 버전/비고 |
|------|------|-----------|
| 프론트엔드 | Next.js (App Router) | 14.2.35 |
| 백엔드 | Next.js API Routes | 14.2.35 |
| 실시간 통역 | @google/genai SDK — Gemini Live API WebSocket | ^1.45.0 |
| 번역 모델 | gemini-2.5-flash-native-audio-preview-12-2025 | STT + 번역 + TTS 통합 |
| 서버 인프라 | Vercel | 서울 리전 (icn1) |
| 데이터베이스 | Supabase PostgreSQL | @supabase/supabase-js ^2.99.1 |
| 인증 | Supabase Auth | 이메일/비밀번호 |
| 상태 관리 | Zustand | ^5.0.11 |
| CI/CD | Vercel Git 연동 | main 브랜치 자동 배포 |
| 도메인 | medtranslate.kr | Vercel 연결 |

---

### 프론트엔드 주요 라이브러리

| 라이브러리 | 용도 |
|------------|------|
| Tailwind CSS | UI 스타일링 |
| @google/genai | Gemini Live API WebSocket 클라이언트 (GeminiLiveSession) |
| @supabase/supabase-js | Supabase Auth + DB 클라이언트 |
| Web Audio API + AudioWorklet | 마이크 PCM 16kHz 상시 캡처 (audio-processor.js) |
| Web Audio API + AudioContext | PCM 24kHz TTS 실시간 재생 (AudioStreamer) |
| Zustand | 전역 상태 관리 |
| uuid | 세션 ID 생성 |

---

### 시스템 아키텍처 다이어그램

```
+------------------------------------------------------------+
|           단일 디바이스 (안드로이드 웹앱)                 |
|                                                            |
|  [환자 프롬프터 — 상단]   [직원 프롬프터 — 하단]         |
|  - GlossaryHighlight      - GlossaryHighlight              |
|                                                            |
|  AudioWorklet (audio-processor.js)                        |
|  → PCM 16kHz 상시 캡처 → base64 → sendRealtimeInput()    |
|                                                            |
|  AudioStreamer → PCM 24kHz → Web Audio API 재생           |
+---------+---------------------+---------------------------+
          |                     |
          | POST /api/gemini-token  HTTPS (ephemeral token)
          v                     |
   +-------------+              |
   | Vercel      |              |
   | (Next.js    |              |
   | API Routes) |              |
   +------+------+              |
          |                     |
          | token/apiKey        | WSS WebSocket
          v                     v
   +------------------------------------------+
   |         Gemini Live API                  |
   |  gemini-2.5-flash-native-audio-preview   |
   |                                          |
   |  system_instruction: Glossary 용어집    |
   |  STT → 번역 → TTS (단일 세션)           |
   |  inputTranscription + outputTranscription|
   |  audio/pcm;rate=24000 스트림             |
   +------------------------------------------+
          |
   +------+------+
   | Supabase    |
   | PostgreSQL  |
   | hospitals   |
   | sessions    |
   +------+------+
          |
   +------+------+
   | Supabase    |
   |    Auth     |
   +-------------+
```

---

### 하드웨어 요구사항 (Hardware Requirements, v2)

| 항목 | 요구사항 |
|------|----------|
| 메인 디바이스 | 안드로이드 스마트폰 또는 태블릿 1대 (접수대 고정 비치, 크롬/웹뷰 최신 버전) |
| 오디오 출력 | 귀를 막지 않는 오픈핏(Open-ear) 블루투스 이어폰 (예: Shokz OpenFit, OpenFit Air 등) |
| 마이크 입력 | 디바이스 내장 마이크 우선, 필요 시 외장 마이크(테이블 마이크) 지원 |
| 입력 제어 | PTT 버튼 없음 — Full-Duplex 상시 마이크, Gemini Live가 화자 자동 감지 |
| 네트워크 | 안정적인 Wi-Fi 또는 유선 LAN (모바일 데이터는 예비용) |

---

### 번역 파이프라인 상세 흐름

```
[발화자 디바이스]
AudioWorklet
    → PCM 16kHz, 16-bit 오디오 청크
    → WebSocket emit('audio-stream', chunk)

[Cloud Run — Translation Pipeline]
    ← socket.on('audio-stream')
    → Google Cloud STT v2 스트리밍
    → (Interim) 중간 텍스트 → 화면 표시용
    → (Final)   최종 텍스트
        → Glossary 매핑 적용
        → Google Cloud Translation
        → 번역 텍스트
        → Google Cloud TTS (WaveNet)
        → 음성 오디오 (MP3/Base64)
    → WebSocket emit('translation', { text, audio, originalText })

[수신자 디바이스]
    ← socket.on('translation')
    → 말풍선 렌더링 (원문 + 번역)
    → Web Audio API로 번역 음성 자동 재생
    → 파형 애니메이션 재생
```

---

### 언어 코드 매핑 테이블

> v3.0에서는 Gemini Live API가 STT + 번역 + TTS를 모두 처리하므로 별도 언어 코드 매핑이 불필요.
> Gemini system_instruction에 언어명을 자연어로 기술 (예: "Korean", "Thai").

| 언어 코드 | 언어명 (system_instruction용) | Glossary 파일 |
|-----------|-------------------------------|---------------|
| ko | 한국어 (Korean) | — (기준 언어) |
| th | Thai (태국어) | glossary/ko-th.json |
| vi | Vietnamese (베트남어) | glossary/ko-vi.json |
| en | English (영어) | glossary/ko-en.json |
| id | Indonesian (인도네시아어) | glossary/ko-id.json |
| es | Spanish (스페인어) | glossary/ko-es.json |
| mn | Mongolian (몽골어) | glossary/ko-mn.json |
| yue | Cantonese (광동어) | glossary/ko-yue.json |
| zh | Mandarin Chinese (북경어) | glossary/ko-zh.json |
| ja | Japanese (일본어) | glossary/ko-ja.json |
| fr | French (프랑스어) | glossary/ko-fr.json |
| de | German (독일어) | glossary/ko-de.json |

---

## 7. 데이터 모델 (Data Model)

> v3.0: Firebase/Firestore 제거, Supabase PostgreSQL 사용.

### Supabase 테이블: `hospitals`

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | uuid (PK) | gen_random_uuid() |
| auth_user_id | uuid | auth.users(id) FK, Supabase Auth UID |
| name | text | 병원명 |
| email | text (UNIQUE) | 로그인 이메일 |
| plan | text | 플랜 구분 (`free` / `basic` / `premium`) |
| created_at | timestamptz | 계정 생성 일시 |

---

### Supabase 테이블: `sessions`

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | uuid (PK) | gen_random_uuid() |
| hospital_id | uuid | hospitals(id) FK |
| patient_lang | text | 환자 언어 코드 (`th`/`vi`/`en`/`id`/`es`/`mn`/`yue`/`zh`/`ja`/`fr`/`de`) |
| status | text | 세션 상태 (`waiting` / `active` / `ended`) |
| started_at | timestamptz | 세션 시작 일시 (default: now()) |
| ended_at | timestamptz | 세션 종료 일시 (종료 시 업데이트) |
| duration_sec | integer | 통역 총 시간 (초, 종료 시 자동 계산) |

> RLS 활성화 — 서버 사이드 API는 SUPABASE_SERVICE_ROLE_KEY로 RLS 우회
> 음성 데이터 및 대화 내용은 DB에 저장하지 않음 (개인정보 보호)

---

### Glossary 데이터 (JSON 파일, DB 미사용)

Glossary는 DB가 아닌 로컬 JSON 파일로 관리됩니다.

| 필드명 | 타입 | 설명 |
|--------|------|------|
| ko | string | 한국어 용어 |
| th / vi / en / id / es / mn / yue / zh / ja / fr / de | string? | 각 언어 번역 (해당 파일에 존재하는 경우) |
| category | string | 카테고리 (안내 / 시술 / 증상 / 약품 / 보험 등) |

---

## 8. 화면 설계 (Screen Design)

### 화면 1: 로그인 페이지

| 항목 | 내용 |
|------|------|
| 경로 | `/` (루트) |
| 접근 조건 | 비로그인 상태 |
| 로그인 후 이동 | `/dashboard` |

**구성 요소**
- MedTranslate 로고 및 서비스 소개 문구
- 이메일 입력 필드
- 비밀번호 입력 필드
- "로그인" 버튼
- 에러 메시지 표시 영역

**동작**
- Supabase Auth `signInWithPassword()` 호출
- 로그인 성공 시 `/dashboard`로 리디렉션
- 로그인 실패 시 에러 메시지 표시 ("이메일 또는 비밀번호가 올바르지 않습니다.")
- 이미 로그인된 상태로 접근 시 `/dashboard`로 자동 리디렉션

---

### 화면 2: 대시보드

| 항목 | 내용 |
|------|------|
| 경로 | `/dashboard` |
| 접근 조건 | 로그인 상태 필수 |

**구성 요소**
- 상단 헤더: MedTranslate 로고, 병원명, 로그아웃 버튼
- 언어 선택 그리드 (11개 언어, 국기 이모지 + 자국어 표기)
- "통역 시작" 버튼 (선택된 언어 표시, 미선택 시 비활성)
- 사용량 통계 카드: 이번달 통역 건수, 총 사용시간, 언어별 건수 (Supabase 실제 데이터)
- 최근 세션 목록 테이블 (Supabase 실제 데이터, GET /api/session/list)
- 동적 병원명 — 로그인 사용자의 hospitals 레코드에서 표시

**동작**
- 언어 선택 후 "통역 시작" 클릭 → `POST /api/session { patientLang }` → 세션 생성 → `/session/[id]?lang={code}` 이동
- QR 코드 기능 없음 (v3에서 제거됨)
- Supabase Auth를 통해 Bearer 토큰을 세션 생성 API에 전달
- 데이터 로드 타임아웃: 10초 AbortController, 실패 시 재시도 UI 표시

---

### 화면 3: 환자 입장 페이지 (v1 잔존 — 현재 미사용)

| 항목 | 내용 |
|------|------|
| 경로 | `/join/[id]` |
| 상태 | v1 잔존 코드. v3에서는 단일 디바이스 Full-Duplex 방식이므로 환자 입장 페이지 불필요 |

> v3에서는 직원이 대시보드에서 언어를 선택하고 세션을 시작하면, 같은 디바이스에서 직원과 환자가 함께 사용한다.

---

### 화면 4: 통역 세션 페이지

| 항목 | 내용 |
|------|------|
| 경로 | `/session/[id]?lang={patientLangCode}` |
| 접근 조건 | 세션 ID 유효, lang 파라미터 있음 |

**구성 요소**
- 상단 상태 바:
  - 연결 상태 인디케이터 (초록 pulse: 연결됨 / 노랑: 연결 중 / 빨강: 끊김)
  - 언어 표시 (예: 태국어 ↔ 한국어)
  - "종료" 버튼 (우측)
- 환자 프롬프터 영역 (상단 절반, 파란/인디고 배경):
  - PrompterDisplay — 환자 발화 원문 + 번역 결과 (Glossary 하이라이팅)
  - 화자 라벨 "환자 발화 → 한국어"
- 구분선
- 직원 프롬프터 영역 (하단 절반, 파란/인디고 배경):
  - PrompterDisplay — 직원 발화 원문 + 번역 결과 (Glossary 하이라이팅)
  - 화자 라벨 "직원 발화 → {외국어}"
- 하단 상태 바:
  - 연결 상태 + "듣는 중..." 텍스트
  - 세션 타이머 (MM:SS)

**동작**
- 페이지 로드 시 GET /api/session?id=xxx → 세션 유효성 검증 (무효 ID 차단)
- POST /api/gemini-token → GeminiLiveSession.connect()
- AudioWorklet 로드 (public/audio-processor.js) → 마이크 상시 캡처 시작
- PCM 16kHz 청크 → base64 → session.sendAudio() → Gemini Live 실시간 전송
- inputTranscription 수신 → 언어 감지(한글) → 해당 프롬프터 업데이트 (fragment 누적)
- outputTranscription 수신 → 동일 언어 에코 필터 통과 → 반대쪽 프롬프터 업데이트
- audio/pcm 수신 → AudioStreamer.addPCM16() → 즉시 재생
- 스마트 인터럽트: 새 발화 3자 이상 → 현재 TTS 즉시 중단
- 토큰 만료 1분 전 자동 재발급 (30초 주기)
- 탭 닫기/앱 전환: navigator.sendBeacon("/api/session/end") 자동 호출
- "종료" 클릭 → confirm() → PUT /api/session {id, status:'ended'} → /dashboard

**UX 포인트**
- PTT 버튼 없음 — 마이크는 항상 켜진 상태
- 반응형 폰트 크기 (텍스트 길이에 따라 자동 조정)
- 빈 프롬프터: "한국어로 말하세요" / "{언어}로 말하세요" 플레이스홀더
- 오프라인 감지 오버레이 — 인터넷 끊김 시 표시, 복구 시 자동 재연결
- 에러 바운더리 (app/session/[id]/error.tsx) — 예외 발생 시 복구 UI 제공

---

## 9. 프로젝트 구조 (Project Structure)

```
medtranslate/
├── app/                              # Next.js App Router 루트
│   ├── page.tsx                      # 로그인 페이지 (/) — Supabase Auth
│   ├── error.tsx                     # 전역 React 에러 바운더리
│   ├── dashboard/
│   │   └── page.tsx                  # 대시보드 (/dashboard) — 11개 언어 선택, Supabase 실데이터
│   ├── session/
│   │   └── [id]/
│   │       ├── page.tsx              # 통역 세션 (/session/[id]?lang=xx) — Full-Duplex
│   │       └── error.tsx             # 세션 전용 에러 바운더리
│   ├── join/
│   │   └── [id]/
│   │       └── page.tsx              # [v1 잔존] 환자 입장 페이지 — 미사용
│   └── api/
│       ├── gemini-token/
│       │   └── route.ts              # Gemini ephemeral token 발급 (expiresAt 포함)
│       ├── session/
│       │   ├── route.ts              # 세션 CRUD (POST/GET/PATCH/PUT)
│       │   ├── end/
│       │   │   └── route.ts          # sendBeacon 전용 세션 종료
│       │   └── list/
│       │       └── route.ts          # 세션 목록 조회 (zombie 자동 정리, no-cache)
│       ├── translate/
│       │   └── route.ts              # 서버사이드 번역 (PTT 모드 보조용)
│       └── auth/
│           └── route.ts              # 인증 유틸
│
├── components/                       # React 컴포넌트
│   ├── PrompterDisplay.tsx           # 프롬프터 UI (반응형 폰트, 화자 라벨, 11개 언어)
│   ├── GlossaryHighlight.tsx         # Glossary 용어 하이라이팅
│   ├── OfflineOverlay.tsx            # 네트워크 오프라인 감지 오버레이
│   ├── HalfDuplexPTT.tsx             # [v1 잔존] PTT 버튼 — 미사용
│   ├── AudioRecorder.tsx             # [v1 잔존] 오디오 레코더 — 미사용
│   ├── AudioPlayer.tsx               # [v1 잔존] 오디오 플레이어 — 미사용
│   ├── TranscriptDisplay.tsx         # [v1 잔존] 말풍선 UI — 미사용
│   ├── ConnectionStatus.tsx          # [v1 잔존] 연결 상태 — 미사용
│   └── LanguageSelector.tsx          # [v1 잔존] 언어 선택 — 미사용
│
├── lib/                              # 라이브러리
│   ├── gemini-client.ts              # GeminiLiveSession (클라이언트 사이드 WebSocket, 자동 재연결)
│   ├── gemini-live.ts                # translateWithGeminiLive (서버 사이드 단발성 번역)
│   ├── supabase.ts                   # Supabase 클라이언트 (브라우저 싱글톤 + admin)
│   ├── glossary.ts                   # Glossary 로드, buildSystemPrompt, findTerms
│   ├── fetch-with-retry.ts           # fetch 재시도 유틸 (3회, 10s 타임아웃, 지수 백오프)
│   └── env-check.ts                  # 환경 변수 유효성 검사 (validateEnv)
│
├── store/                            # Zustand 상태 관리
│   ├── sessionStore.ts               # 세션 상태
│   └── transcriptStore.ts            # 트랜스크립트 상태 (현재 미사용)
│
├── glossary/                         # 의료 용어 사전 JSON (11개 언어, 각 95개 항목)
│   ├── ko-th.json                    # 한-태 (피부과/미용 시술 위주)
│   ├── ko-vi.json                    # 한-베
│   ├── ko-en.json                    # 한-영
│   ├── ko-id.json                    # 한-인도네시아어
│   ├── ko-es.json                    # 한-스페인어
│   ├── ko-mn.json                    # 한-몽골어
│   ├── ko-yue.json                   # 한-광동어
│   ├── ko-zh.json                    # 한-북경어
│   ├── ko-ja.json                    # 한-일본어
│   ├── ko-fr.json                    # 한-프랑스어
│   └── ko-de.json                    # 한-독일어
│
├── public/
│   └── audio-processor.js            # AudioWorklet 프로세서 (PCM 16kHz 캡처)
│
├── supabase/                         # Supabase DB 스키마 및 마이그레이션
│   ├── schema.sql                    # 초기 스키마 (hospitals, sessions + RLS)
│   └── migrations/
│       ├── 20260316_add_languages.sql          # en, id 언어 추가
│       ├── 20260324_add_all_languages.sql       # 11개 언어 전체 추가
│       ├── 20260325_add_new_languages.sql       # patient_lang CHECK 제약 최종 갱신
│       └── 20260326_zombie_cleanup.sql          # cleanup_zombie_sessions() DB 함수
│
├── types/
│   └── index.ts                      # 공통 타입 정의
│
├── vercel.json                       # Vercel 배포 설정 (framework, regions: icn1)
├── .env.example                      # 환경 변수 예시
├── next.config.mjs                   # Next.js 설정
├── tailwind.config.ts                # Tailwind CSS 설정
├── tsconfig.json                     # TypeScript 설정
└── package.json                      # 의존성 목록
```

---

## 10. 개발 로드맵 (Development Roadmap)

### Phase 1 — v1 (2-Device WebSocket) [완료, 폐기]
v1 구현 완료 후 v2 1-Device PTT 모델로 전환, 이후 v3 Full-Duplex로 재구현됨.

---

### Phase 2 — v2 (1-Device Half-Duplex PTT) [완료, v3로 교체]
Supabase 도입, PTT 버튼 2개, Google Cloud STT+Translation+TTS 파이프라인 구현.

---

### Phase 3 — v3 (Gemini Live API Full-Duplex) [완료]

| 항목 | 내용 |
|------|------|
| 목표 | Gemini Live API 단일 통합으로 STT+번역+TTS 처리, PTT 제거 |
| 주요 작업 | @google/genai SDK 도입, GeminiLiveSession 구현, AudioWorklet, AudioStreamer, 11개 언어 확장 |
| 완료 기준 | 마이크 상시 켬 → 발화 감지 → 자동 번역 → TTS 재생 + 프롬프터 표시 |

---

### 남은 작업 (참고: work.md 우선순위 목록)

| 항목 | 내용 |
|------|------|
| types/index.ts GlossaryEntry 정리 | lib/glossary.ts 타입과 통합 (현재 th/vi만 포함) |
| v1 잔존 코드 제거 | app/join/, HalfDuplexPTT.tsx 등 불필요 파일 삭제 |

---

### Phase 3 ~ Phase 6 [완료 — v1/v2 레거시 계획, v3에서 대체됨]

> v3 전환으로 QR 코드, socket.io, Google Cloud STT/Translation/TTS, Cloud Run 배포 단계는 모두 완료 처리되었다.
> 현재 시스템은 Gemini Live API + Supabase + Vercel 기반으로 운영 중이다.
> 남은 작업은 위 "남은 작업" 섹션 및 `work.md` 참조.

---

### 병렬 개발 전략

동시에 여러 세션에서 개발할 경우 다음과 같이 역할을 분담한다.

| 세션 | 담당 영역 | 주요 파일 |
|------|-----------|-----------|
| 세션 A | 프론트엔드 | `app/`, `components/`, `store/` |
| 세션 B | 백엔드 + DB | `app/api/`, `lib/supabase.ts`, `supabase/` |
| 세션 C | Gemini Live + Glossary | `lib/gemini-client.ts`, `lib/glossary.ts`, `glossary/` |
| 세션 D | 배포 + 인프라 | `vercel.json`, `.env.local`, Supabase 마이그레이션 |

---

## 11. 환경 설정 (Environment Setup)

### Supabase 설정

- [ ] Supabase 프로젝트 생성 (https://supabase.com)
- [ ] SQL Editor에서 `supabase/schema.sql` 실행 (hospitals, sessions 테이블 + RLS)
- [ ] SQL Editor에서 마이그레이션 순서대로 실행:
  - `supabase/migrations/20260316_add_languages.sql`
  - `supabase/migrations/20260324_add_all_languages.sql`
- [ ] Authentication → Email 로그인 활성화
- [ ] 병원 계정 생성 (Authentication → Users → 사용자 추가)
- [ ] hospitals 테이블에 병원 레코드 삽입 (auth_user_id 연결)
- [ ] Project Settings → API → URL, anon key, service_role key 복사

---

### Google AI Studio 설정

- [ ] https://aistudio.google.com 에서 API key 발급
- [ ] Gemini API — gemini-2.5-flash-native-audio-preview 모델 접근 확인

---

### Vercel 배포 설정

- [ ] Vercel 프로젝트 생성 및 Git 연결
- [ ] Environment Variables 등록 (아래 목록 참조)
- [ ] Region: icn1 (Seoul) — vercel.json에 설정됨

---

### 환경 변수 목록 (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 사이드 전용, NEXT_PUBLIC_ 붙이지 않음

# Gemini API (Google AI Studio)
GEMINI_API_KEY=

# 앱 설정
NEXT_PUBLIC_APP_URL=https://medtranslate.kr
```

---

## 12. 비용 분석 (Cost Analysis)

> v3.0 기준 — Google Cloud STT/Translation/TTS 3개 API 비용이 Gemini Live API 단일 비용으로 통합됨.

### 초기 비용

| 항목 | 비용 |
|------|------|
| Google AI Studio 무료 티어 | 무료 (일정 한도 내) |
| Supabase Free tier | 무료 (500MB DB, 50,000 Auth MAU) |
| Vercel Hobby | 무료 (개인 프로젝트) |
| 도메인 (medtranslate.kr) | 약 ₩20,000/년 |
| **초기 총비용** | **약 ₩20,000/년** |

---

### 월간 운영 비용 (병원 10곳 기준)

가정: 병원 1곳당 월 30회 통역, 회당 평균 10분

| 서비스 | 사용량 추정 | 단가 | 월 비용 |
|--------|------------|------|---------|
| Gemini Live API (gemini-2.5-flash) | 3,000분 오디오 입출력 | 정확한 단가 Google AI 정책 참조 | 추정 중 |
| Supabase (Pro tier, 필요 시) | DB 읽기/쓰기 소량 | $25/월 | ₩35,000 |
| Vercel (Pro, 필요 시) | Serverless 실행 | $20/월 | ₩28,000 |
| **합계 (Pro tier 기준)** | | | **약 ₩60,000~ + Gemini API** |

> Gemini Live API 가격은 Google AI Studio 요금제 참조. 단일 API 통합으로 v2(STT+Translation+TTS 3개 API) 대비 청구 단순화.

---

### 통역사 파견 대비 비용 비교

| 구분 | 비용 |
|------|------|
| 통역사 파견 (병원 10곳, 월 30회) | 약 ₩600만원~1,200만원 |
| MedTranslate (병원 10곳) | 약 ₩10~12만원 |
| **절감 효과** | **10~100배 절감** |

---

## 13. 의료 용어 사전 초기 데이터 (Glossary Initial Data)

### 한-태 (ko-th) / 한-베 (ko-vi) 의료 용어 샘플

| 카테고리 | 한국어 | 태국어 (th) | 베트남어 (vi) |
|----------|--------|-------------|----------------|
| 접수 | 접수 | การลงทะเบียน | Đăng ký |
| 접수 | 대기실 | ห้องรอ | Phòng chờ |
| 접수 | 진료실 | ห้องตรวจ | Phòng khám |
| 접수 | 예약 | การนัดหมาย | Đặt lịch hẹn |
| 접수 | 수납 | การชำระเงิน | Thanh toán |
| 보험 | 보험 | ประกันภัย | Bảo hiểm |
| 보험 | 보험카드 | บัตรประกันภัย | Thẻ bảo hiểm |
| 증상 | 통증 | ความเจ็บปวด | Đau |
| 증상 | 발열 | ไข้ | Sốt |
| 증상 | 두통 | ปวดหัว | Đau đầu |
| 증상 | 복통 | ปวดท้อง | Đau bụng |
| 증상 | 어지러움 | วิงเวียน | Chóng mặt |
| 증상 | 기침 | ไอ | Ho |
| 증상 | 구토 | อาเจียน | Nôn |
| 증상 | 알레르기 | การแพ้ | Dị ứng |
| 검사 | 혈액검사 | การตรวจเลือด | Xét nghiệm máu |
| 검사 | 소변검사 | การตรวจปัสสาวะ | Xét nghiệm nước tiểu |
| 검사 | 내시경 | การส่องกล้อง | Nội soi |
| 검사 | X-ray | เอกซเรย์ | Chụp X-quang |
| 검사 | MRI | MRI | MRI |
| 처치 | 마취 | การดมยาสลบ | Gây mê |
| 처치 | 수술 | การผ่าตัด | Phẫu thuật |
| 처치 | 입원 | การรับตัวผู้ป่วย | Nhập viện |
| 처치 | 퇴원 | การออกจากโรงพยาบาล | Xuất viện |
| 처치 | 주사 | การฉีดยา | Tiêm thuốc |
| 약품 | 처방전 | ใบสั่งยา | Đơn thuốc |
| 약품 | 약국 | ร้านขายยา | Nhà thuốc |
| 약품 | 진통제 | ยาแก้ปวด | Thuốc giảm đau |
| 약품 | 항생제 | ยาปฏิชีวนะ | Kháng sinh |
| 약품 | 식후 복용 | รับประทานหลังอาหาร | Uống sau bữa ăn |

> 전체 데이터는 `glossary/ko-th.json` 등 11개 언어 JSON 파일로 관리 (피부과/미용 시술 용어 위주, 95개 항목 구현 완료).
> buildSystemPrompt()가 Gemini Live system_instruction에 자동 주입. DB 불필요.

---

## 14. 성공 지표 (Success Metrics)

| 지표 | 목표값 | 측정 방법 |
|------|--------|-----------|
| 번역 정확도 | 95% 이상 | 의료 전문가 샘플 검수 |
| 음성 인식 정확도 (WER) | 10% 이하 (Word Error Rate) | STT 결과 샘플 검수 |
| 전체 응답 지연시간 | 2초 이내 | 발화 종료 → 음성 출력 시간 측정 |
| Gemini Live 연결 성공률 | 99% 이상 | Vercel 로그 분석 |
| 세션 완료율 | 80% 이상 (에러 없이 종료) | Supabase sessions 상태 분석 |
| 사용자 만족도 | 4.0 / 5.0 이상 | 사용 후 짧은 피드백 수집 |
| 월간 활성 병원 수 | 런칭 3개월 내 10곳 | Supabase sessions 집계 |
| 통역 세션 수 | 월 300건 이상 (10곳 기준) | Supabase sessions 테이블 집계 |

---

## 15. 리스크 및 대응 방안 (Risks & Mitigation)

### 기술적 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| Gemini Live 의료 용어 인식 부정확 | 높음 | Glossary system_instruction 주입 + 지속 개선 |
| iOS Safari AudioWorklet 미지원 이슈 | 높음 | getUserMedia + ScriptProcessor 폴백 구현 고려 |
| Gemini Live WebSocket 연결 불안정 | 중간 | 자동 재연결 구현 완료 (지수 백오프, 최대 5회), disconnected 상태 UI 표시 |
| Gemini API 할당량 / 응답 지연 | 중간 | thinkingBudget:0으로 지연 최소화, 할당량 모니터링 |
| Vercel Serverless cold start | 낮음 | /api/gemini-token은 경량 — 영향 미미 |
| 번역 지연 2초 초과 | 중간 | Gemini Live는 스트리밍 응답, 체감 지연 최소화 |

---

### 비즈니스 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| 병원 초기 채택률 저조 | 높음 | 외국인 환자 비율 높은 병원 우선 타겟, 무료 체험 제공 |
| 번역 오류로 인한 의료 사고 우려 | 높음 | "참고용 보조 통역 도구" 명확히 안내, 중요 내용은 서면 확인 권장 |
| 경쟁 서비스 출현 | 낮음 | 의료 특화 Glossary, 빠른 시장 진입이 경쟁 우위 |
| Google API 비용 급증 | 중간 | 사용량 알림 설정, 병원별 월 사용량 상한 설정 |
| 개인정보 보호 규정 위반 우려 | 높음 | 음성 데이터 비저장 원칙 준수, 개인정보처리방침 수립, HTTPS 강제 |
