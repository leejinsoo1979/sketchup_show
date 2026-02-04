# frozen_string_literal: true

require 'base64'
require 'tempfile'
require 'fileutils'

module NanoBanana
  # SketchUp 씬을 이미지로 추출
  class SceneExporter
    DEFAULT_WIDTH = 1920
    DEFAULT_HEIGHT = 1080

    def initialize
      @model = Sketchup.active_model
      @view = @model.active_view
    end

    # 현재 뷰를 이미지로 추출
    def export_current_view(options = {})
      width = options[:width] || DEFAULT_WIDTH
      height = options[:height] || DEFAULT_HEIGHT
      antialias = options.fetch(:antialias, true)
      transparent = options.fetch(:transparent, false)

      # 원래 상태 저장
      original_state = save_render_state

      begin
        # 씬 전처리
        prepare_scene_for_export

        # 임시 파일 생성
        temp_file = Tempfile.new(['nanobanana_export', '.png'])
        temp_path = temp_file.path
        temp_file.close

        # 이미지 내보내기
        export_options = {
          filename: temp_path,
          width: width,
          height: height,
          antialias: antialias,
          transparent: transparent
        }

        success = @view.write_image(export_options)

        unless success
          raise "이미지 내보내기에 실패했습니다."
        end

        # Base64 인코딩
        image_data = File.binread(temp_path)
        base64_image = Base64.strict_encode64(image_data)

        # 씬 정보 수집
        scene_info = collect_scene_info

        {
          image: base64_image,
          scene_info: scene_info,
          width: width,
          height: height
        }
      ensure
        # 원래 상태 복원
        restore_render_state(original_state)

        # 임시 파일 삭제
        File.delete(temp_path) if File.exist?(temp_path)
      end
    end

    # 씬 정보 수집
    def collect_scene_info
      camera = @view.camera

      {
        # 카메라 정보
        camera_position: point_to_array(camera.eye),
        camera_target: point_to_array(camera.target),
        camera_up: vector_to_array(camera.up),
        fov: camera.fov,
        aspect_ratio: camera.aspect_ratio,
        perspective: camera.perspective?,

        # 씬 정보
        scene_name: current_scene_name,
        tags: collect_tags,
        materials: collect_materials,

        # 모델 정보
        model_name: @model.name,
        model_path: @model.path,

        # 렌더링 정보
        style_name: @model.styles.active_style&.name,
        shadow_enabled: @model.shadow_info['DisplayShadows'],

        # 공간 분석
        space_type: detect_space_type,
        estimated_room_size: estimate_room_size
      }
    end

    private

    # 렌더 상태 저장
    def save_render_state
      rendering_options = @model.rendering_options
      {
        display_dims: rendering_options['DisplayDims'],
        display_text: rendering_options['DisplayText'],
        display_section_planes: rendering_options['DisplaySectionPlanes'],
        display_section_cuts: rendering_options['DisplaySectionCuts'],
        display_construction_geometry: rendering_options['DrawHiddenGeometry'],
        hidden_layers: collect_hidden_layers
      }
    end

    # 렌더 상태 복원
    def restore_render_state(state)
      return unless state

      rendering_options = @model.rendering_options
      rendering_options['DisplayDims'] = state[:display_dims]
      rendering_options['DisplayText'] = state[:display_text]
      rendering_options['DisplaySectionPlanes'] = state[:display_section_planes]
      rendering_options['DisplaySectionCuts'] = state[:display_section_cuts]
      rendering_options['DrawHiddenGeometry'] = state[:display_construction_geometry]

      # 숨긴 레이어 복원
      restore_hidden_layers(state[:hidden_layers])
    end

    # 내보내기 전 씬 준비
    def prepare_scene_for_export
      rendering_options = @model.rendering_options

      # 치수선, 텍스트 숨기기
      rendering_options['DisplayDims'] = false
      rendering_options['DisplayText'] = false

      # 단면 평면 숨기기
      rendering_options['DisplaySectionPlanes'] = false

      # 숨겨진 지오메트리 숨기기
      rendering_options['DrawHiddenGeometry'] = false

      # 특정 태그(레이어) 숨기기 (가이드, 보조선 등)
      hide_helper_layers
    end

    # 보조 레이어 숨기기
    def hide_helper_layers
      helper_keywords = %w[guide helper annotation dimension 가이드 보조 치수]

      @model.layers.each do |layer|
        layer_name_lower = layer.name.downcase
        if helper_keywords.any? { |kw| layer_name_lower.include?(kw) }
          layer.visible = false
        end
      end
    end

    # 숨겨진 레이어 수집
    def collect_hidden_layers
      @model.layers.select { |l| !l.visible? }.map(&:name)
    end

    # 숨겨진 레이어 복원
    def restore_hidden_layers(hidden_names)
      return unless hidden_names

      @model.layers.each do |layer|
        layer.visible = !hidden_names.include?(layer.name)
      end
    end

    # 현재 씬 이름
    def current_scene_name
      page = @model.pages.selected_page
      page ? page.name : 'Untitled'
    end

    # 태그(레이어) 수집
    def collect_tags
      @model.layers.select(&:visible?).map(&:name)
    end

    # 재질 수집
    def collect_materials
      @model.materials.map do |mat|
        {
          name: mat.name,
          color: mat.color ? color_to_hex(mat.color) : nil,
          alpha: mat.alpha,
          texture: mat.texture ? mat.texture.filename : nil
        }
      end
    end

    # 공간 타입 감지
    def detect_space_type
      tags = collect_tags.join(' ').downcase

      space_types = {
        'living_room' => %w[living 거실 리빙 소파],
        'bedroom' => %w[bed 침실 침대 베드],
        'kitchen' => %w[kitchen 주방 키친 싱크],
        'bathroom' => %w[bath 욕실 화장실 샤워],
        'office' => %w[office 사무 오피스 책상],
        'dining' => %w[dining 다이닝 식탁 식당]
      }

      space_types.each do |type, keywords|
        return type if keywords.any? { |kw| tags.include?(kw) }
      end

      'interior'
    end

    # 방 크기 추정
    def estimate_room_size
      bounds = @model.bounds

      return nil if bounds.empty?

      {
        width: bounds.width.to_m.round(2),
        depth: bounds.depth.to_m.round(2),
        height: bounds.height.to_m.round(2)
      }
    end

    # Point3d를 배열로 변환
    def point_to_array(point)
      [point.x.to_f, point.y.to_f, point.z.to_f]
    end

    # Vector3d를 배열로 변환
    def vector_to_array(vector)
      [vector.x.to_f, vector.y.to_f, vector.z.to_f]
    end

    # 색상을 HEX로 변환
    def color_to_hex(color)
      '#%02x%02x%02x' % [color.red, color.green, color.blue]
    end
  end
end
