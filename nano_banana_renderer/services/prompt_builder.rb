# frozen_string_literal: true

module NanoBanana
  # 프롬프트 빌더 - AI 렌더링 엔진 핵심
  #
  # 구조:
  # FINAL_PROMPT = LOCKED_GEOMETRY_BLOCK + VARIABLE_CONTROL_BLOCK + USER_PROMPT_BLOCK
  #
  class PromptBuilder

    # ========================================
    # LOCKED GEOMETRY BLOCK (절대 수정 불가)
    # ========================================
    # 이 블록은 어떤 경우에도 사용자가 수정할 수 없음
    # 모든 API 호출에 자동으로 포함됨

    LOCKED_GEOMETRY_BLOCK = <<~PROMPT
      STRICT IMAGE-TO-IMAGE CONVERSION ONLY.

      Input: 3D SketchUp wireframe/model render
      Output: Photorealistic version of THE EXACT SAME IMAGE

      CRITICAL - PIXEL-LEVEL PRESERVATION:
      - SAME walls, SAME positions
      - SAME furniture, SAME locations, SAME sizes
      - SAME camera angle, SAME perspective
      - SAME room layout, SAME proportions

      DO NOT:
      - Add ANY new objects (no plants, rugs, mirrors, decorations)
      - Remove ANY existing objects
      - Move or resize ANYTHING
      - Change room layout or proportions
      - Be creative or redesign the space

      ONLY DO:
      - Add realistic textures to existing surfaces
      - Add realistic lighting/shadows
      - Make it look like a photograph of THIS EXACT SCENE

      This is texture/material enhancement ONLY, not redesign.
    PROMPT

    # ========================================
    # LIGHTING PRESETS (안전한 조명 변경만 허용)
    # ========================================
    # ⚠️ "Golden hour", "Dramatic lighting" 금지
    # ⚠️ 그림자 방향 변경 = 구조 왜곡 위험
    # → Tonal change ONLY (색조 변경만)

    LIGHTING_PRESETS = {
      neutral: {
        name: '기본 (Neutral Reference)',
        safe: true,
        prompt: <<~PROMPT
          Lighting preset: Neutral Reference
          Maintain original lighting direction and shadow positions
          Apply photorealistic material rendering only
          No lighting mood change
        PROMPT
      },

      day: {
        name: '낮 (Day)',
        safe: true,
        prompt: <<~PROMPT
          Lighting preset: Day
          Bright natural daylight tonal quality
          Lighting change must be tonal only
          No shadow direction or geometry perception change
          Maintain all shadow positions from original image
          Windows show bright exterior
        PROMPT
      },

      evening: {
        name: '저녁 (Evening)',
        safe: true,
        prompt: <<~PROMPT
          Lighting preset: Evening
          Warm evening tonal quality
          Lighting change must be tonal only
          No shadow direction or geometry perception change
          Maintain all shadow positions from original image
          Subtle warm color temperature shift only
        PROMPT
      },

      night: {
        name: '밤 (Night)',
        safe: true,
        prompt: <<~PROMPT
          Lighting preset: Night
          Artificial lighting only
          Lighting change must be tonal only
          No shadow direction or geometry perception change
          Windows show dark exterior
          Interior warm artificial light tones
        PROMPT
      }
    }.freeze

    # ========================================
    # INTERIOR LIGHT CONTROL (조명 ON/OFF)
    # ========================================
    # ⚠️ 광원 위치 변경 금지
    # → 밝기/발광 여부만 토글

    LIGHT_CONTROL = {
      on: {
        name: '조명 ON',
        prompt: <<~PROMPT
          Interior lights: ON
          All existing light fixtures are illuminated
          Do not change light positions or intensities spatially
          Do not add new light sources
          Do not remove any light fixtures
          Maintain original light fixture positions exactly
        PROMPT
      },

      off: {
        name: '조명 OFF',
        prompt: <<~PROMPT
          Interior lights: OFF
          All artificial light fixtures are turned off
          Do not change light positions spatially
          Do not remove any light fixtures from scene
          Natural ambient light only
          Maintain original light fixture positions exactly
        PROMPT
      }
    }.freeze

    # ========================================
    # STYLE PRESETS (재질 실사화만 허용)
    # ========================================
    # ⚠️ 구조 변경 유발 스타일 금지
    # → Material realism ONLY

    STYLE_PRESETS = {
      photorealistic: {
        name: '포토리얼리스틱 (기본)',
        prompt: <<~PROMPT
          OUTPUT QUALITY:
          - Photorealistic rendering
          - DSLR camera quality
          - Professional architectural photography standard
          - Remove any "AI-generated" artifacts
          - Natural material textures and reflections
        PROMPT
      },

      warm_tone: {
        name: '따뜻한 톤',
        prompt: <<~PROMPT
          OUTPUT QUALITY:
          - Photorealistic rendering with warm color grading
          - DSLR camera quality
          - Warm color temperature adjustment only
          - No structural or lighting direction changes
          - Natural material textures
        PROMPT
      },

      cool_tone: {
        name: '시원한 톤',
        prompt: <<~PROMPT
          OUTPUT QUALITY:
          - Photorealistic rendering with cool color grading
          - DSLR camera quality
          - Cool color temperature adjustment only
          - No structural or lighting direction changes
          - Natural material textures
        PROMPT
      },

      high_contrast: {
        name: '고대비',
        prompt: <<~PROMPT
          OUTPUT QUALITY:
          - Photorealistic rendering with enhanced contrast
          - DSLR camera quality
          - Tonal contrast enhancement only
          - No structural changes
          - Crisp material definition
        PROMPT
      }
    }.freeze

    # ========================================
    # 메인 빌더 메서드
    # ========================================

    def initialize
      @locked_block = LOCKED_GEOMETRY_BLOCK
    end

    # 초기 렌더링 (SketchUp → 실사)
    def build_initial_render(scene_info = {}, style_key = :photorealistic)
      variable_block = build_initial_variable_block(scene_info)
      style_block = resolve_style(style_key)

      combine_blocks(variable_block, style_block)
    end

    # 조명 프리셋 변경
    def build_lighting_change(lighting_key, light_switch = nil)
      lighting = LIGHTING_PRESETS[lighting_key.to_sym]
      raise ArgumentError, "Unknown lighting preset: #{lighting_key}" unless lighting

      variable_parts = [lighting[:prompt]]

      # 조명 ON/OFF 추가
      if light_switch
        light_control = LIGHT_CONTROL[light_switch.to_sym]
        variable_parts << light_control[:prompt] if light_control
      end

      variable_block = variable_parts.join("\n\n")

      combine_blocks(variable_block, STYLE_PRESETS[:photorealistic][:prompt])
    end

    # 오브젝트 배치 후 재생성
    def build_object_placement(hotspots, image_dimensions)
      placement_block = build_placement_block(hotspots, image_dimensions)

      variable_block = <<~PROMPT
        OBJECT PLACEMENT TASK:
        #{placement_block}

        PLACEMENT RULES:
        - Place the specified object at the marked hotspot
        - Maintain realistic scale relative to surrounding geometry
        - Do NOT alter any existing structure or furniture
        - Object must sit naturally on floor/surface
        - Match lighting and shadow direction of existing scene
        - Object integration must be seamless and photorealistic
      PROMPT

      combine_blocks(variable_block, STYLE_PRESETS[:photorealistic][:prompt])
    end

    # 재생성 (기존 이미지 기반)
    def build_regeneration(changes = {})
      variable_parts = []

      # 조명 프리셋
      if changes[:lighting]
        lighting = LIGHTING_PRESETS[changes[:lighting].to_sym]
        variable_parts << lighting[:prompt] if lighting
      end

      # 조명 ON/OFF
      if changes[:light_switch]
        light_control = LIGHT_CONTROL[changes[:light_switch].to_sym]
        variable_parts << light_control[:prompt] if light_control
      end

      # 재생성 규칙
      variable_parts << <<~PROMPT
        REGENERATION TASK:
        - This is image-to-image regeneration
        - Existing structure: LOCKED (do not modify)
        - Apply only the specified changes above
        - Maintain material realism
      PROMPT

      variable_block = variable_parts.join("\n\n")

      combine_blocks(variable_block, STYLE_PRESETS[:photorealistic][:prompt])
    end

    # ========================================
    # 프리셋 목록 (UI용)
    # ========================================

    def self.lighting_presets
      LIGHTING_PRESETS.map { |key, value| { key: key, name: value[:name] } }
    end

    def self.style_presets
      STYLE_PRESETS.map { |key, value| { key: key, name: value[:name] } }
    end

    def self.light_controls
      LIGHT_CONTROL.map { |key, value| { key: key, name: value[:name] } }
    end

    private

    # 블록 결합 (항상 LOCKED_GEOMETRY_BLOCK이 먼저)
    def combine_blocks(variable_block, user_block = '')
      [
        "=" * 50,
        "LOCKED GEOMETRY PRESERVATION (NON-NEGOTIABLE)",
        "=" * 50,
        @locked_block,
        "",
        "=" * 50,
        "VARIABLE CONTROL BLOCK",
        "=" * 50,
        variable_block,
        "",
        "=" * 50,
        "OUTPUT REQUIREMENTS",
        "=" * 50,
        user_block
      ].join("\n")
    end

    # 초기 렌더링용 변수 블록
    def build_initial_variable_block(scene_info)
      parts = []

      parts << "SCENE CONTEXT:"
      parts << "- Task: Transform SketchUp model to photorealistic image"
      parts << "- Mode: Strict reconstruction (not creative generation)"

      if scene_info[:space_type]
        parts << "- Space type: #{scene_info[:space_type]}"
      end

      if scene_info[:camera_position]
        parts << "- Camera: Locked to source image exactly"
      end

      parts << ""
      parts << "INITIAL RENDER RULES:"
      parts << "- Convert 3D model appearance to photorealistic materials"
      parts << "- Maintain exact geometry from source"
      parts << "- Apply realistic lighting based on existing light setup"
      parts << "- No creative interpretation"

      parts.join("\n")
    end

    # 오브젝트 배치 블록
    def build_placement_block(hotspots, image_dimensions)
      return "No objects to place." if hotspots.nil? || hotspots.empty?

      width = image_dimensions[:width] || 1920
      height = image_dimensions[:height] || 1080

      instructions = hotspots.map.with_index do |hotspot, index|
        position = describe_position(hotspot.x, hotspot.y, width, height)
        estimated_height = hotspot.respond_to?(:estimated_height_cm) ? hotspot.estimated_height_cm : 100

        <<~INSTRUCTION
          Object #{index + 1}: #{hotspot.object_name}
          - Position: #{position}
          - Approximate height: #{estimated_height}cm
          - Must sit naturally on floor with correct perspective
          - Must match scene lighting direction
        INSTRUCTION
      end

      instructions.join("\n")
    end

    # 위치 설명
    def describe_position(x, y, width, height)
      horizontal = case x.to_f / width
        when 0..0.33 then 'left area'
        when 0.33..0.66 then 'center area'
        else 'right area'
      end

      vertical = case y.to_f / height
        when 0..0.4 then 'back'
        when 0.4..0.7 then 'middle'
        else 'front'
      end

      "#{vertical} #{horizontal} of the room"
    end

    # 스타일 해석
    def resolve_style(style_input)
      if style_input.is_a?(Symbol) && STYLE_PRESETS.key?(style_input)
        STYLE_PRESETS[style_input][:prompt]
      elsif style_input.is_a?(String) && style_input.length > 20
        # 사용자 커스텀 입력은 출력 품질 관련만 허용
        <<~PROMPT
          OUTPUT QUALITY:
          - Photorealistic rendering
          - DSLR camera quality
          - #{style_input}
          - No structural modifications allowed
        PROMPT
      else
        STYLE_PRESETS[:photorealistic][:prompt]
      end
    end
  end
end
