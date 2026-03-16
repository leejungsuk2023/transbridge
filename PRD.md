# MedTranslate — Product Requirements Document (PRD)

> 작성일: 2026-03-03
> 버전: v1.0

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

병원 접수대에 비치된 안드로이드 기기 1대와 오픈핏 이어폰을 이용해, 병원 직원과 외국인 환자가 PTT(누르고 말하기) 방식으로 지연 없는 실시간 음성 통역(STS)과 프롬프터 자막을 주고받는 대면 통역 솔루션

### 배경 및 동기

국내 외국인 환자 수는 지속적으로 증가하고 있으나, 의료 현장에서의 언어 장벽은 여전히 큰 문제다. 기존 통역사 파견 서비스는 비용이 높고(월 ₩600만원 이상), 즉각적인 대응이 어렵다. 특히 태국인 및 베트남인 환자 비율이 높은 병원에서 실시간 통역 수요가 높음에도 불구하고, 별도 앱 설치 없이 즉시 사용할 수 있는 솔루션이 부재한 상황이다.

### 목표

- 병원 접수부터 진료, 수납까지 전 과정에서 언어 장벽 없이 원활한 의사소통 제공
- **단일 디바이스** 기반 대면 통역으로, 기기 관리·교육 복잡도 최소화
- 통역사 파견 대비 10배 이상의 비용 절감
- 환자 경험 향상 및 병원 서비스 품질 제고
- Google Cloud STT/Translation/TTS를 활용한 정확도 높은 실시간 음성 통역(STS) 제공

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
| 역할 | 태국인 또는 베트남인 환자 |
| 환경 | 병원 대기실 또는 접수대, 개인 스마트폰 |
| 기술 수준 | 기본적인 스마트폰 사용 가능, QR 스캔 경험 있음 |
| 주요 언어 | 태국어 (th) 또는 베트남어 (vi) |

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

> v2.0부터는 QR 기반 2-Device 구조를 폐기하고, **단일 디바이스 대면형 STS 모델**을 사용한다.

### 흐름 A — 병원 실장(직원) 흐름

```
1. 웹앱 접속 (medtranslate.kr) — 병원 접수대에 고정 비치된 안드로이드 기기
        |
2. 이메일 + 비밀번호로 로그인 (Firebase Auth)
        |
3. 대시보드에서 환자 언어(태국어/베트남어) 선택 후 "새 통역 시작" 버튼 클릭
        |
4. 화면이 상·하단으로 분할 렌더링 (상단: 환자용, 하단: 직원용)
        |
5. 환자에게 소독된 오픈핏(Open-ear) 이어폰 제공 및 착용 안내
        |
6. 직원이 하단의 '한국어 마이크' PTT 버튼을 누른 상태에서 발화
        |
7. 기기 내 STT → Glossary 교정 → 번역 → TTS 파이프라인 실행
        |
8. 환자 이어폰으로 태국어/베트남어 음성 출력
        |
9. 화면 중앙 프롬프터 영역에 번역 문장 1줄을 크게 표시
        |
10. 필요 시 통역 반복, 종료 시 "세션 종료" 버튼 클릭
```

---

### 흐름 B — 외국인 환자 흐름

```
1. 병원 접수대에서 안내를 받고, 오픈핏 이어폰을 착용
        |
2. 직원이 세션을 시작하면, 환자는 상단 화면에 자신의 언어(태국어/베트남어)를 확인
        |
3. 직원 발화 후, 본인 언어의 번역 음성이 이어폰으로 재생
        |
4. 동시에 화면 중앙 프롬프터에 번역 텍스트가 크게 표시되어 내용을 시각적으로 확인
        |
5. 본인이 말할 때는 상단의 '태국어/베트남어 마이크' PTT 버튼을 터치한 뒤 발화
        |
6. 기기에서 역방향 STT → Glossary 교정 → 번역 → TTS 실행
        |
7. 직원 쪽 스피커/이어폰으로 한국어 음성 출력 + 화면에 한국어 문장 표시
        |
8. 진료/접수 흐름이 종료되면 세션 종료 안내 후 이어폰 회수 및 소독
```

---

### 흐름 C — 단일 디바이스 번역 파이프라인 흐름

```
[공용 디바이스(안드로이드 웹앱)]
        |
1. 직원/환자 중 한 명이 PTT 버튼을 누름 (Half-Duplex, 한쪽만 활성)
        |
2. 마이크 캡처 (AudioWorklet 또는 MediaRecorder — PCM 오디오 스트림)
        |
3. Next.js API Route로 오디오 업로드 (HTTPS, 단일 디바이스 → 서버)
        |
[서버 — Next.js API Routes + Google Cloud]
        |
4. Google Cloud STT v2 → 텍스트 변환 (단일 화자 인식)
        |
5. 의료 용어 사전(Glossary) 적용 → 번역 정확도 향상
        |
6. Google Cloud Translation → 대상 언어로 번역
        |
7. Google Cloud TTS (WaveNet) → 번역 텍스트를 음성 합성
        |
[공용 디바이스]
        |
8. 합성된 오디오를 이어폰/스피커로 재생
        |
9. 화면 중앙 프롬프터에 번역 문장 1줄만 크게 표시 (Glossary 단어 하이라이팅)
        |
10. 오디오·텍스트는 세션 종료 후 즉시 폐기 (저장하지 않음)
```

---

## 4. 기능 요구사항 (Functional Requirements)

### FR-1: Half-Duplex(반이중) 오디오 제어

| 항목 | 내용 |
|------|------|
| 목적 | 하울링, 에코, 동시 발화로 인한 음성 품질 저하 방지 |
| 방식 | 두 개의 PTT(누르고 말하기) 소프트웨어 버튼으로 단일 발화만 허용 |

**상세 요구사항**
- 직원용 PTT 버튼(한국어)과 환자용 PTT 버튼(태국어/베트남어) 두 개를 제공한다.
- 한쪽 PTT 버튼이 **눌려 있는 동안** 다른 쪽 마이크 입력은 시스템 레벨에서 비활성화한다.
- TTS 음성이 재생 중일 때는 두 PTT 버튼 모두 비활성화하여, 재생 중 발화로 인한 하울링을 방지한다.
- 버튼 상태(대기/녹음 중/재생 중)를 색상·아이콘으로 명확히 구분한다.

---

### FR-2: 대형 프롬프터 UI 및 용어 하이라이팅

| 항목 | 내용 |
|------|------|
| 목적 | 청취·시청이 어려운 상황에서도 의료 정보를 명확하게 전달 |
| 구성 | 화면 중앙에 현재 발화에 대한 번역 문장 1줄만 크게 표시 |

**상세 요구사항**
- 이전 버전의 **대화형 말풍선 UI는 사용하지 않는다.**
- 현재 완료된 **마지막 문장 1개만** 전체 화면에 가까운 크기로 표시한다.
- `glossary/ko-th.json`, `glossary/ko-vi.json`에 정의된 의료 용어는:
  - 색상(예: 금색/강조색)과 굵기(Bold)를 사용해 시각적으로 돋보이게 렌더링한다.
  - 필요 시 하단에 원문/번역 용어를 작은 툴팁/설명으로 함께 표기할 수 있다.
- 프롬프터 문장은 직원·환자 어느 쪽 발화이든 동일한 형식으로 표시하되,
  - 상단에는 **“직원 발화 / 환자 발화”** 라벨을 부가적으로 명시한다.

---

> 아래 FR-1~FR-8(기존 번호)은 **v1(QR 기반 2-Device) 설계를 참고용으로 유지**하며, 실제 구현에서는
> QR 코드 생성/스캔, WebSocket 기반 다중 디바이스 동기화 기능은 v2.0에서 사용하지 않는다.

### FR-1: 병원 계정 관리

| 항목 | 내용 |
|------|------|
| 인증 수단 | 이메일 + 비밀번호 (Firebase Authentication) |
| 계정 생성 | 관리자가 Firebase Console에서 직접 생성 (초기) |
| 로그인 유지 | Firebase 세션 기반, 브라우저 재시작 후에도 유지 |
| 로그아웃 | 대시보드에서 로그아웃 버튼 제공 |

**상세 요구사항**
- 로그인 실패 시 명확한 에러 메시지 표시
- 비인가 접근 시 로그인 페이지로 자동 리디렉션
- Firebase Auth의 ID 토큰으로 API Route 인증 처리

---

### FR-2: 세션 관리

**세션 생성**
- 병원 실장이 "새 통역 시작" 버튼 클릭 시 세션 자동 생성
- 세션 ID는 UUID v4로 생성
- Firestore `sessions` 컬렉션에 세션 문서 저장
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
- Firestore 실시간 리스너로 상태 변화 감지

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

- Firestore `glossary` 컬렉션에 저장
- 한국어 기준 키로 태국어/베트남어 번역 제공
- Google Cloud Translation API의 Custom Glossary 기능에 연동
- 카테고리별 분류: 접수, 진료, 검사, 처치, 약품, 증상, 보험 등
- 초기 150개 이상의 의료 용어 제공 (아래 §13 참고)

---

## 5. 비기능 요구사항 (Non-Functional Requirements)

### 성능 (Performance)

| 항목 | 목표 |
|------|------|
| 번역 전체 지연시간 (Latency) | 2초 이내 (발화 종료 → 번역 음성 출력) |
| STT 응답 시간 | 1초 이내 |
| WebSocket 연결 수립 시간 | 3초 이내 |
| 페이지 초기 로드 시간 | 3초 이내 (LTE 환경) |
| 동시 세션 처리 | Cloud Run 자동 스케일링으로 대응 |

---

### 보안 (Security)

- 음성 데이터는 Firestore에 저장하지 않음 — 실시간 처리 후 즉시 삭제 (개인정보 보호법 준수)
- 모든 통신은 HTTPS / WSS (WebSocket Secure) 사용
- Firebase Auth ID 토큰으로 API Route 접근 인증
- 세션 URL은 추측 불가능한 UUID v4 형태
- Firestore Security Rules로 데이터 접근 제어
- 환경 변수에 API 키 저장, 코드에 하드코딩 금지

---

### 확장성 (Scalability)

- Google Cloud Run: 요청량에 따른 자동 스케일 업/다운
- Firestore: 서버리스 NoSQL로 자동 확장
- 서울 리전 (asia-northeast3) 배포로 국내 사용자 지연시간 최소화
- WebSocket 서버는 Cloud Run 단일 인스턴스 내 socket.io로 처리 (초기)
- 규모 확장 시 Redis Adapter 추가로 다중 인스턴스 지원 가능

---

### 가용성 (Availability)

- 서비스 목표 가용성: 99.5% 이상
- Cloud Run의 자동 재시작 및 헬스체크 활용
- Firestore 99.999% SLA 활용

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

- **현재(v2)**:  
  - 구조: **단일 디바이스(안드로이드 웹앱)** → Next.js API Routes → Google Cloud(STT/Translation/TTS)  
  - 역할: 한 기기에서 직원·환자 양쪽 발화를 번갈아 PTT로 입력하고, 번역 결과를 이어폰/프롬프터로 출력
  - 효과: QR/세션 동기화·다중 디바이스 연결 복잡도가 사라지고, 단일 브라우저의 `AudioContext` 및 `MediaRecorder/AudioWorklet`이 오디오 I/O를 전담

> socket.io WebSocket 서버는 향후 다중 디바이스 모드(v1 스타일)를 다시 지원할 필요가 있을 때를 대비해 보조 옵션으로 유지할 수 있으나, v2 기본 시나리오에서는 사용하지 않는다.

---

### 기술 스택 테이블

| 영역 | 기술 | 버전/비고 |
|------|------|-----------|
| 프론트엔드 | Next.js (App Router) | 14.x |
| 백엔드 | Next.js API Routes | 14.x |
| 실시간 통신 | (v1) socket.io / (v2) HTTPS API 기반 단일 디바이스 STS | 4.x / Next.js API Routes |
| 서버 인프라 | Google Cloud Run | 서울 리전 (asia-northeast3) |
| 데이터베이스 | Firestore (Firebase) | NoSQL |
| 인증 | Firebase Authentication | 이메일/비밀번호 |
| STT | Google Cloud Speech-to-Text v2 | 스트리밍 |
| 번역 | Google Cloud Translation API | v3 (AutoML Glossary) |
| TTS | Google Cloud Text-to-Speech | WaveNet |
| CI/CD | Cloud Build + Cloud Run | 자동 배포 |
| 도메인 | medtranslate.kr | Cloud Run 연결 |

---

### 프론트엔드 주요 라이브러리

| 라이브러리 | 용도 |
|------------|------|
| Tailwind CSS | UI 스타일링 |
| qrcode.react | QR코드 생성 및 표시 |
| html5-qrcode | 브라우저 카메라로 QR 스캔 |
| socket.io-client | WebSocket 실시간 통신 클라이언트 |
| Web Audio API + AudioWorklet | 마이크 오디오 실시간 캡처 및 처리 (단일 디바이스 PTT) |
| Zustand | 전역 상태 관리 |

---

### 시스템 아키텍처 다이어그램

```
+---------------------------------------------------+
|        단일 디바이스 (안드로이드 웹앱)            |
|  - 직원 화면(하단) / 환자 화면(상단) 분할        |
|  - PTT 버튼 2개 (직원/환자)                       |
|  - Web Audio API + AudioWorklet/MediaRecorder     |
+-------------------------+-------------------------+
                          |
                          |  HTTPS (API Routes)
                          v
                 +------------------------+
                 |   Google Cloud Run    |
                 |  (Next.js API Routes) |
                 |                        |
                 |  +------------------+  |
                 |  | Translation      |  |
                 |  | Pipeline         |  |
                 |  +--------+---------+  |
                 +-----------+------------+
                             |
                +------------+-------------+
                |            |             |
          +-----+---+   +----+-----+  +----+----+
          | Cloud  |   | Cloud  |   | Cloud  |
          |  STT   |   |Translate|   |  TTS   |
          +--------+   +---------+   +--------+
                             |
                   +---------+---------+
                   |     Firestore     |
                   | (hospitals,       |
                   |  sessions,        |
                   |  glossary)        |
                   +---------+---------+
                             |
                     +-------+-------+
                     |   Firebase    |
                     |     Auth      |
                     +---------------+
```

---

### 하드웨어 요구사항 (Hardware Requirements, v2)

| 항목 | 요구사항 |
|------|----------|
| 메인 디바이스 | 안드로이드 스마트폰 또는 태블릿 1대 (접수대 고정 비치, 크롬/웹뷰 최신 버전) |
| 오디오 출력 | 귀를 막지 않는 오픈핏(Open-ear) 블루투스 이어폰 (예: Shokz OpenFit, OpenFit Air 등) |
| 마이크 입력 | 디바이스 내장 마이크 우선, 필요 시 외장 마이크(테이블 마이크) 지원 |
| 입력 제어 | 화면 분할 터치 UI를 통한 PTT 버튼 2개 (직원/환자). 향후 블루투스 프리젠터/풋스위치와의 연동을 옵션으로 고려 |
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

| 언어 | STT 코드 | Translation 코드 | TTS 코드 | TTS 음성 |
|------|----------|-----------------|---------|---------|
| 한국어 | ko-KR | ko | ko-KR | ko-KR-Wavenet-A |
| 태국어 | th-TH | th | th-TH | th-TH-Standard-A |
| 베트남어 | vi-VN | vi | vi-VN | vi-VN-Wavenet-A |

---

## 7. 데이터 모델 (Data Model)

### Firestore 컬렉션: `hospitals`

| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | string | Firebase Auth UID (문서 ID) |
| name | string | 병원명 |
| email | string | 로그인 이메일 |
| plan | string | 플랜 구분 (`free` / `basic` / `pro`) |
| createdAt | Timestamp | 계정 생성 일시 |

---

### Firestore 컬렉션: `sessions`

| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | string | UUID v4 (문서 ID) |
| hospitalId | string | hospitals 컬렉션 참조 ID |
| patientLang | string | 환자 언어 코드 (`th` / `vi`) |
| status | string | 세션 상태 (`waiting` / `active` / `ended`) |
| startedAt | Timestamp | 세션 시작 일시 |
| endedAt | Timestamp | 세션 종료 일시 (종료 시 업데이트) |
| durationSec | number | 통역 총 시간 (초, 종료 시 계산) |

> 음성 데이터 및 대화 내용은 Firestore에 저장하지 않음 (개인정보 보호)

---

### Firestore 컬렉션: `glossary`

| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | string | 자동 생성 문서 ID |
| ko | string | 한국어 용어 |
| th | string | 태국어 번역 |
| vi | string | 베트남어 번역 |
| category | string | 카테고리 (접수 / 진료 / 검사 / 처치 / 약품 / 증상 / 보험) |

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
- Firebase Auth `signInWithEmailAndPassword()` 호출
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
- "새 통역 시작" 버튼 (대형, 파란색 CTA)
- QR코드 표시 영역 (세션 생성 후 표시)
- QR코드 인쇄 버튼
- 사용량 통계 카드 (3개):
  - 이번 달 통역 건수
  - 이번 달 총 통역 시간
  - 언어별 건수
- 최근 세션 목록 (테이블 형태)

**동작**
- "새 통역 시작" 클릭 → `POST /api/session` 호출 → 세션 생성 → QR 코드 렌더링
- QR 코드는 세션이 `active` 또는 `waiting` 상태일 때만 표시
- 세션 종료 후 목록에 자동 추가
- Firestore 실시간 리스너로 세션 목록 자동 업데이트

---

### 화면 3: 환자 입장 페이지

| 항목 | 내용 |
|------|------|
| 경로 | `/join/[id]` |
| 접근 조건 | 없음 (누구나 접근 가능, 세션 ID만 필요) |

**구성 요소**

*Step 1 — 언어 선택*
- "언어를 선택하세요 / กรุณาเลือกภาษา / Vui lòng chọn ngôn ngữ" 안내 문구
- [ภาษาไทย (태국어)] 버튼 — 크게, 태국 국기 아이콘
- [Tiếng Việt (베트남어)] 버튼 — 크게, 베트남 국기 아이콘

*Step 2 — 마이크 허용 안내*
- 마이크 아이콘 + 안내 문구 (자국어로 표시)
  - 태국어: "กรุณาอนุญาตการเข้าถึงไมโครโฟน"
  - 베트남어: "Vui lòng cho phép truy cập micrô"
- "연결 시작 / เริ่มต้น / Bắt đầu" 버튼

**동작**
- 세션 ID의 유효성 Firestore에서 검증 (없거나 `ended` 상태면 에러 표시)
- 언어 선택 후 Firestore 세션 문서의 `patientLang` 업데이트
- 마이크 권한 요청 (`navigator.mediaDevices.getUserMedia`)
- 권한 허용 시 `/session/[id]?role=patient` 로 이동

---

### 화면 4: 통역 세션 페이지

| 항목 | 내용 |
|------|------|
| 경로 | `/session/[id]` |
| 접근 조건 | 세션 ID 유효, 역할(role) 파라미터 있음 |

**구성 요소**
- 상단 상태 바:
  - 연결 상태 인디케이터 (초록: 연결됨 / 빨강: 끊김)
  - 세션 경과 시간 타이머
  - 언어 표시 (예: 한국어 ↔ 태국어)
- 말풍선 대화 영역 (스크롤 가능)
  - 내 발화: 오른쪽 정렬 말풍선 (원문)
  - 상대방 발화: 왼쪽 정렬 말풍선 (원문 + 번역)
- 파형 애니메이션 영역
  - 발화 중: 실시간 파형
  - 번역 음성 재생 중: 재생 파형
- 하단 컨트롤:
  - 마이크 버튼 (누르고 있는 동안 발화 / Push-to-Talk)
  - 세션 종료 버튼 (실장 역할만 표시)

**동작**
- 페이지 진입 시 socket.io 연결 수립 및 세션 Room 참여
- 마이크 버튼 누름 → AudioWorklet 시작 → 서버로 오디오 스트리밍
- 버튼 뗌 → 스트리밍 중단 → STT 최종 결과 수신 대기
- `translation` 이벤트 수신 → 말풍선 렌더링 → 음성 자동 재생

**UX 포인트**
- 말풍선 새 메시지 수신 시 자동 하단 스크롤
- "상대방이 말하는 중..." 인디케이터 (발화 감지 시)
- 번역 음성 재생 중에는 마이크 버튼 비활성화 (에코 방지)
- 네트워크 끊김 시 "재연결 중..." 오버레이 표시

---

## 9. 프로젝트 구조 (Project Structure)

```
medtranslate/
├── app/                              # Next.js App Router 루트
│   ├── page.tsx                      # 로그인 페이지 (/)
│   ├── dashboard/
│   │   └── page.tsx                  # 대시보드 (/dashboard)
│   ├── session/
│   │   └── [id]/
│   │       └── page.tsx              # 통역 세션 UI (/session/[id])
│   ├── join/
│   │   └── [id]/
│   │       └── page.tsx              # 환자 입장 (/join/[id])
│   └── api/
│       ├── session/
│       │   └── route.ts              # 세션 생성/조회/종료 API
│       ├── translate/
│       │   └── route.ts              # 번역 테스트 API (개발용)
│       └── auth/
│           └── route.ts              # 인증 관련 API
│
├── components/                       # 재사용 가능한 React 컴포넌트
│   ├── QRCode.tsx                    # QR코드 생성 컴포넌트 (qrcode.react)
│   ├── QRScanner.tsx                 # QR 스캔 컴포넌트 (html5-qrcode)
│   ├── AudioWorklet.tsx              # 마이크 오디오 캡처 컴포넌트
│   ├── Transcript.tsx                # 말풍선 대화 목록 컴포넌트
│   ├── WaveformAnimation.tsx         # 파형 애니메이션 컴포넌트
│   ├── LanguageSelector.tsx          # 언어 선택 UI 컴포넌트
│   └── ConnectionStatus.tsx          # 연결 상태 표시 컴포넌트
│
├── lib/                              # 외부 서비스 연동 및 유틸리티
│   ├── google-stt.ts                 # Google Cloud STT v2 클라이언트
│   ├── google-translate.ts           # Google Cloud Translation 클라이언트
│   ├── google-tts.ts                 # Google Cloud TTS 클라이언트
│   ├── firebase.ts                   # Firebase 초기화 및 Firestore 헬퍼
│   ├── socket.ts                     # socket.io 클라이언트 초기화
│   └── glossary.ts                   # 의료 용어 사전 로딩 및 적용 유틸
│
├── server/                           # 서버 사이드 로직
│   ├── websocket.ts                  # socket.io 서버 설정 및 이벤트 핸들러
│   └── translation-pipeline.ts       # STT → Translation → TTS 파이프라인
│
├── store/                            # Zustand 전역 상태 관리
│   ├── sessionStore.ts               # 세션 상태 (id, status, lang)
│   └── transcriptStore.ts            # 대화 내용 상태 (말풍선 목록)
│
├── glossary/                         # 의료 용어 사전 JSON 데이터
│   ├── ko-th.json                    # 한-태 의료 용어 사전
│   └── ko-vi.json                    # 한-베 의료 용어 사전
│
├── public/                           # 정적 파일
│   ├── icons/                        # 국기 아이콘, 마이크 아이콘 등
│   └── logo.svg                      # MedTranslate 로고
│
├── types/                            # TypeScript 타입 정의
│   └── index.ts                      # 공통 타입 (Session, Transcript 등)
│
├── Dockerfile                        # Cloud Run 배포용 Docker 이미지
├── .env.local                        # 환경 변수 (로컬 개발용, git 제외)
├── .env.example                      # 환경 변수 예시 파일
├── next.config.js                    # Next.js 설정 (WebSocket 서버 포함)
├── tailwind.config.js                # Tailwind CSS 설정
├── tsconfig.json                     # TypeScript 설정
└── package.json                      # 의존성 목록
```

---

## 10. 개발 로드맵 (Development Roadmap)

### Phase 1 — 프로젝트 셋업 + 기본 UI (1주)

| 항목 | 내용 |
|------|------|
| 목표 | 개발 환경 구축 및 기본 UI 골격 완성 |
| 주요 작업 | Next.js 프로젝트 초기화, Tailwind 설정, Firebase 초기화, 로그인 화면, 대시보드 기본 레이아웃, Dockerfile 작성 |
| 완료 기준 | `npm run dev` 실행 시 로그인 → 대시보드 이동 동작 확인 |
| 예상 기간 | 5~7일 |

---

### Phase 2 — Firebase 인증 + Firestore (3일)

| 항목 | 내용 |
|------|------|
| 목표 | 인증 및 데이터베이스 연동 완성 |
| 주요 작업 | Firebase Auth 로그인/로그아웃, Firestore Security Rules, 세션 생성 API (`POST /api/session`), 세션 목록 실시간 리스너 |
| 완료 기준 | 로그인 후 세션 생성 시 Firestore에 문서 저장 및 대시보드 목록 표시 |
| 예상 기간 | 2~3일 |

---

### Phase 3 — QR 코드 + 세션 연결 (3일)

| 항목 | 내용 |
|------|------|
| 목표 | QR 생성 및 환자 입장 흐름 완성 |
| 주요 작업 | qrcode.react로 QR 생성, html5-qrcode로 QR 스캔, 언어 선택 UI, 마이크 권한 요청, socket.io 기본 연결 |
| 완료 기준 | QR 스캔 후 환자가 세션에 참여하고 양쪽이 WebSocket으로 연결 |
| 예상 기간 | 3일 |

---

### Phase 4 — 번역 파이프라인 핵심 구현 (1~2주)

| 항목 | 내용 |
|------|------|
| 목표 | 실시간 음성 통역 동작 완성 (전체 개발의 70%) |
| 주요 작업 | AudioWorklet 마이크 캡처, Google STT v2 스트리밍 연동, Google Translation 연동, Google TTS 연동, Translation Pipeline 통합, Glossary 적용 |
| 완료 기준 | 한국어 발화 → 태국어/베트남어 음성 출력, 역방향 통역 동작 |
| 예상 기간 | 7~14일 |

---

### Phase 5 — UI 완성 + 통합 테스트 (1주)

| 항목 | 내용 |
|------|------|
| 목표 | 사용자 경험 완성 및 버그 수정 |
| 주요 작업 | 말풍선 UI 완성, 파형 애니메이션, 연결 상태 표시, 대시보드 통계 카드, 모바일 브라우저 호환성 테스트, iOS Safari 마이크 이슈 해결 |
| 완료 기준 | 실제 환경에서 병원 직원 + 외국인 환자 시나리오 엔드투엔드 동작 |
| 예상 기간 | 5~7일 |

---

### Phase 6 — 배포 + 도메인 연결 (2~3일)

| 항목 | 내용 |
|------|------|
| 목표 | 프로덕션 배포 및 운영 환경 구축 |
| 주요 작업 | Cloud Build 파이프라인 설정, Cloud Run 배포, medtranslate.kr 도메인 연결, SSL 인증서 설정, 환경 변수 설정, 모니터링 알림 설정 |
| 완료 기준 | `https://medtranslate.kr` 에서 전체 서비스 정상 동작 |
| 예상 기간 | 2~3일 |

---

### 병렬 개발 전략

동시에 여러 세션에서 개발할 경우 다음과 같이 역할을 분담한다.

| 세션 | 담당 영역 | 주요 파일 |
|------|-----------|-----------|
| 세션 A | 프론트엔드 | `app/`, `components/`, `store/` |
| 세션 B | 백엔드 + DB | `app/api/`, `lib/firebase.ts`, `server/websocket.ts` |
| 세션 C | 번역 파이프라인 | `lib/google-*.ts`, `server/translation-pipeline.ts` |
| 세션 D | 배포 + 인프라 | `Dockerfile`, `.env`, Cloud Run 설정 |

---

## 11. 환경 설정 (Environment Setup)

### Google Cloud Console 설정

- [ ] 새 프로젝트 생성 (예: `medtranslate-prod`)
- [ ] Cloud Speech-to-Text API 활성화
- [ ] Cloud Translation API 활성화
- [ ] Cloud Text-to-Speech API 활성화
- [ ] Cloud Run API 활성화
- [ ] Cloud Build API 활성화
- [ ] 서비스 계정 생성 및 JSON 키 발급
  - 역할: Cloud Speech Client, Cloud Translation API User, Cloud Text-to-Speech API User
- [ ] Cloud Run 서비스 배포 리전 설정 (asia-northeast3, 서울)

---

### Firebase Console 설정

- [ ] Firebase 프로젝트 생성 (Google Cloud 프로젝트와 연결)
- [ ] Authentication 활성화 → 이메일/비밀번호 로그인 방법 활성화
- [ ] Firestore Database 생성 (프로덕션 모드)
- [ ] Firestore Security Rules 설정
- [ ] 병원 계정 생성 (Authentication → 사용자 추가)
- [ ] Firebase 웹 앱 추가 → SDK 설정 값 복사

---

### 환경 변수 목록 (`.env.local`)

```bash
# Firebase 클라이언트 SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Google Cloud (서버 사이드)
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=

# 앱 설정
NEXT_PUBLIC_APP_URL=https://medtranslate.kr
NEXT_PUBLIC_WEBSOCKET_URL=wss://medtranslate.kr

# 서버 설정
PORT=3000
NODE_ENV=production
```

---

## 12. 비용 분석 (Cost Analysis)

### 초기 비용

| 항목 | 비용 |
|------|------|
| Google Cloud 신규 가입 크레딧 | $300 (약 ₩400,000) 무료 제공 |
| 도메인 (medtranslate.kr) | 약 ₩20,000/년 |
| 개발 초기 인프라 | Google Cloud 무료 크레딧으로 충당 가능 |
| **초기 총비용** | **약 ₩20,000 ~ ₩50,000** |

---

### 월간 운영 비용 (병원 10곳 기준)

가정: 병원 1곳당 월 30회 통역, 회당 평균 10분

| 서비스 | 사용량 추정 | 단가 | 월 비용 |
|--------|------------|------|---------|
| Google Cloud STT | 10곳 × 30회 × 10분 = 3,000분 | $0.016/분 | $48 (약 ₩64,000) |
| Google Cloud Translation | 약 50,000 자 | $20/백만자 | $1 (약 ₩1,400) |
| Google Cloud TTS | 약 100,000 자 | $16/백만자 | $1.6 (약 ₩2,200) |
| Cloud Run | 상시 최소 인스턴스 1대 | $15~30/월 | ₩20,000~40,000 |
| Firestore | 소량 읽기/쓰기 | 무료 티어 범위 내 | ₩0 |
| **합계** | | | **약 ₩90,000~120,000** |

> 실제 사용량에 따라 증감 가능. Google Cloud 프리 티어 적용 시 일부 무료.

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

> 전체 데이터는 `glossary/ko-th.json`, `glossary/ko-vi.json` 파일에 JSON 형태로 관리. 150개 이상의 용어로 초기 구성 예정.

---

## 14. 성공 지표 (Success Metrics)

| 지표 | 목표값 | 측정 방법 |
|------|--------|-----------|
| 번역 정확도 | 95% 이상 | 의료 전문가 샘플 검수 |
| 음성 인식 정확도 (WER) | 10% 이하 (Word Error Rate) | STT 결과 샘플 검수 |
| 전체 응답 지연시간 | 2초 이내 | 발화 종료 → 음성 출력 시간 측정 |
| WebSocket 연결 성공률 | 99% 이상 | 서버 로그 분석 |
| 세션 완료율 | 80% 이상 (에러 없이 종료) | Firestore 세션 상태 분석 |
| 사용자 만족도 | 4.0 / 5.0 이상 | 사용 후 짧은 피드백 수집 |
| 월간 활성 병원 수 | 런칭 3개월 내 10곳 | Firestore 세션 생성 병원 수 |
| 통역 세션 수 | 월 300건 이상 (10곳 기준) | Firestore 세션 컬렉션 집계 |

---

## 15. 리스크 및 대응 방안 (Risks & Mitigation)

### 기술적 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| STT 의료 용어 인식 부정확 | 높음 | Glossary 적용, 사용자 피드백 기반 지속 개선 |
| iOS Safari AudioWorklet 미지원 이슈 | 높음 | getUserMedia + ScriptProcessor 폴백 구현 |
| 네트워크 불안정으로 WebSocket 끊김 | 중간 | socket.io 자동 재연결, 끊김 상태 UI 표시 |
| Cloud Run 콜드 스타트 지연 | 중간 | 최소 인스턴스 1개 유지 설정 (`--min-instances=1`) |
| Google Cloud API 할당량 초과 | 낮음 | 할당량 모니터링 알림 설정, 플랜 업그레이드 준비 |
| 번역 지연 2초 초과 | 중간 | STT 스트리밍 최적화, 서버 리전 최적화 (서울) |

---

### 비즈니스 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| 병원 초기 채택률 저조 | 높음 | 외국인 환자 비율 높은 병원 우선 타겟, 무료 체험 제공 |
| 번역 오류로 인한 의료 사고 우려 | 높음 | "참고용 보조 통역 도구" 명확히 안내, 중요 내용은 서면 확인 권장 |
| 경쟁 서비스 출현 | 낮음 | 의료 특화 Glossary, 빠른 시장 진입이 경쟁 우위 |
| Google API 비용 급증 | 중간 | 사용량 알림 설정, 병원별 월 사용량 상한 설정 |
| 개인정보 보호 규정 위반 우려 | 높음 | 음성 데이터 비저장 원칙 준수, 개인정보처리방침 수립, HTTPS 강제 |
