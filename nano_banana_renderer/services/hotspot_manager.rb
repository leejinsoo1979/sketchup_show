# frozen_string_literal: true

require 'securerandom'

module NanoBanana
  # 3D 핫스팟 오브젝트 배치 관리
  # 스케치업 월드 좌표 기반
  class HotspotManager
    # 개별 핫스팟 데이터 클래스 (3D 좌표 지원)
    class Hotspot
      attr_accessor :id, :position, :normal, :screen_pos, :scale,
                    :object_image, :object_name, :floor_reference,
                    :estimated_size, :rotation

      def initialize(attrs = {})
        @id = attrs[:id] || SecureRandom.uuid
        # 3D 월드 좌표 (mm 단위)
        @position = attrs[:position] || { x: 0, y: 0, z: 0 }
        # 표면 노멀 벡터
        @normal = attrs[:normal] || { x: 0, y: 0, z: 1 }
        # 2D 스크린 좌표 (픽셀)
        @screen_pos = attrs[:screen_pos] || { x: 0, y: 0 }
        # 스케일 (1.0 = 100%)
        @scale = attrs[:scale] || 1.0
        # 회전 (도 단위, Z축 기준)
        @rotation = attrs[:rotation] || 0
        # 참조 이미지
        @object_image = attrs[:object_image]
        @object_name = attrs[:object_name] || 'Object'
        # 바닥 기준점 여부
        @floor_reference = attrs[:floor_reference] != false
        # 추정 실제 크기 (mm)
        @estimated_size = attrs[:estimated_size] || { width: 500, height: 800, depth: 500 }
      end

      # 위치 설명 (자연어)
      def position_description
        x_pos = case @position[:x]
          when -Float::INFINITY..0 then 'left side'
          when 0..2000 then 'center-left'
          when 2000..4000 then 'center'
          when 4000..6000 then 'center-right'
          else 'right side'
        end

        y_pos = case @position[:y]
          when -Float::INFINITY..0 then 'front'
          when 0..3000 then 'middle-front'
          when 3000..6000 then 'middle'
          when 6000..9000 then 'middle-back'
          else 'back'
        end

        "#{y_pos}, #{x_pos}"
      end

      # 실제 높이 (mm → cm)
      def height_cm
        (@estimated_size[:height] / 10.0).round
      end

      # JSON 변환
      def to_hash
        {
          id: @id,
          position: @position,
          normal: @normal,
          screen_pos: @screen_pos,
          scale: @scale,
          rotation: @rotation,
          object_name: @object_name,
          floor_reference: @floor_reference,
          estimated_size: @estimated_size,
          height_cm: height_cm
        }
      end

      def to_json(*_args)
        to_hash.to_json
      end
    end

    attr_reader :hotspots

    def initialize(hotspots = [])
      @hotspots = hotspots
    end

    # 핫스팟 추가 (3D 좌표 기반)
    def add(position:, normal:, screen_pos:, object_image:, object_name:,
            scale: 1.0, rotation: 0, floor_reference: true, estimated_size: nil)
      hotspot = Hotspot.new(
        position: position,
        normal: normal,
        screen_pos: screen_pos,
        scale: scale,
        rotation: rotation,
        object_image: object_image,
        object_name: object_name,
        floor_reference: floor_reference,
        estimated_size: estimated_size || { width: 500, height: 800, depth: 500 }
      )
      @hotspots << hotspot
      hotspot
    end

    # 핫스팟 제거
    def remove(id)
      @hotspots.reject! { |h| h.id == id }
    end

    # 핫스팟 조회
    def find(id)
      @hotspots.find { |h| h.id == id }
    end

    # 스케일 업데이트
    def update_scale(id, scale)
      hotspot = find(id)
      return unless hotspot

      hotspot.scale = [[scale, 0.1].max, 5.0].min
      hotspot
    end

    # 회전 업데이트
    def update_rotation(id, rotation)
      hotspot = find(id)
      return unless hotspot

      hotspot.rotation = rotation % 360
      hotspot
    end

    # 위치 업데이트 (3D)
    def update_position(id, position)
      hotspot = find(id)
      return unless hotspot

      hotspot.position = position
      hotspot
    end

    # 모두 제거
    def clear
      @hotspots = []
    end

    # 핫스팟 개수
    def count
      @hotspots.length
    end

    # 비어있는지 확인
    def empty?
      @hotspots.empty?
    end

    # 모든 오브젝트 이미지 배열
    def object_images
      @hotspots.map(&:object_image).compact
    end

    # AI용 배치 프롬프트 생성 (3D 좌표 포함)
    def build_placement_prompt
      return '' if @hotspots.empty?

      instructions = @hotspots.map.with_index do |hotspot, index|
        pos = hotspot.position
        size = hotspot.estimated_size

        <<~INSTRUCTION
          Object #{index + 1} - "#{hotspot.object_name}":
          - World Position: (#{pos[:x].round}mm, #{pos[:y].round}mm, #{pos[:z].round}mm)
          - Placement: #{hotspot.position_description}
          - Estimated Size: #{size[:width]}mm W × #{size[:depth]}mm D × #{size[:height]}mm H
          - Rotation: #{hotspot.rotation}° (Z-axis)
          - Floor Contact: #{hotspot.floor_reference ? 'Yes' : 'No'}
          - Scale Factor: #{hotspot.scale}
        INSTRUCTION
      end

      instructions.join("\n")
    end

    # JSON 변환
    def to_hash
      {
        count: count,
        hotspots: @hotspots.map(&:to_hash)
      }
    end

    def to_json(*_args)
      to_hash.to_json
    end

    # 깊이 기반 정렬 (뒤에서 앞으로)
    def sort_by_depth!
      @hotspots.sort_by! { |h| -h.position[:y] }
      self
    end

    # 유효성 검사
    def validate
      errors = []

      @hotspots.each do |hotspot|
        errors << "#{hotspot.object_name}: 이미지가 없습니다" unless hotspot.object_image
        errors << "#{hotspot.object_name}: 스케일이 유효하지 않습니다" if hotspot.scale <= 0
      end

      {
        valid: errors.empty?,
        errors: errors
      }
    end
  end

  # ========================================
  # 스케치업 3D 좌표 추출 도구
  # ========================================
  class CoordinateExtractor
    # 스크린 좌표에서 3D 월드 좌표 추출
    def self.screen_to_world(view, screen_x, screen_y)
      # 레이캐스트로 3D 포인트 찾기
      ray = view.pickray(screen_x, screen_y)
      return nil unless ray

      model = Sketchup.active_model
      hit = model.raytest(ray)

      if hit
        point = hit[0]
        path = hit[1]

        # 히트된 면의 노멀 벡터 계산
        normal = calculate_normal(path)

        {
          position: {
            x: point.x.to_mm,
            y: point.y.to_mm,
            z: point.z.to_mm
          },
          normal: {
            x: normal.x,
            y: normal.y,
            z: normal.z
          },
          floor_reference: point.z.to_mm < 100, # 바닥 근처인지
          hit_entity: path.last
        }
      else
        # 히트 실패 시 바닥면 (Z=0) 기준 계산
        ground_point = ray_ground_intersection(ray)
        if ground_point
          {
            position: {
              x: ground_point.x.to_mm,
              y: ground_point.y.to_mm,
              z: 0
            },
            normal: { x: 0, y: 0, z: 1 },
            floor_reference: true,
            hit_entity: nil
          }
        else
          nil
        end
      end
    end

    # 면의 노멀 벡터 계산
    def self.calculate_normal(path)
      entity = path.last
      if entity.is_a?(Sketchup::Face)
        entity.normal
      else
        Geom::Vector3d.new(0, 0, 1) # 기본값: 위쪽
      end
    end

    # 레이와 바닥면(Z=0)의 교차점
    def self.ray_ground_intersection(ray)
      origin = ray[0]
      direction = ray[1]

      return nil if direction.z.abs < 0.0001 # 수평에 가까우면 무시

      t = -origin.z / direction.z
      return nil if t < 0 # 카메라 뒤쪽

      Geom::Point3d.new(
        origin.x + direction.x * t,
        origin.y + direction.y * t,
        0
      )
    end

    # 현재 카메라 정보 추출
    def self.get_camera_info(view)
      camera = view.camera
      {
        eye: {
          x: camera.eye.x.to_mm,
          y: camera.eye.y.to_mm,
          z: camera.eye.z.to_mm
        },
        target: {
          x: camera.target.x.to_mm,
          y: camera.target.y.to_mm,
          z: camera.target.z.to_mm
        },
        up: {
          x: camera.up.x,
          y: camera.up.y,
          z: camera.up.z
        },
        fov: camera.fov,
        aspect_ratio: camera.aspect_ratio,
        perspective: camera.perspective?
      }
    end

    # 씬 컨텍스트 전체 추출 (AI 전달용)
    def self.get_scene_context(view)
      model = Sketchup.active_model
      shadow_info = model.shadow_info

      {
        camera: get_camera_info(view),
        units: 'mm',
        shadow: {
          enabled: shadow_info['DisplayShadows'],
          time: shadow_info['ShadowTime'].to_s,
          light_direction: shadow_info['SunDirection'].to_a
        },
        model_bounds: get_model_bounds(model)
      }
    end

    # 모델 전체 바운딩 박스
    def self.get_model_bounds(model)
      bounds = model.bounds
      {
        min: {
          x: bounds.min.x.to_mm,
          y: bounds.min.y.to_mm,
          z: bounds.min.z.to_mm
        },
        max: {
          x: bounds.max.x.to_mm,
          y: bounds.max.y.to_mm,
          z: bounds.max.z.to_mm
        }
      }
    end
  end

  # ========================================
  # 스케치업 컴포넌트 배치 도구
  # ========================================
  class ComponentPlacer
    # 이미지 기반 컴포넌트 생성 및 배치
    def self.place_from_image(position:, rotation:, scale:, name:, image_path: nil)
      model = Sketchup.active_model
      entities = model.active_entities

      # 위치 변환 (mm → 인치)
      point = Geom::Point3d.new(
        position[:x].mm,
        position[:y].mm,
        position[:z].mm
      )

      # 컴포넌트 정의 생성
      definition = model.definitions.add(name)

      # 플레이스홀더 지오메트리 (박스)
      # 실제로는 AI 결과나 3D 모델을 로드해야 함
      width = (500 * scale).mm
      depth = (500 * scale).mm
      height = (800 * scale).mm

      create_placeholder_box(definition.entities, width, depth, height)

      # 변환 매트릭스 생성
      rotation_transform = Geom::Transformation.rotation(point, Z_AXIS, rotation.degrees)
      translation = Geom::Transformation.new(point)
      transform = translation * rotation_transform

      # 컴포넌트 인스턴스 배치
      instance = entities.add_instance(definition, transform)
      instance.name = name

      {
        success: true,
        instance: instance,
        definition: definition
      }
    rescue StandardError => e
      puts "[NanoBanana] Component placement error: #{e.message}"
      { success: false, error: e.message }
    end

    # 플레이스홀더 박스 생성
    def self.create_placeholder_box(entities, width, depth, height)
      # 바닥면 포인트
      pts = [
        Geom::Point3d.new(-width/2, -depth/2, 0),
        Geom::Point3d.new(width/2, -depth/2, 0),
        Geom::Point3d.new(width/2, depth/2, 0),
        Geom::Point3d.new(-width/2, depth/2, 0)
      ]

      # 바닥면 생성 후 Push/Pull
      face = entities.add_face(pts)
      face.pushpull(height) if face
    end

    # 여러 핫스팟을 한번에 배치
    def self.place_hotspots(hotspot_manager)
      results = []

      hotspot_manager.hotspots.each do |hotspot|
        result = place_from_image(
          position: hotspot.position,
          rotation: hotspot.rotation,
          scale: hotspot.scale,
          name: hotspot.object_name
        )
        results << result
      end

      {
        success: results.all? { |r| r[:success] },
        placed_count: results.count { |r| r[:success] },
        results: results
      }
    end
  end
end
