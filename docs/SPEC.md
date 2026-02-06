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
         │ REST (image + JSON meta)
         ▼
┌─────────────────────────────────┐
│   Node Graph Editor (React)     │
│                                 │
│   - NodeCanvas (pan/zoom/drag)  │
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
         │ API calls
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
- 본 시스템은 기존 렌더링 UI 위에 Node Graph를 추가하는 구조이다.
- 모든 AI 실행은 Make 버튼 클릭 시에만 발생한다. 노드 연결/수정 시 자동 실행은 없다.
- 노드 그래프는 DAG(Directed Acyclic Graph)이다. 순환 연결은 금지한다.

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

## 2. React 기준 컴포넌트 구조

### 2.1 디렉토리 구조

```
/src
 ├─ app/
 │   ├─ App.tsx                    // 루트 컴포넌트
 │   ├─ Router.tsx                 // 라우팅
 │   └─ store.ts                   // Zustand 루트 스토어
 │
 ├─ editor/
 │   ├─ NodeEditor.tsx             // 전체 에디터 레이아웃 (좌측 사이드바 + 캔버스 + 우측 패널)
 │   │
 │   ├─ canvas/
 │   │   ├─ NodeCanvas.tsx         // React Flow 기반 캔버스 (pan, zoom, grid)
 │   │   ├─ ConnectionLayer.tsx    // 노드 간 연결선 렌더링
 │   │   └─ CanvasContextMenu.tsx  // 캔버스 우클릭 메뉴 (Load image / Clear all / Rearrange nodes)
 │   │
 │   ├─ nodes/
 │   │   ├─ BaseNode.tsx           // 공통 노드 셸 (썸네일 + 라벨 + 포트 + 상태 표시)
 │   │   ├─ SourceNode.tsx         // Source 이미지 노드
 │   │   ├─ RenderNode.tsx         // Main renderer / Experimental renderer
 │   │   ├─ ModifierNode.tsx       // Details editor (프롬프트 기반 수정)
 │   │   ├─ UpscaleNode.tsx        // Creative upscaler
 │   │   ├─ VideoNode.tsx          // Image to video
 │   │   └─ CompareNode.tsx        // A/B 비교 (비실행 노드)
 │   │
 │   ├─ panels/
 │   │   ├─ InspectorPanel.tsx     // 우측 통합 패널 (Preview + Render settings + Prompt Presets)
 │   │   ├─ PreviewTab.tsx         // Preview 탭: 선택 노드 결과 이미지 표시 + 확대
 │   │   ├─ CompareTab.tsx         // Compare 탭: A/B 슬라이더 비교
 │   │   ├─ DrawTab.tsx            // Draw 탭: 이미지 위 드로잉 + 마스킹
 │   │   ├─ RenderSettings.tsx     // Render Mode 드롭다운 + 엔진별 파라미터
 │   │   ├─ PromptPresets.tsx      // 프리셋 아이콘 그리드
 │   │   └─ UpscaleSettings.tsx    // Upscale 전용 설정 (배율, Creativity, Detail strength 등)
 │   │
 │   ├─ sidebar/
 │   │   ├─ LeftSidebar.tsx        // 좌측 아이콘 사이드바
 │   │   ├─ RenderButton.tsx       // 노드 그래프 뷰 진입 아이콘
 │   │   ├─ HistoryButton.tsx      // History 페이지 진입
 │   │   ├─ AccountButton.tsx      // Account 설정
 │   │   ├─ TutorialButton.tsx     // Tutorial
 │   │   ├─ SupportButton.tsx      // Support 링크
 │   │   └─ SettingsButton.tsx     // Settings
 │   │
 │   ├─ toolbar/
 │   │   ├─ PromptBar.tsx          // 하단 프롬프트 입력 바
 │   │   ├─ MakeButton.tsx         // Make 실행 버튼 + 크레딧 표시
 │   │   └─ EnlargeButton.tsx      // 우측 상단 Enlarge 버튼
 │   │
 │   └─ history/
 │       ├─ HistoryPage.tsx        // 히스토리 전체 페이지
 │       └─ HistoryCard.tsx        // 개별 히스토리 카드 (Use / Save 버튼)
 │
 ├─ drawing/
 │   ├─ DrawCanvas.tsx             // 드로잉 캔버스 (pen, eraser, move)
 │   ├─ DrawToolbar.tsx            // 드로잉 도구 (펜/지우개/커서/삭제 + 브러시 크기 + 색상)
 │   └─ PasteHandler.tsx           // Ctrl+V 이미지 붙여넣기 처리
 │
 ├─ state/
 │   ├─ graphStore.ts              // 노드/엣지 상태 (nodes[], edges[], selectedNodeId)
 │   ├─ executionStore.ts          // 실행 상태 (queue, running, results)
 │   ├─ historyStore.ts            // 히스토리 스냅샷 관리
 │   ├─ uiStore.ts                 // UI 상태 (activeTab, zoom, pan)
 │   └─ creditStore.ts             // 크레딧 잔액 및 비용 계산
 │
 ├─ engine/
 │   ├─ pipelineExecutor.ts        // DAG 정렬 + 순차/병렬 실행
 │   ├─ renderQueue.ts             // 실행 큐 관리
 │   ├─ cacheManager.ts            // 파라미터 해시 기반 캐시
 │   └─ adapters/
 │       ├─ mainRenderer.ts        // 1. Main renderer API 어댑터
 │       ├─ detailsEditor.ts       // 2. Details editor API 어댑터
 │       ├─ creativeUpscaler.ts    // 3. Creative upscaler API 어댑터
 │       ├─ imageToVideo.ts        // 4. Image to video API 어댑터
 │       └─ experimentalRenderer.ts // Experimental 엔진 어댑터
 │
 ├─ api/
 │   ├─ sketchupBridge.ts          // SketchUp ↔ Web 통신
 │   ├─ renderApi.ts               // AI 렌더 API 호출
 │   └─ historyApi.ts              // 히스토리 저장/조회
 │
 └─ types/
     ├─ node.ts                    // 노드 타입 정의
     ├─ engine.ts                  // 엔진 인터페이스
     ├─ preset.ts                  // 프리셋 타입
     └─ graph.ts                   // 그래프 전체 타입
```

### 2.2 컴포넌트 책임 분리

**NodeEditor.tsx** — 전체 에디터 레이아웃을 구성한다. 좌측 LeftSidebar, 중앙 NodeCanvas, 우측 InspectorPanel, 하단 PromptBar + MakeButton을 배치한다.

**NodeCanvas.tsx** — React Flow 기반. 노드 배치, 드래그 이동, 엣지 연결, pan/zoom을 처리한다. 노드 클릭 시 `graphStore.selectedNodeId`를 갱신한다. 노드 더블클릭 시 해당 결과 이미지를 PreviewTab에서 100% 확대 표시한다.

**BaseNode.tsx** — 모든 노드의 공통 셸. 썸네일 이미지, 노드 라벨(Render Mode 이름 + 프롬프트 요약), 입출력 포트(원형 커넥터), 실행 상태 인디케이터(idle/running/done/error)를 렌더링한다. Vizmaker 스크린샷 기준으로 노드는 직사각형 카드이며 내부에 결과 이미지 썸네일이 표시된다.

**InspectorPanel.tsx** — 우측 패널. 상단에 Enlarge 버튼, 그 아래에 Preview/Compare/Draw 탭 전환, 그 아래에 노드 그래프 미니맵(선택 노드 하이라이트), 그 아래에 Render Settings 섹션, 최하단에 Prompt Presets 그리드를 표시한다. 노드 미선택 시 빈 상태로 표시한다.

**PromptBar.tsx** — 하단 전체 너비 텍스트 입력. 프롬프트를 직접 입력하거나 프리셋 클릭 시 자동 채워진다. Vizmaker 기준 플레이스홀더: "Enter your image prompt here..."

**MakeButton.tsx** — 하단 우측. 클릭 시 현재 선택된 노드를 기준으로 상위 DAG를 실행한다. 버튼 하단에 소모 크레딧을 표시한다 (예: "Credits: 1").

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
| `origin` | `"sketchup" \| "upload" \| "paste"` | `"upload"` | 이미지 소스 |
| `image` | `string` | `""` | 이미지 URL 또는 base64 |
| `cameraLocked` | `boolean` | `false` | SketchUp 카메라 고정 여부 |
| `sceneMeta` | `SceneMeta \| null` | `null` | SketchUp 씬 메타데이터 |

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
| `engine` | `"main" \| "experimental-exterior" \| "experimental-interior"` | `"main"` | 렌더 엔진 |
| `prompt` | `string` | `"Create photorealistic image"` | 사용자 프롬프트 |
| `presetId` | `string \| null` | `null` | 적용된 Prompt Preset ID |
| `seed` | `number \| null` | `null` | null이면 랜덤 |
| `resolution` | `string` | `"1200x1200"` | 출력 해상도 |

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
| `presetId` | `string \| null` | `null` | 적용된 Prompt Preset ID |
| `mask` | `string \| null` | `null` | Draw 탭에서 생성된 마스크 이미지 (base64) |
| `maskLayers` | `MaskLayer[]` | `[]` | 색상별 마스크 레이어 목록 |

**MaskLayer 구조:**

```typescript
interface MaskLayer {
  color: "red" | "green" | "blue" | "yellow"
  action: "add" | "remove" | "replace"
  description: string
}
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
| `scale` | `2 \| 4` | `2` | 확대 배율 |
| `optimizedFor` | `"standard" \| "detail" \| "smooth"` | `"standard"` | 최적화 모드 |
| `creativity` | `number` | `0.0` | 0.0~1.0 범위 |
| `detailStrength` | `number` | `0.0` | HDR 디테일 강도 0.0~1.0 |
| `similarity` | `number` | `0.0` | 원본 유사도 0.0~1.0 |
| `promptStrength` | `number` | `0.0` | 프롬프트 영향도 0.0~1.0 |
| `prompt` | `string` | `"Upscale"` | 업스케일 프롬프트 |

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
| `engine` | `"kling" \| "seedance"` | `"kling"` | 비디오 생성 엔진 |
| `duration` | `5 \| 10` | `5` | 영상 길이(초) |
| `prompt` | `string` | `"Move forward"` | 카메라 모션 프롬프트 |
| `endFrameImage` | `string \| null` | `null` | 종료 프레임 이미지 (2프레임 전환용) |

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
| `mode` | `"slider" \| "side_by_side"` | `"slider"` | 비교 모드 |

**동작:** 두 이미지를 슬라이더 또는 나란히 비교한다. 노드 우클릭 → "Compare A" / "Compare B"로 슬롯에 할당한다. AI 실행을 수행하지 않으며 크레딧을 소모하지 않는다.

---

## 4. 노드 JSON 스키마

### 4.1 전체 그래프 스키마

```typescript
interface Graph {
  graphId: string                    // UUID
  nodes: NodeData[]
  edges: EdgeData[]
  meta: {
    createdAt: string               // ISO 8601
    updatedAt: string
    source: "sketchup" | "web" | "api"
    appVersion: string
  }
  ui: {
    zoom: number                    // 기본 1.0
    pan: { x: number; y: number }
  }
}

interface EdgeData {
  id: string                        // UUID
  from: string                      // sourceNodeId
  fromPort: string                  // 출력 포트명 ("image" | "video")
  to: string                       // targetNodeId
  toPort: string                    // 입력 포트명 ("image" | "endFrame" | "imageA" | "imageB")
}
```

### 4.2 공통 노드 구조

```typescript
interface NodeData {
  id: string                        // UUID
  type: NodeType
  position: { x: number; y: number }
  status: NodeStatus
  params: Record<string, any>       // 노드 타입별 파라미터
  result: NodeResult | null
  cost: number                      // 예상 크레딧 소모량
  version: string                   // 노드 스키마 버전 ("1.0.0")
}

type NodeType = "SOURCE" | "RENDER" | "MODIFIER" | "UPSCALE" | "VIDEO" | "COMPARE"

type NodeStatus = "idle" | "queued" | "running" | "done" | "error" | "cancelled" | "blocked"

interface NodeResult {
  image?: string                    // 결과 이미지 URL
  video?: string                    // 결과 비디오 URL
  resolution?: string              // "1200x1200"
  timestamp: string                // ISO 8601
  cacheKey: string                 // 파라미터 해시
}
```

### 4.3 Source Node 스키마

```json
{
  "id": "node-001",
  "type": "SOURCE",
  "position": { "x": 100, "y": 200 },
  "status": "done",
  "params": {
    "origin": "sketchup",
    "image": "https://storage.example.com/scene_capture.png",
    "cameraLocked": true,
    "sceneMeta": {
      "modelName": "Interior_v5",
      "fov": 35,
      "eye": [10.5, 3.2, -5.1],
      "target": [0, 1.5, 0],
      "up": [0, 1, 0],
      "shadow": true,
      "style": "Default",
      "sceneId": "Scene_03"
    }
  },
  "result": {
    "image": "https://storage.example.com/scene_capture.png",
    "resolution": "1920x1080",
    "timestamp": "2025-01-15T10:30:00Z",
    "cacheKey": "abc123"
  },
  "cost": 0,
  "version": "1.0.0"
}
```

### 4.4 Render Node 스키마

```json
{
  "id": "node-002",
  "type": "RENDER",
  "position": { "x": 350, "y": 200 },
  "status": "idle",
  "params": {
    "engine": "main",
    "prompt": "Create photorealistic image",
    "presetId": "screen-to-render",
    "seed": null,
    "resolution": "1200x1200"
  },
  "result": null,
  "cost": 1,
  "version": "1.0.0"
}
```

### 4.5 Modifier Node 스키마

```json
{
  "id": "node-003",
  "type": "MODIFIER",
  "position": { "x": 600, "y": 150 },
  "status": "idle",
  "params": {
    "prompt": "Add a dog in the red area, and remove the object highlighted in green",
    "presetId": null,
    "mask": "data:image/png;base64,...",
    "maskLayers": [
      { "color": "red", "action": "add", "description": "add dog" },
      { "color": "green", "action": "remove", "description": "remove mirror" }
    ]
  },
  "result": null,
  "cost": 1,
  "version": "1.0.0"
}
```

### 4.6 Upscale Node 스키마

```json
{
  "id": "node-004",
  "type": "UPSCALE",
  "position": { "x": 850, "y": 200 },
  "status": "idle",
  "params": {
    "scale": 2,
    "optimizedFor": "standard",
    "creativity": 0.0,
    "detailStrength": 0.0,
    "similarity": 0.0,
    "promptStrength": 0.0,
    "prompt": "Upscale"
  },
  "result": null,
  "cost": 2,
  "version": "1.0.0"
}
```

### 4.7 Video Node 스키마

```json
{
  "id": "node-005",
  "type": "VIDEO",
  "position": { "x": 850, "y": 400 },
  "status": "idle",
  "params": {
    "engine": "kling",
    "duration": 5,
    "prompt": "Move forward",
    "endFrameImage": null
  },
  "result": null,
  "cost": 5,
  "version": "1.0.0"
}
```

### 4.8 캐시 키 생성 규칙

```typescript
function generateCacheKey(node: NodeData, inputImageHash: string): string {
  const payload = JSON.stringify({
    type: node.type,
    params: node.params,
    inputImageHash: inputImageHash
  })
  return sha256(payload)
}
```

동일한 cacheKey를 가진 노드는 재실행하지 않고 기존 result를 재사용한다.

### 4.9 노드 라벨 표시 규칙

각 노드는 캔버스에서 다음 형식으로 라벨을 표시한다:
- 첫 줄: Render Mode 번호 + 이름 (예: "1. Main renderer", "2. Details editor")
- 둘째 줄: 프롬프트 요약 (최대 40자, 말줄임표 처리)

---

## 5. Prompt Preset 시스템 및 프롬프트 공식

### 5.1 Preset 구조

```typescript
interface PromptPreset {
  id: string
  name: string
  icon: string                      // 아이콘 경로
  category: "render" | "modifier" | "upscale" | "video"
  applicableNodeTypes: NodeType[]   // 이 프리셋을 사용할 수 있는 노드 타입
  basePrompt: string               // 프롬프트 본문
  negativePrompt: string           // 네거티브 프롬프트
  visualConstraints: string        // 시각적 제약 조건 (AI에게 전달)
  forbiddenChanges: string         // 금지 변경 사항
  mergeMode: "replace" | "append"  // 사용자 프롬프트와 병합 방식
}
```

### 5.2 프리셋 적용 규칙

- 프리셋 클릭 시 프롬프트 바에 해당 프리셋의 텍스트가 채워진다.
- `mergeMode: "replace"` → 프롬프트 바 전체를 프리셋 텍스트로 교체한다.
- `mergeMode: "append"` → 기존 프롬프트 뒤에 프리셋 텍스트를 추가한다.
- 프리셋은 Modifier Node (Details editor)에서만 표시된다. Render Node에서는 별도의 Render Preset (Screen to render, Image to sketch 등)을 표시한다.
- 프리셋 적용 후 사용자가 프롬프트를 수정할 수 있다.

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

```typescript
function assemblePrompt(node: NodeData, preset: PromptPreset | null): string {
  if (!preset) {
    return node.params.prompt
  }

  let finalPrompt: string
  if (preset.mergeMode === "replace") {
    finalPrompt = preset.basePrompt
  } else {
    finalPrompt = `${node.params.prompt}\n${preset.basePrompt}`
  }

  // visualConstraints와 forbiddenChanges는 API 호출 시 system prompt로 전달
  return finalPrompt
}

function assembleSystemPrompt(preset: PromptPreset): string {
  return `${preset.visualConstraints}\n${preset.forbiddenChanges}`
}

function assembleNegativePrompt(preset: PromptPreset): string {
  return preset.negativePrompt
}
```

---

## 6. 실행 파이프라인 의사코드

### 6.1 Make 버튼 클릭 시 전체 흐름

```typescript
async function onMakeClick(selectedNodeId: string): Promise<void> {
  const graph = graphStore.getState()

  // 1. 선택 노드 기준 상위 서브그래프 추출
  const subgraph = resolveUpstreamSubgraph(selectedNodeId, graph)

  // 2. DAG 검증
  if (hasCycle(subgraph)) {
    throw new Error("Cycle detected in graph")
  }

  // 3. 비용 사전 계산
  const totalCost = subgraph
    .filter(node => node.status !== "done")
    .reduce((sum, node) => sum + node.cost, 0)

  if (creditStore.getState().balance < totalCost) {
    throw new Error("Not enough credits")
  }

  // 4. 캐시 확인 — 변경 없는 노드 스킵
  for (const node of subgraph) {
    const inputHash = getInputHash(node, graph)
    const cacheKey = generateCacheKey(node, inputHash)
    if (node.result?.cacheKey === cacheKey) {
      node.status = "done"  // 캐시 히트 → 스킵
    }
  }

  // 5. 토폴로지컬 정렬
  const executionOrder = topologicalSort(subgraph)

  // 6. 순차 실행 (병렬 가능한 노드는 Promise.all)
  await executeInOrder(executionOrder, graph)

  // 7. 히스토리 저장
  historyStore.getState().saveSnapshot(graph)
}
```

### 6.2 토폴로지컬 정렬

```typescript
function topologicalSort(nodes: NodeData[]): NodeData[][] {
  // 반환값: 레벨별 노드 배열 (같은 레벨 = 병렬 실행 가능)
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    const current = inDegree.get(edge.to) || 0
    inDegree.set(edge.to, current + 1)
    adjacency.get(edge.from)!.push(edge.to)
  }

  const levels: NodeData[][] = []
  let queue = nodes.filter(n => inDegree.get(n.id) === 0)

  while (queue.length > 0) {
    levels.push([...queue])
    const nextQueue: NodeData[] = []

    for (const node of queue) {
      for (const neighborId of adjacency.get(node.id)!) {
        const deg = inDegree.get(neighborId)! - 1
        inDegree.set(neighborId, deg)
        if (deg === 0) {
          const neighbor = nodes.find(n => n.id === neighborId)!
          nextQueue.push(neighbor)
        }
      }
    }

    queue = nextQueue
  }

  return levels
}
```

### 6.3 레벨별 실행 (병렬)

```typescript
async function executeInOrder(
  levels: NodeData[][],
  graph: Graph
): Promise<void> {
  for (const level of levels) {
    // 같은 레벨의 노드는 병렬 실행
    const runnableNodes = level.filter(n => n.status !== "done")

    await Promise.all(
      runnableNodes.map(node => executeNode(node, graph))
    )
  }
}
```

### 6.4 단일 노드 실행

```typescript
async function executeNode(node: NodeData, graph: Graph): Promise<void> {
  // 상태 전환
  node.status = "running"
  graphStore.getState().updateNode(node.id, { status: "running" })

  try {
    // 입력 이미지 수집
    const inputImages = getInputResults(node, graph)

    // 프리셋 조립
    const preset = node.params.presetId
      ? presetRegistry[node.params.presetId]
      : null

    // 엔진 디스패치
    let result: NodeResult

    switch (node.type) {
      case "SOURCE":
        result = { image: node.params.image, timestamp: now(), cacheKey: "" }
        break

      case "RENDER":
        result = await renderAdapter.execute({
          engine: node.params.engine,
          image: inputImages[0].image,
          prompt: assemblePrompt(node, preset),
          systemPrompt: preset ? assembleSystemPrompt(preset) : "",
          negativePrompt: preset ? assembleNegativePrompt(preset) : "",
          seed: node.params.seed,
          resolution: node.params.resolution
        })
        break

      case "MODIFIER":
        result = await detailsEditorAdapter.execute({
          image: inputImages[0].image,
          prompt: assemblePrompt(node, preset),
          systemPrompt: preset ? assembleSystemPrompt(preset) : "",
          negativePrompt: preset ? assembleNegativePrompt(preset) : "",
          mask: node.params.mask,
          maskLayers: node.params.maskLayers
        })
        break

      case "UPSCALE":
        result = await upscaleAdapter.execute({
          image: inputImages[0].image,
          scale: node.params.scale,
          optimizedFor: node.params.optimizedFor,
          creativity: node.params.creativity,
          detailStrength: node.params.detailStrength,
          similarity: node.params.similarity,
          promptStrength: node.params.promptStrength,
          prompt: node.params.prompt
        })
        break

      case "VIDEO":
        result = await videoAdapter.execute({
          engine: node.params.engine,
          image: inputImages[0].image,
          endFrame: node.params.endFrameImage,
          duration: node.params.duration,
          prompt: assemblePrompt(node, preset)
        })
        break

      case "COMPARE":
        // Compare 노드는 실행하지 않음
        result = { timestamp: now(), cacheKey: "" }
        break
    }

    // 결과 저장
    node.result = result
    node.status = "done"
    graphStore.getState().updateNode(node.id, { result, status: "done" })

    // 크레딧 차감
    creditStore.getState().deduct(node.cost)

  } catch (error) {
    node.status = "error"
    graphStore.getState().updateNode(node.id, { status: "error" })

    // 에러 전파: 하위 노드 blocked 처리
    markDescendantsAsBlocked(node.id, graph)
  }
}
```

### 6.5 에러 전파

```typescript
function markDescendantsAsBlocked(nodeId: string, graph: Graph): void {
  const descendants = getDescendantNodes(nodeId, graph)
  for (const desc of descendants) {
    desc.status = "blocked"
    graphStore.getState().updateNode(desc.id, { status: "blocked" })
  }
}
```

### 6.6 비용 사전 표시

```typescript
function calculateEstimatedCost(selectedNodeId: string, graph: Graph): number {
  const subgraph = resolveUpstreamSubgraph(selectedNodeId, graph)
  return subgraph
    .filter(node => {
      if (node.status === "done") return false
      const inputHash = getInputHash(node, graph)
      const cacheKey = generateCacheKey(node, inputHash)
      return node.result?.cacheKey !== cacheKey  // 캐시 미스만 비용 산정
    })
    .reduce((sum, node) => sum + node.cost, 0)
}
```

Make 버튼 옆에 `Credits: {estimatedCost}`를 표시한다.

---

## 7. SketchUp 전용 플러그인 명세

### 7.1 플러그인 역할

SketchUp Ruby 플러그인은 다음만 수행한다:
- Viewport 이미지 캡처
- Camera/Scene 메타데이터 수집
- 결과 이미지 수신 및 적용
- Vizmaker Web UI 호출

다음은 수행하지 않는다:
- 노드 실행
- 프롬프트 처리
- AI API 호출
- DAG 관리

### 7.2 Viewport 캡처

```ruby
module Vizmaker
  def self.capture_viewport(options = {})
    view = Sketchup.active_model.active_view
    path = File.join(temp_dir, "vizmaker_capture_#{Time.now.to_i}.png")

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

### 7.3 Camera/Scene 메타데이터 수집

```ruby
module Vizmaker
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

### 7.4 Vizmaker 전송 데이터 포맷

```ruby
module Vizmaker
  def self.send_to_vizmaker
    image_path = capture_viewport
    meta = collect_scene_meta

    payload = {
      source: "sketchup",
      image: Base64.strict_encode64(File.read(image_path)),
      meta: meta,
      timestamp: Time.now.iso8601
    }

    # REST API 전송
    uri = URI("https://vizmaker.app/api/source")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri)
    request.body = payload.to_json
    request.content_type = "application/json"
    http.request(request)
  end
end
```

### 7.5 결과 수신

```ruby
module Vizmaker
  def self.apply_result(image_url)
    # 이미지 다운로드
    image_data = Net::HTTP.get(URI(image_url))
    result_path = File.join(temp_dir, "vizmaker_result.png")
    File.write(result_path, image_data, mode: "wb")

    # SketchUp에 Watermark로 적용 또는 로컬 저장
    result_path
  end
end
```

### 7.6 SketchUp 플러그인 UI

```ruby
# 툴바 버튼
cmd = UI::Command.new("Open Vizmaker") {
  Vizmaker.send_to_vizmaker
  UI.openURL("https://vizmaker.app/editor?source=sketchup")
}
cmd.tooltip = "Send to Vizmaker"

toolbar = UI::Toolbar.new("Vizmaker")
toolbar.add_item(cmd)
toolbar.show
```

메뉴 등록:
```ruby
UI.menu("Extensions").add_item("Vizmaker") {
  submenu = UI.menu("Extensions").add_submenu("Vizmaker")
  submenu.add_item("Open Vizmaker") { Vizmaker.send_to_vizmaker }
  submenu.add_item("Refresh Result") { Vizmaker.fetch_latest_result }
}
```

### 7.7 전송 방식

- 최초 이미지 전송: REST POST (이미지 크기가 크므로)
- 실행 상태 모니터링: WebSocket (선택사항, MVP에서는 폴링으로 대체 가능)
- 결과 수신: REST GET (결과 이미지 URL)

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

**노드 연결:**
- 출력 포트 → 입력 포트 드래그로 연결
- 타입 호환: Image 출력 → Image 입력만 가능, Video 출력 → Video 입력만 가능
- 하나의 출력 포트에서 여러 입력 포트로 분기 가능
- 순환 연결 시도 시 연결 거부 (시각적 피드백: 빨간색 표시)

**노드 클릭:**
- 단일 클릭: InspectorPanel에 해당 노드 설정 표시 + Preview 탭에 결과 이미지 표시
- 더블 클릭: Preview를 캔버스 영역 전체로 확대 (65% → 100%)
- 마우스 휠: Preview 이미지 확대/축소 가능

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
- Preview: 선택 노드의 결과 이미지. 결과 없으면 빈 상태. 우측 상단에 해상도 표시 (예: "832 × 1048"). 좌측 상단에 확대율 표시 (예: "65%").
- Compare: A/B 슬라이더 비교
- Draw: 이미지 위 드로잉 + 마스킹

**Enlarge 버튼:** Preview 이미지를 전체 캔버스 영역으로 확대한다.

**노드 그래프 미니맵:** Preview 탭 아래에 우측 패널 내 미니 노드 그래프를 표시한다. 현재 선택 노드를 하이라이트한다. 노드 썸네일이 포함된다.

**Render Settings 섹션:**
- Render Mode 드롭다운: 노드 타입에 따라 표시 항목이 변경된다.
  - SOURCE 선택 시: 표시 없음
  - RENDER 선택 시: "1. Main renderer" (기본), "(experimental) Exterior render", "(experimental) Interior render"
  - MODIFIER 선택 시: "2. Details editor"
  - UPSCALE 선택 시: "3. Creative upscaler" + Upscale/Optimized for/Creativity/Detail strength/Similarity/Prompt strength 슬라이더
  - VIDEO 선택 시: "4. Image to video" + Engine/Video duration 드롭다운

**Prompt Presets 섹션:**
- 노드 타입에 따라 표시되는 프리셋이 변경된다.
- RENDER → Screen to render, Image to sketch, Top view, Side view, Another view
- MODIFIER → Enhance realism, Volumetric rays, Make brighter, Closeup, Axonometry, Winter, Autumn, Technical drawings, Logo, Day to night, Night to day, Add people, Add blurred people, Add blurred cars, Add cars, Add flowers, Add grass, Add trees
- UPSCALE → Upscale
- VIDEO → Zoom in (+ 기타 카메라 모션 프리셋)
- 프리셋 클릭 → 하단 프롬프트 바에 해당 텍스트 채움

**노드 미선택 시:** Render Settings와 Prompt Presets는 빈 상태로 "Drag and drop an image to get started" 메시지 표시.

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

**마스크 생성:** Draw 탭에서 그린 내용은 마스크 이미지(PNG, 투명 배경)로 변환되어 Modifier Node의 `mask` 파라미터에 저장된다.

### 8.4 Make 버튼 동작

- 클릭 시 현재 선택된 노드 기준으로 상위 DAG 전체를 실행한다.
- 이미 done 상태이고 파라미터 변경이 없는 노드는 스킵한다 (캐시).
- 실행 중 Make 버튼은 비활성화된다 (로딩 스피너 표시).
- 실행 완료 후 결과 이미지가 노드 썸네일에 표시된다.
- 실행 완료 후 히스토리에 자동 저장된다.

### 8.5 History 동작

- 좌측 사이드바 History 아이콘 클릭 → History 전체 페이지로 전환
- 모든 실행 결과가 시간순으로 그리드 표시 (타임스탬프 포함)
- 각 카드에 Use / Save 버튼
  - Use: 해당 시점의 전체 그래프(노드 + 엣지 + 결과)를 현재 워크스페이스에 복원
  - Save: 결과 이미지를 로컬에 다운로드
- 카드 클릭 시 해당 결과의 프롬프트, 소스, 생성 파라미터 상세 표시

### 8.6 Undo/Redo

- 그래프 편집(노드 추가/삭제, 엣지 연결/해제, 노드 이동, 파라미터 변경)은 Undo/Redo 스택에 기록한다.
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- 실행 결과(AI 렌더링)는 Undo 대상이 아니다. 히스토리에서 복원한다.

### 8.7 노드 자동 정렬 (Rearrange)

- 우클릭 → Rearrange nodes 선택 시
- 연결이 적은 노드(말단)가 하단에 배치된다
- 연결이 많은 노드(허브)가 상단에 배치된다
- 수평 간격: 250px, 수직 간격: 150px
- Source 노드는 항상 좌측에 배치된다

### 8.8 크레딧 표시

- Make 버튼 하단에 예상 소모 크레딧 표시: "Credits: N"
- 잔액 부족 시 Make 버튼 비활성화 + "Not enough credits" 메시지

### 8.9 노드 상태 시각 표시

| 상태 | 시각적 표현 |
|---|---|
| idle | 회색 테두리 |
| queued | 노란색 테두리 |
| running | 청록색 테두리 + 로딩 스피너 |
| done | 흰색 테두리 + 결과 썸네일 표시 |
| error | 빨간색 테두리 + 에러 아이콘 |
| blocked | 반투명 + 회색 오버레이 |

### 8.10 연결 규칙 요약

| 출력 타입 | 허용 입력 타입 | 비고 |
|---|---|---|
| Image | Image | 모든 이미지 노드 간 연결 가능 |
| Video | 없음 | Video는 말단 노드 |
| 없음 (Source) | - | Source는 입력 없음 |

- 하나의 출력 → 여러 입력: 허용 (분기)
- 여러 출력 → 하나의 입력: 금지 (Compare Node 제외, 2개 입력)
- 순환 연결: 금지

---

## 부록 A. 상태 관리 스키마 (Zustand)

```typescript
// graphStore.ts
interface GraphState {
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeId: string | null

  addNode: (node: NodeData) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, partial: Partial<NodeData>) => void
  addEdge: (edge: EdgeData) => void
  removeEdge: (edgeId: string) => void
  selectNode: (nodeId: string | null) => void
  clearAll: () => void
  rearrangeNodes: () => void
  getUpstreamNodes: (nodeId: string) => NodeData[]
}

// executionStore.ts
interface ExecutionState {
  isRunning: boolean
  currentNodeId: string | null
  queue: string[]

  executePipeline: (nodeId: string) => Promise<void>
  cancelExecution: () => void
}

// historyStore.ts
interface HistoryState {
  snapshots: GraphSnapshot[]

  saveSnapshot: (graph: Graph) => void
  restoreSnapshot: (snapshotId: string) => void
  loadMore: () => void
}

interface GraphSnapshot {
  id: string
  graph: Graph
  timestamp: string
  creditUsed: number
  thumbnails: string[]
}
```

## 부록 B. 엔진 어댑터 인터페이스

```typescript
interface EngineAdapter {
  id: string
  type: "image" | "video" | "upscale"
  execute(input: EngineInput): Promise<NodeResult>
}

interface RenderInput {
  engine: string
  image: string
  prompt: string
  systemPrompt: string
  negativePrompt: string
  seed: number | null
  resolution: string
}

interface ModifierInput {
  image: string
  prompt: string
  systemPrompt: string
  negativePrompt: string
  mask: string | null
  maskLayers: MaskLayer[]
}

interface UpscaleInput {
  image: string
  scale: number
  optimizedFor: string
  creativity: number
  detailStrength: number
  similarity: number
  promptStrength: number
  prompt: string
}

interface VideoInput {
  engine: string
  image: string
  endFrame: string | null
  duration: number
  prompt: string
}
```

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
| 프론트엔드 | React + TypeScript |
| 노드 그래프 | React Flow |
| 상태 관리 | Zustand |
| 드로잉 캔버스 | Fabric.js 또는 Konva |
| 비디오 재생 | HTML5 Video |
| SketchUp 플러그인 | Ruby |
| API 통신 | REST + WebSocket (선택) |
| 스타일링 | Tailwind CSS |

---

*이 문서는 Claude Code에게 직접 전달하여 추가 질문 없이 구현을 시작할 수 있는 수준으로 작성되었다.*
