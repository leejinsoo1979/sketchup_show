# frozen_string_literal: true

module NanoBanana
  # 2포인트 투시 카메라 Tool (Enscape 스타일)
  class CameraTool
    # SketchUp 키 상수
    VK_SHIFT = 16

    # 카메라 높이 프리셋 (미터)
    HEIGHT_PRESETS = {
      standing: 1.6,    # 서있기
      seated: 1.1,      # 앉기
      low_angle: 0.5,   # 낮은 앵글
      top_view: 3.0     # 위에서 보기
    }.freeze

    # 화각 프리셋 (도)
    FOV_PRESETS = {
      wide: 74,         # 광각 (24mm)
      standard: 54,     # 표준 (35mm)
      portrait: 40,     # 인물 (50mm)
      telephoto: 28     # 망원 (85mm)
    }.freeze

    # 이동 속도 (m/픽셀)
    BASE_MOVE_SPEED = 0.01
    FAST_MOVE_MULTIPLIER = 3.0

    # 회전 속도 (도/픽셀)
    ROTATION_SPEED = 0.3

    def initialize
      @view = Sketchup.active_model.active_view
      @camera = @view.camera

      # 현재 설정
      @height = HEIGHT_PRESETS[:standing]
      @fov = FOV_PRESETS[:standard]
      @move_speed = BASE_MOVE_SPEED

      # 마우스 상태
      @last_x = 0
      @last_y = 0
      @left_button_down = false
      @right_button_down = false
      @shift_down = false

      # 키보드 상태
      @keys = { w: false, a: false, s: false, d: false, q: false, e: false }

      apply_two_point_perspective
    end

    # ========================================
    # SketchUp Tool 인터페이스
    # ========================================

    def activate
      @view = Sketchup.active_model.active_view
      @camera = @view.camera
      apply_two_point_perspective
      update_fov
      Sketchup.status_text = "NanoBanana 카메라: WASD 이동, 마우스 회전, Q/E 높이, 휠 속도"
    end

    def deactivate(view)
      Sketchup.status_text = ""
    end

    def resume(view)
      Sketchup.status_text = "NanoBanana 카메라: WASD 이동, 마우스 회전, Q/E 높이, 휠 속도"
    end

    # 마우스 버튼 다운
    def onLButtonDown(flags, x, y, view)
      @left_button_down = true
      @last_x = x
      @last_y = y
    end

    def onLButtonUp(flags, x, y, view)
      @left_button_down = false
    end

    def onRButtonDown(flags, x, y, view)
      @right_button_down = true
      @last_x = x
      @last_y = y
    end

    def onRButtonUp(flags, x, y, view)
      @right_button_down = false
    end

    # 마우스 이동
    def onMouseMove(flags, x, y, view)
      @shift_down = (flags & 1) == 1  # Shift 키 체크

      if @left_button_down
        # 좌클릭 드래그: 시점 회전 (수평만)
        dx = x - @last_x
        rotate_horizontal(dx * ROTATION_SPEED)
      elsif @right_button_down
        # 우클릭 드래그: 팬 (평행 이동)
        dx = x - @last_x
        dy = y - @last_y
        pan(-dx * @move_speed * 5, dy * @move_speed * 5)
      end

      @last_x = x
      @last_y = y
      view.invalidate
    end

    # 마우스 휠: 이동 속도 조절
    def onMouseWheel(flags, delta, x, y, view)
      if delta > 0
        @move_speed *= 1.2
      else
        @move_speed /= 1.2
      end
      @move_speed = [[@move_speed, 0.001].max, 0.5].min  # 범위 제한
      Sketchup.status_text = "이동 속도: #{(@move_speed * 100).round(1)}"
      view.invalidate
    end

    # 키보드 다운
    def onKeyDown(key, repeat, flags, view)
      case key
      when 'w'.ord, 'W'.ord then @keys[:w] = true
      when 'a'.ord, 'A'.ord then @keys[:a] = true
      when 's'.ord, 'S'.ord then @keys[:s] = true
      when 'd'.ord, 'D'.ord then @keys[:d] = true
      when 'q'.ord, 'Q'.ord then @keys[:q] = true
      when 'e'.ord, 'E'.ord then @keys[:e] = true
      when VK_SHIFT then @shift_down = true
      end

      process_movement(view)
    end

    def onKeyUp(key, repeat, flags, view)
      case key
      when 'w'.ord, 'W'.ord then @keys[:w] = false
      when 'a'.ord, 'A'.ord then @keys[:a] = false
      when 's'.ord, 'S'.ord then @keys[:s] = false
      when 'd'.ord, 'D'.ord then @keys[:d] = false
      when 'q'.ord, 'Q'.ord then @keys[:q] = false
      when 'e'.ord, 'E'.ord then @keys[:e] = false
      when VK_SHIFT then @shift_down = false
      end
    end

    # ========================================
    # 카메라 조작 메서드
    # ========================================

    # WASD 이동 처리
    def process_movement(view)
      speed = @shift_down ? @move_speed * FAST_MOVE_MULTIPLIER : @move_speed
      speed_m = speed.m  # 미터를 인치로 변환 (SketchUp 내부 단위)

      # 카메라 방향 벡터 (수평 성분만)
      direction = @camera.direction.clone
      direction.z = 0
      direction.normalize! if direction.length > 0

      # 오른쪽 벡터
      right = direction.cross(Z_AXIS)
      right.normalize! if right.length > 0

      move_vector = Geom::Vector3d.new(0, 0, 0)

      # 앞/뒤
      if @keys[:w]
        scaled_dir = Geom::Vector3d.new(direction.x * speed_m, direction.y * speed_m, direction.z * speed_m)
        move_vector = Geom::Vector3d.new(move_vector.x + scaled_dir.x, move_vector.y + scaled_dir.y, move_vector.z + scaled_dir.z)
      end
      if @keys[:s]
        scaled_dir = Geom::Vector3d.new(direction.x * speed_m, direction.y * speed_m, direction.z * speed_m)
        move_vector = Geom::Vector3d.new(move_vector.x - scaled_dir.x, move_vector.y - scaled_dir.y, move_vector.z - scaled_dir.z)
      end

      # 좌/우
      if @keys[:d]
        scaled_right = Geom::Vector3d.new(right.x * speed_m, right.y * speed_m, right.z * speed_m)
        move_vector = Geom::Vector3d.new(move_vector.x + scaled_right.x, move_vector.y + scaled_right.y, move_vector.z + scaled_right.z)
      end
      if @keys[:a]
        scaled_right = Geom::Vector3d.new(right.x * speed_m, right.y * speed_m, right.z * speed_m)
        move_vector = Geom::Vector3d.new(move_vector.x - scaled_right.x, move_vector.y - scaled_right.y, move_vector.z - scaled_right.z)
      end

      # 위/아래
      if @keys[:e]
        move_vector = Geom::Vector3d.new(move_vector.x, move_vector.y, move_vector.z + speed_m)
      end
      if @keys[:q]
        move_vector = Geom::Vector3d.new(move_vector.x, move_vector.y, move_vector.z - speed_m)
      end

      # 이동 적용
      unless move_vector.length.zero?
        eye = @camera.eye.offset(move_vector)
        target = @camera.target.offset(move_vector)
        @camera.set(eye, target, Z_AXIS)
        view.invalidate
      end
    end

    # 수평 회전 (좌우 둘러보기)
    def rotate_horizontal(degrees)
      angle = degrees.degrees

      # 카메라 eye를 중심으로 target 회전
      eye = @camera.eye
      target = @camera.target

      # eye에서 target으로의 벡터
      view_vector = eye.vector_to(target)
      distance = view_vector.length

      # Z축 기준 회전
      rotation = Geom::Transformation.rotation(eye, Z_AXIS, -angle)
      new_direction = view_vector.transform(rotation)
      new_direction.length = distance

      new_target = eye.offset(new_direction)

      @camera.set(eye, new_target, Z_AXIS)
    end

    # 팬 (평행 이동)
    def pan(dx, dy)
      dx_m = dx.m
      dy_m = dy.m

      # 카메라 방향 벡터
      direction = @camera.direction.clone
      direction.z = 0
      direction.normalize! if direction.length > 0

      right = direction.cross(Z_AXIS)
      right.normalize! if right.length > 0

      scaled_right = Geom::Vector3d.new(right.x * dx_m, right.y * dx_m, right.z * dx_m)
      scaled_dir = Geom::Vector3d.new(direction.x * dy_m, direction.y * dy_m, direction.z * dy_m)
      move_vector = Geom::Vector3d.new(scaled_right.x + scaled_dir.x, scaled_right.y + scaled_dir.y, scaled_right.z + scaled_dir.z)

      eye = @camera.eye.offset(move_vector)
      target = @camera.target.offset(move_vector)
      @camera.set(eye, target, Z_AXIS)
    end

    # ========================================
    # 설정 메서드
    # ========================================

    # 2포인트 투시 적용 (수직선 고정)
    def apply_two_point_perspective
      @camera.set(@camera.eye, @camera.target, Z_AXIS)
    end

    # 카메라 높이 설정
    def set_height(height_key_or_value)
      if height_key_or_value.is_a?(Symbol)
        @height = HEIGHT_PRESETS[height_key_or_value] || HEIGHT_PRESETS[:standing]
      else
        @height = height_key_or_value.to_f
      end

      apply_height
    end

    # 높이 적용
    def apply_height
      eye = @camera.eye
      target = @camera.target
      height_m = @height.m  # 미터를 인치로 변환

      new_eye = Geom::Point3d.new(eye.x, eye.y, height_m)
      new_target = Geom::Point3d.new(target.x, target.y, height_m)

      @camera.set(new_eye, new_target, Z_AXIS)
      @view.invalidate
    end

    # 화각(FOV) 설정
    def set_fov(fov_key_or_value)
      if fov_key_or_value.is_a?(Symbol)
        @fov = FOV_PRESETS[fov_key_or_value] || FOV_PRESETS[:standard]
      else
        @fov = fov_key_or_value.to_f
      end

      update_fov
    end

    # FOV 적용
    def update_fov
      @camera.perspective = true
      @camera.fov = @fov
      @view.invalidate
    end

    # 현재 설정 반환
    def current_settings
      {
        height: @height,
        fov: @fov,
        move_speed: @move_speed,
        eye: @camera.eye.to_a,
        target: @camera.target.to_a
      }
    end

    # ========================================
    # 프리셋 목록 (UI용)
    # ========================================

    def self.height_presets
      HEIGHT_PRESETS.map { |key, value| { key: key, value: value, name: preset_name(key) } }
    end

    def self.fov_presets
      FOV_PRESETS.map { |key, value| { key: key, value: value, name: fov_name(key) } }
    end

    def self.preset_name(key)
      {
        standing: '서있기 (1.6m)',
        seated: '앉기 (1.1m)',
        low_angle: '낮은 앵글 (0.5m)',
        top_view: '위에서 보기 (3.0m)'
      }[key]
    end

    def self.fov_name(key)
      {
        wide: '광각 24mm (74°)',
        standard: '표준 35mm (54°)',
        portrait: '인물 50mm (40°)',
        telephoto: '망원 85mm (28°)'
      }[key]
    end
  end
end
