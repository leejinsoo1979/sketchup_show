# NanoBanana 프롬프트 시스템 설계

## 1. 프롬프트 아키텍처 개요

### 1.1 3-Layer 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Layer 1: 구조 고정 (Structure Lock)                            │
│  ─────────────────────────────────────                          │
│  • 시스템 레벨 (사용자 접근 불가)                               │
│  • 모든 API 호출에 자동 포함                                    │
│  • 왜곡 방지 핵심 규칙                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 2: 씬 컨텍스트 (Scene Context)                           │
│  ─────────────────────────────────────                          │
│  • 자동 생성 (SketchUp 씬 분석)                                 │
│  • 공간 타입, 카메라 정보, 태그 매핑                            │
│  • 사용자 수정 불가 (읽기 전용)                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 3: 사용자 입력 (User Input)                              │
│  ─────────────────────────────────────                          │
│  • 스타일, 분위기, 조명 선호                                    │
│  • 직접 입력 또는 프리셋 선택                                   │
│  • 자유롭게 수정 가능                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 프롬프트 조합 순서

```
최종 프롬프트 = [작업 지시] + [Layer 2] + [Layer 1] + [Layer 3]
```

---

## 2. Layer 1: 구조 고정 프롬프트

### 2.1 기본 구조 고정 (STRUCTURE_LOCK)

```ruby
STRUCTURE_LOCK = <<~PROMPT
  CRITICAL PRESERVATION RULES:

  Keep ALL existing elements EXACTLY unchanged:
  - All walls, floors, and ceiling in their exact positions and shapes
  - All existing furniture shapes, positions, sizes, and materials
  - All windows and doors in their exact locations and sizes
  - All architectural details (moldings, columns, beams)
  - Original room dimensions, proportions, and perspective
  - Original composition and spatial relationships
  - All material textures and patterns

  DO NOT under any circumstances:
  - Warp, distort, or bend any walls or architectural elements
  - Change the shape, size, or position of any existing furniture
  - Alter any materials, textures, or surface patterns
  - Modify the camera angle, perspective, or field of view
  - Add or remove any structural elements
  - Change the room's proportions or dimensions
PROMPT
```

### 2.2 확장 구조 고정 (재생성용)

```ruby
EXTENDED_STRUCTURE_LOCK = <<~PROMPT
  #{STRUCTURE_LOCK}

  ADDITIONAL PRESERVATION for regeneration:
  - Maintain exact color relationships between elements
  - Preserve shadow directions and intensity ratios
  - Keep reflection patterns on glossy surfaces
  - Maintain depth relationships between objects
  - Preserve edge sharpness of all existing elements
PROMPT
```

---

## 3. Layer 2: 씬 컨텍스트 생성

### 3.1 씬 분석 로직

```ruby
class SceneContextBuilder
  SPACE_TYPE_KEYWORDS = {
    living_room: %w[living 거실 리빙 소파 TV],
    bedroom: %w[bed 침실 침대 베드룸],
    kitchen: %w[kitchen 주방 키친 싱크대],
    bathroom: %w[bath 욕실 화장실 샤워],
    office: %w[office 사무 오피스 책상 데스크],
    dining: %w[dining 다이닝 식탁 식당],
    entrance: %w[entrance 현관 엔트런스]
  }

  def build_context(scene_info)
    space_type = detect_space_type(scene_info[:tags])
    camera_info = describe_camera(scene_info[:camera_position], scene_info[:camera_target])
    materials = extract_materials(scene_info[:tags])

    <<~CONTEXT
      SCENE INFORMATION:
      - Space Type: #{space_type}
      - Camera: #{camera_info}
      - Key Materials: #{materials.join(', ')}
    CONTEXT
  end

  private

  def detect_space_type(tags)
    tag_string = tags.join(" ").downcase

    SPACE_TYPE_KEYWORDS.each do |type, keywords|
      return format_space_type(type) if keywords.any? { |kw| tag_string.include?(kw.downcase) }
    end

    "interior space"
  end

  def format_space_type(type)
    type.to_s.split('_').map(&:capitalize).join(' ')
  end

  def describe_camera(position, target)
    # 카메라 높이로 뷰 타입 추정
    height = position[2] rescue 1.5

    if height < 0.5
      "low angle view (floor level)"
    elsif height < 1.2
      "seated eye level view"
    elsif height < 1.8
      "standing eye level view"
    else
      "elevated view"
    end
  end

  def extract_materials(tags)
    material_keywords = {
      'wood' => '목재',
      'marble' => '대리석',
      'concrete' => '콘크리트',
      'fabric' => '패브릭',
      'leather' => '가죽',
      'metal' => '금속',
      'glass' => '유리',
      'tile' => '타일'
    }

    found = []
    tag_string = tags.join(" ").downcase

    material_keywords.each do |en, kr|
      found << en if tag_string.include?(en) || tag_string.include?(kr)
    end

    found.empty? ? ["mixed materials"] : found
  end
end
```

---

## 4. Layer 3: 사용자 입력 및 프리셋

### 4.1 스타일 프리셋

```ruby
STYLE_PRESETS = {
  modern: {
    name: "모던 인테리어",
    prompt: <<~PROMPT
      Modern interior photography style.
      Clean lines, minimal decoration.
      Neutral color palette with subtle accent colors.
      Contemporary furniture and fixtures.
      Soft, diffused natural lighting.
    PROMPT
  },

  scandinavian: {
    name: "스칸디나비안",
    prompt: <<~PROMPT
      Scandinavian interior design style.
      Light wood tones, white walls.
      Cozy hygge atmosphere.
      Natural materials (wood, wool, linen).
      Bright, airy feel with warm undertones.
    PROMPT
  },

  industrial: {
    name: "인더스트리얼",
    prompt: <<~PROMPT
      Industrial loft style interior.
      Exposed brick, concrete, metal elements.
      Raw, unfinished aesthetic.
      Edison bulbs and vintage lighting.
      Urban, edgy atmosphere.
    PROMPT
  },

  minimal: {
    name: "미니멀",
    prompt: <<~PROMPT
      Minimalist interior design.
      "Less is more" philosophy.
      Monochromatic color scheme.
      Essential furniture only.
      Clean, uncluttered spaces.
      Emphasis on negative space.
    PROMPT
  },

  luxury: {
    name: "럭셔리",
    prompt: <<~PROMPT
      Luxury high-end interior.
      Premium materials (marble, velvet, brass).
      Rich, sophisticated color palette.
      Statement lighting fixtures.
      Elegant, refined atmosphere.
      Attention to fine details.
    PROMPT
  },

  warm: {
    name: "따뜻한 분위기",
    prompt: <<~PROMPT
      Warm, inviting atmosphere.
      Golden hour lighting quality.
      Earthy, warm color tones.
      Soft textures and comfortable feel.
      Cozy, lived-in aesthetic.
    PROMPT
  },

  cool: {
    name: "시원한 분위기",
    prompt: <<~PROMPT
      Cool, contemporary atmosphere.
      Blue-tinted natural light.
      Cool gray and white tones.
      Crisp, clean aesthetic.
      Modern, sophisticated feel.
    PROMPT
  },

  dramatic: {
    name: "드라마틱",
    prompt: <<~PROMPT
      Dramatic interior photography.
      High contrast lighting.
      Deep shadows and bright highlights.
      Moody, atmospheric quality.
      Cinematic composition.
    PROMPT
  }
}
```

### 4.2 조명 프리셋

```ruby
LIGHTING_PRESETS = {
  day_bright: {
    name: "밝은 낮",
    prompt: <<~PROMPT
      Bright midday natural lighting.
      Strong sunlight streaming through windows.
      Clear, defined shadows.
      Blue sky visible through windows.
      Vibrant, energetic atmosphere.
    PROMPT
  },

  day_soft: {
    name: "부드러운 낮",
    prompt: <<~PROMPT
      Soft diffused daylight.
      Overcast sky lighting quality.
      Minimal shadows.
      Even, gentle illumination.
      Calm, serene atmosphere.
    PROMPT
  },

  golden_hour: {
    name: "골든아워",
    prompt: <<~PROMPT
      Golden hour warm sunlight.
      Low angle sun casting long shadows.
      Warm orange and yellow tones.
      Romantic, dreamy atmosphere.
      Soft lens flare effects acceptable.
    PROMPT
  },

  blue_hour: {
    name: "블루아워",
    prompt: <<~PROMPT
      Blue hour twilight lighting.
      Deep blue ambient light from windows.
      Interior warm lights creating contrast.
      Magical, transitional atmosphere.
      Balance of warm interior and cool exterior.
    PROMPT
  },

  night_ambient: {
    name: "밤 (은은한)",
    prompt: <<~PROMPT
      Night time with ambient interior lighting.
      Soft, warm lamp light throughout.
      Dark windows showing night sky.
      Cozy, intimate atmosphere.
      Subtle shadows from multiple light sources.
    PROMPT
  },

  night_dramatic: {
    name: "밤 (드라마틱)",
    prompt: <<~PROMPT
      Night time with dramatic lighting.
      Strong contrast between lit and unlit areas.
      Focused accent lighting on key elements.
      Moody, cinematic atmosphere.
      Deep shadows and bright highlights.
    PROMPT
  },

  all_lights_on: {
    name: "조명 전체 ON",
    prompt: <<~PROMPT
      All interior lights fully illuminated.
      Ceiling lights, lamps, and fixtures all on.
      Bright, well-lit interior.
      Multiple overlapping light sources.
      Minimal shadows.
    PROMPT
  },

  all_lights_off: {
    name: "조명 전체 OFF",
    prompt: <<~PROMPT
      All artificial lights turned off.
      Natural light from windows only.
      Darker interior areas away from windows.
      Strong directional lighting from outside.
      Natural shadow patterns.
    PROMPT
  }
}
```

---

## 5. 작업별 프롬프트 템플릿

### 5.1 초기 렌더링 (Initial Render)

```ruby
def build_initial_render_prompt(scene_context, user_style)
  <<~PROMPT
    Transform this SketchUp interior model into a photorealistic rendered image.

    #{scene_context}

    #{STRUCTURE_LOCK}

    RENDERING REQUIREMENTS:
    - Photorealistic quality matching professional interior photography
    - Natural, believable lighting and shadows
    - Accurate material representation (reflections, textures, transparency)
    - Proper depth of field and focus
    - No artificial or CGI-looking elements

    STYLE:
    #{user_style}
  PROMPT
end
```

### 5.2 조명 변경 (Lighting Change)

```ruby
def build_lighting_change_prompt(lighting_preset, current_style)
  <<~PROMPT
    Modify the lighting of this interior scene.

    #{lighting_preset[:prompt]}

    #{EXTENDED_STRUCTURE_LOCK}

    LIGHTING CHANGE RULES:
    - Only modify light sources, shadows, and ambient lighting
    - Adjust window views to match time of day
    - Update reflections to match new lighting
    - Maintain all other visual elements exactly

    MAINTAIN CURRENT STYLE:
    #{current_style}
  PROMPT
end
```

### 5.3 오브젝트 배치 후 재생성 (Object Placement)

```ruby
def build_placement_prompt(hotspots, image_dimensions, user_style)
  placement_instructions = hotspots.map do |hotspot|
    position = hotspot.position_description(image_dimensions[:width], image_dimensions[:height])
    height = hotspot.estimated_height_cm

    <<~INSTRUCTION
      - #{hotspot.object_name}:
        Position: #{position}
        Approximate height: #{height}cm
        Placement: naturally sitting on the floor
    INSTRUCTION
  end.join("\n")

  <<~PROMPT
    Integrate the provided objects into this interior scene.

    OBJECTS TO PLACE:
    #{placement_instructions}

    INTEGRATION REQUIREMENTS:
    - Each object must match the room's exact perspective
    - Objects must have correct scale relative to existing furniture
    - Objects must cast appropriate shadows matching scene lighting
    - Objects must have proper reflections on nearby surfaces
    - Objects should appear naturally integrated, not composited
    - Maintain consistent lighting across all objects

    #{EXTENDED_STRUCTURE_LOCK}

    STYLE:
    #{user_style}
  PROMPT
end
```

### 5.4 스타일 변경 (Style Transfer)

```ruby
def build_style_transfer_prompt(new_style)
  <<~PROMPT
    Apply a new visual style to this interior scene.

    NEW STYLE:
    #{new_style}

    #{STRUCTURE_LOCK}

    STYLE TRANSFER RULES:
    - Modify color grading, atmosphere, and mood
    - Adjust lighting quality to match style
    - Update material appearances (matte/glossy balance)
    - Keep all structural elements unchanged
    - Maintain exact furniture positions and shapes
    - Only aesthetic qualities should change
  PROMPT
end
```

---

## 6. 프롬프트 조합기 (Prompt Builder)

### 6.1 메인 빌더 클래스

```ruby
module NanoBanana
  class PromptBuilder
    include StructureLockPrompts
    include StylePresets
    include LightingPresets

    def initialize
      @scene_context_builder = SceneContextBuilder.new
    end

    # 초기 렌더링 프롬프트
    def build_initial_render(scene_info, style_key_or_custom)
      scene_context = @scene_context_builder.build_context(scene_info)
      user_style = resolve_style(style_key_or_custom)

      build_initial_render_prompt(scene_context, user_style)
    end

    # 조명 변경 프롬프트
    def build_lighting_change(lighting_key, current_style = nil)
      lighting = LIGHTING_PRESETS[lighting_key.to_sym]
      raise ArgumentError, "Unknown lighting preset: #{lighting_key}" unless lighting

      build_lighting_change_prompt(lighting, current_style || "")
    end

    # 오브젝트 배치 프롬프트
    def build_object_placement(hotspots, image_dimensions, style_key_or_custom)
      user_style = resolve_style(style_key_or_custom)

      build_placement_prompt(hotspots, image_dimensions, user_style)
    end

    # 스타일 변경 프롬프트
    def build_style_change(style_key_or_custom)
      user_style = resolve_style(style_key_or_custom)

      build_style_transfer_prompt(user_style)
    end

    private

    def resolve_style(style_key_or_custom)
      if style_key_or_custom.is_a?(Symbol) || STYLE_PRESETS.key?(style_key_or_custom.to_sym)
        STYLE_PRESETS[style_key_or_custom.to_sym][:prompt]
      else
        style_key_or_custom.to_s
      end
    end
  end
end
```

---

## 7. 프롬프트 검증 및 최적화

### 7.1 프롬프트 검증기

```ruby
class PromptValidator
  MAX_LENGTH = 4000  # Gemini 권장 최대 길이
  MIN_LENGTH = 50

  REQUIRED_KEYWORDS = [
    "keep", "unchanged", "preserve", "maintain", "exact"
  ]

  FORBIDDEN_PATTERNS = [
    /change.*wall/i,
    /move.*furniture/i,
    /resize.*room/i,
    /alter.*structure/i
  ]

  def validate(prompt)
    errors = []

    # 길이 검증
    if prompt.length > MAX_LENGTH
      errors << "프롬프트가 너무 깁니다 (#{prompt.length}/#{MAX_LENGTH})"
    end

    if prompt.length < MIN_LENGTH
      errors << "프롬프트가 너무 짧습니다"
    end

    # 필수 키워드 확인
    has_preservation = REQUIRED_KEYWORDS.any? { |kw| prompt.downcase.include?(kw) }
    unless has_preservation
      errors << "구조 보존 키워드가 누락되었습니다"
    end

    # 금지 패턴 확인
    FORBIDDEN_PATTERNS.each do |pattern|
      if prompt.match?(pattern)
        errors << "금지된 패턴이 감지되었습니다: #{pattern.source}"
      end
    end

    {
      valid: errors.empty?,
      errors: errors,
      length: prompt.length,
      warnings: generate_warnings(prompt)
    }
  end

  private

  def generate_warnings(prompt)
    warnings = []

    if prompt.length > MAX_LENGTH * 0.8
      warnings << "프롬프트가 권장 길이에 근접합니다"
    end

    unless prompt.include?("photorealistic")
      warnings << "실사 품질 키워드 추가를 권장합니다"
    end

    warnings
  end
end
```

### 7.2 프롬프트 최적화

```ruby
class PromptOptimizer
  def optimize(prompt)
    optimized = prompt.dup

    # 중복 제거
    optimized = remove_duplicates(optimized)

    # 불필요한 공백 정리
    optimized = clean_whitespace(optimized)

    # 구조화
    optimized = structure_prompt(optimized)

    optimized
  end

  private

  def remove_duplicates(text)
    lines = text.split("\n")
    lines.uniq.join("\n")
  end

  def clean_whitespace(text)
    text.gsub(/\n{3,}/, "\n\n").strip
  end

  def structure_prompt(text)
    # 섹션별로 정리
    text
  end
end
```

---

## 8. 사용 예시

### 8.1 기본 렌더링

```ruby
builder = NanoBanana::PromptBuilder.new

scene_info = {
  tags: ["거실", "소파", "TV", "wood floor"],
  camera_position: [5.0, 3.0, 1.6],
  camera_target: [0.0, 0.0, 1.0]
}

prompt = builder.build_initial_render(scene_info, :modern)
# 또는 커스텀 스타일
prompt = builder.build_initial_render(scene_info, "Warm cozy atmosphere with soft lighting")
```

### 8.2 조명 변경

```ruby
prompt = builder.build_lighting_change(:night_ambient, "Modern interior style")
```

### 8.3 오브젝트 배치

```ruby
hotspots = [
  Hotspot.new(x: 800, y: 600, object_name: "floor lamp", scale: 1.2),
  Hotspot.new(x: 400, y: 700, object_name: "armchair", scale: 1.0)
]

prompt = builder.build_object_placement(
  hotspots,
  { width: 1920, height: 1080 },
  :modern
)
```

---

## 9. 프롬프트 디버깅

### 9.1 로깅

```ruby
class PromptLogger
  def log_prompt(operation, prompt, metadata = {})
    log_entry = {
      timestamp: Time.now.iso8601,
      operation: operation,
      prompt_length: prompt.length,
      prompt_preview: prompt[0..200] + "...",
      metadata: metadata
    }

    puts "[PromptBuilder] #{log_entry.to_json}"

    # 파일 로깅 (디버그 모드)
    if NanoBanana::DEBUG_MODE
      File.open(debug_log_path, 'a') do |f|
        f.puts(log_entry.to_json)
        f.puts("--- FULL PROMPT ---")
        f.puts(prompt)
        f.puts("--- END ---\n\n")
      end
    end
  end
end
```

### 9.2 A/B 테스트 지원

```ruby
class PromptVariant
  def self.generate_variants(base_prompt, variations)
    variations.map do |variation|
      {
        id: SecureRandom.uuid,
        prompt: apply_variation(base_prompt, variation),
        variation_type: variation[:type]
      }
    end
  end

  def self.apply_variation(prompt, variation)
    case variation[:type]
    when :emphasis
      prompt.gsub(variation[:target], variation[:replacement])
    when :addition
      prompt + "\n\n" + variation[:content]
    when :removal
      prompt.gsub(variation[:pattern], '')
    end
  end
end
```
