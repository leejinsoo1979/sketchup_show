# Vizmaker 스타일 노드 기반 AI 렌더링 에디터 — 구현 기획 문서

---

## 1. 전체 시스템 아키텍처 개요

### 1.1 시스템 구성

```
┌─────────────────────────┐
│   SketchUp Plugin       │
│   (Ruby, Local)         │
│                         │
│   - Viewport Capture    │
│   - Camera/Scene Meta   │
│   - Result Import       │
└────────┬────────────────┘
         │ sketchup.callback() / execute_script()
         ▼
┌─────────────────────────────────┐
│   Node Graph Editor             │
│   (Vanilla JS, HtmlDialog)     │
│                                 │
│   - NodeCanvas (drag/pan)       │
│   - Inspector Panel (right)     │
│   - Preview/Compare/Draw tabs   │
│   - Prompt bar (bottom)         │
│   - Make button (bottom-right)  │
└────────┬────────────────────────┘
         │ DAG Execution
         ▼
┌─────────────────────────────────┐
│   Execution Engine              │
│                                 │
│   - Topological Sort            │
│   - Engine Dispatch             │
│   - Status Propagation          │
│   - Cache (hash-based)          │
└────────┬────────────────────────┘
         │ API calls (via Ruby bridge)
         ▼
┌─────────────────────────────────┐
│   AI Renderer / Processor APIs  │
│                                 │
│   - Main Renderer (NanoBanana)  │
│   - Details Editor              │
│   - Creative Upscaler           │
│   - Image to Video (Kling/Seed) │
│   - Experimental Renderers      │
└─────────────────────────────────┘
```

### 1.2 핵심 원칙

- SketchUp Ruby 플러그인은 이미 구현되어 있다. Source 공급자이자 결과 소비자 역할만 한다.
- 본 시스템은 기존 렌더링 UI 위에 Node Graph를 추가하는 구조이다. SketchUp의 HtmlDialog 내부에서 동작한다.
- 모든 AI 실행은 Make 버튼 클릭 시에만 발생한다. 노드 연결/수정 시 자동 실행은 없다.
- 노드 그래프는 DAG(Directed Acyclic Graph)이다. 순환 연결은 금지한다.
- HtmlDialog의 Chromium 88 CEF 엔진 제약에 따라 ES5 호환 문법(`var`, `function`)을 기본으로 사용한다. ES6 화살표 함수, `Promise`, `async/await`는 Chromium 88에서 지원되므로 사용 가능하다. `const`/`let`은 교차 파일 스코프 문제로 `var`를 사용한다.

### 1.3 Render Mode 매핑 (Vizmaker 기준)

Vizmaker의 Render Mode 드롭다운에 나타나는 모드는 다음과 같다. 각 모드는 노드 타입과 1:1 대응한다.

| Render Mode | 노드 타입 | 설명 |
|---|---|---|
| 1. Main renderer | RenderNode | 기본 AI 렌더링. Source 이미지를 포토리얼리스틱으로 변환 |
| 2. Details editor | ModifierNode | 기존 렌더 결과에 대해 프롬프트 기반 세부 수정 수행 |
| 3. Creative upscaler | UpscaleNode | 저해상도 이미지를 2x/4x 확대 + 디테일 보강 |
| 4. Image to video | VideoNode | 정지 이미지에서 카메라 모션 영상 생성 |
| (experimental) Exterior render | RenderNode (engine=experimental-exterior) | 외부 전경 특화 실험 엔진 |
| (experimental) Interior render | RenderNode (engine=experimental-interior) | 인테리어 특화 실험 엔진 |

---

## 2. 스크립트 모듈 구조

### 2.1 디렉토리 구조

```
nano_banana_renderer/
├── main.rb                          # Ruby 진입점, 메뉴 등록, HtmlDialog 생성
├── services/
│   ├── scene_exporter.rb            # SketchUp → PNG
│   ├── api_client.rb                # Gemini API 통신
│   └── ...                          # 기타 Ruby 서비스 모듈
├── ui/
│   ├── main_dialog.html             # 메인 HTML (모든 모드 포함)
│   ├── scripts/
│   │   ├── core.js                  # 공유 상태(state), DOM 캐시(el), Ruby 브릿지(callRuby/sketchup)
│   │   ├── node-presets.js          # 프리셋 데이터 (nodePresets 전역 객체)
│   │   ├── node-editor.js           # 메인 노드 에디터 (nodeEditor 전역 객체)
│   │   ├── render-mode.js           # 렌더 모드 로직 (캡처, 렌더링, 설정, 카메라, 씬)
│   │   ├── mix-mode.js              # 믹스 모드 로직 (인페인팅, 오브젝트 배치 등)
│   │   ├── node-types-ext.js        # 확장 노드 타입 등록 (modifier, upscale, video, compare)
│   │   └── node-inspector-ext.js    # 확장 노드 타입 Inspector UI
│   └── styles/
│       └── *.css                    # 일반 CSS (빌드 없음, 직접 link 태그)
└── assets/
    └── object_library/              # 기본 오브젝트 PNG
```

### 2.2 스크립트 로딩 순서

HTML에서 `<script src>` 태그로 순서대로 로드한다. 빌드 도구 없음.

```html
<script src="scripts/core.js"></script>
<script src="scripts/node-presets.js"></script>
<script src="scripts/node-editor.js"></script>
<script src="scripts/render-mode.js"></script>
<script src="scripts/mix-mode.js"></script>
<script src="scripts/node-types-ext.js"></script>
<script src="scripts/node-inspector-ext.js"></script>
```

### 2.3 모듈 책임 분리

**core.js** — 공유 상태(`var state`), DOM 요소 캐시(`var el`), SketchUp Ruby 브릿지(`callRuby` 함수, `var sketchup` 객체)를 정의한다. 씬별 상태 저장/복원, 프롬프트 탭 전환 처리. 모든 후속 스크립트가 참조하는 기반 모듈이다.

**node-presets.js** — 프리셋 데이터(`var nodePresets`)를 전역 객체로 정의한다. `render`, `modifier`, `upscale`, `video` 카테고리별 프리셋 배열을 포함한다. 코드 로직 없이 데이터만 포함한다.

**node-editor.js** — 메인 노드 에디터 로직(`var nodeEditor`). 노드 추가/삭제/선택, 드래그 이동, 포트 연결, Canvas 기반 연결선 렌더링, Inspector 패널 업데이트, Make 실행(DAG 순서), topologicalSort를 구현한다. 노드 클릭 시 `nodeEditor.selectedNode`를 갱신한다. 노드 썸네일, 상태 인디케이터, 인라인 SVG 아이콘을 렌더링한다.

**render-mode.js** — 렌더 모드 전용 로직. SketchUp 캡처 콜백(`onCaptureComplete`), 렌더 시작/완료/에러 콜백, Auto 프롬프트, 히스토리, 설정 패널, 카메라 컨트롤(WASD), 씬 탭, 그리드 가이드, 모드 전환(`switchToRenderMode`, `switchToMixMode`, `switchToNodeMode`)을 처리한다.

**mix-mode.js** — 믹스 모드 전용 로직(`var mixState`). 인페인팅 마스크 캔버스, 핫스팟 배치, 재질 교체, 도면 3D 변환 서브모드를 처리한다.

**node-types-ext.js** — 확장 노드 타입(modifier, upscale, video, compare)을 nodeEditor 레지스트리에 등록한다. 아이콘(`_icons`), 타이틀(`_titles`), 포트 제약(`_noOutputTypes`, `_noInputTypes`), 기본 데이터(`getDefaultData` 확장), 실행 로직(`execute` 확장), 순환 검사(`connect` 확장)를 추가한다. IIFE로 감싸서 내부 변수 오염을 방지한다.

**node-inspector-ext.js** — 확장 노드 타입의 Inspector UI를 동적으로 생성한다. modifier/upscale/video/compare 패널 HTML 빌드, `updateInspector` 확장, 슬라이더/버튼 이벤트 바인딩을 처리한다. IIFE로 감싼다.

### 2.4 크로스 파일 통신 패턴

모든 크로스 파일 공유는 `var`로 선언된 전역 변수를 통해 이루어진다.

| 전역 변수 | 정의 위치 | 참조 위치 | 설명 |
|---|---|---|---|
| `state` | core.js | render-mode.js, mix-mode.js | 앱 전체 상태 |
| `el` | core.js | render-mode.js | DOM 요소 캐시 |
| `sketchup` | core.js | node-editor.js, render-mode.js | Ruby 콜백 래퍼 |
| `callRuby` | core.js | mix-mode.js | Ruby 호출 함수 |
| `nodeEditor` | node-editor.js | node-types-ext.js, node-inspector-ext.js, render-mode.js | 노드 에디터 |
| `nodePresets` | node-presets.js | node-inspector-ext.js | 프리셋 데이터 |

---

## 3. 노드 타입 전체 정의

### 3.1 Source Node

| 항목 | 값 |
|---|---|
| type | `SOURCE` |
| 입력 포트 | 없음 |
| 출력 포트 | `image` (Image) |
| 실행 타이밍 | Make 클릭 시 (캡처 이미지 로드) |
| 병렬 가능 | 해당 없음 (루트 노드) |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `origin` | `"sketchup"` / `"upload"` / `"paste"` | `"upload"` | 이미지 소스 |
| `image` | `string` | `""` | 이미지 URL 또는 base64 |
| `cameraLocked` | `boolean` | `false` | SketchUp 카메라 고정 여부 |
| `sceneMeta` | `object` / `null` | `null` | SketchUp 씬 메타데이터 |

**JS 기본 데이터 구조:**

```javascript
// core.js 또는 node-editor.js 내 getDefaultData
var defaultSourceData = {
  time: 'day',
  light: 'on',
  image: null
};
```

**동작:** 이미지를 드래그 앤 드롭하거나 Browse 버튼으로 업로드하면 Source 노드가 자동 생성된다. SketchUp에서 전송 시 `origin: "sketchup"`으로 자동 생성된다. DAG의 루트이다.

---

### 3.2 Render Node (Main Renderer / Experimental)

| 항목 | 값 |
|---|---|
| type | `RENDER` |
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 실행 타이밍 | Make 클릭 시 |
| 병렬 가능 | 동일 Source에서 분기된 Render 노드끼리 병렬 실행 가능 |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `engine` | `"main"` / `"experimental-exterior"` / `"experimental-interior"` | `"main"` | 렌더 엔진 |
| `prompt` | `string` | `"Create photorealistic image"` | 사용자 프롬프트 |
| `presetId` | `string` / `null` | `null` | 적용된 Prompt Preset ID |
| `seed` | `number` / `null` | `null` | null이면 랜덤 |
| `resolution` | `string` | `"1200x1200"` | 출력 해상도 |

**JS 기본 데이터 구조:**

```javascript
var defaultRendererData = {
  mode: 'nanobanana-pro',
  resolution: '2048',
  aspect: 'original',
  presets: [],
  customPrompt: '',
  negativePrompt: ''
};
```

**동작:** 입력 이미지에 프롬프트를 적용하여 AI 렌더링을 수행한다. Vizmaker에서 "1. Main renderer" 또는 "(experimental)" 모드에 해당한다.

---

### 3.3 Modifier Node (Details Editor)

| 항목 | 값 |
|---|---|
| type | `MODIFIER` |
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 실행 타이밍 | Make 클릭 시 |
| 병렬 가능 | 동일 입력에서 분기 시 병렬 가능 |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `prompt` | `string` | `""` | 수정 지시 프롬프트 |
| `presetId` | `string` / `null` | `null` | 적용된 Prompt Preset ID |
| `mask` | `string` / `null` | `null` | Draw 탭에서 생성된 마스크 이미지 (base64) |
| `maskLayers` | `array` | `[]` | 색상별 마스크 레이어 목록 |

**MaskLayer 구조:**

```javascript
/**
 * @typedef {Object} MaskLayer
 * @property {string} color - "red" | "green" | "blue" | "yellow"
 * @property {string} action - "add" | "remove" | "replace"
 * @property {string} description - 레이어 설명
 */
var exampleMaskLayer = {
  color: "red",
  action: "add",
  description: "add dog"
};
```

**JS 기본 데이터 구조:**

```javascript
var defaultModifierData = {
  prompt: '',
  presetId: null,
  negativePrompt: '',
  mask: null,
  customPrompt: ''
};
```

**동작:** 이미 렌더된 이미지에 프롬프트 기반 세부 수정을 수행한다. Vizmaker에서 "2. Details editor" 모드에 해당한다. Prompt Preset (Enhance realism, Add people, Day to night 등)은 이 노드에서 사용된다. Draw 탭에서 마스크를 생성하면 마스킹 영역 + 프롬프트를 결합하여 인페인팅을 수행한다.

**색상별 의미:**
- 빨강(red): 해당 영역에 객체 추가
- 초록(green): 해당 영역의 객체 제거
- 파랑(blue): 해당 영역의 객체 교체
- 노랑(yellow): 해당 영역 스타일 변경

---

### 3.4 Upscale Node (Creative Upscaler)

| 항목 | 값 |
|---|---|
| type | `UPSCALE` |
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 실행 타이밍 | Make 클릭 시 |
| 병렬 가능 | 가능 |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `scale` | `2` / `4` | `2` | 확대 배율 |
| `optimizedFor` | `"standard"` / `"detail"` / `"smooth"` | `"standard"` | 최적화 모드 |
| `creativity` | `number` | `0.5` | 0.0~1.0 범위 |
| `detailStrength` | `number` | `0.5` | HDR 디테일 강도 0.0~1.0 |
| `similarity` | `number` | `0.5` | 원본 유사도 0.0~1.0 |
| `promptStrength` | `number` | `0.0` | 프롬프트 영향도 0.0~1.0 |
| `prompt` | `string` | `"Upscale"` | 업스케일 프롬프트 |

**JS 기본 데이터 구조:**

```javascript
var defaultUpscaleData = {
  scale: 2,
  optimizedFor: 'standard',
  creativity: 0.5,
  detailStrength: 0.5,
  similarity: 0.5,
  promptStrength: 0.5,
  prompt: 'Upscale',
  customPrompt: ''
};
```

**동작:** Vizmaker에서 "3. Creative upscaler" 모드에 해당한다. 저해상도 AI 이미지(1200px)를 2x/4x 확대하며 디테일을 보강한다.

---

### 3.5 Video Node (Image to Video)

| 항목 | 값 |
|---|---|
| type | `VIDEO` |
| 입력 포트 | `image` (Image), `endFrame` (Image, optional) |
| 출력 포트 | `video` (Video) |
| 실행 타이밍 | Make 클릭 시 |
| 병렬 가능 | 가능 |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `engine` | `"kling"` / `"seedance"` | `"kling"` | 비디오 생성 엔진 |
| `duration` | `5` / `10` | `5` | 영상 길이(초) |
| `prompt` | `string` | `"Move forward"` | 카메라 모션 프롬프트 |
| `endFrameImage` | `string` / `null` | `null` | 종료 프레임 이미지 (2프레임 전환용) |

**JS 기본 데이터 구조:**

```javascript
var defaultVideoData = {
  engine: 'kling',
  duration: 5,
  prompt: 'Move forward',
  endFrameImage: null,
  customPrompt: ''
};
```

**동작:** Vizmaker에서 "4. Image to video" 모드에 해당한다. 단일 이미지에서 카메라 모션 영상을 생성하거나, 시작/종료 프레임 2장을 지정하여 전환 애니메이션을 생성한다. 결과는 노드 내에서 자동 재생된다.

**Prompt Preset (Video 전용):**

| 프리셋 | 프롬프트 |
|---|---|
| Zoom in | `"Zoom in"` |
| Move forward | `"Move forward"` |
| Orbit | `"Orbit camera around subject"` |
| Pan left | `"Pan camera left"` |

---

### 3.6 Compare Node (비실행)

| 항목 | 값 |
|---|---|
| type | `COMPARE` |
| 입력 포트 | `imageA` (Image), `imageB` (Image) |
| 출력 포트 | 없음 |
| 실행 타이밍 | 실행하지 않음 (UI 전용) |
| 병렬 가능 | 해당 없음 |

**필수 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `mode` | `"slider"` / `"side_by_side"` | `"slider"` | 비교 모드 |

**JS 기본 데이터 구조:**

```javascript
var defaultCompareData = {
  mode: 'slider',
  imageA: null,
  imageB: null
};
```

**동작:** 두 이미지를 슬라이더 또는 나란히 비교한다. 노드 우클릭 → "Compare A" / "Compare B"로 슬롯에 할당한다. AI 실행을 수행하지 않으며 크레딧을 소모하지 않는다.

---

## 4. 노드 JSON 스키마

### 4.1 전체 그래프 스키마

```javascript
/**
 * @typedef {Object} Graph
 * @property {string} graphId - UUID
 * @property {NodeData[]} nodes
 * @property {EdgeData[]} edges
 * @property {Object} meta
 * @property {string} meta.createdAt - ISO 8601
 * @property {string} meta.updatedAt
 * @property {string} meta.source - "sketchup" | "web" | "api"
 * @property {string} meta.appVersion
 * @property {Object} ui
 * @property {number} ui.zoom - 기본 1.0
 * @property {Object} ui.pan - { x: number, y: number }
 */

/**
 * @typedef {Object} EdgeData
 * @property {string} id - UUID
 * @property {string} from - sourceNodeId
 * @property {string} fromPort - 출력 포트명 ("image" | "video")
 * @property {string} to - targetNodeId
 * @property {string} toPort - 입력 포트명 ("image" | "endFrame" | "imageA" | "imageB")
 */
```

**현재 구현에서의 연결 데이터:** `nodeEditor.connections` 배열은 단순 `{ from: nodeId, to: nodeId }` 형태를 사용한다. 포트명은 노드 타입에서 자동 추론한다.

### 4.2 공통 노드 구조

```javascript
/**
 * @typedef {Object} NodeData
 * @property {number} id - 노드 고유 ID (nodeEditor.nextNodeId로 자동 증가)
 * @property {string} type - 노드 타입
 * @property {number} x - X 좌표
 * @property {number} y - Y 좌표
 * @property {boolean} dirty - 변경 여부 (재실행 필요 표시)
 * @property {Object} data - 노드 타입별 파라미터
 * @property {string|null} thumbnail - 결과 이미지 base64
 */

// 노드 타입 상수
// "source" | "renderer" | "modifier" | "upscale" | "video" | "compare"

// 노드 상태 (CSS 클래스로 표현)
// idle: 기본
// processing: .processing 클래스 추가
// done: dirty = false
// error: 에러 시 콘솔 출력
```

**현재 구현에서의 노드 객체 예시:**

```javascript
var exampleNode = {
  id: 1,
  type: 'renderer',
  x: 480,
  y: 120,
  dirty: true,
  data: {
    mode: 'nanobanana-pro',
    resolution: '2048',
    aspect: 'original',
    presets: ['enhance-realism'],
    customPrompt: 'Create photorealistic interior',
    negativePrompt: 'cartoon, sketch'
  },
  thumbnail: null  // base64 string when result exists
};
```

### 4.3 Source Node 스키마

```json
{
  "id": 1,
  "type": "source",
  "x": 80,
  "y": 120,
  "dirty": true,
  "data": {
    "time": "day",
    "light": "on",
    "image": null
  },
  "thumbnail": null
}
```

### 4.4 Render Node 스키마

```json
{
  "id": 2,
  "type": "renderer",
  "x": 480,
  "y": 120,
  "dirty": true,
  "data": {
    "mode": "nanobanana-pro",
    "resolution": "2048",
    "aspect": "original",
    "presets": ["screen-to-render"],
    "customPrompt": "Create photorealistic image",
    "negativePrompt": "cartoon, illustration, sketch, low quality, blurry"
  },
  "thumbnail": null
}
```

### 4.5 Modifier Node 스키마

```json
{
  "id": 3,
  "type": "modifier",
  "x": 880,
  "y": 120,
  "dirty": true,
  "data": {
    "prompt": "Add a dog in the red area",
    "presetId": null,
    "negativePrompt": "",
    "mask": "data:image/png;base64,...",
    "customPrompt": "Add a dog in the red area"
  },
  "thumbnail": null
}
```

### 4.6 Upscale Node 스키마

```json
{
  "id": 4,
  "type": "upscale",
  "x": 880,
  "y": 380,
  "dirty": true,
  "data": {
    "scale": 2,
    "optimizedFor": "standard",
    "creativity": 0.5,
    "detailStrength": 0.5,
    "similarity": 0.5,
    "promptStrength": 0.5,
    "prompt": "Upscale",
    "customPrompt": ""
  },
  "thumbnail": null
}
```

### 4.7 Video Node 스키마

```json
{
  "id": 5,
  "type": "video",
  "x": 880,
  "y": 640,
  "dirty": true,
  "data": {
    "engine": "kling",
    "duration": 5,
    "prompt": "Move forward",
    "endFrameImage": null,
    "customPrompt": ""
  },
  "thumbnail": null
}
```

### 4.8 캐시 키 생성 규칙

```javascript
function generateCacheKey(node, inputImageHash) {
  var payload = JSON.stringify({
    type: node.type,
    params: node.data,
    inputImageHash: inputImageHash
  });
  return sha256(payload);
}
```

동일한 cacheKey를 가진 노드는 재실행하지 않고 기존 result를 재사용한다. 현재 구현에서는 `node.dirty` 플래그로 간이 캐시를 구현한다. `dirty = false`인 노드는 Make 실행 시 스킵된다.

### 4.9 노드 라벨 표시 규칙

각 노드는 캔버스에서 다음 형식으로 라벨을 표시한다:
- 첫 줄: 노드 타입 이름 (예: "Source", "Renderer", "Modifier")
- 프롬프트 요약은 Inspector에서 확인

라벨은 노드 카드 하단 외부에 `.node-label-outside` > `.node-title`로 렌더링된다. `nodeEditor._titles` 레지스트리에서 타입별 표시 이름을 관리한다.

---

## 5. Prompt Preset 시스템 및 프롬프트 공식

### 5.1 Preset 구조

```javascript
/**
 * @typedef {Object} PromptPreset
 * @property {string} id
 * @property {string} name
 * @property {string} prompt - 프롬프트 본문
 * @property {string} negative - 네거티브 프롬프트
 */

// nodePresets 전역 객체 (node-presets.js에서 정의)
var nodePresets = {
  render: [ /* ... */ ],
  modifier: [ /* ... */ ],
  upscale: [ /* ... */ ],
  video: [ /* ... */ ]
};
```

**확장 프리셋 필드 (향후 추가 가능):**

```javascript
/**
 * @typedef {Object} PromptPresetFull
 * @property {string} id
 * @property {string} name
 * @property {string} icon - 아이콘 경로
 * @property {string} category - "render" | "modifier" | "upscale" | "video"
 * @property {string[]} applicableNodeTypes - 이 프리셋을 사용할 수 있는 노드 타입
 * @property {string} basePrompt - 프롬프트 본문
 * @property {string} negativePrompt - 네거티브 프롬프트
 * @property {string} visualConstraints - 시각적 제약 조건 (AI에게 전달)
 * @property {string} forbiddenChanges - 금지 변경 사항
 * @property {string} mergeMode - "replace" | "append" 사용자 프롬프트와 병합 방식
 */
```

### 5.2 프리셋 적용 규칙

- 프리셋 클릭 시 프롬프트 바에 해당 프리셋의 텍스트가 채워진다.
- `mergeMode: "replace"` → 프롬프트 바 전체를 프리셋 텍스트로 교체한다.
- `mergeMode: "append"` → 기존 프롬프트 뒤에 프리셋 텍스트를 추가한다.
- 프리셋은 Modifier Node (Details editor)에서만 표시된다. Render Node에서는 별도의 Render Preset (Screen to render, Image to sketch 등)을 표시한다.
- 프리셋 적용 후 사용자가 프롬프트를 수정할 수 있다.

**현재 구현:** node-inspector-ext.js에서 프리셋 클릭 이벤트를 처리한다. `node.data.customPrompt`와 하단 프롬프트 바(`node-prompt-input`)를 동시에 갱신한다.

### 5.3 Render Node 전용 Prompt Presets

Render Mode가 "1. Main renderer"일 때 표시되는 프리셋:

#### Screen to render
```
id: "screen-to-render"
category: "render"
applicableNodeTypes: ["RENDER"]
mergeMode: "replace"
basePrompt: "Create photorealistic image"
negativePrompt: "cartoon, illustration, sketch, low quality, blurry"
visualConstraints: "Preserve exact geometry, camera angle, and spatial layout from the source image."
forbiddenChanges: "Do not add or remove architectural elements. Do not change room proportions."
```

#### Image to sketch
```
id: "image-to-sketch"
category: "render"
applicableNodeTypes: ["RENDER"]
mergeMode: "replace"
basePrompt: "Convert to architectural sketch drawing"
negativePrompt: "photorealistic, photograph, color photo"
visualConstraints: "Maintain architectural proportions and perspective."
forbiddenChanges: "Do not alter building geometry."
```

#### Top view
```
id: "top-view"
category: "render"
applicableNodeTypes: ["RENDER"]
mergeMode: "replace"
basePrompt: "Generate top-down orthographic view"
negativePrompt: "perspective distortion, vanishing point, angled view"
visualConstraints: "Bird's eye view, parallel projection."
forbiddenChanges: "Do not add perspective."
```

#### Side view
```
id: "side-view"
category: "render"
applicableNodeTypes: ["RENDER"]
mergeMode: "replace"
basePrompt: "Generate side elevation view"
negativePrompt: "top view, perspective, aerial"
visualConstraints: "Orthographic side elevation."
forbiddenChanges: "Do not rotate the viewpoint."
```

#### Another view
```
id: "another-view"
category: "render"
applicableNodeTypes: ["RENDER"]
mergeMode: "replace"
basePrompt: "Generate an alternative camera angle of the same scene"
negativePrompt: "identical angle, same viewpoint"
visualConstraints: "Maintain the same room, furniture, and style."
forbiddenChanges: "Do not change the interior design or objects."
```

### 5.4 Modifier Node (Details Editor) 전용 Prompt Presets

Render Mode가 "2. Details editor"일 때 표시되는 프리셋:

#### Enhance realism
```
id: "enhance-realism"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Photorealistic architectural visualization. Enhance material realism, global illumination, reflections, and micro-details. Natural lighting, physically based rendering quality."
negativePrompt: "cartoon, illustration, low quality, oversaturated"
visualConstraints: "Preserve exact geometry, camera angle, and object placement."
forbiddenChanges: "Do NOT add or remove objects. Do NOT change room layout or furniture positions."
```

#### Volumetric rays
```
id: "volumetric-rays"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add cinematic volumetric light rays. Sunlight scattering through space with realistic atmospheric particles. Soft god rays."
negativePrompt: "overexposure, dramatic color shift, artificial lighting, harsh shadows"
visualConstraints: "Preserve all geometry and composition."
forbiddenChanges: "Do NOT change lighting direction. Do NOT alter room geometry."
```

#### Make brighter
```
id: "make-brighter"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Increase overall exposure and brightness. Preserve color balance and material fidelity."
negativePrompt: "blown highlights, overexposure, washed out, color shift"
visualConstraints: "Maintain original lighting direction and shadow positions."
forbiddenChanges: "Do NOT change lighting direction, color temperature, or shadow geometry."
```

#### Closeup
```
id: "closeup"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Create a close-up shot of the main subject. Shallow depth of field, realistic lens compression. Focus on material detail and texture quality."
negativePrompt: "wide angle, distant view, blurry subject, unfocused"
visualConstraints: "Maintain original style and lighting."
forbiddenChanges: "Do NOT change materials or style."
```

#### Axonometry
```
id: "axonometry"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Generate axonometric architectural visualization. Parallel projection. Clean edges, neutral lighting, technical clarity."
negativePrompt: "perspective distortion, vanishing point, artistic, painterly"
visualConstraints: "No perspective distortion."
forbiddenChanges: "Do NOT add artistic effects or stylization."
```

#### Winter
```
id: "winter"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Change season to winter. Snow accumulation on horizontal surfaces. Cold daylight atmosphere. Bare trees, frost on windows."
negativePrompt: "summer, green foliage, warm tones, sunny"
visualConstraints: "Preserve architecture and camera position."
forbiddenChanges: "Do NOT change building geometry or camera angle."
```

#### Autumn
```
id: "autumn"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Change season to autumn. Warm golden and orange foliage. Soft warm-toned daylight."
negativePrompt: "winter, snow, summer green, cold tones"
visualConstraints: "Preserve architecture and camera position."
forbiddenChanges: "Do NOT change building geometry or camera angle."
```

#### Technical drawings
```
id: "technical-drawings"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Architectural technical drawing style. Monochrome or limited color palette. Clear linework, no artistic shading. Orthographic or axonometric projection."
negativePrompt: "photorealistic, color photo, artistic, painterly, textures"
visualConstraints: "Maintain exact proportions and dimensions."
forbiddenChanges: "Do NOT add artistic effects. Do NOT add color beyond line weights."
```

#### Logo
```
id: "logo"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Transform the image into a clean logo-style illustration. Flat colors, simplified shapes. Transparent or white background."
negativePrompt: "photorealistic, textures, lighting effects, gradients, shadows"
visualConstraints: "Simplified geometric shapes."
forbiddenChanges: "Do NOT preserve photorealistic textures."
```

#### Day to night
```
id: "day-to-night"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Convert daytime scene to nighttime. Artificial lighting visible from interior. Natural night sky illumination. Warm window glow."
negativePrompt: "daylight, sunny, bright sky, daytime"
visualConstraints: "Preserve geometry and composition."
forbiddenChanges: "Do NOT change building geometry or furniture."
```

#### Night to day
```
id: "night-to-day"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Convert nighttime scene to daytime. Natural daylight illumination. Clear or partly cloudy sky."
negativePrompt: "night, dark, artificial lighting only, stars"
visualConstraints: "Preserve geometry and composition."
forbiddenChanges: "Do NOT change building geometry or furniture."
```

#### Add people
```
id: "add-people"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add realistic people naturally integrated into the scene. Correct scale, perspective, and lighting. People should not block key architectural elements."
negativePrompt: "mannequins, cartoon people, oversized, floating"
visualConstraints: "Match lighting and perspective of the existing scene."
forbiddenChanges: "Do NOT alter architecture or furniture."
```

#### Add blurred people
```
id: "add-blurred-people"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add motion-blurred people for realism. Long exposure effect. People walking naturally through the space."
negativePrompt: "sharp people, static poses, mannequins"
visualConstraints: "Match lighting and perspective."
forbiddenChanges: "Do NOT alter architecture or furniture."
```

#### Add blurred cars
```
id: "add-blurred-cars"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add motion-blurred cars on roads. Long exposure effect for dynamic movement."
negativePrompt: "static cars, parked, sharp focus on vehicles"
visualConstraints: "Match road perspective and scene scale."
forbiddenChanges: "Do NOT alter buildings or landscape."
```

#### Add cars
```
id: "add-cars"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add realistic parked cars matching scene context. Correct scale and perspective."
negativePrompt: "floating cars, oversized, cartoon"
visualConstraints: "Match lighting and perspective."
forbiddenChanges: "Do NOT alter buildings."
```

#### Add flowers
```
id: "add-flowers"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add natural flowers subtly integrated into the scene. Respect scale, season, and climate."
negativePrompt: "oversized flowers, artificial, plastic"
visualConstraints: "Do not obstruct architecture."
forbiddenChanges: "Do NOT change architecture or major scene elements."
```

#### Add grass
```
id: "add-grass"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add natural grass and ground cover. Realistic lawn texture, appropriate for the climate."
negativePrompt: "artificial turf, oversaturated green, unrealistic"
visualConstraints: "Match terrain and scene context."
forbiddenChanges: "Do NOT change architecture or hardscape."
```

#### Add trees
```
id: "add-trees"
category: "modifier"
applicableNodeTypes: ["MODIFIER"]
mergeMode: "replace"
basePrompt: "Add realistic trees appropriate to the climate and scene. Correct scale and natural placement."
negativePrompt: "cartoon trees, floating, oversized, indoor trees outside"
visualConstraints: "Match season and climate."
forbiddenChanges: "Do NOT obstruct key architectural views."
```

### 5.5 Upscale Node 전용 Prompt Presets

#### Upscale
```
id: "upscale"
category: "upscale"
applicableNodeTypes: ["UPSCALE"]
mergeMode: "replace"
basePrompt: "Upscale"
negativePrompt: ""
visualConstraints: "Preserve all details from original."
forbiddenChanges: "Do NOT alter content or composition."
```

### 5.6 Video Node 전용 Prompt Presets

#### Zoom in
```
id: "zoom-in-video"
category: "video"
applicableNodeTypes: ["VIDEO"]
mergeMode: "replace"
basePrompt: "Zoom in"
negativePrompt: ""
visualConstraints: "Smooth camera motion."
forbiddenChanges: "Do NOT change scene content."
```

### 5.7 프롬프트 최종 조립 함수

```javascript
/**
 * 프롬프트 최종 조립
 * @param {Object} node - 노드 데이터
 * @param {Object|null} preset - 프리셋 객체
 * @returns {string} 최종 프롬프트
 */
function assemblePrompt(node, preset) {
  if (!preset) {
    return node.data.customPrompt || node.data.prompt || '';
  }

  var finalPrompt;
  if (preset.mergeMode === "replace") {
    finalPrompt = preset.prompt;
  } else {
    finalPrompt = (node.data.customPrompt || '') + '\n' + preset.prompt;
  }

  // visualConstraints와 forbiddenChanges는 API 호출 시 system prompt로 전달
  return finalPrompt;
}

/**
 * 시스템 프롬프트 조립 (확장 프리셋 필드 사용 시)
 * @param {Object} preset - 확장 프리셋 객체
 * @returns {string}
 */
function assembleSystemPrompt(preset) {
  return (preset.visualConstraints || '') + '\n' + (preset.forbiddenChanges || '');
}

/**
 * 네거티브 프롬프트 조립
 * @param {Object} preset - 프리셋 객체
 * @returns {string}
 */
function assembleNegativePrompt(preset) {
  return preset.negative || preset.negativePrompt || '';
}
```

**현재 구현:** node-editor.js의 `executeRendererNode`에서 프롬프트를 조합한다. 프리셋은 `node.data.presets` 배열로 스타일 키워드를 결합하고, `node.data.customPrompt`는 사용자 입력 프롬프트이다.

---

## 6. 실행 파이프라인 의사코드

### 6.1 Make 버튼 클릭 시 전체 흐름

```javascript
/**
 * Make 버튼 클릭 시 DAG 실행
 * node-types-ext.js에서 nodeEditor.execute를 오버라이드하여 구현
 */
nodeEditor.execute = function() {
  if (!nodeEditor.dirty) return;

  var makeBtn = document.getElementById('node-make-btn');
  makeBtn.disabled = true;
  makeBtn.innerHTML = '... Processing...';

  // 1. 토폴로지컬 정렬
  var sortedIds = nodeEditor.topologicalSort();

  // 2. 순차 실행 (async/await 사용, Chromium 88 지원)
  (function executeNext(index) {
    if (index >= sortedIds.length) {
      // 모든 노드 실행 완료
      nodeEditor.dirty = false;
      makeBtn.disabled = false;
      makeBtn.innerHTML = 'Make';
      return;
    }

    var nodeId = sortedIds[index];
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.dirty) {
      executeNext(index + 1);
      return;
    }

    var el = document.getElementById('node-' + node.id);
    if (el) el.classList.add('processing');

    // 노드 타입별 실행
    var executePromise;
    if (node.type === 'source') {
      executePromise = nodeEditor.executeSourceNode(node);
    } else if (node.type === 'renderer' || node.type === 'modifier') {
      executePromise = nodeEditor.executeRendererNode(node);
    } else if (node.type === 'upscale') {
      executePromise = executeUpscaleNode(node);
    } else if (node.type === 'video') {
      executePromise = executeVideoNode(node);
    } else {
      executePromise = Promise.resolve();
    }

    executePromise.then(function() {
      node.dirty = false;
      if (el) el.classList.remove('processing');
      nodeEditor.renderNode(node);
      executeNext(index + 1);
    });
  })(0);
};
```

### 6.2 토폴로지컬 정렬

```javascript
/**
 * 노드를 DAG 의존 순서로 정렬
 * @returns {number[]} 정렬된 노드 ID 배열
 */
nodeEditor.topologicalSort = function() {
  var result = [];
  var visited = {};
  var nodeMap = {};
  for (var i = 0; i < nodeEditor.nodes.length; i++) {
    nodeMap[nodeEditor.nodes[i].id] = nodeEditor.nodes[i];
  }

  function visit(nodeId) {
    if (visited[nodeId]) return;
    visited[nodeId] = true;

    // 입력 노드들 먼저 방문
    for (var j = 0; j < nodeEditor.connections.length; j++) {
      var c = nodeEditor.connections[j];
      if (c.to === nodeId) {
        visit(c.from);
      }
    }

    result.push(nodeId);
  }

  for (var k = 0; k < nodeEditor.nodes.length; k++) {
    visit(nodeEditor.nodes[k].id);
  }
  return result;
};
```

### 6.3 Source 노드 실행

```javascript
/**
 * Source 노드 실행 — SketchUp 캡처 콜백 기반
 * @param {Object} node
 * @returns {Promise}
 */
nodeEditor.executeSourceNode = function(node) {
  return new Promise(function(resolve) {
    // Ruby 캡처 콜백 등록
    window._nodeSourceCallback = function(imageBase64) {
      node.data.image = imageBase64;
      node.thumbnail = imageBase64;
      node.dirty = false;
      nodeEditor.renderNode(node);
      nodeEditor.updateInspector();
      requestAnimationFrame(function() { nodeEditor.renderConnections(); });
      resolve();
    };

    // sketchup.callback() 방식으로 Ruby에 캡처 요청
    sketchup.captureScene(state.imageSize);

    // 타임아웃 fallback (10초)
    setTimeout(function() {
      if (window._nodeSourceCallback) {
        resolve();
      }
    }, 10000);
  });
};
```

### 6.4 Renderer 노드 실행 (병렬 지원)

```javascript
/**
 * Renderer 노드 실행 — Ruby를 통한 API 호출
 * @param {Object} node
 * @returns {Promise}
 */
nodeEditor.executeRendererNode = function(node) {
  // 입력 연결 찾기
  var inputConn = null;
  for (var i = 0; i < nodeEditor.connections.length; i++) {
    if (nodeEditor.connections[i].to === node.id) {
      inputConn = nodeEditor.connections[i];
      break;
    }
  }
  if (!inputConn) return Promise.resolve();

  var sourceNode = null;
  for (var j = 0; j < nodeEditor.nodes.length; j++) {
    if (nodeEditor.nodes[j].id === inputConn.from) {
      sourceNode = nodeEditor.nodes[j];
      break;
    }
  }
  if (!sourceNode || !sourceNode.data.image) return Promise.resolve();

  var renderId = 'node_' + node.id;

  return new Promise(function(resolve) {
    // 노드별 콜백 등록
    window._nodeRendererCallbacks[renderId] = function(result) {
      if (result.success) {
        node.thumbnail = result.image;
        node.data.image = result.image;
        nodeEditor.renderNode(node);
        if (nodeEditor.selectedNode === node.id) {
          nodeEditor.updateInspector();
        }
        requestAnimationFrame(function() { nodeEditor.renderConnections(); });
      } else {
        console.error('[Node] Render failed:', renderId, result.error);
      }
      resolve();
    };

    // 프롬프트 조합
    var prompt = node.data.customPrompt || 'Create photorealistic interior render';
    if (node.data.presets && node.data.presets.length > 0) {
      prompt += '. Style: ' + node.data.presets.join(', ');
    }
    var negPrompt = node.data.negativePrompt || '';

    // Ruby에 렌더링 요청 (render_id 포함 -> Ruby Thread로 병렬 실행)
    sketchup.startRender(
      sourceNode.data.time,
      sourceNode.data.light,
      prompt,
      negPrompt,
      renderId
    );

    // 타임아웃 fallback (120초)
    setTimeout(function() {
      if (window._nodeRendererCallbacks[renderId]) {
        console.warn('[Node] Render timeout:', renderId);
        window._nodeRendererCallbacks[renderId]({ success: false, error: 'Timeout' });
      }
    }, 120000);
  });
};
```

### 6.5 에러 전파

```javascript
/**
 * 에러 발생 시 하위 노드를 blocked 처리
 * @param {number} nodeId - 에러 발생 노드 ID
 */
function markDescendantsAsBlocked(nodeId) {
  var descendants = [];
  var queue = [nodeId];
  var visited = {};

  while (queue.length > 0) {
    var current = queue.shift();
    for (var i = 0; i < nodeEditor.connections.length; i++) {
      var c = nodeEditor.connections[i];
      if (c.from === current && !visited[c.to]) {
        visited[c.to] = true;
        descendants.push(c.to);
        queue.push(c.to);
      }
    }
  }

  for (var j = 0; j < descendants.length; j++) {
    var el = document.getElementById('node-' + descendants[j]);
    if (el) el.classList.add('blocked');
  }
}
```

### 6.6 비용 사전 표시

```javascript
/**
 * 선택된 노드 기준 예상 비용 계산
 * @param {number} selectedNodeId
 * @returns {number} 예상 크레딧
 */
function calculateEstimatedCost(selectedNodeId) {
  // 현재 구현에서는 dirty 노드 수 기반 간이 계산
  var count = 0;
  for (var i = 0; i < nodeEditor.nodes.length; i++) {
    var node = nodeEditor.nodes[i];
    if (node.dirty && node.type !== 'source' && node.type !== 'compare') {
      count += getCostForType(node.type, node.data);
    }
  }
  return count;
}

function getCostForType(type, data) {
  if (type === 'source' || type === 'compare') return 0;
  if (type === 'renderer') return 1;
  if (type === 'modifier') return 1;
  if (type === 'upscale') return data.scale === 4 ? 4 : 2;
  if (type === 'video') return data.duration === 10 ? 10 : 5;
  return 1;
}
```

Make 버튼 옆에 `Credits: {estimatedCost}`를 표시한다.

---

## 7. SketchUp 플러그인 연동 명세

### 7.1 플러그인 역할

SketchUp Ruby 플러그인은 다음만 수행한다:
- Viewport 이미지 캡처
- Camera/Scene 메타데이터 수집
- 결과 이미지 수신 및 적용
- HtmlDialog 내부의 Node Editor UI 호스팅
- AI API 호출 중개 (Ruby Thread 기반)

다음은 수행하지 않는다:
- 노드 그래프 로직 (JS 담당)
- 프롬프트 조합 로직 (JS 담당)
- DAG 관리 (JS 담당)

### 7.2 통신 방식: sketchup.callback() / execute_script()

**JS → Ruby 방향:** `callRuby()` 함수 또는 `sketchup.*` 래퍼를 통해 `skp:` 프로토콜로 호출한다.

```javascript
// core.js에서 정의
function callRuby(action) {
  var args = Array.prototype.slice.call(arguments, 1);
  var param = args.length > 0 ? JSON.stringify(args) : '';
  window.location = 'skp:' + action + '@' + encodeURIComponent(param);
}

var sketchup = {
  captureScene: function(size) { callRuby('capture_scene', size); },
  startRender: function(time, light, prompt, negativePrompt, renderId) {
    callRuby('start_render', time, light, prompt, negativePrompt, renderId || '');
  },
  generateAutoPrompt: function(style, time, light) {
    callRuby('generate_auto_prompt', style || '', time || 'day', light || 'on');
  },
  saveImage: function() { callRuby('save_image', ''); },
  // ... 기타 콜백
};
```

**Ruby → JS 방향:** `dialog.execute_script()` 메서드로 JS 함수를 호출한다. 대용량 데이터(이미지 base64)는 30KB 청크 폴링 방식을 사용한다.

```ruby
# Ruby에서 JS 함수 호출 예시
dialog.execute_script("onCaptureComplete('#{base64_data}')")
dialog.execute_script("onNodeRenderComplete('#{render_id}', '#{base64_data}')")
```

**주의 (HtmlDialog 크래시 방지):**
- `execute_script()`로 500KB 이상 데이터를 한 번에 전송하면 안 된다.
- Thread 내에서 직접 `execute_script()`를 호출하면 안 된다. `UI.start_timer` 사용.
- 대용량 이미지는 청크 분할 전송 사용.

### 7.3 Viewport 캡처

```ruby
module NanoBanana
  def self.capture_viewport(options = {})
    view = Sketchup.active_model.active_view
    path = File.join(temp_dir, "capture_#{Time.now.to_i}.png")

    view.write_image({
      filename: path,
      width: options[:width] || 1920,
      height: options[:height] || 1080,
      antialias: true,
      compression: 0.9
    })

    path
  end
end
```

### 7.4 Camera/Scene 메타데이터 수집

```ruby
module NanoBanana
  def self.collect_scene_meta
    model = Sketchup.active_model
    view = model.active_view
    camera = view.camera

    {
      camera: {
        eye: camera.eye.to_a,
        target: camera.target.to_a,
        up: camera.up.to_a,
        fov: camera.fov,
        perspective: camera.perspective?
      },
      scene: {
        modelName: File.basename(model.path, ".skp"),
        sceneId: model.pages.selected_page&.name,
        style: model.styles.active_style.name,
        shadow: model.shadow_info["DisplayShadows"]
      },
      rendering: {
        edgeDisplay: model.rendering_options["EdgeDisplayMode"],
        faceStyle: model.rendering_options["FaceStyle"]
      }
    }
  end
end
```

### 7.5 병렬 렌더링 콜백 구조

```ruby
# main.rb - 병렬 렌더링 지원
dialog.add_action_callback("start_render") do |_ctx, *args|
  time, light, prompt, negative_prompt, render_id = parse_args(args)

  Thread.new do
    begin
      result_base64 = api_client.render(prompt, negative_prompt, source_image)

      # UI 스레드에서 JS 콜백 호출
      UI.start_timer(0, false) do
        if render_id && !render_id.empty?
          dialog.execute_script("onNodeRenderComplete('#{render_id}', '#{result_base64}')")
        else
          dialog.execute_script("onRenderComplete('#{result_base64}', '#{scene_name}')")
        end
      end
    rescue => e
      UI.start_timer(0, false) do
        if render_id && !render_id.empty?
          dialog.execute_script("onNodeRenderError('#{render_id}', '#{e.message}')")
        else
          dialog.execute_script("onRenderError('#{e.message}', '#{scene_name}')")
        end
      end
    end
  end
end
```

### 7.6 JS 콜백 등록 패턴

```javascript
// render-mode.js - 병렬 렌더링 콜백 맵
window._nodeRendererCallbacks = {};

function onNodeRenderComplete(renderId, base64) {
  var cb = window._nodeRendererCallbacks[renderId];
  if (cb) {
    cb({ success: true, image: base64 });
    delete window._nodeRendererCallbacks[renderId];
  }
}

function onNodeRenderError(renderId, errorMsg) {
  var cb = window._nodeRendererCallbacks[renderId];
  if (cb) {
    cb({ success: false, error: errorMsg });
    delete window._nodeRendererCallbacks[renderId];
  }
}
```

### 7.7 전송 방식 요약

| 방향 | 방법 | 용도 |
|---|---|---|
| JS → Ruby | `skp:` 프로토콜 (`callRuby()`) | 액션 요청 (캡처, 렌더, 저장) |
| Ruby → JS | `execute_script()` | 결과 콜백 (이미지, 상태, 에러) |
| Ruby → JS (대용량) | 청크 폴링 (30KB 분할) | 대용량 이미지 전송 |

---

## 8. UX / 동작 규칙

### 8.1 노드 캔버스 동작

**이미지 로드:**
- 캔버스 빈 영역에 이미지 드래그 앤 드롭 → Source 노드 자동 생성
- Browse 버튼 클릭 → 파일 선택 → Source 노드 자동 생성
- SketchUp에서 전송 → Source 노드 자동 생성

**노드 생성:**
- Source 노드의 출력 포트에서 드래그 시작 → 연결 대상 없이 놓으면 Render Mode 선택 메뉴 표시 → 선택한 모드의 노드 자동 생성 및 연결
- 기존 노드의 출력 포트에서 드래그 → 동일 방식
- 상단 툴바의 Source/Renderer/Modifier/Upscale/Video 버튼 클릭으로도 생성 가능
- 노드 카드의 미니 툴바(+Source, +Renderer, +Animation) 버튼 클릭 시 해당 노드 아래에 자동 배치 및 연결

**노드 연결:**
- 출력 포트 → 입력 포트 드래그로 연결 (mousedown → mouseup)
- 타입 호환: Image 출력 → Image 입력만 가능, Video 출력 → Video 입력만 가능
- 하나의 출력 포트에서 여러 입력 포트로 분기 가능
- 하나의 입력 포트에는 하나의 연결만 허용 (기존 연결 자동 제거)
- 순환 연결 시도 시 연결 거부 (node-types-ext.js의 `_hasCycle` 검사)
- `_noOutputTypes` 레지스트리에 등록된 타입(compare, video)은 출력 연결 불가

**연결선 렌더링:** Canvas API 기반. `<canvas id="node-connections">`에 베지어 곡선으로 그린다. SVG DOM 조작 대신 Canvas 직접 그리기를 사용하여 성능을 보장한다.

```javascript
// 연결선 그리기 (node-editor.js)
ctx.strokeStyle = '#00d4aa';
ctx.lineWidth = 2.5;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
ctx.stroke();
```

**노드 클릭:**
- 단일 클릭: `nodeEditor.selectNode(nodeId)` 호출. InspectorPanel에 해당 노드 설정 표시 + Preview 탭에 결과 이미지 표시
- 빈 캔버스 클릭: `nodeEditor.selectNode(null)` 호출. Inspector 빈 상태
- 선택 상태는 CSS 클래스 `.selected` 토글로 표현 (innerHTML 재생성 안함)

**노드 드래그:** `mousedown` → `mousemove` → `mouseup` 이벤트 체인. `requestAnimationFrame`으로 스로틀링. `transform: translate(x, y)`로 GPU 가속 이동. 드래그 중 연결선 실시간 업데이트.

**캔버스 우클릭 메뉴 (빈 영역):**
- Load image... → 파일 선택 → Source 노드 생성
- Clear all → 모든 노드/엣지 삭제
- Rearrange nodes → DAG 자동 정렬 (연결 수가 적은 노드가 하단, 많은 노드가 상단)

**노드 우클릭 메뉴:**
- Make → 해당 노드 기준 실행
- Duplicate → 노드 복제 (파라미터 복사, 결과 미포함)
- Delete → 노드 삭제 + 연결된 엣지 삭제
- Compare A → CompareTab의 A 슬롯에 할당
- Compare B → CompareTab의 B 슬롯에 할당

### 8.2 Inspector Panel 동작

**탭 구성 (상단):**
- Preview: 선택 노드의 결과 이미지. 결과 없으면 빈 상태. 우측 상단에 해상도 표시 (예: "832 x 1048"). 좌측 상단에 확대율 표시 (예: "65%").
- Compare: A/B 슬라이더 비교
- Draw: 이미지 위 드로잉 + 마스킹

**Enlarge 버튼:** Preview 이미지를 전체 캔버스 영역으로 확대한다. `node-enlarged-preview` 요소를 활성화하고 `node-canvas-area`를 최소화한다. Escape 키로 해제 가능.

**노드 그래프 미니맵:** Enlarge 모드 활성 시 Inspector의 Preview 영역이 미니맵 모드(`.minimap-mode`)로 전환된다. 현재 선택 노드를 하이라이트한다.

**Render Settings 섹션 (아코디언):**
- Render Mode 드롭다운: 노드 타입에 따라 표시 항목이 변경된다.
  - SOURCE 선택 시: Time(Day/Night/Sunset) + Light(On/Off) 버튼
  - RENDER 선택 시: Resolution(1024/2048/4096) + Aspect Ratio + Preset 그리드
  - MODIFIER 선택 시: Modifier Presets 그리드
  - UPSCALE 선택 시: Scale(2x/4x) + Optimized for + Creativity/Detail strength/Similarity 슬라이더
  - VIDEO 선택 시: Engine(Kling/Seedance) + Duration(5s/10s) + Motion Presets
  - COMPARE 선택 시: Mode(Slider/Side by Side)

**Prompt Presets 섹션:**
- 노드 타입에 따라 표시되는 프리셋이 변경된다.
- RENDER → Screen to render, Image to sketch, Top view, Side view, Another view
- MODIFIER → Enhance realism, Volumetric rays, Make brighter, Closeup, Axonometry, Winter, Autumn, Technical drawings, Logo, Day to night, Night to day, Add people, Add blurred people, Add blurred cars, Add cars, Add flowers, Add grass, Add trees
- UPSCALE → Upscale
- VIDEO → Zoom in (+ 기타 카메라 모션 프리셋)
- 프리셋 클릭 → 하단 프롬프트 바에 해당 텍스트 채움

**노드 미선택 시:** Render Settings와 Prompt Presets는 빈 상태로 "Select a node" 메시지 표시.

### 8.3 Draw 탭 동작

**도구 바 (상단):**
- Pen (기본): 자유 드로잉
- Eraser: 그린 영역 지우기
- Move (커서): 이미지 팬
- Delete (휴지통): 전체 드로잉 삭제
- Size 슬라이더: 브러시 크기 조절
- Color 드롭다운: Red / Green / Blue / Yellow

**색상별 의미:**
- Red: 해당 영역에 객체 추가
- Green: 해당 영역의 객체 제거
- Blue: 교체
- Yellow: 스타일 변경

**이미지 붙여넣기:** Ctrl+V로 클립보드 이미지를 캔버스에 붙여넣기 가능. 붙여넣은 이미지는 드래그로 위치 조정 가능.

**마스크 생성:** Draw 탭에서 그린 내용은 마스크 이미지(PNG, 투명 배경)로 변환되어 Modifier Node의 `mask` 파라미터에 저장된다. Canvas API의 `toDataURL('image/png')`으로 추출.

### 8.4 Make 버튼 동작

- 클릭 시 전체 DAG를 토폴로지컬 순서로 실행한다.
- 이미 `dirty = false`이고 파라미터 변경이 없는 노드는 스킵한다.
- 실행 중 Make 버튼은 비활성화된다 (로딩 스피너 표시).
- 실행 완료 후 결과 이미지가 노드 썸네일에 표시된다.
- 실행 완료 후 히스토리에 자동 저장된다.

### 8.5 History 동작

- 좌측 사이드바 History 아이콘 클릭 → History 갤러리 표시
- 모든 실행 결과가 시간순으로 그리드 표시 (타임스탬프 포함)
- 카드 클릭 시 해당 결과 이미지를 렌더 뷰에 로드
- 히스토리는 `~/.sketchupshow/history.json`에 최대 500개 저장
- Ruby `callRuby('save_history', json)` / `callRuby('load_history')`로 관리

### 8.6 Undo/Redo

- 그래프 편집(노드 추가/삭제, 엣지 연결/해제, 노드 이동, 파라미터 변경)은 Undo/Redo 스택에 기록한다.
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- 실행 결과(AI 렌더링)는 Undo 대상이 아니다. 히스토리에서 복원한다.

### 8.7 노드 자동 정렬 (Rearrange)

- 우클릭 → Rearrange nodes 선택 시
- 연결이 적은 노드(말단)가 하단에 배치된다
- 연결이 많은 노드(허브)가 상단에 배치된다
- 수평 간격: 250px, 수직 간격: 150px (현재 카드 간격: 260px)
- Source 노드는 항상 좌측에 배치된다

### 8.8 크레딧 표시

- Make 버튼 하단에 예상 소모 크레딧 표시: "Credits: N"
- 잔액 부족 시 Make 버튼 비활성화 + "Not enough credits" 메시지

### 8.9 노드 상태 시각 표시

| 상태 | 시각적 표현 | CSS 클래스 |
|---|---|---|
| idle | 회색 테두리 | (기본) |
| dirty | 변경됨 표시 | `.dirty` |
| processing | 청록색 테두리 + 로딩 스피너 | `.processing` |
| done | 흰색 테두리 + 결과 썸네일 표시 | `dirty = false` |
| error | 빨간색 테두리 + 에러 아이콘 | (에러 시) |
| selected | 강조 테두리 | `.selected` |
| dragging | 드래그 중 효과 | `.dragging` |

노드 프로그레스 바: `.node-progress` > `.node-progress-bar` 요소로 실행 진행률 표시.

### 8.10 연결 규칙 요약

| 출력 타입 | 허용 입력 타입 | 비고 |
|---|---|---|
| Image | Image | 모든 이미지 노드 간 연결 가능 |
| Video | 없음 | Video는 말단 노드 (`_noOutputTypes.video = true`) |
| 없음 (Source) | - | Source는 입력 없음 |
| 없음 (Compare) | - | Compare는 출력 없음 (`_noOutputTypes.compare = true`) |

- 하나의 출력 → 여러 입력: 허용 (분기)
- 여러 출력 → 하나의 입력: 금지 (Compare Node 제외, 2개 입력)
- 순환 연결: 금지 (`_hasCycle` 검사)

### 8.11 모드 전환

좌측 아이콘 메뉴로 3가지 모드를 전환한다:

| 모드 | 메뉴 ID | 함수 | 설명 |
|---|---|---|---|
| Render | `menu-render` | `switchToRenderMode()` | 기존 렌더 UI (Source/Result 패널) |
| Node Editor | `menu-camera` | `switchToNodeMode()` | 노드 그래프 에디터 |
| Mix | `menu-mix` | `switchToMixMode()` | 인페인팅/오브젝트 배치 |

모드 전환 시 각 모드의 컨테이너 DOM 요소에 `.active` 클래스를 토글한다. Node 모드 진입 시 초기 노드가 없으면 Source + Renderer 쌍을 자동 생성하고 연결한다.

---

## 부록 A. 상태 관리 구조 (전역 객체)

```javascript
// ========================================
// core.js - 앱 전체 상태
// ========================================
var state = {
  originalImage: null,      // 원본 캡처 이미지 base64
  renderImage: null,        // 렌더 결과 이미지 base64
  isRendering: false,       // 렌더링 진행 중 여부
  apiConnected: false,      // API 연결 상태
  converted: false,         // Convert 완료 여부
  timePreset: 'day',        // 시간 프리셋
  lightSwitch: 'on',        // 조명 상태
  imageSize: '1024',        // 이미지 크기
  engine: 'replicate',      // 렌더 엔진
  resultPanels: [{ id: 1, image: null }],  // 결과 패널 목록
  nextResultId: 2,
  currentScene: null,       // 현재 활성 씬 이름
  history: [],              // 히스토리 배열
  nextHistoryId: 1
};

// ========================================
// node-editor.js - 노드 에디터 상태
// ========================================
var nodeEditor = {
  // --- 노드/연결 데이터 ---
  nodes: [],                // NodeData[] 배열
  connections: [],          // { from: nodeId, to: nodeId }[] 배열
  nextNodeId: 1,            // 다음 노드 ID

  // --- UI 상태 ---
  selectedNode: null,       // 현재 선택된 노드 ID (null이면 미선택)
  draggingNode: null,       // 드래그 중인 노드 참조
  dragOffset: { x: 0, y: 0 },
  connecting: null,         // 연결 중인 노드 { fromId, fromPort }
  dirty: false,             // 변경 여부 (Make 버튼 활성화)

  // --- 확장 레지스트리 ---
  _icons: {},               // 타입별 SVG 아이콘
  _titles: {},              // 타입별 표시 이름
  _noOutputTypes: {},       // 출력 포트 없는 타입
  _noInputTypes: {},        // 입력 포트 없는 타입

  // --- 메서드 ---
  addNode: function(type, x, y) { /* ... */ },
  addNodeBelow: function(clickedNode, newType) { /* ... */ },
  deleteNode: function(nodeId) { /* ... */ },
  selectNode: function(nodeId) { /* ... */ },
  connect: function(fromId, toId) { /* ... */ },
  renderNode: function(node, positionOnly) { /* ... */ },
  renderConnections: function() { /* ... */ },
  updateInspector: function() { /* ... */ },
  execute: function() { /* ... */ },
  executeSourceNode: function(node) { /* ... */ },
  executeRendererNode: function(node) { /* ... */ },
  topologicalSort: function() { /* ... */ },
  markDirty: function() { /* ... */ },
  getDefaultData: function(type) { /* ... */ },
  updatePortStates: function() { /* ... */ }
};

// ========================================
// mix-mode.js - 믹스 모드 상태
// ========================================
var mixState = {
  mode: 'add-remove',       // 서브모드
  baseImage: null,           // Image 객체
  baseImageBase64: null,     // base64 문자열
  objectImage: null,         // 오브젝트 이미지 base64
  materialImage: null,       // 재질 이미지 base64
  floorplanImage: null,      // 도면 이미지 base64
  hotspots: [],              // 핫스팟 배열
  selectedHotspot: null,     // 선택된 핫스팟 ID
  brushSize: 30,
  brushColor: 'rgba(255, 59, 48, 0.5)',
  tool: 'brush',
  isDrawing: false,
  canvasScale: 1,
  sceneContext: null         // SketchUp 씬 컨텍스트
};

// ========================================
// node-presets.js - 프리셋 데이터 (읽기 전용)
// ========================================
var nodePresets = {
  render: [ /* PromptPreset[] */ ],
  modifier: [ /* PromptPreset[] */ ],
  upscale: [ /* PromptPreset[] */ ],
  video: [ /* PromptPreset[] */ ]
};
```

## 부록 B. 엔진 어댑터 구조

```javascript
/**
 * @typedef {Object} EngineAdapter
 * @property {string} id
 * @property {string} type - "image" | "video" | "upscale"
 * @property {function} execute - 실행 함수 (Promise 반환)
 */

/**
 * @typedef {Object} RenderInput
 * @property {string} engine
 * @property {string} image - base64
 * @property {string} prompt
 * @property {string} systemPrompt
 * @property {string} negativePrompt
 * @property {number|null} seed
 * @property {string} resolution
 */

/**
 * @typedef {Object} ModifierInput
 * @property {string} image - base64
 * @property {string} prompt
 * @property {string} systemPrompt
 * @property {string} negativePrompt
 * @property {string|null} mask - base64
 * @property {Object[]} maskLayers
 */

/**
 * @typedef {Object} UpscaleInput
 * @property {string} image - base64
 * @property {number} scale
 * @property {string} optimizedFor
 * @property {number} creativity
 * @property {number} detailStrength
 * @property {number} similarity
 * @property {number} promptStrength
 * @property {string} prompt
 */

/**
 * @typedef {Object} VideoInput
 * @property {string} engine
 * @property {string} image - base64
 * @property {string|null} endFrame - base64
 * @property {number} duration
 * @property {string} prompt
 */
```

**현재 구현:** 엔진 어댑터 패턴은 아직 추상화되지 않았다. 모든 API 호출은 Ruby 브릿지(`sketchup.startRender`)를 통해 이루어진다. Ruby 측에서 엔진 디스패치를 처리하며, JS는 콜백만 수신한다.

## 부록 C. 비용 테이블

| 노드 타입 | 크레딧 |
|---|---|
| SOURCE | 0 |
| RENDER (main) | 1 |
| RENDER (experimental) | 1 |
| MODIFIER (details editor) | 1 |
| UPSCALE (2x) | 2 |
| UPSCALE (4x) | 4 |
| VIDEO (5초) | 5 |
| VIDEO (10초) | 10 |
| COMPARE | 0 |

## 부록 D. 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Vanilla JavaScript (ES5 호환, Chromium 88 CEF) |
| UI 호스팅 | SketchUp HtmlDialog |
| 노드 그래프 | 커스텀 구현 (Canvas API 연결선 + DOM 노드 카드) |
| 상태 관리 | 전역 `var` 객체 (`state`, `nodeEditor`, `mixState`, `nodePresets`) |
| 드로잉 캔버스 | Canvas API (네이티브) |
| 비디오 재생 | HTML5 Video |
| SketchUp 플러그인 | Ruby (SketchUp Ruby API 2021+) |
| JS ↔ Ruby 통신 | `skp:` 프로토콜 (JS→Ruby) + `execute_script()` (Ruby→JS) |
| 스타일링 | 일반 CSS (빌드 없음, `<link>` 태그) |
| 아이콘 | 인라인 SVG |
| 빌드 도구 | 없음 (`<script src>` 직접 로드) |

---

*이 문서는 SketchUp HtmlDialog 환경에서의 Vanilla JS 노드 에디터 구현을 위한 전체 기획이다. 별도 빌드 도구나 npm 패키지 없이, plain `<script src>` 태그와 전역 `var` 객체 방식으로 구현된다.*
