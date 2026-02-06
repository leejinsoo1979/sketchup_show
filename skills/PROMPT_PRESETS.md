# PROMPT_PRESETS.md — 프롬프트 프리셋 전체 정의

---

## 프리셋 구조

```typescript
interface PromptPreset {
  id: string
  name: string
  icon: string                        // 아이콘 파일명 또는 이모지
  category: "render" | "modifier" | "upscale" | "video"
  applicableNodeTypes: NodeType[]
  basePrompt: string
  negativePrompt: string
  visualConstraints: string           // AI system prompt에 포함
  forbiddenChanges: string            // AI system prompt에 포함
  mergeMode: "replace" | "append"
}
```

## 프리셋 적용 규칙

1. 프리셋 아이콘 클릭 → 하단 프롬프트 바에 `basePrompt` 텍스트가 채워진다
2. `mergeMode: "replace"` → 기존 프롬프트를 완전히 교체
3. `mergeMode: "append"` → 기존 프롬프트 뒤에 추가
4. 사용자가 프리셋 적용 후 프롬프트를 직접 수정할 수 있다
5. `visualConstraints`와 `forbiddenChanges`는 API 호출 시 system prompt로 별도 전달한다 (사용자에게는 보이지 않음)

## 프롬프트 조립 함수

```typescript
function assemblePrompt(node: NodeData, preset: PromptPreset | null): {
  prompt: string
  systemPrompt: string
  negativePrompt: string
} {
  if (!preset) {
    return {
      prompt: node.params.prompt,
      systemPrompt: "",
      negativePrompt: ""
    }
  }

  const prompt = preset.mergeMode === "replace"
    ? preset.basePrompt
    : `${node.params.prompt}\n${preset.basePrompt}`

  return {
    prompt,
    systemPrompt: `${preset.visualConstraints}\n${preset.forbiddenChanges}`,
    negativePrompt: preset.negativePrompt
  }
}
```

---

## A. Render Node 전용 프리셋 (Main Renderer)

Inspector에서 Render Mode = "1. Main renderer" 선택 시 표시.

### Screen to render
```json
{
  "id": "screen-to-render",
  "name": "Screen to render",
  "category": "render",
  "applicableNodeTypes": ["RENDER"],
  "mergeMode": "replace",
  "basePrompt": "Create photorealistic image",
  "negativePrompt": "cartoon, illustration, sketch, low quality, blurry",
  "visualConstraints": "Preserve exact geometry, camera angle, and spatial layout from the source image.",
  "forbiddenChanges": "Do not add or remove architectural elements. Do not change room proportions."
}
```

### Image to sketch
```json
{
  "id": "image-to-sketch",
  "name": "Image to sketch",
  "category": "render",
  "applicableNodeTypes": ["RENDER"],
  "mergeMode": "replace",
  "basePrompt": "Convert to architectural sketch drawing",
  "negativePrompt": "photorealistic, photograph, color photo",
  "visualConstraints": "Maintain architectural proportions and perspective.",
  "forbiddenChanges": "Do not alter building geometry."
}
```

### Top view
```json
{
  "id": "top-view",
  "name": "Top view",
  "category": "render",
  "applicableNodeTypes": ["RENDER"],
  "mergeMode": "replace",
  "basePrompt": "Generate top-down orthographic view",
  "negativePrompt": "perspective distortion, vanishing point, angled view",
  "visualConstraints": "Bird's eye view, parallel projection.",
  "forbiddenChanges": "Do not add perspective."
}
```

### Side view
```json
{
  "id": "side-view",
  "name": "Side view",
  "category": "render",
  "applicableNodeTypes": ["RENDER"],
  "mergeMode": "replace",
  "basePrompt": "Generate side elevation view",
  "negativePrompt": "top view, perspective, aerial",
  "visualConstraints": "Orthographic side elevation.",
  "forbiddenChanges": "Do not rotate the viewpoint."
}
```

### Another view
```json
{
  "id": "another-view",
  "name": "Another view",
  "category": "render",
  "applicableNodeTypes": ["RENDER"],
  "mergeMode": "replace",
  "basePrompt": "Generate an alternative camera angle of the same scene",
  "negativePrompt": "identical angle, same viewpoint",
  "visualConstraints": "Maintain the same room, furniture, and style.",
  "forbiddenChanges": "Do not change the interior design or objects."
}
```

---

## B. Modifier Node 전용 프리셋 (Details Editor)

Inspector에서 Render Mode = "2. Details editor" 선택 시 표시.
3열 그리드로 배치. 아이콘 + 라벨.

### Enhance realism
```json
{
  "id": "enhance-realism",
  "name": "Enhance realism",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Photorealistic architectural visualization. Enhance material realism, global illumination, reflections, and micro-details. Natural lighting, physically based rendering quality.",
  "negativePrompt": "cartoon, illustration, low quality, oversaturated",
  "visualConstraints": "Preserve exact geometry, camera angle, and object placement.",
  "forbiddenChanges": "Do NOT add or remove objects. Do NOT change room layout or furniture positions."
}
```

### Volumetric rays
```json
{
  "id": "volumetric-rays",
  "name": "Volumetric rays",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add cinematic volumetric light rays. Sunlight scattering through space with realistic atmospheric particles. Soft god rays.",
  "negativePrompt": "overexposure, dramatic color shift, artificial lighting, harsh shadows",
  "visualConstraints": "Preserve all geometry and composition.",
  "forbiddenChanges": "Do NOT change lighting direction. Do NOT alter room geometry."
}
```

### Make brighter
```json
{
  "id": "make-brighter",
  "name": "Make brighter",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Increase overall exposure and brightness. Preserve color balance and material fidelity.",
  "negativePrompt": "blown highlights, overexposure, washed out, color shift",
  "visualConstraints": "Maintain original lighting direction and shadow positions.",
  "forbiddenChanges": "Do NOT change lighting direction, color temperature, or shadow geometry."
}
```

### Closeup
```json
{
  "id": "closeup",
  "name": "Closeup",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Create a close-up shot of the main subject. Shallow depth of field, realistic lens compression. Focus on material detail and texture quality.",
  "negativePrompt": "wide angle, distant view, blurry subject, unfocused",
  "visualConstraints": "Maintain original style and lighting.",
  "forbiddenChanges": "Do NOT change materials or style."
}
```

### Axonometry
```json
{
  "id": "axonometry",
  "name": "Axonometry",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Generate axonometric architectural visualization. Parallel projection. Clean edges, neutral lighting, technical clarity.",
  "negativePrompt": "perspective distortion, vanishing point, artistic, painterly",
  "visualConstraints": "No perspective distortion.",
  "forbiddenChanges": "Do NOT add artistic effects or stylization."
}
```

### Winter
```json
{
  "id": "winter",
  "name": "Winter",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Change season to winter. Snow accumulation on horizontal surfaces. Cold daylight atmosphere. Bare trees, frost on windows.",
  "negativePrompt": "summer, green foliage, warm tones, sunny",
  "visualConstraints": "Preserve architecture and camera position.",
  "forbiddenChanges": "Do NOT change building geometry or camera angle."
}
```

### Autumn
```json
{
  "id": "autumn",
  "name": "Autumn",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Change season to autumn. Warm golden and orange foliage. Soft warm-toned daylight.",
  "negativePrompt": "winter, snow, summer green, cold tones",
  "visualConstraints": "Preserve architecture and camera position.",
  "forbiddenChanges": "Do NOT change building geometry or camera angle."
}
```

### Technical drawings
```json
{
  "id": "technical-drawings",
  "name": "Technical drawings",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Architectural technical drawing style. Monochrome or limited color palette. Clear linework, no artistic shading. Orthographic or axonometric projection.",
  "negativePrompt": "photorealistic, color photo, artistic, painterly, textures",
  "visualConstraints": "Maintain exact proportions and dimensions.",
  "forbiddenChanges": "Do NOT add artistic effects. Do NOT add color beyond line weights."
}
```

### Logo
```json
{
  "id": "logo",
  "name": "Logo",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Transform the image into a clean logo-style illustration. Flat colors, simplified shapes. Transparent or white background.",
  "negativePrompt": "photorealistic, textures, lighting effects, gradients, shadows",
  "visualConstraints": "Simplified geometric shapes.",
  "forbiddenChanges": "Do NOT preserve photorealistic textures."
}
```

### Day to night
```json
{
  "id": "day-to-night",
  "name": "Day to night",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Convert daytime scene to nighttime. Artificial lighting visible from interior. Natural night sky illumination. Warm window glow.",
  "negativePrompt": "daylight, sunny, bright sky, daytime",
  "visualConstraints": "Preserve geometry and composition.",
  "forbiddenChanges": "Do NOT change building geometry or furniture."
}
```

### Night to day
```json
{
  "id": "night-to-day",
  "name": "Night to day",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Convert nighttime scene to daytime. Natural daylight illumination. Clear or partly cloudy sky.",
  "negativePrompt": "night, dark, artificial lighting only, stars",
  "visualConstraints": "Preserve geometry and composition.",
  "forbiddenChanges": "Do NOT change building geometry or furniture."
}
```

### Add people
```json
{
  "id": "add-people",
  "name": "Add people",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add realistic people naturally integrated into the scene. Correct scale, perspective, and lighting. People should not block key architectural elements.",
  "negativePrompt": "mannequins, cartoon people, oversized, floating",
  "visualConstraints": "Match lighting and perspective of the existing scene.",
  "forbiddenChanges": "Do NOT alter architecture or furniture."
}
```

### Add blurred people
```json
{
  "id": "add-blurred-people",
  "name": "Add blurred people",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add motion-blurred people for realism. Long exposure effect. People walking naturally through the space.",
  "negativePrompt": "sharp people, static poses, mannequins",
  "visualConstraints": "Match lighting and perspective.",
  "forbiddenChanges": "Do NOT alter architecture or furniture."
}
```

### Add blurred cars
```json
{
  "id": "add-blurred-cars",
  "name": "Add blurred cars",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add motion-blurred cars on roads. Long exposure effect for dynamic movement.",
  "negativePrompt": "static cars, parked, sharp focus on vehicles",
  "visualConstraints": "Match road perspective and scene scale.",
  "forbiddenChanges": "Do NOT alter buildings or landscape."
}
```

### Add cars
```json
{
  "id": "add-cars",
  "name": "Add cars",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add realistic parked cars matching scene context. Correct scale and perspective.",
  "negativePrompt": "floating cars, oversized, cartoon",
  "visualConstraints": "Match lighting and perspective.",
  "forbiddenChanges": "Do NOT alter buildings."
}
```

### Add flowers
```json
{
  "id": "add-flowers",
  "name": "Add flowers",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add natural flowers subtly integrated into the scene. Respect scale, season, and climate.",
  "negativePrompt": "oversized flowers, artificial, plastic",
  "visualConstraints": "Do not obstruct architecture.",
  "forbiddenChanges": "Do NOT change architecture or major scene elements."
}
```

### Add grass
```json
{
  "id": "add-grass",
  "name": "Add grass",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add natural grass and ground cover. Realistic lawn texture, appropriate for the climate.",
  "negativePrompt": "artificial turf, oversaturated green, unrealistic",
  "visualConstraints": "Match terrain and scene context.",
  "forbiddenChanges": "Do NOT change architecture or hardscape."
}
```

### Add trees
```json
{
  "id": "add-trees",
  "name": "Add trees",
  "category": "modifier",
  "applicableNodeTypes": ["MODIFIER"],
  "mergeMode": "replace",
  "basePrompt": "Add realistic trees appropriate to the climate and scene. Correct scale and natural placement.",
  "negativePrompt": "cartoon trees, floating, oversized, indoor trees outside",
  "visualConstraints": "Match season and climate.",
  "forbiddenChanges": "Do NOT obstruct key architectural views."
}
```

---

## C. Upscale Node 전용 프리셋

### Upscale
```json
{
  "id": "upscale",
  "name": "Upscale",
  "category": "upscale",
  "applicableNodeTypes": ["UPSCALE"],
  "mergeMode": "replace",
  "basePrompt": "Upscale",
  "negativePrompt": "",
  "visualConstraints": "Preserve all details from original.",
  "forbiddenChanges": "Do NOT alter content or composition."
}
```

---

## D. Video Node 전용 프리셋

### Zoom in
```json
{
  "id": "zoom-in-video",
  "name": "Zoom in",
  "category": "video",
  "applicableNodeTypes": ["VIDEO"],
  "mergeMode": "replace",
  "basePrompt": "Zoom in",
  "negativePrompt": "",
  "visualConstraints": "Smooth camera motion.",
  "forbiddenChanges": "Do NOT change scene content."
}
```

### Move forward
```json
{
  "id": "move-forward",
  "name": "Move forward",
  "category": "video",
  "applicableNodeTypes": ["VIDEO"],
  "mergeMode": "replace",
  "basePrompt": "Move forward",
  "negativePrompt": "",
  "visualConstraints": "Smooth forward dolly motion.",
  "forbiddenChanges": "Do NOT change scene content."
}
```

### Orbit
```json
{
  "id": "orbit",
  "name": "Orbit",
  "category": "video",
  "applicableNodeTypes": ["VIDEO"],
  "mergeMode": "replace",
  "basePrompt": "Orbit camera around subject",
  "negativePrompt": "",
  "visualConstraints": "Smooth orbital motion.",
  "forbiddenChanges": "Do NOT change scene content."
}
```

### Pan left
```json
{
  "id": "pan-left",
  "name": "Pan left",
  "category": "video",
  "applicableNodeTypes": ["VIDEO"],
  "mergeMode": "replace",
  "basePrompt": "Pan camera left",
  "negativePrompt": "",
  "visualConstraints": "Smooth lateral motion.",
  "forbiddenChanges": "Do NOT change scene content."
}
```

---

## 프리셋 ↔ 노드 타입 매핑 요약

| 노드 타입 | Inspector에 표시되는 프리셋 |
|---|---|
| RENDER | Screen to render, Image to sketch, Top view, Side view, Another view |
| MODIFIER | Enhance realism, Volumetric rays, Make brighter, Closeup, Axonometry, Winter, Autumn, Technical drawings, Logo, Day to night, Night to day, Add people, Add blurred people, Add blurred cars, Add cars, Add flowers, Add grass, Add trees |
| UPSCALE | Upscale |
| VIDEO | Zoom in, Move forward, Orbit, Pan left |
| SOURCE | (프리셋 없음) |
| COMPARE | (프리셋 없음) |
