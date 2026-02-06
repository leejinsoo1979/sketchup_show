# BRIEFING.md — 클로드 코드 프로젝트 브리핑

> 이 문서는 프로젝트 총괄 담당자가 작성한 기술 브리핑이다.
> 클로드 코드는 이 문서를 최우선으로 읽고, 모든 작업에서 이 문서의 지시를 따르라.

---

## 1. 프로젝트 구조

이 프로젝트는 **NanoBanana** — SketchUp 3D 모델을 AI로 실사 렌더링하는 플러그인이다.
기존에 Ruby 기반 SketchUp 플러그인이 동작하고 있으며,
여기에 **Vizmaker 스타일의 노드 기반 에디터**를 웹앱으로 추가 개발한다.

### 프로젝트는 하나다. 두 레이어로 구성된다.

```
sketchup_Nanobanana/                    ← 프로젝트 루트 (하나의 저장소)
│
├── nano_banana_renderer/               ← [레이어 1] 기존 Ruby SketchUp 플러그인
│   ├── main.rb                           SketchUp 씬 캡처, 카메라 데이터 수집
│   ├── services/                         API 통신, 프롬프트 엔진, 설정 관리 등
│   │   ├── api_client.rb                 Gemini API 통신 (동작 중)
│   │   ├── replicate_client.rb           Replicate API 통신 (동작 중)
│   │   ├── prompt_engine.rb              프롬프트 3-Layer 시스템 (동작 중)
│   │   ├── scene_exporter.rb             씬 캡처/메타데이터 (동작 중)
│   │   ├── config_store.rb               API Key AES-256 암호화 (동작 중)
│   │   └── ...기타 서비스 모듈
│   └── ui/                               기존 HtmlDialog UI (유지)
│
├── webapp/                             ← [레이어 2] Vizmaker 노드 에디터 (새로 개발)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/                          App.tsx, Router, 루트 스토어
│       ├── editor/
│       │   ├── canvas/                   NodeCanvas, ConnectionLayer, ContextMenu
│       │   ├── nodes/                    BaseNode, SourceNode, RenderNode, ModifierNode, UpscaleNode, VideoNode, CompareNode
│       │   ├── panels/                   InspectorPanel, PreviewTab, CompareTab, DrawTab, RenderSettings, PromptPresets
│       │   ├── sidebar/                  LeftSidebar
│       │   ├── toolbar/                  PromptBar, MakeButton, EnlargeButton
│       │   └── history/                  HistoryPage, HistoryCard
│       ├── drawing/                      DrawCanvas, DrawToolbar, PasteHandler
│       ├── state/                        graphStore, executionStore, historyStore, uiStore, creditStore
│       ├── engine/                       pipelineExecutor, renderQueue, cacheManager, adapters/
│       ├── api/                          sketchupBridge, renderApi, historyApi
│       ├── types/                        node.ts, engine.ts, preset.ts, graph.ts
│       └── presets/                      프리셋 JSON 정의 파일들
│
├── docs/                               ← 개발 문서
│   └── SPEC.md
├── skills/                             ← 영역별 상세 명세
│   ├── UI_DESIGN.md
│   ├── NODE_TYPES.md
│   ├── PROMPT_PRESETS.md
│   ├── PIPELINE.md
│   ├── UI_RULES.md
│   └── SKETCHUP.md
│
├── api/                                ← Vercel 웹 동기화 (기존, 유지)
├── CLAUDE.md                           ← 프로젝트 컨텍스트
├── BRIEFING.md                         ← 이 문서
└── INITIAL_COMMANDS.md                 ← 클로드 코드 최초 명령어
```

---

## 2. 두 레이어의 역할 분담

```
[SketchUp]
    │
    │  Ruby 플러그인 (레이어 1 - 기존 코드, 수정하지 마라)
    │  · 씬 캡처 → PNG + 카메라 메타데이터
    │  · API Key 암호화 저장/로드
    │  · 로컬 서버 (WEBrick, 포트 9876)
    │
    ▼  REST API (localhost:9876)
    │
[Vizmaker 노드 에디터] (레이어 2 - 새로 개발)
    │  · Source 노드: Ruby 플러그인에서 캡처 이미지 수신
    │  · 노드 그래프: DAG 기반 렌더링 파이프라인 편집
    │  · Make 실행: 토폴로지컬 정렬 → AI API 호출
    │  · 결과 반환: 렌더링 결과를 SketchUp에 전달
    │
    ▼  AI API (Gemini / Replicate)
    │
[AI 렌더링 결과]
```

### 절대 규칙: 기존 Ruby 코드를 건드리지 마라

레이어 1(nano_banana_renderer/)의 Ruby 코드는 이미 동작 중이다.
너의 작업 범위는 **레이어 2(webapp/)만**이다.
기존 Ruby 파일을 수정, 삭제, 이동하지 마라.
기존 코드가 궁금하면 읽기만 하고, 참고만 하라.

---

## 3. 기존 코드 분석 결과 (참고용)

기존 NanoBanana 프로젝트를 코드 레벨까지 분석한 결과이다.
webapp 개발 시 아래 내용을 참고하라.

### 가져올 것 (검증된 설계)

- **프롬프트 3-Layer 시스템**: prompt_engine.rb(783줄)에 구현되어 있음. Layer 1(구조 고정) → Layer 2(씬 컨텍스트) → Layer 3(사용자 입력). AI가 원본 구도를 파괴하지 못하게 강제하는 핵심 메커니즘이다. PROMPT_PRESETS.md에 이미 Vizmaker용으로 반영됨.
- **청크 기반 데이터 전송**: HtmlDialog 크래시 방지를 위해 1MB Base64를 30KB 청크로 분할 전송. webapp에서는 직접적으로 필요 없으나, SketchUp Bridge 연동(12단계) 시 참고.
- **스타일/조명 프리셋**: 8개 스타일 + 8개 조명 프리셋이 prompt_engine.rb에 하드코딩되어 있음. Vizmaker에서는 PROMPT_PRESETS.md의 28개 프리셋으로 확장.
- **API 통신 패턴**: api_client.rb(330줄)에 재시도 로직(지수 백오프), 커스텀 에러 클래스(AuthenticationError, RateLimitError) 존재. adapters/ 설계 시 동일 패턴 적용하라.
- **API Key 암호화**: config_store.rb(187줄)에 AES-256 + 머신 고유 ID 기반 암호화. webapp에서는 Ruby 로컬 서버를 통해 키를 받아 사용하므로 직접 구현 불필요.

### 버릴 것 (기존 코드의 안티패턴)

- **전역 상태 산재**: Ruby 인스턴스 변수 40개 + JS 상태 객체가 분산 → Zustand 단일 스토어로 해결
- **main.rb 만능 파일(473줄)**: 콜백, 타이머, 옵저버 혼재 → 컴포넌트/서비스 분리 철저히
- **이중 API 혼선**: Ruby `@current_api = 'gemini'` vs JS `engine: 'replicate'` 불일치 → adapters/ 패턴으로 엔진별 명확 분리. 어떤 엔진을 쓰는지 코드만 보고 즉시 알 수 있어야 한다.
- **콜백 지옥**: `sketchup.captureScene()` 호출 후 응답 대기 없음, 타이밍 이슈 → async/await + 파이프라인 실행기
- **하드코딩**: 경로(`/Users/jinsoolee/...`), 매직 넘버(1024px, 30KB, 60초), API 모델명 산재 → 설정 파일 + 상수 파일로 중앙화

---

## 4. 너의 역할

너는 webapp/ 폴더에 Vizmaker 노드 에디터를 구현하는 개발자다.

### 반드시 지켜야 할 원칙

1. **문서를 먼저 전부 읽어라.** CLAUDE.md → UI_DESIGN.md → SPEC.md → NODE_TYPES.md → PROMPT_PRESETS.md → PIPELINE.md → UI_RULES.md → SKETCHUP.md 순서대로 읽은 뒤에 구현을 시작하라.

2. **프로덕션 기준으로 작성하라.** 목업, 임시 코드, 데모용 구현을 하지 마라. 지금 작성하는 코드가 최종 코드다. 나중에 고칠 거라는 전제를 허용하지 않는다.

3. **데이터 구조를 먼저 잡아라.** UI 컴포넌트를 만들기 전에 반드시 TypeScript 타입 정의와 Zustand 스토어 구조를 완성하라. 화면은 데이터 구조 위에 자연스럽게 올라간다.

4. **문서에 명시된 것만 구현하라.** 문서에 없는 기능, 없는 UI, 없는 동작을 임의로 추가하지 마라. 판단이 필요할 때는 반드시 물어라.

5. **기존 Ruby 코드를 참고하되 복사하지 마라.** 기존 프로젝트의 프롬프트 시스템, API 통신 패턴은 참고할 가치가 있다. 하지만 Ruby 코드를 TypeScript로 그대로 옮기지 마라. 아키텍처가 완전히 다르다.

6. **기존 Ruby 파일을 절대 수정하지 마라.** nano_banana_renderer/ 폴더는 읽기 전용이다.

---

## 5. 기술 스택 (확정)

| 영역 | 기술 | 비고 |
|---|---|---|
| 프론트엔드 | React 18 + TypeScript | Vite 빌드, webapp/ 폴더 |
| 노드 그래프 | React Flow (reactflow) | 노드 배치/연결/pan/zoom |
| 상태 관리 | Zustand | graphStore, executionStore, historyStore, creditStore, uiStore |
| 드로잉 | Fabric.js | Draw 탭 마스킹 캔버스 |
| 스타일링 | Tailwind CSS | 다크 테마 (#0a0a14 ~ #1a1a24) |
| 아이콘 | lucide-react | 이모지 아이콘 절대 금지 |
| API 통신 | REST (fetch) | Ruby 로컬 서버(9876) + AI API |
| SketchUp 연동 | localhost:9876 | 기존 WEBrick 서버 활용 |

---

## 6. 핵심 규칙 (절대 위반 금지)

1. **자동 실행 금지**: 노드 연결/수정 시 AI 렌더링이 자동으로 실행되면 안 된다. 반드시 Make 버튼 클릭 시에만 실행한다.
2. **DAG 강제**: 노드 그래프는 방향성 비순환 그래프(DAG)이다. 순환 연결을 허용하면 안 된다.
3. **크레딧 사전 계산**: Make 실행 전 예상 크레딧을 계산하여 표시한다. 잔액 부족 시 실행을 차단한다.
4. **캐시 재사용**: 동일 파라미터 + 동일 입력 이미지 조합은 재실행하지 않는다. sha256 해시 기반 캐시 키를 사용한다.
5. **노드 = 결과물**: 실행 완료된 노드는 결과 이미지 썸네일을 표시한다. 노드 하나가 하나의 확정된 결과물이다.
6. **이모지 아이콘 금지**: 모든 아이콘은 lucide-react 라이브러리를 사용한다. 프리셋 아이콘은 커스텀 SVG 선화(line art)로 구현한다.
7. **다크 테마 필수**: 배경은 #0a0a14 ~ #1a1a24 범위. 흰색 배경 요소는 노드 카드 내부 이미지 영역뿐이다.
8. **기존 코드 불가침**: nano_banana_renderer/ 폴더의 Ruby/HTML/JS/CSS 파일을 수정, 삭제, 이동하지 마라.

---

## 7. 구현 순서

아래 순서대로 구현하라. 각 단계를 완료한 뒤 다음으로 넘어가라.
모든 작업은 webapp/ 폴더 안에서 수행한다.

| 단계 | 작업 | 핵심 참조 문서 |
|---|---|---|
| 1 | webapp/ 프로젝트 스캐폴딩 (Vite + React + TS + Tailwind + 패키지) | CLAUDE.md |
| 2 | TypeScript 타입 정의 (모든 노드/엣지/프리셋 인터페이스) | NODE_TYPES.md |
| 3 | Zustand 스토어 5개 (graph, execution, history, credit, ui) | SPEC.md |
| 4 | 전체 레이아웃 (사이드바 + 캔버스 + 패널 + 프롬프트바) | UI_DESIGN.md, UI_RULES.md |
| 5 | React Flow 노드 캔버스 + 커스텀 노드 6종 | NODE_TYPES.md |
| 6 | Inspector 패널 (Preview/Compare/Draw 탭 + Render Settings + Presets) | UI_RULES.md, PROMPT_PRESETS.md |
| 7 | DAG 실행 파이프라인 (Make 버튼 → 토폴로지컬 정렬 → 실행) | PIPELINE.md |
| 8 | Draw 탭 (Fabric.js 마스킹) | UI_RULES.md |
| 9 | Compare 탭 (A/B 슬라이더) | UI_RULES.md |
| 10 | History 페이지 | UI_RULES.md |
| 11 | 컨텍스트 메뉴 + Undo/Redo + 노드 자동 정렬 | UI_RULES.md |
| 12 | SketchUp Bridge 연동 (localhost:9876 ↔ webapp) | SKETCHUP.md |
| 13 | 엔진 어댑터 (mock → 기존 api_client.rb 패턴 참고하여 실제 API 전환) | SPEC.md |
| 14 | 최종 통합 테스트 (드롭 → 노드 생성 → 연결 → Make → 결과 표시) | 전체 |

---

## 8. API Mock 규칙

실제 AI API는 아직 연결하지 않는다. 모든 엔진 호출은 mock으로 구현하라.

```typescript
// webapp/src/engine/adapters/mockRenderer.ts
async function mockRender(input: Blob, params: RenderParams): Promise<Blob> {
  await delay(2000);
  return input; // 입력 이미지를 그대로 반환
}
```

- RENDER: 2초 딜레이
- MODIFIER: 2초 딜레이
- UPSCALE: 3초 딜레이
- VIDEO: 5초 딜레이

adapters/ 폴더에 EngineAdapter 인터페이스를 정의하고,
mock과 실제 API 구현을 교체 가능하게 분리하라.
실제 API 전환 시 기존 api_client.rb의 재시도 로직(지수 백오프)과
에러 클래스 패턴을 TypeScript로 재현하라.

---

## 9. SketchUp 연동 (12단계에서 구현)

기존 Ruby 플러그인의 로컬 서버(WEBrick, 포트 9876)를 통해 webapp과 통신한다.

```
[Ruby 플러그인]                    [webapp 노드 에디터]
     │                                    │
     │  POST /capture                     │
     │  → PNG Base64 + camera metadata    │
     │────────────────────────────────────>│  Source 노드에 이미지 로드
     │                                    │
     │  POST /render-complete             │
     │  ← 결과 이미지 PNG                 │
     │<────────────────────────────────────│  렌더링 결과 반환
     │                                    │
     │  GET /status                       │
     │  → { connected: true, scene: ... } │
     │<────────────────────────────────────│  연결 상태 확인
```

12단계 이전까지는 이미지 드래그 앤 드롭으로 Source를 공급하는 방식으로 동작해야 한다.
SketchUp 연결 여부와 관계없이 webapp은 독립적으로 동작해야 한다.

---

## 10. 금지 사항

- 문서에 없는 기능을 임의로 추가하지 마라
- nano_banana_renderer/ 폴더의 파일을 수정하지 마라
- console.log 디버깅 코드를 프로덕션 코드에 남기지 마라
- any 타입을 사용하지 마라. 모든 타입을 명시하라
- 이모지를 UI 아이콘으로 사용하지 마라
- 흰색/밝은 배경을 사용하지 마라 (노드 내부 이미지 영역 제외)
- node_modules, .env, API Key를 커밋하지 마라
- 실행되지 않는 코드, 주석 처리된 코드를 남기지 마라
- Ruby 코드를 TypeScript로 1:1 번역하지 마라. 아키텍처가 다르다.

---

## 11. 문서 참조 우선순위

구현 시 충돌이 있을 경우, 아래 우선순위를 따르라:

1. **BRIEFING.md** (이 문서) — 최상위 지시. 프로젝트 구조, 역할 분담, 금지 사항
2. **CLAUDE.md** — 프로젝트 컨텍스트, 핵심 규칙, 구현 순서
3. **UI_DESIGN.md** — UI 픽셀 단위 명세 (UI 관련 충돌 시 이 문서가 우선)
4. **SPEC.md** — 전체 기획 (기능 관련 충돌 시 이 문서가 우선)
5. **개별 skills/*.md** — 각 영역 상세 명세
6. **기존 Ruby 코드** — 읽기 전용 참고. 패턴은 참고하되 구조는 따르지 마라.
