# BRIEFING.md — 클로드 코드 프로젝트 브리핑

> 이 문서는 프로젝트 총괄 담당자가 작성한 기술 브리핑이다.
> 클로드 코드는 이 문서를 최우선으로 읽고, 모든 작업에서 이 문서의 지시를 따르라.

---

## 1. 프로젝트 구조

이 프로젝트는 **NanoBanana** — SketchUp 3D 모델을 AI로 실사 렌더링하는 플러그인이다.
Ruby 기반 SketchUp 플러그인이 동작하고 있으며,
그 안에 **Vizmaker 스타일의 노드 기반 에디터**를 HtmlDialog UI로 통합 구현한다.

### 프로젝트는 하나다. 모든 코드는 nano_banana_renderer/ 안에 있다.

```
sketchup_Nanobanana/                    <-- 프로젝트 루트 (하나의 저장소)
|
+-- nano_banana_renderer/               <-- SketchUp 플러그인 전체
|   +-- main.rb                           진입점, 메뉴 등록, HtmlDialog 관리
|   +-- services/                         Ruby 서비스 모듈 (읽기 전용)
|   |   +-- api_client.rb                 Gemini API 통신 (동작 중)
|   |   +-- replicate_client.rb           Replicate API 통신 (동작 중)
|   |   +-- prompt_engine.rb              프롬프트 3-Layer 시스템 (동작 중)
|   |   +-- scene_exporter.rb             씬 캡처/메타데이터 (동작 중)
|   |   +-- config_store.rb               API Key AES-256 암호화 (동작 중)
|   |   +-- ...기타 서비스 모듈
|   +-- ui/                               HtmlDialog UI (작업 대상)
|   |   +-- main_dialog.html              메인 렌더링 UI + 노드 에디터 통합
|   |   +-- settings_dialog.html          API Key 설정
|   |   +-- editor_dialog.html            이미지 보정
|   |   +-- hotspot_dialog.html           오브젝트 배치
|   |   +-- scripts/                      Vizmaker 노드 에디터 JS (작업 대상)
|   |   |   +-- core.js                   상태, 브릿지, DOM 캐시
|   |   |   +-- node-presets.js           프롬프트 프리셋 정의
|   |   |   +-- node-editor.js            노드 캔버스, 연결, DAG
|   |   |   +-- render-mode.js            렌더 모드 전환
|   |   |   +-- mix-mode.js               믹스 모드
|   |   |   +-- node-types-ext.js         노드 타입 확장
|   |   |   +-- node-inspector-ext.js     인스펙터 패널 확장
|   |   +-- styles/                       CSS 스타일시트 (작업 대상)
|   |       +-- common.css               공통 스타일
|   |       +-- main-base.css            기본 레이아웃
|   |       +-- main-render.css          렌더 모드 스타일
|   |       +-- main-mix.css             믹스 모드 스타일
|   |       +-- main-node-editor.css     노드 에디터 스타일
|
+-- docs/                               <-- 개발 문서
|   +-- SPEC.md
+-- skills/                             <-- 영역별 상세 명세
|   +-- UI_DESIGN.md
|   +-- NODE_TYPES.md
|   +-- PROMPT_PRESETS.md
|   +-- PIPELINE.md
|   +-- UI_RULES.md
|   +-- SKETCHUP.md
|
+-- CLAUDE.md                           <-- 프로젝트 컨텍스트
+-- BRIEFING.md                         <-- 이 문서
+-- INITIAL_COMMANDS.md                 <-- 클로드 코드 최초 명령어
```

---

## 2. 통합 아키텍처

```
[SketchUp]
    |
    |  Ruby 플러그인 (main.rb + services/)
    |  . 씬 캡처 -> PNG + 카메라 메타데이터
    |  . API Key 암호화 저장/로드
    |  . HtmlDialog 생성 및 관리
    |
    v  sketchup.callback() / execute_script()
    |
[HtmlDialog UI] (nano_banana_renderer/ui/)
    |  . 렌더 모드: 기존 1차/2차 렌더링
    |  . 노드 에디터 모드: Vizmaker DAG 기반 파이프라인
    |  . Source 노드: Ruby에서 전달받은 캡처 이미지 수신
    |  . 노드 그래프: Canvas API 기반 연결선 + 노드 배치
    |  . Make 실행: 토폴로지컬 정렬 -> AI API 호출
    |  . 결과 반환: execute_script()로 Ruby에 전달
    |
    v  AI API (Gemini / Replicate)
    |
[AI 렌더링 결과]
```

### 절대 규칙: 기존 Ruby 서비스 코드(services/*.rb)는 읽기 전용이다. UI 코드(ui/ 폴더)만 수정하라.

`nano_banana_renderer/services/` 폴더의 Ruby 파일은 이미 동작 중이다.
`main.rb`는 HtmlDialog와 콜백을 관리하므로, 필요 시 최소한으로만 수정하라.
너의 주요 작업 범위는 **`nano_banana_renderer/ui/`** 안의 HTML, JS, CSS 파일이다.
기존 Ruby 서비스 파일을 수정, 삭제, 이동하지 마라.
기존 코드가 궁금하면 읽기만 하고, 참고만 하라.

---

## 3. 기존 코드 분석 결과 (참고용)

기존 NanoBanana 프로젝트를 코드 레벨까지 분석한 결과이다.
노드 에디터 개발 시 아래 내용을 참고하라.

### 가져올 것 (검증된 설계)

- **프롬프트 3-Layer 시스템**: prompt_engine.rb(783줄)에 구현되어 있음. Layer 1(구조 고정) -> Layer 2(씬 컨텍스트) -> Layer 3(사용자 입력). AI가 원본 구도를 파괴하지 못하게 강제하는 핵심 메커니즘이다. PROMPT_PRESETS.md에 이미 Vizmaker용으로 반영됨.
- **청크 기반 데이터 전송**: HtmlDialog 크래시 방지를 위해 1MB Base64를 30KB 청크로 분할 전송. 노드 에디터에서도 동일한 패턴을 사용해야 한다. Ruby -> JS 대용량 이미지 전송 시 반드시 청크 폴링 방식을 따르라.
- **스타일/조명 프리셋**: 8개 스타일 + 8개 조명 프리셋이 prompt_engine.rb에 하드코딩되어 있음. Vizmaker에서는 PROMPT_PRESETS.md의 28개 프리셋으로 확장.
- **API 통신 패턴**: api_client.rb(330줄)에 재시도 로직(지수 백오프), 커스텀 에러 클래스(AuthenticationError, RateLimitError) 존재. 노드 에디터의 API 호출 시 동일 패턴을 적용하라.
- **API Key 암호화**: config_store.rb(187줄)에 AES-256 + 머신 고유 ID 기반 암호화. 노드 에디터에서는 sketchup.callback()을 통해 Ruby 측에서 키를 받아 사용하므로 직접 구현 불필요.

### 버릴 것 (기존 코드의 안티패턴)

- **전역 상태 산재**: Ruby 인스턴스 변수 40개 + JS 상태 객체가 분산 -> nodeEditor 객체로 상태를 중앙화하여 해결
- **main.rb 만능 파일(473줄)**: 콜백, 타이머, 옵저버 혼재 -> 스크립트 파일별 역할 분리 철저히
- **이중 API 혼선**: Ruby `@current_api = 'gemini'` vs JS `engine: 'replicate'` 불일치 -> 노드별 엔진 파라미터로 명확 분리. 어떤 엔진을 쓰는지 코드만 보고 즉시 알 수 있어야 한다.
- **콜백 지옥**: `sketchup.captureScene()` 호출 후 응답 대기 없음, 타이밍 이슈 -> 콜백 체인을 명확히 하고, setTimeout 기반 폴링으로 안정적 처리
- **하드코딩**: 경로(`/Users/jinsoolee/...`), 매직 넘버(1024px, 30KB, 60초), API 모델명 산재 -> core.js 상단에 설정 상수로 중앙화

---

## 4. 너의 역할

너는 `nano_banana_renderer/ui/` 폴더에 Vizmaker 노드 에디터를 구현하는 개발자다.
스크립트는 `ui/scripts/` 안에, 스타일은 `ui/styles/` 안에 작성한다.

### 반드시 지켜야 할 원칙

1. **문서를 먼저 전부 읽어라.** CLAUDE.md -> UI_DESIGN.md -> SPEC.md -> NODE_TYPES.md -> PROMPT_PRESETS.md -> PIPELINE.md -> UI_RULES.md -> SKETCHUP.md 순서대로 읽은 뒤에 구현을 시작하라.

2. **프로덕션 기준으로 작성하라.** 목업, 임시 코드, 데모용 구현을 하지 마라. 지금 작성하는 코드가 최종 코드다. 나중에 고칠 거라는 전제를 허용하지 않는다.

3. **데이터 구조를 먼저 잡아라.** UI DOM을 만들기 전에 반드시 nodeEditor 객체의 프로퍼티 구조(nodes 배열, edges 배열, selectedNodeId 등)를 core.js 또는 node-editor.js에서 완성하라. 화면은 데이터 구조 위에 자연스럽게 올라간다.

4. **문서에 명시된 것만 구현하라.** 문서에 없는 기능, 없는 UI, 없는 동작을 임의로 추가하지 마라. 판단이 필요할 때는 반드시 물어라.

5. **기존 Ruby 코드를 참고하되 복사하지 마라.** 기존 프로젝트의 프롬프트 시스템, API 통신 패턴은 참고할 가치가 있다. 하지만 Ruby 코드를 JS로 그대로 옮기지 마라. 동작 환경이 다르다.

6. **기존 Ruby 서비스 파일을 절대 수정하지 마라.** services/ 폴더는 읽기 전용이다.

---

## 5. 기술 스택 (확정)

| 영역 | 기술 | 비고 |
|---|---|---|
| 프론트엔드 | Vanilla JavaScript (ES5 호환) | Chromium 88 CEF (SketchUp 2022), 빌드 없음 |
| 노드 그래프 | Canvas API 기반 커스텀 구현 | nodeEditor 전역 객체, 레지스트리 패턴 |
| 상태 관리 | nodeEditor 객체 프로퍼티 | nodes[], edges[], selectedNodeId 등 |
| 드로잉 | Canvas API | Draw 탭 마스킹 캔버스 |
| 스타일링 | Plain CSS | 다크 테마 (#0a0a14 ~ #1a1a24) |
| 아이콘 | 인라인 SVG | 이모지 아이콘 절대 금지, 외부 라이브러리 없음 |
| API 통신 | sketchup.callback() + execute_script() | Ruby HtmlDialog 브릿지 |
| AI API | XMLHttpRequest / fetch (Chromium 88 지원) | Gemini / Replicate 직접 호출 |
| SketchUp 연동 | HtmlDialog addAction / execute_script | 청크 폴링 방식으로 대용량 데이터 전송 |

### 스크립트 로드 순서 (절대 변경 금지)

```html
<script src="scripts/core.js"></script>
<script src="scripts/node-presets.js"></script>
<script src="scripts/node-editor.js"></script>
<script src="scripts/render-mode.js"></script>
<script src="scripts/mix-mode.js"></script>
<script src="scripts/node-types-ext.js"></script>
<script src="scripts/node-inspector-ext.js"></script>
```

각 파일은 이전 파일에서 선언한 전역 변수와 함수에 의존한다.
순서를 바꾸면 undefined 에러가 발생한다.

---

## 6. 핵심 규칙 (절대 위반 금지)

1. **자동 실행 금지**: 노드 연결/수정 시 AI 렌더링이 자동으로 실행되면 안 된다. 반드시 Make 버튼 클릭 시에만 실행한다.
2. **DAG 강제**: 노드 그래프는 방향성 비순환 그래프(DAG)이다. 순환 연결을 허용하면 안 된다.
3. **크레딧 사전 계산**: Make 실행 전 예상 크레딧을 계산하여 표시한다. 잔액 부족 시 실행을 차단한다.
4. **캐시 재사용**: 동일 파라미터 + 동일 입력 이미지 조합은 재실행하지 않는다. 해시 기반 캐시 키를 사용한다.
5. **노드 = 결과물**: 실행 완료된 노드는 결과 이미지 썸네일을 표시한다. 노드 하나가 하나의 확정된 결과물이다.
6. **인라인 SVG 아이콘**: 모든 아이콘은 인라인 SVG 선화(line art)로 구현한다. 이모지, 외부 아이콘 라이브러리 사용 금지.
7. **다크 테마 필수**: 배경은 #0a0a14 ~ #1a1a24 범위. 흰색 배경 요소는 노드 카드 내부 이미지 영역뿐이다.
8. **var 사용**: 크로스 파일 전역 스코프에서 공유되는 변수는 반드시 `var`로 선언한다. `const`/`let`은 파일 내부 함수 스코프에서만 사용한다.
9. **빌드 없음**: npm, webpack, vite 등 빌드 도구를 사용하지 않는다. 모든 JS/CSS는 `<script src>` / `<link href>` 태그로 직접 로드한다.
10. **ES5 호환**: 크로스 파일 스코프에서 화살표 함수를 사용하지 않는다. 템플릿 리터럴은 Chromium 88이 지원하므로 사용 가능하되, 크리티컬 패스에서는 문자열 결합을 우선 사용한다.
11. **HtmlDialog 크래시 방지**: execute_script()로 500KB 이상 데이터를 한 번에 전송하지 않는다. Thread 내에서 직접 execute_script()를 호출하지 않는다 (UI.start_timer 사용).

---

## 7. 구현 순서

아래 순서대로 구현하라. 각 단계를 완료한 뒤 다음으로 넘어가라.
모든 작업은 `nano_banana_renderer/ui/` 폴더 안에서 수행한다.

| 단계 | 작업 | 핵심 참조 문서 |
|---|---|---|
| 1 | core.js에 nodeEditor 전역 객체 구조 정의 (nodes[], edges[], selectedNodeId, 상태 관리 함수) | SPEC.md |
| 2 | node-presets.js에 프롬프트 프리셋 28종 데이터 정의 | PROMPT_PRESETS.md |
| 3 | node-editor.js에 Canvas 기반 노드 캔버스 (pan/zoom/drag/연결선 그리기) | NODE_TYPES.md, UI_DESIGN.md |
| 4 | main_dialog.html에 전체 레이아웃 구성 (사이드바 + 캔버스 + 패널 + 프롬프트바) | UI_DESIGN.md, UI_RULES.md |
| 5 | node-types-ext.js에 노드 6종 생성/렌더링 함수 (Source, Render, Modifier, Upscale, Video, Compare) | NODE_TYPES.md |
| 6 | node-inspector-ext.js에 Inspector 패널 (Preview/Compare/Draw 탭 + Render Settings + Presets) | UI_RULES.md, PROMPT_PRESETS.md |
| 7 | node-editor.js에 DAG 실행 파이프라인 (Make 버튼 -> 토폴로지컬 정렬 -> 실행) | PIPELINE.md |
| 8 | Draw 탭 Canvas 마스킹 구현 | UI_RULES.md |
| 9 | Compare 탭 A/B 슬라이더 구현 | UI_RULES.md |
| 10 | History 페이지 구현 | UI_RULES.md |
| 11 | 컨텍스트 메뉴 + Undo/Redo + 노드 자동 정렬 | UI_RULES.md |
| 12 | SketchUp 브릿지 연동 (sketchup.callback() <-> execute_script()) | SKETCHUP.md |
| 13 | 엔진 어댑터 (mock -> 실제 API 전환, api_client.rb 패턴 참고) | SPEC.md |
| 14 | 최종 통합 테스트 (드롭 -> 노드 생성 -> 연결 -> Make -> 결과 표시) | 전체 |

---

## 8. API Mock 규칙

실제 AI API는 아직 연결하지 않는다. 모든 엔진 호출은 mock으로 구현하라.

```javascript
// node-editor.js 또는 별도 mock 함수
function mockRender(inputBase64, params, callback) {
  setTimeout(function() {
    // 입력 이미지를 그대로 반환
    callback(null, inputBase64);
  }, 2000);
}

function mockUpscale(inputBase64, params, callback) {
  setTimeout(function() {
    callback(null, inputBase64);
  }, 3000);
}

function mockVideo(inputBase64, params, callback) {
  setTimeout(function() {
    callback(null, inputBase64);
  }, 5000);
}
```

- RENDER: 2초 딜레이
- MODIFIER: 2초 딜레이
- UPSCALE: 3초 딜레이
- VIDEO: 5초 딜레이

nodeEditor 객체에 엔진 레지스트리를 두고,
mock과 실제 API 구현을 교체 가능하게 분리하라.

```javascript
var engineAdapters = {
  mock: {
    render: mockRender,
    modifier: mockModifier,
    upscale: mockUpscale,
    video: mockVideo
  },
  real: {
    render: realRender,    // 나중에 구현
    modifier: realModifier,
    upscale: realUpscale,
    video: realVideo
  }
};

var activeEngine = 'mock';  // 'real'로 전환 시 실제 API 사용
```

실제 API 전환 시 기존 api_client.rb의 재시도 로직(지수 백오프)과
에러 처리 패턴을 JS 콜백 방식으로 재현하라.

---

## 9. SketchUp 연동 (12단계에서 구현)

HtmlDialog의 `sketchup.callback()` / `execute_script()` 브릿지를 통해 통신한다.

```
[Ruby 플러그인 (main.rb)]              [HtmlDialog UI (main_dialog.html)]
     |                                           |
     |  JS -> Ruby: sketchup.captureScene()      |
     |  (addAction으로 등록된 콜백 호출)           |
     |<------------------------------------------|
     |                                           |
     |  Ruby -> JS: execute_script()             |
     |  (청크 폴링 방식으로 이미지 전달)           |
     |  onChunkStart(sceneName, totalChunks)      |
     |------------------------------------------>|  Source 노드에 이미지 로드
     |                                           |
     |  JS -> Ruby: sketchup.getNextChunk()      |
     |<------------------------------------------|
     |                                           |
     |  Ruby -> JS: onChunkData(data, isLast)    |
     |------------------------------------------>|  청크 조합 후 처리
     |                                           |
     |  JS -> Ruby: sketchup.saveResult(base64)  |
     |<------------------------------------------|  렌더링 결과 전달
```

12단계 이전까지는 이미지 드래그 앤 드롭으로 Source를 공급하는 방식으로 동작해야 한다.
SketchUp 연결 여부와 관계없이 노드 에디터는 독립적으로 동작해야 한다.

### SketchUp 환경 감지

```javascript
var isSketchUp = (typeof sketchup !== 'undefined');

function callRuby(callbackName, args) {
  if (isSketchUp && sketchup[callbackName]) {
    sketchup[callbackName].apply(null, args || []);
  } else {
    console.log('[Mock] sketchup.' + callbackName + ' called with:', args);
  }
}
```

---

## 10. 금지 사항

- 문서에 없는 기능을 임의로 추가하지 마라
- services/ 폴더의 Ruby 파일을 수정하지 마라
- console.log 디버깅 코드를 프로덕션 코드에 남기지 마라
- 이모지를 UI 아이콘으로 사용하지 마라
- 흰색/밝은 배경을 사용하지 마라 (노드 내부 이미지 영역 제외)
- API Key를 JS 코드에 하드코딩하지 마라
- 실행되지 않는 코드, 주석 처리된 코드를 남기지 마라
- Ruby 코드를 JS로 1:1 번역하지 마라. 동작 환경이 다르다
- npm, node_modules, 빌드 도구를 도입하지 마라
- 크로스 파일 스코프에서 `const`/`let`을 사용하지 마라 (`var`를 사용하라)
- 크로스 파일 스코프에서 화살표 함수를 사용하지 마라
- 외부 JS 라이브러리(React, Vue, jQuery, lodash 등)를 추가하지 마라
- execute_script()로 500KB 이상 데이터를 한 번에 전송하지 마라
- 스크립트 로드 순서를 변경하지 마라

---

## 11. 문서 참조 우선순위

구현 시 충돌이 있을 경우, 아래 우선순위를 따르라:

1. **BRIEFING.md** (이 문서) -- 최상위 지시. 프로젝트 구조, 역할 분담, 금지 사항
2. **CLAUDE.md** -- 프로젝트 컨텍스트, 핵심 규칙, 구현 순서
3. **UI_DESIGN.md** -- UI 픽셀 단위 명세 (UI 관련 충돌 시 이 문서가 우선)
4. **SPEC.md** -- 전체 기획 (기능 관련 충돌 시 이 문서가 우선)
5. **개별 skills/*.md** -- 각 영역 상세 명세
6. **기존 Ruby 코드** -- 읽기 전용 참고. 패턴은 참고하되 구조는 따르지 마라.
