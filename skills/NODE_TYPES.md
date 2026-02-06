# NODE_TYPES.md — 노드 타입 상세 정의

---

## 공통 노드 인터페이스

```typescript
interface NodeData {
  id: string                          // UUID v4
  type: "SOURCE" | "RENDER" | "MODIFIER" | "UPSCALE" | "VIDEO" | "COMPARE"
  position: { x: number; y: number }
  status: "idle" | "queued" | "running" | "done" | "error" | "cancelled" | "blocked"
  params: Record<string, any>
  result: NodeResult | null
  cost: number                        // 크레딧 소모량
  version: string                     // "1.0.0"
}

interface NodeResult {
  image?: string                      // 결과 이미지 URL
  video?: string                      // 결과 비디오 URL
  resolution?: string                 // "1200x1200"
  timestamp: string                   // ISO 8601
  cacheKey: string                    // sha256(type + params + inputHash)
}
```

---

## 1. SOURCE

Source 노드는 파이프라인의 시작점이다. 이미지를 제공한다.

| 항목 | 값 |
|---|---|
| 입력 포트 | 없음 |
| 출력 포트 | `image` (Image) |
| 크레딧 | 0 |
| 병렬 | 해당 없음 (루트) |

### 파라미터

```typescript
interface SourceParams {
  origin: "sketchup" | "upload" | "paste"
  image: string                       // URL 또는 base64
  cameraLocked: boolean               // SketchUp 카메라 고정
  sceneMeta: {
    modelName: string
    fov: number
    eye: [number, number, number]
    target: [number, number, number]
    up: [number, number, number]
    shadow: boolean
    style: string
    sceneId: string
  } | null
}
```

### 생성 트리거
- 캔버스에 이미지 드래그 앤 드롭
- Browse 버튼 클릭 → 파일 선택
- SketchUp 플러그인에서 전송
- Ctrl+V 이미지 붙여넣기 (캔버스 빈 영역)

### 캔버스 표시
- 노드 카드 내부에 이미지 썸네일
- 하단 라벨: "Source"

---

## 2. RENDER

Main renderer 또는 Experimental renderer. Source 이미지를 AI로 변환한다.

| 항목 | 값 |
|---|---|
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 크레딧 | 1 |
| 병렬 | 동일 Source에서 분기된 Render 노드끼리 병렬 가능 |

### 파라미터

```typescript
interface RenderParams {
  engine: "main" | "experimental-exterior" | "experimental-interior"
  prompt: string                      // 기본값: "Create photorealistic image"
  presetId: string | null             // Prompt Preset ID
  seed: number | null                 // null = 랜덤
  resolution: string                  // "1200x1200"
}
```

### Inspector 표시 (Render Mode = "1. Main renderer")
- Render Mode 드롭다운
- Prompt Presets 그리드: Screen to render, Image to sketch, Top view, Side view, Another view

### 캔버스 표시
- 첫 줄: "1. Main renderer" 또는 "(experimental) Exterior render"
- 둘째 줄: 프롬프트 요약 (최대 40자)
- 실행 후: 결과 이미지 썸네일

---

## 3. MODIFIER

Details editor. 렌더 결과에 프롬프트 기반 세부 수정을 수행한다.

| 항목 | 값 |
|---|---|
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 크레딧 | 1 |
| 병렬 | 동일 입력에서 분기 시 병렬 가능 |

### 파라미터

```typescript
interface ModifierParams {
  prompt: string
  presetId: string | null
  mask: string | null                 // Draw 탭에서 생성된 마스크 (base64 PNG)
  maskLayers: MaskLayer[]
}

interface MaskLayer {
  color: "red" | "green" | "blue" | "yellow"
  action: "add" | "remove" | "replace" | "style"
  description: string
}
```

### 색상별 마스크 의미
- **Red**: 해당 영역에 객체 추가 ("add a dog in the red area")
- **Green**: 해당 영역의 객체 제거 ("remove the object highlighted in green")
- **Blue**: 해당 영역의 객체 교체
- **Yellow**: 해당 영역의 스타일 변경

### Inspector 표시 (Render Mode = "2. Details editor")
- Render Mode 드롭다운
- Prompt Presets 그리드: Enhance realism, Volumetric rays, Make brighter, Closeup, Axonometry, Winter, Autumn, Technical drawings, Logo, Day to night, Night to day, Add people, Add blurred people, Add blurred cars, Add cars, Add flowers, Add grass, Add trees

### 캔버스 표시
- 첫 줄: "2. Details editor"
- 둘째 줄: 프롬프트 요약
- 실행 후: 결과 이미지 썸네일

---

## 4. UPSCALE

Creative upscaler. 저해상도 이미지를 확대한다.

| 항목 | 값 |
|---|---|
| 입력 포트 | `image` (Image) |
| 출력 포트 | `image` (Image) |
| 크레딧 | 2 (2x) / 4 (4x) |
| 병렬 | 가능 |

### 파라미터

```typescript
interface UpscaleParams {
  scale: 2 | 4
  optimizedFor: "standard" | "detail" | "smooth"
  creativity: number                  // 0.0 ~ 1.0
  detailStrength: number              // 0.0 ~ 1.0 (HDR)
  similarity: number                  // 0.0 ~ 1.0
  promptStrength: number              // 0.0 ~ 1.0
  prompt: string                      // 기본값: "Upscale"
}
```

### Inspector 표시 (Render Mode = "3. Creative upscaler")
- Upscale 드롭다운: 2x / 4x
- Optimized for 드롭다운: Standard / Detail / Smooth
- Creativity 슬라이더 (0.00 ~ 1.00)
- Detail strength (hdr) 슬라이더
- Similarity 슬라이더
- Prompt strength 슬라이더
- Prompt Presets: Upscale (단일)

---

## 5. VIDEO

Image to video. 정지 이미지에서 영상을 생성한다.

| 항목 | 값 |
|---|---|
| 입력 포트 | `image` (Image), `endFrame` (Image, optional) |
| 출력 포트 | `video` (Video) |
| 크레딧 | 5 (5초) / 10 (10초) |
| 병렬 | 가능 |

### 파라미터

```typescript
interface VideoParams {
  engine: "kling" | "seedance"
  duration: 5 | 10
  prompt: string                      // 기본값: "Move forward"
  endFrameImage: string | null        // 종료 프레임 (2프레임 전환용)
}
```

### Inspector 표시 (Render Mode = "4. Image to video")
- Engine 드롭다운: Kling v2.1 / Seedance
- Video duration 드롭다운: 5 seconds / 10 seconds
- Prompt Presets: Zoom in (+ 기타 카메라 모션)

### 캔버스 표시
- 노드에 재생 아이콘 ▶ 오버레이
- 클릭 시 비디오 자동 재생 (PreviewTab에서)

---

## 6. COMPARE

비교 전용 노드. AI 실행을 수행하지 않는다.

| 항목 | 값 |
|---|---|
| 입력 포트 | `imageA` (Image), `imageB` (Image) |
| 출력 포트 | 없음 |
| 크레딧 | 0 |
| 병렬 | 해당 없음 |

### 파라미터

```typescript
interface CompareParams {
  mode: "slider" | "side_by_side"
}
```

### 동작
- 노드 우클릭 → "Compare A" → 해당 노드 결과를 A 슬롯에 할당
- 다른 노드 우클릭 → "Compare B" → B 슬롯에 할당
- CompareTab에서 슬라이더 비교 표시

---

## 노드 연결 규칙

| 규칙 | 설명 |
|---|---|
| Image → Image | 허용 |
| Video → 어디든 | 금지 (Video는 말단) |
| 1 출력 → N 입력 | 허용 (분기) |
| N 출력 → 1 입력 | 금지 (Compare 제외) |
| 순환 | 금지 (DAG 강제) |

---

## 노드 상태 시각 표시

| 상태 | 테두리 색상 | 추가 표시 |
|---|---|---|
| idle | `#444` | — |
| queued | `#f0ad4e` | — |
| running | `#00d4aa` | 로딩 스피너 |
| done | `#fff` | 결과 썸네일 |
| error | `#ff4444` | ⚠ 아이콘 |
| blocked | `#444` 반투명 | 회색 오버레이 |
