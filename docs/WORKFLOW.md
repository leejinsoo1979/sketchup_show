# NanoBanana 워크플로우 상세 문서

## 1. 전체 워크플로우 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  [1] SketchUp 씬 캡처                                                   │
│       │                                                                 │
│       ▼                                                                 │
│  [2] Gemini 1차 렌더링 ──────────────────────────────────────┐         │
│       │                                                       │         │
│       ▼                                                       │         │
│  [3] 로컬 이미지 보정 (선택)                                  │         │
│       │   └─ 온도/색조/밝기/대비/채도 등                      │         │
│       │   └─ API 호출 없음, 실시간 처리                       │         │
│       │                                                       │         │
│       ▼                                                       │         │
│  [4] 낮/밤/조명 변경 (선택) ─────────────────────────┐       │         │
│       │   └─ Gemini 재생성                           │       │         │
│       │   └─ 시맨틱 마스킹으로 구조 고정             │       │         │
│       │                                              │       │         │
│       ▼                                              ▼       ▼         │
│  [5] 핫스팟 오브젝트 배치 (선택)          ◀──── 재시작 가능 ──┘        │
│       │   └─ 드래그&드롭 배치                                          │
│       │   └─ 스케일 조정                                               │
│       │   └─ 로컬 레이어 합성 (미리보기)                               │
│       │                                                                 │
│       ▼                                                                 │
│  [6] 최종 재생성                                                        │
│       │   └─ 배치된 오브젝트 실사화                                    │
│       │   └─ 구조 + 기존 가구 + 새 오브젝트 모두 고정                  │
│       │                                                                 │
│       ▼                                                                 │
│  [7] 완성 이미지 저장/내보내기                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. 단계별 상세

### 2.1 [1] SketchUp 씬 캡처

#### 입력
- 현재 SketchUp 뷰

#### 처리
```ruby
class SceneExporter
  def export_current_view(options = {})
    width = options[:width] || 1920
    height = options[:height] || 1080

    # 1. 전처리
    prepare_scene

    # 2. 이미지 추출
    view = Sketchup.active_model.active_view
    keys = {
      filename: temp_file_path,
      width: width,
      height: height,
      antialias: true,
      transparent: false
    }
    view.write_image(keys)

    # 3. Base64 인코딩
    image_data = File.binread(temp_file_path)
    Base64.strict_encode64(image_data)
  end

  def prepare_scene
    model = Sketchup.active_model

    # 가이드/치수선 숨김
    model.rendering_options["DisplayDims"] = false

    # 그림자 끄기 (선택적)
    # model.shadow_info["DisplayShadows"] = false
  end

  def collect_scene_info
    model = Sketchup.active_model
    view = model.active_view
    camera = view.camera

    {
      camera_position: camera.eye.to_a,
      camera_target: camera.target.to_a,
      fov: camera.fov,
      tags: model.layers.map(&:name),
      scene_name: model.pages.selected_page&.name || "Untitled"
    }
  end
end
```

#### 출력
- Base64 인코딩된 PNG 이미지
- 씬 메타데이터 (카메라 정보, 태그 목록)

---

### 2.2 [2] Gemini 1차 렌더링

#### 입력
- SketchUp 캡처 이미지 (Base64)
- 씬 정보
- 사용자 스타일 입력

#### 프롬프트 구성

```ruby
class PromptBuilder
  LAYER_1_STRUCTURE_LOCK = <<~PROMPT
    Keep ALL existing elements exactly unchanged:
    - All walls, floors, ceiling positions and shapes
    - All existing furniture shapes, positions, and materials
    - All windows and doors in their exact locations
    - Original room dimensions and perspective
    - Original composition and spatial relationships

    DO NOT:
    - Warp or distort any walls or architectural elements
    - Change the shape or position of any existing furniture
    - Alter any materials or textures
    - Modify the camera angle or perspective
  PROMPT

  def build_initial_render_prompt(scene_info, user_style)
    layer_2 = generate_scene_description(scene_info)

    <<~PROMPT
      Transform this SketchUp interior rendering into a photorealistic image.

      Scene Information:
      #{layer_2}

      #{LAYER_1_STRUCTURE_LOCK}

      Style Requirements:
      #{user_style}

      Render with professional interior photography quality.
    PROMPT
  end

  private

  def generate_scene_description(scene_info)
    # 태그 기반 공간 타입 추정
    space_type = detect_space_type(scene_info[:tags])

    "Interior type: #{space_type}"
  end

  def detect_space_type(tags)
    tag_string = tags.join(" ").downcase

    if tag_string.include?("living") || tag_string.include?("거실")
      "living room"
    elsif tag_string.include?("bed") || tag_string.include?("침실")
      "bedroom"
    elsif tag_string.include?("kitchen") || tag_string.include?("주방")
      "kitchen"
    elsif tag_string.include?("office") || tag_string.include?("사무")
      "office"
    else
      "interior space"
    end
  end
end
```

#### 출력
- 실사 렌더링 이미지 (Base64)

---

### 2.3 [3] 로컬 이미지 보정

#### 입력
- 렌더링된 이미지

#### 처리 (JavaScript - Canvas API)

```javascript
class ImageEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.originalImageData = null;

    this.adjustments = {
      temperature: 0,     // -100 ~ +100 (쿨 ~ 웜)
      tint: 0,            // -100 ~ +100 (그린 ~ 마젠타)
      brightness: 0,      // -100 ~ +100
      contrast: 0,        // -100 ~ +100
      highlights: 0,      // -100 ~ +100
      shadows: 0,         // -100 ~ +100
      whites: 0,          // -100 ~ +100
      vibrance: 0,        // -100 ~ +100
      saturation: 0,      // -100 ~ +100
      sharpness: 0        // 0 ~ +100
    };
  }

  loadImage(base64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.ctx.drawImage(img, 0, 0);
        this.originalImageData = this.ctx.getImageData(0, 0, img.width, img.height);
        resolve();
      };
      img.src = 'data:image/png;base64,' + base64;
    });
  }

  applyAdjustments() {
    const imageData = new ImageData(
      new Uint8ClampedArray(this.originalImageData.data),
      this.originalImageData.width,
      this.originalImageData.height
    );

    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 밝기
      const brightnessFactor = this.adjustments.brightness / 100;
      r += 255 * brightnessFactor;
      g += 255 * brightnessFactor;
      b += 255 * brightnessFactor;

      // 대비
      const contrastFactor = (this.adjustments.contrast + 100) / 100;
      r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
      g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
      b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

      // 온도 (간단한 구현)
      const tempFactor = this.adjustments.temperature / 100;
      r += 30 * tempFactor;
      b -= 30 * tempFactor;

      // 채도
      const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
      const satFactor = (this.adjustments.saturation + 100) / 100;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;

      // 클램핑
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  exportBase64() {
    return this.canvas.toDataURL('image/png').split(',')[1];
  }
}
```

#### 출력
- 보정된 이미지 (Base64)
- **API 호출 없음**

---

### 2.4 [4] 낮/밤/조명 변경

#### 입력
- 현재 이미지
- 조명 모드 선택

#### 프롬프트 템플릿

```ruby
LIGHTING_PROMPTS = {
  day: <<~PROMPT,
    Transform the lighting to bright daytime.
    - Bright natural daylight streaming through windows
    - Soft shadows from sunlight
    - Clear blue sky visible through windows
    - All interior lights appear off
  PROMPT

  evening: <<~PROMPT,
    Transform the lighting to warm evening golden hour.
    - Warm orange/golden sunlight at low angle
    - Long soft shadows
    - Sunset colors visible through windows
    - Cozy ambient atmosphere
  PROMPT

  night: <<~PROMPT,
    Transform the lighting to night time.
    - Dark night sky visible through windows
    - Warm interior artificial lighting from lamps
    - Soft ambient glow throughout the room
    - Cozy nighttime atmosphere
  PROMPT

  lights_on: <<~PROMPT,
    Turn on all interior lights.
    - Ceiling lights, lamps, and fixtures all illuminated
    - Warm artificial light throughout
    - Appropriate shadows from multiple light sources
  PROMPT

  lights_off: <<~PROMPT,
    Turn off all interior lights.
    - Only natural light from windows
    - No artificial illumination
    - Darker interior with window light only
  PROMPT
}

def build_lighting_prompt(mode)
  lighting_instruction = LIGHTING_PROMPTS[mode]

  <<~PROMPT
    #{lighting_instruction}

    #{LAYER_1_STRUCTURE_LOCK}
  PROMPT
end
```

#### 출력
- 조명이 변경된 렌더링 이미지

---

### 2.5 [5] 핫스팟 오브젝트 배치

#### 입력
- 현재 렌더링 이미지
- 오브젝트 이미지 (PNG, 투명 배경 권장)
- 배치 좌표 및 스케일

#### 데이터 구조

```ruby
class Hotspot
  attr_accessor :id, :x, :y, :scale, :object_image, :object_name

  def initialize(attrs = {})
    @id = attrs[:id] || SecureRandom.uuid
    @x = attrs[:x]
    @y = attrs[:y]
    @scale = attrs[:scale] || 1.0
    @object_image = attrs[:object_image]
    @object_name = attrs[:object_name]
  end

  def position_description(image_width, image_height)
    horizontal = case x.to_f / image_width
      when 0..0.33 then "left"
      when 0.33..0.66 then "center"
      else "right"
    end

    vertical = case y.to_f / image_height
      when 0..0.4 then "back"
      when 0.4..0.7 then "middle"
      else "front"
    end

    "#{vertical}-#{horizontal} area"
  end

  def estimated_height_cm
    # 기본 높이 100cm 기준, 스케일 적용
    base_height = 100
    (base_height * @scale).round
  end
end
```

#### 로컬 미리보기 (레이어 합성)

```javascript
class HotspotPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseImage = null;
    this.hotspots = [];
  }

  setBaseImage(base64) {
    return new Promise((resolve) => {
      this.baseImage = new Image();
      this.baseImage.onload = () => {
        this.canvas.width = this.baseImage.width;
        this.canvas.height = this.baseImage.height;
        this.render();
        resolve();
      };
      this.baseImage.src = 'data:image/png;base64,' + base64;
    });
  }

  addHotspot(id, x, y, objectBase64, name) {
    const hotspot = {
      id,
      x,
      y,
      scale: 1.0,
      image: new Image(),
      name
    };

    hotspot.image.src = 'data:image/png;base64,' + objectBase64;
    hotspot.image.onload = () => this.render();

    this.hotspots.push(hotspot);
    return hotspot;
  }

  updateScale(id, scale) {
    const hotspot = this.hotspots.find(h => h.id === id);
    if (hotspot) {
      hotspot.scale = scale;
      this.render();
    }
  }

  updatePosition(id, x, y) {
    const hotspot = this.hotspots.find(h => h.id === id);
    if (hotspot) {
      hotspot.x = x;
      hotspot.y = y;
      this.render();
    }
  }

  removeHotspot(id) {
    this.hotspots = this.hotspots.filter(h => h.id !== id);
    this.render();
  }

  render() {
    // 기본 이미지 그리기
    this.ctx.drawImage(this.baseImage, 0, 0);

    // 핫스팟 오브젝트 그리기
    this.hotspots.forEach(hotspot => {
      if (hotspot.image.complete) {
        const width = hotspot.image.width * hotspot.scale;
        const height = hotspot.image.height * hotspot.scale;

        // 중심점 기준 배치
        const drawX = hotspot.x - width / 2;
        const drawY = hotspot.y - height;  // 바닥 기준

        this.ctx.drawImage(hotspot.image, drawX, drawY, width, height);

        // 핫스팟 마커 (+)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(hotspot.x, hotspot.y, 15, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#333';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('+', hotspot.x, hotspot.y);
      }
    });
  }
}
```

#### 출력
- 핫스팟 목록 (위치, 스케일, 오브젝트 정보)
- 미리보기 이미지 (로컬 합성)

---

### 2.6 [6] 최종 재생성

#### 입력
- 현재 렌더링 이미지 (Base64)
- 배치할 오브젝트 이미지들 (Base64 배열)
- 핫스팟 정보 (위치, 스케일, 이름)

#### 프롬프트 구성

```ruby
def build_final_render_prompt(hotspots, image_width, image_height, user_style)
  placement_instructions = hotspots.map do |hotspot|
    position = hotspot.position_description(image_width, image_height)
    height = hotspot.estimated_height_cm

    "- Place the #{hotspot.object_name} at the #{position}, " +
    "approximately #{height}cm tall, sitting naturally on the floor"
  end.join("\n")

  <<~PROMPT
    Integrate the provided objects into this interior scene photorealistically.

    Object Placement:
    #{placement_instructions}

    Integration Requirements:
    - Each object must match the room's perspective exactly
    - Objects must have correct shadows matching the scene's lighting
    - Objects should appear naturally integrated, not pasted
    - Maintain proper depth and spatial relationships

    #{LAYER_1_STRUCTURE_LOCK}

    Style: #{user_style}
  PROMPT
end
```

#### API 호출

```ruby
def final_render(base_image, hotspots, user_style)
  # 오브젝트 이미지 배열
  object_images = hotspots.map(&:object_image)

  # 프롬프트 생성
  prompt = build_final_render_prompt(
    hotspots,
    @image_width,
    @image_height,
    user_style
  )

  # API 호출 (다중 이미지)
  @api_client.generate_with_references(base_image, object_images, prompt)
end
```

#### 출력
- 최종 렌더링 이미지 (오브젝트가 실사화되어 배치됨)

---

### 2.7 [7] 저장/내보내기

#### 저장 형식
- PNG (고품질)
- JPEG (웹용, 용량 최적화)

#### 저장 경로
```
{프로젝트폴더}/NanoBanana_Renders/
  └── {Scene이름}/
      ├── render_001.png
      ├── render_002.png
      └── history.json
```

#### 히스토리 구조
```json
{
  "scene_name": "거실_v1",
  "renders": [
    {
      "id": "uuid-1",
      "timestamp": "2024-01-15T10:30:00Z",
      "type": "initial",
      "filename": "render_001.png",
      "prompt_summary": "Photorealistic, warm lighting"
    },
    {
      "id": "uuid-2",
      "timestamp": "2024-01-15T10:45:00Z",
      "type": "lighting_change",
      "filename": "render_002.png",
      "prompt_summary": "Night time with lamps on"
    }
  ]
}
```

## 3. 상태 다이어그램

```
                    ┌─────────────┐
                    │    IDLE     │
                    └──────┬──────┘
                           │ [씬 캡처]
                           ▼
                    ┌─────────────┐
                    │  CAPTURING  │
                    └──────┬──────┘
                           │ [캡처 완료]
                           ▼
                    ┌─────────────┐
            ┌──────│  RENDERING  │──────┐
            │      └──────┬──────┘      │
            │ [실패]      │ [성공]      │
            ▼             ▼             │
     ┌──────────┐  ┌─────────────┐     │
     │  ERROR   │  │   EDITING   │◀────┘
     └──────────┘  └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  ADJUSTING │  │  LIGHTING  │  │  PLACING   │
   │  (로컬)    │  │  (API)     │  │  (로컬)    │
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │REGENERATING │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   SAVING    │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  COMPLETE   │
                  └─────────────┘
```
