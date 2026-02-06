# frozen_string_literal: true

# SketchupShow - SketchUp AI 렌더링 플러그인
# 메인 진입점

require 'sketchup'
require 'extensions'
require 'net/http'
require 'uri'
require 'json'
require 'base64'
require 'socket'
require 'webrick'

module NanoBanana
  PLUGIN_NAME = 'Sketchup Show'
  PLUGIN_VERSION = '1.0.0'
  PLUGIN_AUTHOR = 'SketchupShow Team'
  PLUGIN_DESCRIPTION = 'SketchUp AI 실사 렌더링 플러그인 (Google Gemini 기반)'

  # 플러그인 루트 경로
  PLUGIN_ROOT = File.dirname(__FILE__)

  # 서비스 모듈 로드
  require_relative 'services/config_store'
  require_relative 'services/scene_exporter'
  require_relative 'services/prompt_builder'
  require_relative 'services/api_client'
  require_relative 'services/replicate_client'
  require_relative 'services/hotspot_manager'
  require_relative 'services/camera_tool'

  # 전역 상태
  @main_dialog = nil
  @settings_dialog = nil
  @editor_dialog = nil
  @hotspot_dialog = nil
  @mix_dialog = nil
  @prompt_dialog = nil
  @current_image = nil
  @current_hotspots = []
  @config_store = nil
  @api_client = nil
  @replicate_client = nil
  @current_api = 'gemini'  # 'gemini' 또는 'replicate'
  @camera_tool = nil
  @mirror_active = false
  @mirror_timer = nil
  @view_observer = nil
  @pages_observer = nil
  @converted_prompt = nil  # Convert 시 AI가 생성한 프롬프트
  @reference_image = nil   # 레퍼런스 이미지 (2차 생성용)
  @web_sync_active = false
  @web_session_id = nil
  @web_sync_timer = nil
  @local_server = nil
  @local_server_thread = nil
  @local_port = 9876
  @current_source_image = nil

  # 웹 동기화 서버 URL
  WEB_SYNC_URL = 'https://sketchup-show.vercel.app/api/sync'

  class << self
    attr_accessor :current_image, :current_hotspots

    # JSON 인자 파싱 헬퍼
    def parse_json_args(json_str)
      return [] if json_str.nil? || json_str.empty?
      begin
        JSON.parse(json_str)
      rescue JSON::ParserError
        # JSON이 아니면 단일 값으로 처리
        [json_str]
      end
    end

    # 플러그인 초기화
    def initialize_plugin
      @config_store = ConfigStore.new

      # Gemini API
      api_key = @config_store.load_api_key
      puts "[SketchupShow] Gemini API Key: #{api_key ? '있음' : '없음'}"
      @gemini_model = @config_store.load_setting('gemini_model') || 'gemini-2.0-flash-exp'
      if api_key && !api_key.empty?
        @api_client = ApiClient.new(api_key, @gemini_model)
      end

      # Replicate API
      replicate_token = @config_store.load_setting('replicate_token')
      # 토큰이 없으면 nil 유지 (설정에서 입력 필요)
      if replicate_token.nil? || replicate_token.empty?
        replicate_token = nil
      end
      puts "[SketchupShow] Replicate Token: #{replicate_token ? '있음' : '없음'}"
      @replicate_model = @config_store.load_setting('replicate_model') || 'photorealistic-fx'
      if replicate_token && !replicate_token.empty?
        @replicate_client = ReplicateClient.new(replicate_token, @replicate_model)
      end

      # 기본 엔진 설정 (Gemini 우선 - 포토리얼리스틱 결과)
      @current_api = @config_store.load_setting('current_api') || 'gemini'
      puts "[SketchupShow] 현재 엔진: #{@current_api}"

      register_menu
      register_toolbar

      # 로컬 웹 서버 자동 시작
      start_local_server

      puts "[SketchupShow] 플러그인 초기화 완료 (v#{PLUGIN_VERSION})"
    end

    # 메뉴 등록
    def register_menu
      menu = UI.menu('Extensions')
      submenu = menu.add_submenu(PLUGIN_NAME)

      submenu.add_item('Run') { show_main_dialog }
      submenu.add_separator
      submenu.add_item('설정') { show_settings_dialog }
      submenu.add_separator
      submenu.add_item('도움말') { show_help }
      submenu.add_item('정보') { show_about }
    end

    # 툴바 등록
    def register_toolbar
      toolbar = UI::Toolbar.new(PLUGIN_NAME)

      # 렌더링 버튼
      cmd_render = UI::Command.new('Run') { show_main_dialog }
      cmd_render.tooltip = 'Sketchup Show 실행'
      cmd_render.status_bar_text = 'AI 실사 렌더링을 시작합니다'
      cmd_render.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_small.png')
      cmd_render.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_large.png')
      toolbar.add_item(cmd_render)

      # 설정 버튼
      cmd_settings = UI::Command.new('Settings') { show_settings_dialog }
      cmd_settings.tooltip = 'SketchupShow 설정'
      cmd_settings.status_bar_text = 'API Key 및 설정을 관리합니다'
      cmd_settings.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/settings_small.png')
      cmd_settings.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/settings_large.png')
      toolbar.add_item(cmd_settings)

      toolbar.show
    end

    # ========================================
    # 2P 카메라 Tool
    # ========================================
    def activate_camera_tool
      @camera_tool ||= CameraTool.new
      Sketchup.active_model.select_tool(@camera_tool)
    end

    def set_camera_height(height_key)
      @camera_tool ||= CameraTool.new
      @camera_tool.set_height(height_key.to_sym)
    end

    def set_camera_fov(fov_key)
      @camera_tool ||= CameraTool.new
      @camera_tool.set_fov(fov_key.to_sym)
    end

    # 카메라 이동 (UI 버튼용)
    def camera_move(direction)
      view = Sketchup.active_model.active_view
      camera = view.camera

      # 이동 거리 (인치, 약 5cm)
      step = 2.0
      step_z = 1.0

      # 카메라 방향 벡터 (수평)
      dir = camera.direction.clone
      dir.z = 0
      dir.normalize! if dir.length > 0

      # 오른쪽 벡터
      right = dir.cross(Z_AXIS)
      right.normalize! if right.length > 0

      move = Geom::Vector3d.new(0, 0, 0)

      case direction
      when 'forward'
        move = Geom::Vector3d.new(dir.x * step, dir.y * step, 0)
      when 'back'
        move = Geom::Vector3d.new(-dir.x * step, -dir.y * step, 0)
      when 'left'
        move = Geom::Vector3d.new(-right.x * step, -right.y * step, 0)
      when 'right'
        move = Geom::Vector3d.new(right.x * step, right.y * step, 0)
      when 'up'
        move = Geom::Vector3d.new(0, 0, step_z)
      when 'down'
        move = Geom::Vector3d.new(0, 0, -step_z)
      end

      new_eye = camera.eye.offset(move)
      new_target = camera.target.offset(move)
      camera.set(new_eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 카메라 회전 (UI 버튼용)
    def camera_rotate(direction)
      view = Sketchup.active_model.active_view
      camera = view.camera

      # 회전 각도 (도) - 2도씩
      angle = (direction == 'left' ? 2.0 : -2.0).degrees

      eye = camera.eye
      view_vector = eye.vector_to(camera.target)
      distance = view_vector.length

      # Z축 기준 회전
      rotation = Geom::Transformation.rotation(eye, Z_AXIS, angle)
      new_direction = view_vector.transform(rotation)
      new_direction.length = distance

      new_target = eye.offset(new_direction)
      camera.set(eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 2점 투시 자동 보정
    def apply_two_point_perspective
      view = Sketchup.active_model.active_view
      camera = view.camera

      eye = camera.eye
      target = camera.target

      # 시선 방향 벡터
      view_vector = eye.vector_to(target)

      # 수평 방향만 유지 (Z 성분 제거)
      horizontal_dir = Geom::Vector3d.new(view_vector.x, view_vector.y, 0)

      if horizontal_dir.length > 0
        horizontal_dir.normalize!
        distance = Math.sqrt(view_vector.x**2 + view_vector.y**2 + view_vector.z**2)

        # 새 타겟: 같은 높이에서 수평으로 바라봄
        new_target = Geom::Point3d.new(
          eye.x + horizontal_dir.x * distance,
          eye.y + horizontal_dir.y * distance,
          eye.z  # 같은 높이
        )

        # Z_AXIS를 up으로 설정하면 수직선 고정
        camera.set(eye, new_target, Z_AXIS)
        view.invalidate
        puts "[SketchupShow] 2점 투시 적용됨"
      end
    rescue StandardError => e
      puts "[SketchupShow] 2점 투시 에러: #{e.message}"
    end

    # 카메라 높이 설정 (UI 버튼용)
    def camera_set_height(preset)
      view = Sketchup.active_model.active_view
      camera = view.camera

      heights = {
        'standing' => 63.0,   # 1.6m in inches
        'seated' => 43.3,     # 1.1m in inches
        'low_angle' => 19.7   # 0.5m in inches
      }

      height = heights[preset] || 43.3

      eye = camera.eye
      target = camera.target

      new_eye = Geom::Point3d.new(eye.x, eye.y, height)
      new_target = Geom::Point3d.new(target.x, target.y, height)

      camera.set(new_eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 카메라 FOV 설정 (UI 버튼용)
    def camera_set_fov(preset)
      view = Sketchup.active_model.active_view
      camera = view.camera

      fovs = {
        'wide' => 74,       # 광각 24mm
        'standard' => 54,   # 표준 35mm
        'telephoto' => 28   # 망원 85mm
      }

      fov = fovs[preset] || 54

      camera.perspective = true
      camera.fov = fov
      view.invalidate
    end

    # ========================================
    # 미러링 기능
    # ========================================

    # 미러링 시작
    def start_mirror
      @mirror_active = true

      # ViewObserver 등록
      @view_observer ||= MirrorViewObserver.new(self)
      Sketchup.active_model.active_view.add_observer(@view_observer)

      # 초기 캡처
      mirror_capture

      puts "[SketchupShow] 미러링 시작"
    end

    # 미러링 중지
    def stop_mirror
      @mirror_active = false

      # ViewObserver 제거
      if @view_observer
        begin
          Sketchup.active_model.active_view.remove_observer(@view_observer)
        rescue
        end
      end

      puts "[SketchupShow] 미러링 중지"
    end

    # 미러링 캡처 (적정 해상도)
    def mirror_capture
      return unless @mirror_active
      return unless @main_dialog

      begin
        temp_path = "/tmp/nanobanana_mirror.jpg"
        view = Sketchup.active_model.active_view

        # 프리뷰 해상도 (960x540) - 빠른 미러링
        view.write_image({
          filename: temp_path,
          width: 960,
          height: 540,
          antialias: false,
          compression: 0.6
        })

        image_data = Base64.strict_encode64(File.binread(temp_path))

        @main_dialog.execute_script("onMirrorUpdate('#{image_data}')")
      rescue StandardError => e
        # 에러 시 무시
      end
    end

    def mirror_active?
      @mirror_active
    end

    # ========================================
    # 메인 다이얼로그
    # ========================================
    def show_main_dialog
      if @main_dialog && @main_dialog.visible?
        @main_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: PLUGIN_NAME,
        preferences_key: 'SketchupShow_MainDialog_v2',
        width: 1400,
        height: 800,
        min_width: 1000,
        min_height: 600,
        resizable: true,
        style: UI::HtmlDialog::STYLE_DIALOG
      }

      @main_dialog = UI::HtmlDialog.new(options)
      @main_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/main_dialog.html'))

      # 콜백 등록
      register_main_callbacks(@main_dialog)

      @main_dialog.show
    end

    def register_main_callbacks(dialog)
      # 씬 캡처
      dialog.add_action_callback('capture_scene') do |_ctx, json_args|
        args = parse_json_args(json_args)
        size = args[0] || '1024'  # ★ 기본값 1024로 변경 (속도 우선)
        capture_scene(size)
      end

      # 렌더링 시작 (새 UI: time + light + prompt + negative 파라미터)
      dialog.add_action_callback('start_render') do |_ctx, json_args|
        args = parse_json_args(json_args)
        time_preset = args[0] || 'day'
        light_switch = args[1] || 'on'
        prompt = args[2] || ''
        negative_prompt = args[3] || ''

        puts "[SketchupShow] ========== START_RENDER 콜백 =========="
        puts "[SketchupShow] time_preset: #{time_preset}"
        puts "[SketchupShow] light_switch: #{light_switch}"
        puts "[SketchupShow] prompt 길이: #{prompt ? prompt.length : 0}"
        puts "[SketchupShow] negative_prompt 길이: #{negative_prompt ? negative_prompt.length : 0}"

        # UI에서 직접 입력한 프롬프트가 있으면 사용
        if prompt && !prompt.empty?
          @converted_prompt = prompt
          puts "[SketchupShow] 프롬프트 저장됨: #{prompt[0..100]}..."
        else
          puts "[SketchupShow] 프롬프트 비어있음!"
        end
        @negative_prompt = negative_prompt if negative_prompt && !negative_prompt.empty?
        start_render_with_preset(time_preset, light_switch)
      end

      # Auto 프롬프트 생성 요청 (스타일 + 라이팅 파라미터)
      dialog.add_action_callback('generate_auto_prompt') do |_ctx, json_args|
        args = parse_json_args(json_args)
        style = args[0] || ''
        time_preset = args[1] || 'day'
        light_switch = args[2] || 'on'
        generate_auto_prompt(style, time_preset, light_switch)
      end

      # 이미지 저장
      dialog.add_action_callback('save_image') do |_ctx, json_args|
        args = parse_json_args(json_args)
        filename = args[0] || ''
        save_image(filename)
      end

      # API Key 저장 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('save_api_key') do |_ctx, key|
        save_api_key_from_main(key)
      end

      # API Key 로드 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('load_api_key') do |_ctx|
        load_api_key_to_main
      end

      # 연결 테스트 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('test_connection') do |_ctx|
        test_connection_from_main
      end

      # 이미지 보정 다이얼로그 열기
      dialog.add_action_callback('open_editor') do |_ctx|
        show_editor_dialog
      end

      # API 연결 상태 확인
      dialog.add_action_callback('check_api_status') do |_ctx|
        check_api_status
      end

      # 모델 저장 (메인 다이얼로그용)
      dialog.add_action_callback('save_model') do |_ctx, model|
        save_model(model)
      end

      # 모델 로드 (메인 다이얼로그용)
      dialog.add_action_callback('load_model') do |_ctx|
        load_model_to_main_dialog
      end

      # ★ Replicate API 토큰 저장
      dialog.add_action_callback('save_replicate_token') do |_ctx, token|
        save_replicate_token(token)
      end

      # ★ Replicate API 토큰 로드
      dialog.add_action_callback('load_replicate_token') do |_ctx|
        load_replicate_token
      end

      # ★ 엔진 선택 (gemini / replicate)
      dialog.add_action_callback('set_engine') do |_ctx, engine|
        set_current_engine(engine)
      end

      # ★ 현재 엔진 로드
      dialog.add_action_callback('get_engine') do |_ctx|
        @main_dialog&.execute_script("onEngineLoaded('#{@current_api}')")
      end

      # ★ 레퍼런스 이미지 설정 (파일 첨부)
      dialog.add_action_callback('set_reference_image') do |_ctx, base64|
        @reference_image = base64
        puts "[SketchupShow] 레퍼런스 이미지 설정됨: #{base64 ? base64.length : 0} bytes"
      end

      # ★ 레퍼런스 이미지 해제
      dialog.add_action_callback('clear_reference_image') do |_ctx|
        @reference_image = nil
        puts "[SketchupShow] 레퍼런스 이미지 해제됨"
      end

      # 카메라 이동
      dialog.add_action_callback('cam_move') do |_ctx, direction_json|
        puts "[SketchupShow] cam_move 호출됨: #{direction_json.inspect}"
        args = parse_json_args(direction_json)
        dir = args.is_a?(Array) ? args[0] : args
        puts "[SketchupShow] 카메라 이동: #{dir}"
        camera_move(dir.to_s)
      end

      # 카메라 회전
      dialog.add_action_callback('cam_rotate') do |_ctx, direction_json|
        puts "[SketchupShow] cam_rotate 호출됨: #{direction_json.inspect}"
        args = parse_json_args(direction_json)
        dir = args.is_a?(Array) ? args[0] : args
        puts "[SketchupShow] 카메라 회전: #{dir}"
        camera_rotate(dir.to_s)
      end

      # 카메라 높이 프리셋
      dialog.add_action_callback('cam_height') do |_ctx, preset_json|
        args = parse_json_args(preset_json)
        preset = args.is_a?(Array) ? args[0] : args
        camera_set_height(preset.to_s)
      end

      # 카메라 FOV 프리셋
      dialog.add_action_callback('cam_fov') do |_ctx, preset_json|
        args = parse_json_args(preset_json)
        preset = args.is_a?(Array) ? args[0] : args
        camera_set_fov(preset.to_s)
      end

      # 미러링 시작
      dialog.add_action_callback('start_mirror') do |_ctx|
        start_mirror
      end

      # 미러링 중지
      dialog.add_action_callback('stop_mirror') do |_ctx|
        stop_mirror
      end

      # 씬 목록 가져오기 (첫 로드 시 첫 번째 씬으로 자동 전환)
      dialog.add_action_callback('get_scenes') do |_ctx|
        get_scenes(true)
      end

      # 씬 선택/전환
      dialog.add_action_callback('select_scene') do |_ctx, scene_name_json|
        args = parse_json_args(scene_name_json)
        scene_name = args.is_a?(Array) && args[0] ? args[0] : scene_name_json
        select_scene(scene_name)
      end

      # 씬 추가
      dialog.add_action_callback('add_scene') do |_ctx|
        add_scene
      end

      # 2점 투시 적용
      dialog.add_action_callback('apply_2point') do |_ctx|
        apply_two_point_perspective
      end

      # Mix 다이얼로그 열기
      dialog.add_action_callback('open_mix') do |_ctx|
        show_mix_dialog
      end

      # Prompt 다이얼로그 열기
      dialog.add_action_callback('open_prompt') do |_ctx|
        show_prompt_dialog
      end

      # 2차 생성 (이전 결과를 소스로 사용, 새 패널에 표시)
      dialog.add_action_callback('regenerate') do |_ctx, source_base64, prompt, negative_prompt, panel_id|
        regenerate_image(source_base64, prompt, negative_prompt.to_s, panel_id.to_i)
      end

      # 렌더링 완료 폴링 (JS가 주기적으로 호출)
      dialog.add_action_callback('poll_render_complete') do |_ctx|
        poll_render_complete
      end

      # 다음 청크 요청 (JS에서 호출)
      dialog.add_action_callback('getNextChunk') do |_ctx|
        get_next_chunk
      end

      # 이미지를 파일로 저장 (JS에서 호출)
      dialog.add_action_callback('saveImageToFile') do |_ctx, base64, scene_name|
        save_image_to_temp_file(base64.to_s, scene_name.to_s)
      end

      # 히스토리 저장
      dialog.add_action_callback('save_history') do |_ctx, history_json|
        save_history_to_file(history_json)
      end

      # 히스토리 로드
      dialog.add_action_callback('load_history') do |_ctx|
        load_history_from_file
      end

      # 웹 동기화 시작
      dialog.add_action_callback('start_web_sync') do |_ctx|
        session_id = start_web_sync
        dialog.execute_script("onWebSyncStarted('#{session_id}')")
      end

      # 웹 동기화 중지
      dialog.add_action_callback('stop_web_sync') do |_ctx|
        stop_web_sync
        dialog.execute_script("onWebSyncStopped()")
      end

      # PagesObserver 등록 (씬 변경 감지)
      register_pages_observer

      # ★ Mix 모드 콜백도 메인 다이얼로그에 등록
      register_mix_callbacks_for_main(dialog)
    end

    # 메인 다이얼로그용 Mix 콜백 등록
    def register_mix_callbacks_for_main(dialog)
      # 현재 이미지 가져오기 (Mix 모드용)
      dialog.add_action_callback('mix_get_current_image') do |_ctx|
        if @current_image
          dialog.execute_script("onMixBaseImageLoaded('#{@current_image}')")
        end
      end

      # 3D 좌표 가져오기 (스크린 좌표 → 월드 좌표)
      dialog.add_action_callback('mix_get_3d_coord') do |_ctx, screen_x, screen_y|
        get_3d_coordinate_for_main(screen_x.to_i, screen_y.to_i)
      end

      # 씬 컨텍스트 가져오기 (카메라, 조명, 바운드)
      dialog.add_action_callback('mix_get_scene_context') do |_ctx|
        get_scene_context_for_main
      end

      # Mix 적용
      dialog.add_action_callback('mix_apply') do |_ctx, data_json|
        apply_mix_from_main(data_json)
      end
    end

    # 메인 다이얼로그용 3D 좌표 추출
    def get_3d_coordinate_for_main(screen_x, screen_y)
      begin
        view = Sketchup.active_model.active_view
        result = CoordinateExtractor.screen_to_world(view, screen_x, screen_y)

        if result
          coord_data = {
            position: result[:position],
            normal: result[:normal],
            floor_reference: result[:floor_reference],
            screen_pos: { x: screen_x, y: screen_y }
          }
          @main_dialog&.execute_script("onMixCoordReceived('#{coord_data.to_json}')")
        else
          @main_dialog&.execute_script("onMixCoordReceived(null)")
        end
      rescue StandardError => e
        puts "[SketchupShow] 3D 좌표 추출 에러: #{e.message}"
        @main_dialog&.execute_script("onMixCoordReceived(null)")
      end
    end

    # 메인 다이얼로그용 씬 컨텍스트 추출
    def get_scene_context_for_main
      begin
        view = Sketchup.active_model.active_view
        context = CoordinateExtractor.get_scene_context(view)

        @main_dialog&.execute_script("onMixSceneContextLoaded('#{context.to_json}')")
      rescue StandardError => e
        puts "[SketchupShow] 씬 컨텍스트 추출 에러: #{e.message}"
        @main_dialog&.execute_script("onMixSceneContextLoaded(null)")
      end
    end

    # 메인 다이얼로그에서 Mix 적용
    def apply_mix_from_main(data_json)
      puts "[SketchupShow] ===== APPLY_MIX_FROM_MAIN 호출됨 ====="

      unless @api_client
        puts "[SketchupShow] 에러: API 클라이언트 없음"
        @main_dialog&.execute_script("onMixError('API Key가 설정되지 않았습니다.')")
        return
      end

      begin
        data = JSON.parse(data_json)
        mode = data['mode']

        puts "[SketchupShow] 모드: #{mode}"
        puts "[SketchupShow] 핫스팟 수: #{data['hotspots']&.length || 0}"

        Thread.new do
          begin
            puts "[SketchupShow] Thread 시작..."
            result = case mode
            when 'add-remove'
              puts "[SketchupShow] mix_add_remove 호출..."
              mix_add_remove(data)
            when 'inpaint'
              mix_inpaint(data)
            when 'material'
              mix_material(data)
            when 'floorplan'
              mix_floorplan(data)
            else
              raise "Unknown mix mode: #{mode}"
            end

            if result && result[:image]
              @current_image = result[:image]
              @main_dialog&.execute_script("onMixComplete('#{result[:image]}')")
            else
              @main_dialog&.execute_script("onMixError('이미지 생성에 실패했습니다.')")
            end
          rescue StandardError => e
            puts "[SketchupShow] Mix 에러: #{e.message}"
            @main_dialog&.execute_script("onMixError('#{e.message.gsub("'", "\\'")}')")
          end
        end
      rescue StandardError => e
        puts "[SketchupShow] Mix 파싱 에러: #{e.message}"
        @main_dialog&.execute_script("onMixError('데이터 파싱 에러')")
      end
    end

    # ========================================
    # 씬 (페이지) 관리
    # ========================================
    def get_scenes(auto_select_first = false)
      model = Sketchup.active_model
      pages = model.pages

      scenes = pages.map do |page|
        { name: page.name }
      end

      scenes_json = scenes.to_json
      @main_dialog.execute_script("onScenesUpdate('#{scenes_json}')")

      # 첫 번째 씬으로 자동 전환 및 미러링 시작
      if auto_select_first && pages.count > 0
        first_page = pages[0]
        pages.selected_page = first_page
        model.active_view.invalidate
        puts "[SketchupShow] 첫 번째 씬으로 전환: #{first_page.name}"
        # 자동 미러링 즉시 시작
        start_mirror
        @main_dialog.execute_script("setMirrorActive(true)") if @main_dialog
      end
    rescue StandardError => e
      puts "[SketchupShow] 씬 목록 에러: #{e.message}"
    end

    def select_scene(scene_name)
      model = Sketchup.active_model
      pages = model.pages

      page = pages[scene_name]
      if page
        pages.selected_page = page
        model.active_view.invalidate
        puts "[SketchupShow] 씬 전환: #{scene_name}"

        # ★★★ 씬 전환 시 항상 새로 캡처 (프롬프트가 새 씬에 맞게 생성되도록) ★★★
        # 약간의 딜레이 후 캡처 (SketchUp 렌더링 완료 대기)
        UI.start_timer(0.15, false) do
          puts "[SketchupShow] 씬 전환 후 자동 캡처 시작..."
          capture_current_view
          # Convert된 프롬프트 초기화 (새 씬이므로 새로 생성해야 함)
          @converted_prompt = nil
          puts "[SketchupShow] 이전 프롬프트 초기화됨 - 새 씬에 맞게 Convert 필요"
        end
      else
        puts "[SketchupShow] 씬을 찾을 수 없음: #{scene_name}"
      end
    rescue StandardError => e
      puts "[SketchupShow] 씬 전환 에러: #{e.message}"
    end

    # 현재 뷰를 새 씬으로 추가
    def add_scene
      model = Sketchup.active_model
      pages = model.pages

      # 씬 이름 생성
      index = pages.count + 1
      name = "Scene #{index}"
      while pages[name]
        index += 1
        name = "Scene #{index}"
      end

      # 현재 뷰를 씬으로 저장
      page = pages.add(name)
      puts "[SketchupShow] 씬 추가: #{name}"

      # 목록 갱신
      get_scenes
    rescue StandardError => e
      puts "[SketchupShow] 씬 추가 에러: #{e.message}"
    end

    # PagesObserver 등록
    def register_pages_observer
      return if @pages_observer

      @pages_observer = PagesObserver.new(self)
      Sketchup.active_model.pages.add_observer(@pages_observer)
      puts "[SketchupShow] PagesObserver 등록됨"
    end

    # PagesObserver 해제
    def unregister_pages_observer
      return unless @pages_observer

      Sketchup.active_model.pages.remove_observer(@pages_observer)
      @pages_observer = nil
    end

    # ========================================
    # 설정 다이얼로그
    # ========================================
    def show_settings_dialog
      if @settings_dialog && @settings_dialog.visible?
        @settings_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '설정 - SketchupShow',
        preferences_key: 'SketchupShow_SettingsDialog',
        width: 450,
        height: 400,
        min_width: 400,
        min_height: 350,
        resizable: false
      }

      @settings_dialog = UI::HtmlDialog.new(options)
      @settings_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/settings_dialog.html'))

      register_settings_callbacks(@settings_dialog)

      @settings_dialog.show
    end

    def register_settings_callbacks(dialog)
      # API Key 저장
      dialog.add_action_callback('save_api_key') do |_ctx, key|
        save_api_key(key)
      end

      # API Key 로드
      dialog.add_action_callback('load_api_key') do |_ctx|
        load_api_key_to_dialog
      end

      # 모델 저장
      dialog.add_action_callback('save_model') do |_ctx, model|
        save_model(model)
      end

      # 모델 로드
      dialog.add_action_callback('load_model') do |_ctx|
        load_model_to_dialog
      end

      # 연결 테스트
      dialog.add_action_callback('test_connection') do |_ctx|
        test_api_connection
      end

      # 다운로드 폴더 선택
      dialog.add_action_callback('browse_download_folder') do |_ctx|
        folder = UI.select_directory(title: '다운로드 폴더 선택')
        if folder
          dialog.execute_script("onFolderSelected('#{folder.gsub("'", "\\\\'")}')")
        end
      end

      # 설정 저장
      dialog.add_action_callback('save_settings') do |_ctx, settings_json|
        begin
          settings = JSON.parse(settings_json)
          @config_store.save_settings(settings)
        rescue StandardError => e
          puts "[SketchupShow] 설정 저장 오류: #{e.message}"
        end
      end

      # 설정 로드
      dialog.add_action_callback('load_settings') do |_ctx|
        settings = @config_store.load_all_settings
        if settings
          dialog.execute_script("onSettingsLoaded(#{settings.to_json})")
        end
      end

      # 다이얼로그 닫기
      dialog.add_action_callback('close_dialog') do |_ctx|
        @settings_dialog.close
      end
    end

    # ========================================
    # 편집 다이얼로그
    # ========================================
    def show_editor_dialog
      return unless @current_image

      if @editor_dialog && @editor_dialog.visible?
        @editor_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '이미지 보정 - SketchupShow',
        preferences_key: 'SketchupShow_EditorDialog',
        width: 900,
        height: 650,
        min_width: 800,
        min_height: 600,
        resizable: true
      }

      @editor_dialog = UI::HtmlDialog.new(options)
      @editor_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/editor_dialog.html'))

      register_editor_callbacks(@editor_dialog)

      @editor_dialog.show
    end

    def register_editor_callbacks(dialog)
      # 다이얼로그 로드 완료 시 이미지 전송
      dialog.add_action_callback('editor_ready') do |_ctx|
        dialog.execute_script("loadImage('#{@current_image}')")
      end
      # 보정 적용
      dialog.add_action_callback('apply_adjustments') do |_ctx, image_base64|
        @current_image = image_base64
        @main_dialog&.execute_script("updatePreviewImage('#{image_base64}')")
        dialog.close
      end

      # 보정된 이미지 저장
      dialog.add_action_callback('save_edited_image') do |_ctx, image_base64|
        save_edited_image(image_base64)
      end

      # AI 이미지 재생성 (레퍼런스 + 프롬프트)
      dialog.add_action_callback('editor_generate_ai') do |_ctx, data_json|
        editor_generate_ai(data_json)
      end

      # 취소
      dialog.add_action_callback('cancel_edit') do |_ctx|
        dialog.close
      end
    end

    # 에디터에서 AI 이미지 재생성
    def editor_generate_ai(data_json)
      unless @api_client
        @editor_dialog&.execute_script("onAIGenerateError('API Key가 설정되지 않았습니다.')")
        return
      end

      begin
        data = JSON.parse(data_json)
        base_image = data['baseImage']
        reference_image = data['referenceImage']
        user_prompt = data['prompt'] || ''
        texture_intensity = data['textureIntensity'] || 'med'

        Thread.new do
          begin
            # 텍스처 강도 설명
            texture_desc = case texture_intensity
            when 'low'
              "Low texture detail - smoother, more simplified surfaces"
            when 'high'
              "High texture detail - rich, detailed surface textures with visible grain and patterns"
            else
              "Medium texture detail - balanced realistic textures"
            end

            # 프롬프트 구성
            prompt = <<~PROMPT
★★★ IMAGE REFINEMENT REQUEST ★★★
Using the provided base image as the primary reference, apply the following modifications:

User Instructions: #{user_prompt.empty? ? 'Enhance the image quality and realism' : user_prompt}

Texture Setting: #{texture_desc}

#{reference_image ? 'A reference image is provided - incorporate its style, colors, or elements as specified in the user instructions.' : ''}

CRITICAL RULES:
- PRESERVE the exact camera angle, composition, and perspective
- PRESERVE the overall layout and spatial arrangement
- Apply modifications seamlessly while maintaining photorealistic quality
- Ensure consistent lighting and shadows throughout
- Output should be a high-quality photorealistic image

            PROMPT

            puts "[SketchupShow] Editor AI Generate - Texture: #{texture_intensity}"
            puts "[SketchupShow] Prompt: #{prompt[0..200]}..."

            result = if reference_image
              @api_client.generate_with_references(base_image, [reference_image], prompt)
            else
              @api_client.generate(base_image, prompt)
            end

            if result && result[:image]
              # 결과 이미지 저장 (메인 화면에도 반영)
              @current_image = result[:image]
              @editor_dialog&.execute_script("onAIGenerateComplete('#{result[:image]}')")
              # 메인 다이얼로그에도 업데이트
              @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', 'Edit')")
            else
              @editor_dialog&.execute_script("onAIGenerateError('결과를 받지 못했습니다.')")
            end

          rescue StandardError => e
            puts "[SketchupShow] Editor AI Error: #{e.message}"
            @editor_dialog&.execute_script("onAIGenerateError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}')")
          end
        end

      rescue StandardError => e
        @editor_dialog&.execute_script("onAIGenerateError('데이터 파싱 오류: #{e.message}')")
      end
    end

    # ========================================
    # 핫스팟 다이얼로그
    # ========================================
    def show_hotspot_dialog
      return unless @current_image

      if @hotspot_dialog && @hotspot_dialog.visible?
        @hotspot_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '오브젝트 배치 - SketchupShow',
        preferences_key: 'SketchupShow_HotspotDialog',
        width: 950,
        height: 700,
        min_width: 850,
        min_height: 600,
        resizable: true
      }

      @hotspot_dialog = UI::HtmlDialog.new(options)
      @hotspot_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/hotspot_dialog.html'))

      register_hotspot_callbacks(@hotspot_dialog)

      @hotspot_dialog.show

      # 이미지 전송
      @hotspot_dialog.execute_script("loadBaseImage('#{@current_image}')")
    end

    def register_hotspot_callbacks(dialog)
      # 핫스팟 추가
      dialog.add_action_callback('add_hotspot') do |_ctx, data_json|
        data = JSON.parse(data_json)
        add_hotspot(data)
      end

      # 핫스팟 제거
      dialog.add_action_callback('remove_hotspot') do |_ctx, id|
        remove_hotspot(id)
      end

      # 핫스팟 스케일 업데이트
      dialog.add_action_callback('update_hotspot_scale') do |_ctx, id, scale|
        update_hotspot_scale(id, scale.to_f)
      end

      # 재생성
      dialog.add_action_callback('regenerate_with_hotspots') do |_ctx|
        regenerate_with_hotspots
      end

      # 취소
      dialog.add_action_callback('cancel_hotspot') do |_ctx|
        dialog.close
      end
    end

    # ========================================
    # 핵심 기능 구현
    # ========================================

    # 씬 캡처 + AI 프롬프트 생성 (Convert)
    def capture_scene(size = '1024')
      begin
        temp_path = "/tmp/nanobanana_capture.jpg"
        model = Sketchup.active_model
        view = model.active_view
        rendering_options = model.rendering_options

        # ★★★ 핵심: 캡처 전 Edge(윤곽선) 끄기 ★★★
        # SketchUp 기본 설정은 검은 윤곽선이 보임 - AI가 이걸 그대로 반영함
        original_edges = rendering_options["DrawEdges"]
        original_profiles = rendering_options["DrawProfileEdges"] rescue nil
        original_depth_cue = rendering_options["DrawDepthQue"] rescue nil
        original_extension = rendering_options["ExtendLines"] rescue nil

        # Edge 관련 모든 설정 OFF
        rendering_options["DrawEdges"] = false
        rendering_options["DrawProfileEdges"] = false rescue nil
        rendering_options["DrawDepthQue"] = false rescue nil
        rendering_options["ExtendLines"] = false rescue nil

        puts "[SketchupShow] Edge OFF 설정 완료 (원본: #{original_edges})"

        # 해상도 설정 (선명할수록 AI가 더 잘 인식)
        sizes = {
          '1024' => { width: 1920, height: 1080 },   # 속도 (FHD)
          '1536' => { width: 2560, height: 1440 },   # 밸런스 (2K)
          '1920' => { width: 3840, height: 2160 }    # 고품질 (4K)
        }
        resolution = sizes[size] || sizes['1024']

        # JPEG으로 압축 (PNG 대비 70% 용량 감소)
        keys = {
          :filename => temp_path,
          :width => resolution[:width],
          :height => resolution[:height],
          :antialias => true,
          :transparent => false,
          :compression => 0.85  # JPEG 품질 85%
        }

        success = view.write_image(keys)

        # ★★★ 캡처 후 원래 Edge 설정 복원 ★★★
        rendering_options["DrawEdges"] = original_edges
        rendering_options["DrawProfileEdges"] = original_profiles rescue nil
        rendering_options["DrawDepthQue"] = original_depth_cue rescue nil
        rendering_options["ExtendLines"] = original_extension rescue nil

        puts "[SketchupShow] Edge 설정 복원 완료"

        unless success
          raise "이미지 내보내기 실패"
        end

        @current_image = Base64.strict_encode64(File.binread(temp_path))
        file_size_kb = File.size(temp_path) / 1024
        File.delete(temp_path) rescue nil

        puts "[SketchupShow] 캡처 완료 (#{resolution[:width]}x#{resolution[:height]}, #{file_size_kb}KB, Edge OFF)"

        # UI에 캡처 완료 알림
        if @main_dialog
          @main_dialog.execute_script("onCaptureComplete('#{@current_image}', 0)")
          @main_dialog.execute_script("onConvertComplete('')")
          @main_dialog.execute_script("setStatus('Convert 완료 - Auto로 프롬프트 생성하세요')")
        end

      rescue StandardError => e
        # 에러 발생해도 Edge 복원 시도
        rendering_options["DrawEdges"] = original_edges rescue nil
        puts "[SketchupShow] 캡처 에러: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        if @main_dialog
          @main_dialog.execute_script("onCaptureError('#{e.message}')")
        end
      end
    end

    # 씬 분석 - 재질/구조 데이터만 추출 (프롬프트 생성 X)
    def analyze_scene_only
      unless @api_client
        puts "[SketchupShow] API 클라이언트 없음 - 분석 스킵"
        @scene_analysis = nil
        @main_dialog&.execute_script("onConvertComplete('')")
        return
      end

      Thread.new do
        begin
          analysis_prompt = <<~PROMPT
Analyze this SketchUp interior/architecture image and extract ONLY the following data in JSON format.
Do NOT generate any rendering prompt. Output ONLY valid JSON.

{
  "space_type": "거실/침실/주방/사무실/etc",
  "layout": {
    "description": "공간 구성 설명",
    "walls": ["좌측벽 특징", "우측벽 특징", "후면벽 특징"],
    "windows": ["창문1 위치/크기", "창문2 위치/크기"],
    "doors": ["문1 위치"]
  },
  "materials": {
    "floor": {"type": "재질명", "color": "색상", "pattern": "패턴"},
    "ceiling": {"type": "재질명", "color": "색상"},
    "walls": [{"location": "위치", "type": "재질명", "color": "색상"}]
  },
  "furniture": [
    {"name": "가구명", "position": "위치", "material": "재질", "color": "색상"}
  ],
  "lighting": [
    {"type": "조명종류", "position": "위치", "count": 개수}
  ],
  "style": "모던/클래식/미니멀/etc"
}
          PROMPT

          puts "[SketchupShow] 씬 분석 시작 (데이터 추출만)..."

          @main_dialog&.execute_script("updateConvertProgress('이미지 캡처 완료', '공간 구조 분석 중...')")
          sleep(0.3)

          @main_dialog&.execute_script("updateConvertProgress('AI 분석 요청', '재질 및 색상 데이터 추출 중...')")

          # Gemini에게 이미지 분석 요청
          result = @api_client.analyze_scene(@current_image, analysis_prompt)

          @main_dialog&.execute_script("updateConvertProgress('AI 응답 수신', '데이터 처리 중...')")

          if result && result[:text]
            @scene_analysis = result[:text]
            puts "[SketchupShow] 씬 분석 완료"
            puts @scene_analysis[0..300] + "..."

            # Convert 완료 - 프롬프트는 비워두고 활성화만
            @main_dialog&.execute_script("onConvertComplete('')")
          else
            puts "[SketchupShow] 씬 분석 실패"
            @scene_analysis = nil
            @main_dialog&.execute_script("onConvertError('씬 분석 실패')")
          end

        rescue StandardError => e
          puts "[SketchupShow] 씬 분석 에러: #{e.message}"
          @scene_analysis = nil
          @main_dialog&.execute_script("onConvertError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # AI 프롬프트 생성용 시스템 인스트럭션 템플릿
    def get_ai_instruction_template(materials_info, user_style = '', time_preset = 'day', light_switch = 'on')
      style_hint = user_style.to_s.empty? ? "modern luxury interior" : user_style

      # 라이팅 설명 생성 (사용자 설정 기반)
      lighting_desc = build_lighting_description(time_preset, light_switch)

      <<~TEXT
    [CRITICAL TASK]
    You must generate a detailed photorealistic rendering prompt for this interior space.
    This is an IMAGE-TO-IMAGE transformation task. The goal is to convert a 3D SketchUp model into a professional interior photograph.

    [ABSOLUTE CONSTRAINTS - MUST BE INCLUDED IN PROMPT]
    1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must stay in the EXACT same position
    2. NO ADDITIONS: Do NOT add any objects, furniture, mirrors, handles, plants, decorations, or accessories
    3. NO REMOVALS: Do NOT remove anything that exists in the source image
    4. SAME ROOM ONLY: The output must look like the SAME room photographed professionally

    [SOURCE MATERIALS FROM SKETCHUP MODEL]
    #{materials_info}

    [REQUIRED PROMPT STRUCTURE]
    Generate a prompt following this EXACT format:

    ---START OF PROMPT---

    [INPUT IMAGE PRESERVATION - CRITICAL]
    Preserve the EXACT composition, camera angle, and object placement from the input image.
    Do NOT add any new objects, furniture, mirrors, door handles, light switches, plants, rugs, or decorative items.
    Do NOT remove any existing objects from the scene.
    This is a strict image-to-image transformation, not a creative redesign.

    [PHOTOREALISTIC TRANSFORMATION]
    Transform this 3D SketchUp interior render into a professional architectural photograph.
    Style: #{style_hint}
    Camera: Canon EOS R5 with 24mm f/2.8 lens, professional architectural photography
    Quality: 8K resolution, sharp focus, professional color grading

    [MATERIAL RENDERING - BASED ON SOURCE]
    Convert all surfaces to photorealistic materials with natural imperfections:
    - Wood surfaces: visible grain texture, subtle scratches, natural wood imperfections
    - Wall surfaces: realistic paint texture, subtle shadows, minor surface variations
    - Floor surfaces: realistic material texture with wear patterns and reflections
    - Glass surfaces: realistic reflections, subtle smudges, proper transparency
    - Metal surfaces: realistic reflections, subtle fingerprints, appropriate finish

    [LIGHTING SETUP]
    #{lighting_desc}
    - Soft natural shadows with realistic falloff
    - Global illumination and realistic light bounce
    - Subtle ambient occlusion in corners and edges

    [PHOTO REALISM DETAILS]
    - Natural lens characteristics: subtle vignette, minimal chromatic aberration
    - Realistic depth of field with natural bokeh
    - Film-like quality with subtle grain (ISO 200-400)
    - Professional white balance and color temperature

    [NEGATIVE PROMPT - MUST AVOID]
    black outlines, visible edges, sketch lines, wireframe appearance, line art style, hard black lines, 3D render look, CGI appearance, computer graphics, architectural visualization, clean perfect surfaces, uniform flat lighting, artificial plastic look, cartoon style, anime style, painting style, illustration, hand-drawn, digital art, concept art, unrealistic colors, oversaturated, HDR artifacts, bloom effects, lens flare, motion blur

    ---END OF PROMPT---

    [YOUR OUTPUT]
    Generate ONLY the prompt content between ---START OF PROMPT--- and ---END OF PROMPT--- markers.
    Do NOT include any explanations, comments, or additional text.
    The prompt must be detailed and specific to achieve photorealistic results.
      TEXT
    end

    # 라이팅 설명 생성 헬퍼
    def build_lighting_description(time_preset, light_switch)
      time_desc = case time_preset.to_s.downcase
        when 'evening'
          "warm evening sunset tones through windows"
        when 'night'
          "dark exterior through windows, nighttime atmosphere"
        else # day
          "bright natural daylight through windows"
      end

      light_desc = if light_switch.to_s.downcase == 'off'
        "artificial lights OFF, ambient light only"
      else
        "interior lights ON, warm artificial illumination"
      end

      "#{time_desc}, #{light_desc}, soft shadows, global illumination, realistic light bounce"
    end

    # Auto 프롬프트 생성 (분석 데이터 + 스타일 기반 + SketchUp 재질 정보 + 라이팅)
    def generate_auto_prompt(user_style = '', time_preset = 'day', light_switch = 'on')
      puts "[SketchupShow] ========== AUTO 프롬프트 생성 시작 =========="
      puts "[SketchupShow] user_style: #{user_style.inspect}"
      puts "[SketchupShow] time_preset: #{time_preset}, light_switch: #{light_switch}"

      unless @api_client
        puts "[SketchupShow] API 클라이언트 없음"
        return
      end

      unless @current_image
        puts "[SketchupShow] 이미지 없음 - Convert 먼저 실행하세요"
        return
      end

      puts "[SketchupShow] 이미지 있음: #{@current_image.length} bytes"

      # ★★★ SketchUp API는 Thread 밖에서 호출 ★★★
      puts "[SketchupShow] 재질 정보 추출 중..."
      materials_info = extract_materials_info
      puts "[SketchupShow] 추출된 재질 정보:"
      puts materials_info[0..500] + "..." if materials_info && materials_info.length > 500

      # 재질 중심 시스템 인스트럭션 생성 (라이팅 설정 포함)
      prompt_request = get_ai_instruction_template(materials_info, user_style, time_preset, light_switch)
      image_copy = @current_image.dup

      @main_dialog&.execute_script("onAutoPromptStart()")

      Thread.new do
        begin
          result = @api_client.analyze_scene(image_copy, prompt_request)

          if result && result[:text]
            raw_prompt = result[:text]

            # [STRICT 또는 **[STRICT 로 시작하는 부분부터 사용
            if raw_prompt =~ /(\*?\*?\[STRICT|\[INPUT|\[OUTPUT|\[ABSOLUTE)/
              clean_prompt = raw_prompt[$~.begin(0)..-1]
            else
              clean_prompt = raw_prompt
            end

            # 메인 프롬프트와 네거티브 분리
            main_prompt = clean_prompt
            negative_prompt = ""

            if clean_prompt =~ /\[NEGATIVE\](.+)/mi
              negative_prompt = $1.strip
              main_prompt = clean_prompt.sub(/\[NEGATIVE\].+/mi, '').strip
            elsif clean_prompt =~ /Negative[:\s]*(.+)/mi
              negative_prompt = $1.strip.sub(/\n.*$/m, '')  # 첫 줄만
              main_prompt = clean_prompt.sub(/Negative[:\s]*.+/mi, '').strip
            elsif clean_prompt =~ /---\s*\n(.+)/m
              negative_prompt = $1.strip
              main_prompt = clean_prompt.sub(/---\s*\n.+/m, '').strip
            end

            # 네거티브가 없으면 강화된 기본값 설정
            if negative_prompt.empty?
              negative_prompt = "adding new objects, extra furniture, plants, vases, decor, clutter, sketchup, wireframe, 3d model, cartoon, lines, edges, cgi, render artifacts, simplified textures, low quality, blurry, architectural changes, remodeling"
            end

            # 필수 네거티브 키워드 강제 추가
            required_negatives = "adding new objects, extra furniture, plants, vases, decor, sketchup, wireframe, "
            unless negative_prompt.downcase.include?('adding new objects')
              negative_prompt = required_negatives + negative_prompt
            end

            puts "[SketchupShow] Auto 프롬프트 생성 완료"
            puts "[SketchupShow] 네거티브: #{negative_prompt[0..50]}..."

            escaped_main = main_prompt.to_json
            escaped_negative = negative_prompt.to_json
            @main_dialog&.execute_script("onAutoPromptComplete(#{escaped_main}, #{escaped_negative})")
          else
            puts "[SketchupShow] Auto 프롬프트 생성 실패"
            @main_dialog&.execute_script("onAutoPromptError('프롬프트 생성 실패')")
          end

        rescue StandardError => e
          puts "[SketchupShow] Auto 프롬프트 에러: #{e.message}"
          @main_dialog&.execute_script("onAutoPromptError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # 렌더링 시작 (새 UI용 - time preset + light switch)
    def start_render_with_preset(time_preset, light_switch)
      puts "[SketchupShow] ========== 렌더링 시작 =========="
      puts "[SketchupShow] 엔진: #{@current_api}, time=#{time_preset}, light=#{light_switch}"

      # 엔진에 따라 클라이언트 확인
      if @current_api == 'replicate'
        unless @replicate_client
          UI.messagebox('Replicate API Token이 설정되지 않았습니다.', MB_OK)
          return
        end
      else
        unless @api_client
          UI.messagebox('Gemini API Key가 설정되지 않았습니다.', MB_OK)
          return
        end
      end

      unless @current_image
        UI.messagebox('먼저 씬을 캡처하세요.', MB_OK)
        return
      end

      # 현재 씬 이름 가져오기
      model = Sketchup.active_model
      current_scene = model.pages.selected_page&.name || 'Unknown'

      # 렌더링 시작 시 현재 이미지를 별도로 복사 (다른 씬 작업해도 영향 없음)
      puts "[SketchupShow] 이미지 복사 시작..."
      render_source_image = @current_image.dup
      puts "[SketchupShow] 이미지 복사 완료: #{render_source_image.length} bytes"

      # UI에 렌더링 시작 알림 (씬 이름 포함)
      puts "[SketchupShow] UI 알림 전송 중..."
      @main_dialog&.execute_script("onRenderStart('#{current_scene}')")
      puts "[SketchupShow] UI 알림 완료"
      puts "[SketchupShow] 렌더링 시작 (동기 모드)..."

      # Thread 없이 직접 실행 (SketchUp Ruby Thread 문제 회피)
      begin
        render_start = Time.now
        # 시간대와 조명 설정으로 프롬프트 생성
        prompt = build_render_prompt(time_preset, light_switch)
        negative = @negative_prompt || 'cartoon, anime, sketch, drawing, wireframe, outline, black lines, CGI, 3D render'

        puts "[SketchupShow] Prompt: #{prompt[0..200]}..."
        puts "[SketchupShow] 렌더링 씬: #{current_scene}"
        puts "[SketchupShow] 이미지 크기: #{render_source_image.length} bytes"

        # ★★★ 엔진에 따라 API 호출 분기 ★★★
        result = if @current_api == 'replicate'
          puts "[SketchupShow] Replicate API 사용 (ControlNet)"
          @replicate_client.generate(render_source_image, prompt, negative)
        elsif @reference_image
          puts "[SketchupShow] Gemini API + 레퍼런스 이미지"
          @api_client.generate_with_references(render_source_image, [@reference_image], prompt)
        else
          puts "[SketchupShow] Gemini API 사용"
          @api_client.generate(render_source_image, prompt)
        end

        render_elapsed = (Time.now - render_start).round(1)
        puts "[SketchupShow] 렌더링 총 소요시간: #{render_elapsed}초"

        if result && result[:image]
          # 렌더링 결과를 저장 (Export 기능에서 사용)
          @current_image = result[:image]
          puts "[SketchupShow] ★ 1차 결과 저장됨: 씬=#{current_scene}, #{result[:image].length} bytes"

          # 폴링 큐에 추가 (execute_script 크래시 방지)
          @render_complete_queue ||= []
          @render_complete_queue << {
            scene: current_scene,
            image: result[:image],
            timestamp: Time.now.to_i
          }
          puts "[SketchupShow] 렌더링 완료 큐에 추가: #{current_scene}"

          # 웹 동기화 전송
          sync_rendered_to_web if @web_sync_active
        else
          @main_dialog&.execute_script("onRenderError('렌더링 결과를 받지 못했습니다.', '#{current_scene}')")
        end
      rescue StandardError => e
        puts "[SketchupShow] Render Error: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        @main_dialog&.execute_script("onRenderError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}', '#{current_scene}')")
      end
    end

    # 모델에서 재질 정보 추출 (의미 있는 질감만, 영문으로)
    def extract_materials_info
      model = Sketchup.active_model
      materials = model.materials

      return "High-end architectural finishes" if materials.count == 0

      # Face 면적 기준으로 재질 수집
      material_area = {}  # { material_name => total_area }

      collect_material_areas(model.active_entities, material_area)

      # 면적 기준 상위 재질 선택
      sorted_materials = material_area.sort_by { |_, area| -area }

      # 의미 있는 재질만 필터링 (쓰레기 이름 제외)
      meaningful_textures = []

      sorted_materials.each do |mat_name, _area|
        texture_desc = extract_texture_description(mat_name, materials[mat_name])
        next if texture_desc.nil?  # 쓰레기 이름은 스킵

        meaningful_textures << texture_desc
        break if meaningful_textures.length >= 6  # 최대 6개
      end

      # 의미 있는 재질이 없으면 기본값
      if meaningful_textures.empty?
        return "High-end architectural finishes with natural materials"
      end

      meaningful_textures.join(", ")
    rescue StandardError => e
      puts "[SketchupShow] 재질 추출 에러: #{e.message}"
      "Premium interior finishes"
    end

    # 재질 이름에서 질감 설명 추출 (쓰레기면 nil 반환)
    def extract_texture_description(name, material)
      name_lower = name.downcase

      # === 쓰레기 이름 패턴 (nil 반환) ===
      # 숫자로만 된 이름, 기본 색상 이름, 의미 없는 ID
      garbage_patterns = [
        /^재질\d*$/,           # 재질1, 재질30
        /^\[?color[_\s]?\d*\]?$/i,  # [Color_001], Color 1
        /^material\d*$/i,      # Material1
        /^\d+$/,               # 순수 숫자
        /^[a-f0-9]{6}$/i,      # 헥스 컬러코드
        /^default/i,           # Default
        /^untitled/i,          # Untitled
      ]

      garbage_patterns.each do |pattern|
        return nil if name_lower =~ pattern
      end

      # === 의미 있는 질감 키워드 매핑 ===
      texture_map = {
        # 우드
        /walnut/i => "Dark walnut wood with natural grain",
        /oak/i => "Light oak wood, subtle grain",
        /maple/i => "Maple wood, smooth finish",
        /cherry/i => "Cherry wood, warm tone",
        /teak/i => "Teak wood, rich grain",
        /birch/i => "Birch wood, light tone",
        /pine/i => "Pine wood, natural knots",
        /wood/i => "Natural wood finish",
        /timber/i => "Timber finish",
        /veneer/i => "Wood veneer, satin finish",
        /마루|인쇄마루|온돌마루/i => "Wood flooring, natural finish",

        # 스톤/타일
        /marble|대리석/i => "Polished marble with subtle veins",
        /granite/i => "Granite surface, polished",
        /slate/i => "Slate stone, matte",
        /stone/i => "Natural stone finish",
        /tile|타일/i => "Ceramic tile, clean grout",
        /porcelain/i => "Porcelain tile, glossy",
        /terrazzo/i => "Terrazzo, polished aggregate",

        # 금속
        /chrome/i => "Chrome, mirror finish",
        /brass/i => "Brushed brass",
        /copper/i => "Copper, natural patina",
        /steel|stainless/i => "Brushed stainless steel",
        /iron/i => "Black iron finish",
        /aluminum/i => "Anodized aluminum",
        /metal/i => "Metal finish",
        /corrug/i => "Corrugated metal",

        # 패브릭
        /leather/i => "Premium leather texture",
        /velvet/i => "Soft velvet fabric",
        /linen/i => "Natural linen texture",
        /fabric|cloth/i => "Woven fabric",
        /cotton/i => "Cotton fabric",

        # 기타
        /concrete|콘크리트/i => "Raw concrete, industrial",
        /glass|유리/i => "Clear glass, subtle reflections",
        /brick|벽돌/i => "Exposed brick",
        /plaster/i => "Smooth plaster wall",
        /paint/i => "Matte painted surface",
        /plastic|pvc/i => "Matte plastic",
        /acrylic/i => "Clear acrylic",
        /lacquer/i => "High-gloss lacquer",
        /matte/i => "Matte finish",
        /gloss/i => "Glossy finish",
      }

      texture_map.each do |pattern, description|
        return description if name =~ pattern
      end

      # 텍스처 파일이 있으면 그걸로 추정
      if material&.texture
        filename = File.basename(material.texture.filename).downcase rescue ""
        texture_map.each do |pattern, description|
          return description if filename =~ pattern
        end
      end

      # 색상 기반 추정 (마지막 수단)
      if material&.color
        c = material.color
        brightness = (c.red + c.green + c.blue) / 3

        if brightness > 200
          return "Off-white surface"
        elsif brightness < 50
          return "Dark matte surface"
        elsif c.red > c.blue && c.red > c.green
          return "Warm-toned surface"
        elsif c.blue > c.red
          return "Cool-toned surface"
        end
      end

      # 이름에서 영문 키워드 추출 시도
      english_words = name.scan(/[a-zA-Z]{4,}/).map(&:downcase).uniq
      return nil if english_words.empty?

      # 의미 있는 영문 단어가 있으면 사용
      meaningful = english_words.reject { |w| %w[material color default texture].include?(w) }
      return nil if meaningful.empty?

      "#{meaningful.first.capitalize} finish"
    end

    # Face 면적 수집
    def collect_material_areas(entities, material_area, depth = 0)
      return if depth > 5

      entities.each do |entity|
        case entity
        when Sketchup::Face
          area = entity.area rescue 0

          if entity.material
            mat_name = entity.material.name
            material_area[mat_name] = (material_area[mat_name] || 0) + area
          end

        when Sketchup::Group
          collect_material_areas(entity.entities, material_area, depth + 1)

        when Sketchup::ComponentInstance
          collect_material_areas(entity.definition.entities, material_area, depth + 1)
        end
      end
    end

    # Face 순회하여 재질-부위 매핑 수집
    def collect_material_locations(entities, material_locations, depth = 0)
      return if depth > 5  # 무한 재귀 방지

      entities.each do |entity|
        case entity
        when Sketchup::Face
          # Face의 방향으로 부위 추정
          location = classify_face_location(entity)

          # 앞면 재질
          if entity.material
            mat_name = entity.material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

          # 뒷면 재질
          if entity.back_material
            mat_name = entity.back_material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

        when Sketchup::Group
          # 그룹 이름으로 부위 힌트 얻기
          group_hint = guess_location_from_name(entity.name)
          collect_material_locations_with_hint(entity.entities, material_locations, group_hint, depth + 1)

        when Sketchup::ComponentInstance
          # 컴포넌트 이름으로 부위 힌트 얻기
          comp_hint = guess_location_from_name(entity.definition.name)
          collect_material_locations_with_hint(entity.definition.entities, material_locations, comp_hint, depth + 1)
        end
      end
    end

    # 힌트가 있는 재질 수집
    def collect_material_locations_with_hint(entities, material_locations, hint, depth)
      return if depth > 5

      entities.each do |entity|
        case entity
        when Sketchup::Face
          location = hint || classify_face_location(entity)

          if entity.material
            mat_name = entity.material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

          if entity.back_material
            mat_name = entity.back_material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

        when Sketchup::Group
          new_hint = guess_location_from_name(entity.name) || hint
          collect_material_locations_with_hint(entity.entities, material_locations, new_hint, depth + 1)

        when Sketchup::ComponentInstance
          new_hint = guess_location_from_name(entity.definition.name) || hint
          collect_material_locations_with_hint(entity.definition.entities, material_locations, new_hint, depth + 1)
        end
      end
    end

    # Face 방향으로 부위 분류 (바닥/천장/벽)
    def classify_face_location(face)
      normal = face.normal

      # Z축 방향 체크
      if normal.z > 0.7
        "Floor(바닥)"
      elsif normal.z < -0.7
        "Ceiling(천장)"
      else
        "Wall(벽면)"
      end
    end

    # 이름에서 부위 힌트 추출
    def guess_location_from_name(name)
      return nil if name.nil? || name.empty?

      name_lower = name.downcase

      if name_lower.include?('floor') || name_lower.include?('바닥')
        "Floor(바닥)"
      elsif name_lower.include?('ceiling') || name_lower.include?('천장')
        "Ceiling(천장)"
      elsif name_lower.include?('wall') || name_lower.include?('벽')
        "Wall(벽면)"
      elsif name_lower.include?('door') || name_lower.include?('문')
        "Door(문)"
      elsif name_lower.include?('window') || name_lower.include?('창')
        "Window(창문)"
      elsif name_lower.include?('sofa') || name_lower.include?('소파')
        "Furniture-Sofa(소파)"
      elsif name_lower.include?('table') || name_lower.include?('테이블') || name_lower.include?('책상')
        "Furniture-Table(테이블)"
      elsif name_lower.include?('chair') || name_lower.include?('의자')
        "Furniture-Chair(의자)"
      elsif name_lower.include?('cabinet') || name_lower.include?('수납') || name_lower.include?('캐비닛')
        "Furniture-Cabinet(수납장)"
      elsif name_lower.include?('bed') || name_lower.include?('침대')
        "Furniture-Bed(침대)"
      elsif name_lower.include?('lamp') || name_lower.include?('light') || name_lower.include?('조명')
        "Lighting(조명기구)"
      elsif name_lower.include?('plant') || name_lower.include?('식물')
        "Decor-Plant(식물)"
      else
        nil
      end
    end

    # 명도 톤 분류
    def classify_tone(luminance)
      if luminance < 60
        "Very Dark(매우 어두움)"
      elsif luminance < 100
        "Dark(어두움)"
      elsif luminance < 150
        "Medium(중간)"
      elsif luminance < 200
        "Light(밝음)"
      else
        "Very Light(매우 밝음)"
      end
    end

    # 우드 재질 경고 생성
    def generate_wood_warning(materials)
      wood_keywords = ['wood', 'walnut', 'oak', 'teak', 'maple', 'cherry', '원목', '월넛', '오크', '티크', '메이플', '체리']
      wood_materials = materials.select { |m| wood_keywords.any? { |kw| m.name.downcase.include?(kw) } }

      return nil if wood_materials.empty?

      warning_lines = ["\n⚠️ WOOD MATERIAL WARNING (우드 재질 경고):"]
      wood_materials.each do |wm|
        if wm.color
          lum = (0.299 * wm.color.red + 0.587 * wm.color.green + 0.114 * wm.color.blue).to_i
          if lum < 100
            warning_lines << "- \"#{wm.name}\" is DARK WOOD (luminance: #{lum}). DO NOT change to light Oak!"
          else
            warning_lines << "- \"#{wm.name}\" is LIGHT WOOD (luminance: #{lum}). DO NOT change to dark Walnut!"
          end
        end
      end
      warning_lines.join("\n")
    end

    # 렌더링 프롬프트 생성
    def build_render_prompt(time_preset, light_switch)
      # 시간대별 조명 설정 (영문으로 상세하게)
      time_desc = case time_preset
      when 'day'
        "Bright natural daylight, midday sun, soft diffused light through windows, blue sky visible outside"
      when 'evening'
        "Golden hour sunset lighting at 5:00 PM, warm orange-amber light rays through windows, dramatic warm tones"
      when 'night'
        "Nighttime 9:00 PM, dark exterior visible through windows, interior lit by artificial lights only"
      else
        "Bright natural daylight"
      end

      # 조명 ON/OFF 설정 (영문으로 상세하게)
      light_desc = case light_switch
      when 'on'
        "Interior lights ON: All ceiling lights, pendant lamps, wall sconces, and floor lamps are illuminated with warm 3000K color temperature. Realistic soft glow from light fixtures."
      when 'off'
        "Interior lights OFF: All artificial lights are turned off. No lamp glow, no ceiling lights, no wall sconces illuminated. Only natural ambient light from windows and skylights."
      else
        "Interior lights ON with warm 3000K tone"
      end

      # 네거티브 프롬프트 처리
      negative_section = <<~NEGATIVE

[NEGATIVE PROMPT - ABSOLUTELY AVOID]
black outlines, visible edges, sketch lines, wireframe appearance, line art style, hard black lines, 3D render look, CGI appearance, computer graphics, architectural visualization, clean perfect surfaces, uniform flat lighting, artificial plastic look, cartoon style, anime style, painting style, illustration, hand-drawn, digital art, concept art, unrealistic colors, oversaturated, HDR artifacts, bloom effects, lens flare, motion blur, added objects, new furniture, mirrors not in original, extra decorations, added downlights, added spotlights, added recessed lights, added ceiling lights, new light fixtures, extra lighting elements
      NEGATIVE

      if @negative_prompt && !@negative_prompt.empty?
        negative_section += "\nAdditional exclusions: #{@negative_prompt}\n"
      end

      # Convert 여부에 따라 다른 프롬프트 생성
      if @converted_prompt && !@converted_prompt.empty?
        # ★ Convert 완료 - AI가 생성한 상세 프롬프트 사용
        puts "[SketchupShow] Convert 모드 - AI 생성 프롬프트 사용"
        puts "[SketchupShow] 조명 설정: #{light_desc}"

        # 조명 설정을 프롬프트 앞에 강조
        lighting_prefix = <<~LIGHTING
[CRITICAL INSTRUCTION - MUST FOLLOW EXACTLY]

This is an IMAGE-TO-IMAGE transformation task.
Your ONLY job is to convert this 3D SketchUp model render into a photorealistic interior photograph.

[ABSOLUTE RULES - VIOLATION = FAILURE]
1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must remain in the EXACT same position
2. PRESERVE EXACT CAMERA ANGLE: Do not change perspective, viewing angle, or focal length
3. PRESERVE EXACT FURNITURE LAYOUT: Every piece of furniture must stay in its exact location and size
4. NO ADDITIONS: Do NOT add any objects, furniture, decorations, mirrors, handles, plants, or accessories that are not in the source image
5. NO REMOVALS: Do NOT remove any objects that exist in the source image
6. NO LIGHT FIXTURE ADDITIONS: Do NOT add downlights, spotlights, recessed lights, ceiling lights, or any light fixtures that are not visible in the source image. Only render the light fixtures that ALREADY EXIST in the source.

[LIGHTING SETTINGS - APPLY EXACTLY]
Time of Day: #{time_desc}
Interior Lighting: #{light_desc}

        LIGHTING

        lighting_prefix + @converted_prompt + negative_section
      else
        # Convert 안함 - 기본 렌더링 (상세 프롬프트)
        puts "[SketchupShow] 일반 모드 - 기본 프롬프트"
        <<~PROMPT
[CRITICAL INSTRUCTION - MUST FOLLOW EXACTLY]

This is an IMAGE-TO-IMAGE transformation task.
Your ONLY job is to convert this 3D SketchUp model render into a photorealistic interior photograph.

[ABSOLUTE RULES - VIOLATION = FAILURE]
1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must remain in the EXACT same position
2. PRESERVE EXACT CAMERA ANGLE: Do not change perspective, viewing angle, or focal length
3. PRESERVE EXACT FURNITURE LAYOUT: Every piece of furniture must stay in its exact location and size
4. NO ADDITIONS: Do NOT add any objects, furniture, decorations, mirrors, handles, plants, or accessories that are not in the source image
5. NO REMOVALS: Do NOT remove any objects that exist in the source image
6. NO MODIFICATIONS: Do NOT resize, move, rotate, or transform any existing objects
7. NO LIGHT FIXTURE ADDITIONS: Do NOT add downlights, spotlights, recessed lights, ceiling lights, or any light fixtures that are not visible in the source image. Only render the light fixtures that ALREADY EXIST in the source.

[LIGHTING SETTINGS - APPLY EXACTLY]
Time of Day: #{time_desc}
Interior Lighting: #{light_desc}

[PHOTOREALISTIC TRANSFORMATION TASK]
Transform this 3D SketchUp interior render into a professional architectural photograph.
Camera: Canon EOS R5 with 24mm f/2.8 lens, professional architectural photography quality
Quality: High resolution, sharp focus, professional color grading

[MATERIAL RENDERING]
Convert all surfaces to photorealistic materials with natural imperfections:
- Wood surfaces: visible grain texture, subtle scratches, natural wood imperfections
- Wall surfaces: realistic paint texture, subtle shadows, minor surface variations
- Floor surfaces: realistic material texture with wear patterns and reflections
- Glass surfaces: realistic reflections, subtle smudges, proper transparency
- Metal surfaces: realistic reflections, subtle fingerprints, appropriate finish

[PHOTO REALISM DETAILS]
- Natural lens characteristics: subtle vignette, minimal chromatic aberration
- Realistic depth of field with natural bokeh
- Film-like quality with subtle grain (ISO 200-400)
- Professional white balance and color temperature
- Soft natural shadows with realistic falloff
- Global illumination and realistic light bounce
#{negative_section}
        PROMPT
      end
    end


    # 이미지 저장
    def save_image(filename)
      puts "[SketchupShow] save_image 호출됨, filename: #{filename}"
      puts "[SketchupShow] @current_image 존재: #{@current_image ? '있음 (' + @current_image.length.to_s + ' bytes)' : '없음'}"

      unless @current_image
        puts "[SketchupShow] 저장할 이미지가 없습니다"
        @main_dialog&.execute_script("setStatus('No image to save')")
        return
      end

      # 설정에서 저장 경로 및 파일명 형식 로드
      settings = @config_store.load_all_settings
      download_path = settings['download_path']
      filename_format = settings['filename_format'] || 'timestamp'

      # 저장 경로 결정
      if download_path && Dir.exist?(download_path)
        default_dir = download_path
      else
        model = Sketchup.active_model
        model_path = model.path

        if model_path.empty?
          default_dir = File.expand_path('~/Desktop')
        else
          default_dir = File.join(File.dirname(model_path), 'SketchupShow_Renders')
          Dir.mkdir(default_dir) unless Dir.exist?(default_dir)
        end
      end

      # 파일명 생성
      if filename.empty?
        default_filename = generate_filename(filename_format)
      else
        default_filename = filename
      end

      save_path = UI.savepanel('이미지 저장', default_dir, default_filename)
      return unless save_path

      # .png 확장자 확인
      save_path += '.png' unless save_path.downcase.end_with?('.png')

      begin
        # Base64 디코딩 후 저장
        image_data = Base64.decode64(@current_image)
        File.binwrite(save_path, image_data)
        puts "[SketchupShow] 이미지 저장 완료: #{save_path}"
        # UI 상태바에만 표시
        @main_dialog&.execute_script("setStatus('Saved: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[SketchupShow] 저장 실패: #{e.message}"
        @main_dialog&.execute_script("setStatus('Save failed')")
      end
    end

    # 파일명 생성
    def generate_filename(format)
      case format
      when 'timestamp'
        "render_#{Time.now.strftime('%Y%m%d_%H%M%S')}.png"
      when 'scene'
        model = Sketchup.active_model
        page = model.pages.selected_page
        scene_name = page ? page.name.gsub(/[^a-zA-Z0-9가-힣_-]/, '_') : 'untitled'
        "#{scene_name}_render.png"
      when 'sequential'
        # 저장 폴더에서 기존 파일 수 확인
        settings = @config_store.load_all_settings
        dir = settings['download_path'] || File.expand_path('~/Desktop')
        existing = Dir.glob(File.join(dir, 'render_*.png')).length
        "render_#{format('%03d', existing + 1)}.png"
      else
        "render_#{Time.now.strftime('%Y%m%d_%H%M%S')}.png"
      end
    end

    # 편집된 이미지 저장 (에디터에서 호출)
    def save_edited_image(image_base64)
      # 설정에서 저장 경로 로드
      settings = @config_store.load_all_settings
      download_path = settings['download_path']
      filename_format = settings['filename_format'] || 'timestamp'

      # 저장 경로 결정
      if download_path && Dir.exist?(download_path)
        default_dir = download_path
      else
        default_dir = File.expand_path('~/Desktop')
      end

      default_filename = generate_filename(filename_format).sub('render_', 'edited_')

      save_path = UI.savepanel('보정 이미지 저장', default_dir, default_filename)
      return unless save_path

      save_path += '.png' unless save_path.downcase.end_with?('.png')

      begin
        image_data = Base64.decode64(image_base64)
        File.binwrite(save_path, image_data)
        puts "[SketchupShow] 보정 이미지 저장 완료: #{save_path}"
        @editor_dialog&.execute_script("alert('저장 완료: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[SketchupShow] 저장 실패: #{e.message}"
        @editor_dialog&.execute_script("alert('저장 실패: #{e.message}')")
      end
    end

    # API Key 저장
    def save_api_key(key)
      @config_store.save_api_key(key)
      @api_client = ApiClient.new(key, @gemini_model)
      @settings_dialog&.execute_script("onApiKeySaved()")
    end

    # API Key 로드
    def load_api_key_to_dialog
      key = @config_store.load_api_key
      masked_key = key ? ('•' * [key.length - 4, 0].max) + key[-4..-1].to_s : ''
      @settings_dialog&.execute_script("onApiKeyLoaded('#{masked_key}')")
    end

    # API Key 저장 (메인 다이얼로그용)
    def save_api_key_from_main(key_json)
      # JSON 배열로 들어올 수 있으므로 파싱
      key = key_json
      begin
        parsed = JSON.parse(key_json)
        key = parsed.is_a?(Array) ? parsed[0] : parsed
      rescue
        key = key_json
      end
      @config_store.save_api_key(key)
      @api_client = ApiClient.new(key, @gemini_model)
      check_api_status  # 상태 업데이트
    end

    # API Key 로드 (메인 다이얼로그용)
    def load_api_key_to_main
      key = @config_store.load_api_key
      if key && key.length > 4
        masked_key = ('•' * (key.length - 4)) + key[-4..-1]
      elsif key && key.length > 0
        masked_key = '•' * key.length
      else
        masked_key = ''
      end
      puts "[SketchupShow] API Key 로드: #{masked_key.length > 0 ? '저장됨' : '없음'}"
      @main_dialog&.execute_script("onApiKeyLoaded('#{masked_key}')")
    end

    # ★ Replicate 토큰 저장
    def save_replicate_token(token)
      @config_store.save_setting('replicate_token', token)
      @replicate_client = ReplicateClient.new(token, @replicate_model || 'photorealistic-fx')
      puts "[SketchupShow] Replicate 토큰 저장됨"
      check_api_status
    end

    # ★ Replicate 토큰 로드
    def load_replicate_token
      token = @config_store.load_setting('replicate_token')
      if token && token.length > 4
        masked = ('•' * (token.length - 4)) + token[-4..-1]
      else
        masked = ''
      end
      @main_dialog&.execute_script("onReplicateTokenLoaded('#{masked}')")
    end

    # ★ 엔진 설정
    def set_current_engine(engine)
      @current_api = engine
      @config_store.save_setting('current_api', engine)
      puts "[SketchupShow] 엔진 변경: #{engine}"
      check_api_status
    end

    # 연결 테스트 (메인 다이얼로그용)
    def test_connection_from_main
      Thread.new do
        begin
          if @api_client&.test_connection
            @main_dialog&.execute_script("onConnectionTestResult(true, 'API 연결 성공')")
          else
            @main_dialog&.execute_script("onConnectionTestResult(false, 'API 연결 실패')")
          end
        rescue StandardError => e
          @main_dialog&.execute_script("onConnectionTestResult(false, '#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # 모델 저장
    def save_model(model)
      @config_store.save_setting('gemini_model', model)
      @gemini_model = model
      @api_client.model = model if @api_client
      puts "[SketchupShow] Gemini 모델 설정: #{model}"
    end

    # 모델 로드
    def load_model_to_dialog
      model = @config_store.load_setting('gemini_model') || 'gemini-2.5-flash'
      @gemini_model = model
      @settings_dialog&.execute_script("onModelLoaded('#{model}')")
    end

    # 모델 로드 (메인 다이얼로그용)
    def load_model_to_main_dialog
      model = @config_store.load_setting('gemini_model') || 'gemini-2.5-flash'
      @gemini_model = model
      @main_dialog&.execute_script("onModelLoaded('#{model}')")
    end

    # API 연결 테스트
    def test_api_connection
      unless @api_client
        @settings_dialog&.execute_script("onConnectionTestResult(false, 'API Key가 설정되지 않았습니다.')")
        return
      end

      Thread.new do
        begin
          result = @api_client.test_connection
          if result
            @settings_dialog&.execute_script("onConnectionTestResult(true, '연결 성공')")
          else
            @settings_dialog&.execute_script("onConnectionTestResult(false, '연결 실패')")
          end
        rescue StandardError => e
          @settings_dialog&.execute_script("onConnectionTestResult(false, '#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # API 상태 확인
    def check_api_status
      has_key = @api_client ? true : false
      @main_dialog&.execute_script("onApiStatusUpdate(#{has_key})")
    end

    # ========================================
    # 핫스팟 관리
    # ========================================

    def add_hotspot(data)
      hotspot = HotspotManager::Hotspot.new(
        x: data['x'],
        y: data['y'],
        object_image: data['image'],
        object_name: data['name']
      )
      @current_hotspots << hotspot
      @hotspot_dialog&.execute_script("onHotspotAdded('#{hotspot.id}')")
    end

    def remove_hotspot(id)
      @current_hotspots.reject! { |h| h.id == id }
    end

    def update_hotspot_scale(id, scale)
      hotspot = @current_hotspots.find { |h| h.id == id }
      hotspot.scale = scale if hotspot
    end

    def regenerate_with_hotspots
      unless @api_client
        UI.messagebox('API Key가 설정되지 않았습니다.', MB_OK)
        return
      end

      if @current_hotspots.empty?
        UI.messagebox('배치된 오브젝트가 없습니다.', MB_OK)
        return
      end

      @hotspot_dialog&.execute_script('onRegenerateStart()')

      Thread.new do
        begin
          builder = PromptBuilder.new

          # 새로운 시그니처: build_object_placement(hotspots, image_dimensions)
          prompt = builder.build_object_placement(
            @current_hotspots,
            { width: 1920, height: 1080 }
          )

          object_images = @current_hotspots.map(&:object_image)
          result = @api_client.generate_with_references(@current_image, object_images, prompt)

          if result && result[:image]
            @current_image = result[:image]
            @current_hotspots = []
            @hotspot_dialog&.execute_script("onRegenerateComplete('#{result[:image]}')")
            @main_dialog&.execute_script("updatePreviewImage('#{result[:image]}')")
            @hotspot_dialog&.close
          else
            @hotspot_dialog&.execute_script("onRegenerateError('재생성 결과를 받지 못했습니다.')")
          end
        rescue StandardError => e
          @hotspot_dialog&.execute_script("onRegenerateError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # ========================================
    # Prompt 다이얼로그 (프롬프트 편집 + 레퍼런스 이미지)
    # ========================================
    def show_prompt_dialog
      if @prompt_dialog && @prompt_dialog.visible?
        @prompt_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: 'Prompt - SketchupShow',
        preferences_key: 'SketchupShow_PromptDialog',
        width: 500,
        height: 450,
        min_width: 400,
        min_height: 380,
        resizable: true
      }

      @prompt_dialog = UI::HtmlDialog.new(options)
      @prompt_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/prompt_dialog.html'))

      register_prompt_callbacks(@prompt_dialog)

      @prompt_dialog.show
    end

    def register_prompt_callbacks(dialog)
      # 다이얼로그 준비 완료
      dialog.add_action_callback('prompt_ready') do |_ctx|
        # 현재 프롬프트가 있으면 전달
        if @converted_prompt && !@converted_prompt.empty?
          escaped_prompt = @converted_prompt.to_json
          dialog.execute_script("setPrompt(#{escaped_prompt})")
        end
        # 결과 이미지가 있으면 Use Result 버튼 활성화
        if @current_image
          dialog.execute_script("enableUseResult(true)")
        end
      end

      # 프롬프트 적용
      dialog.add_action_callback('prompt_apply') do |_ctx, data_json|
        begin
          data = JSON.parse(data_json)
          @converted_prompt = data['prompt'] || ''
          @reference_image = data['referenceImage']  # 레퍼런스 이미지 저장

          puts "[SketchupShow] Prompt 적용: #{@converted_prompt[0..100]}..."
          puts "[SketchupShow] Reference 이미지: #{@reference_image ? '있음' : '없음'}"

          # 메인 다이얼로그에 프롬프트 업데이트 알림
          @main_dialog&.execute_script("onPromptUpdated()")

          dialog.close
        rescue StandardError => e
          puts "[SketchupShow] Prompt 적용 에러: #{e.message}"
        end
      end

      # 취소
      dialog.add_action_callback('prompt_cancel') do |_ctx|
        dialog.close
      end

      # 결과 이미지를 레퍼런스로 사용
      dialog.add_action_callback('prompt_use_result') do |_ctx|
        if @current_image
          dialog.execute_script("setReference('#{@current_image}')")
        end
      end
    end

    # ========================================
    # Mix 다이얼로그 (요소 추가/삭제, 인페인팅, 재질 변경, 평면도→아이소)
    # ========================================
    def show_mix_dialog
      unless @current_image
        UI.messagebox('먼저 씬을 캡처하세요.', MB_OK)
        return
      end

      if @mix_dialog && @mix_dialog.visible?
        @mix_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: 'Mix - SketchupShow',
        preferences_key: 'SketchupShow_MixDialog',
        width: 1200,
        height: 750,
        min_width: 1000,
        min_height: 600,
        resizable: true
      }

      @mix_dialog = UI::HtmlDialog.new(options)
      @mix_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/mix_dialog.html'))

      register_mix_callbacks(@mix_dialog)

      @mix_dialog.show
    end

    def register_mix_callbacks(dialog)
      # 현재 이미지 가져오기
      dialog.add_action_callback('mix_get_current_image') do |_ctx|
        if @current_image
          dialog.execute_script("onBaseImageLoaded('#{@current_image}')")
        end
      end

      # 3D 좌표 가져오기 (스크린 좌표 → 월드 좌표)
      dialog.add_action_callback('mix_get_3d_coord') do |_ctx, screen_x, screen_y|
        get_3d_coordinate(screen_x.to_i, screen_y.to_i)
      end

      # 씬 컨텍스트 가져오기 (카메라, 조명, 바운드)
      dialog.add_action_callback('mix_get_scene_context') do |_ctx|
        get_scene_context
      end

      # Mix 적용
      dialog.add_action_callback('mix_apply') do |_ctx, data_json|
        apply_mix(data_json)
      end

      # Mix 취소
      dialog.add_action_callback('mix_cancel') do |_ctx|
        @mix_dialog.close
      end
    end

    # 스크린 좌표에서 3D 월드 좌표 추출
    def get_3d_coordinate(screen_x, screen_y)
      begin
        view = Sketchup.active_model.active_view
        result = CoordinateExtractor.screen_to_world(view, screen_x, screen_y)

        if result
          coord_data = {
            position: result[:position],
            normal: result[:normal],
            floor_reference: result[:floor_reference],
            screen_pos: { x: screen_x, y: screen_y }
          }
          @mix_dialog&.execute_script("onCoordReceived('#{coord_data.to_json}')")
        else
          @mix_dialog&.execute_script("onCoordReceived(null)")
        end
      rescue StandardError => e
        puts "[SketchupShow] 3D 좌표 추출 에러: #{e.message}"
        @mix_dialog&.execute_script("onCoordReceived(null)")
      end
    end

    # 씬 컨텍스트 추출 (카메라, 조명, 바운드)
    def get_scene_context
      begin
        view = Sketchup.active_model.active_view
        context = CoordinateExtractor.get_scene_context(view)

        @mix_dialog&.execute_script("onSceneContextLoaded('#{context.to_json}')")
      rescue StandardError => e
        puts "[SketchupShow] 씬 컨텍스트 추출 에러: #{e.message}"
        @mix_dialog&.execute_script("onSceneContextLoaded(null)")
      end
    end

    # Mix 기능 적용
    def apply_mix(data_json)
      unless @api_client
        @mix_dialog&.execute_script("onMixError('API Key가 설정되지 않았습니다.')")
        return
      end

      begin
        data = JSON.parse(data_json)
        mode = data['mode']

        Thread.new do
          begin
            result = case mode
            when 'add-remove'
              mix_add_remove(data)
            when 'inpaint'
              mix_inpaint(data)
            when 'material'
              mix_material(data)
            when 'floorplan'
              mix_floorplan(data)
            else
              raise "Unknown mix mode: #{mode}"
            end

            if result && result[:image]
              @current_image = result[:image]
              @mix_dialog&.execute_script("onMixComplete('#{result[:image]}')")
              @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', 'Mix')")
            else
              @mix_dialog&.execute_script("onMixError('결과 이미지를 받지 못했습니다.')")
            end
          rescue StandardError => e
            puts "[SketchupShow] Mix Error: #{e.message}"
            @mix_dialog&.execute_script("onMixError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}')")
          end
        end
      rescue StandardError => e
        @mix_dialog&.execute_script("onMixError('데이터 파싱 오류: #{e.message}')")
      end
    end

    # Mix: 요소 추가/삭제 (3D 좌표 기반)
    def mix_add_remove(data)
      puts "[SketchupShow] ===== MIX ADD-REMOVE 시작 ====="

      base_image = data['baseImage']
      hotspots = data['hotspots'] || []
      instruction = data['instruction'] || ''
      scene_context = data['sceneContext']
      preserve_settings = data['preserveSettings'] || {}

      puts "[SketchupShow] 핫스팟 수: #{hotspots.length}"
      puts "[SketchupShow] 베이스 이미지 크기: #{base_image&.length || 0} bytes"

      # 핫스팟 정보를 3D 좌표 기반 프롬프트로 변환
      hotspot_descriptions = hotspots.map.with_index do |h, i|
        pos = h['position'] || {}
        size = h['estimatedSize'] || {}
        rotation = h['rotation'] || 0
        scale = h['scale'] || 1.0

        object_name = h['name'] || h['objectName'] || 'Unknown'
        <<~HOTSPOT
Object #{i + 1} - "#{object_name}":
- World Position: (#{pos['x']&.round || 0}mm, #{pos['y']&.round || 0}mm, #{pos['z']&.round || 0}mm)
- Estimated Size: #{size['width'] || 500}mm W × #{size['depth'] || 500}mm D × #{size['height'] || 800}mm H
- Rotation: #{rotation}° (Z-axis)
- Scale Factor: #{scale}
- Floor Contact: #{h['floorReference'] != false ? 'Yes' : 'No'}
        HOTSPOT
      end.join("\n")

      # 카메라 정보 추출
      camera_info = ""
      if scene_context && scene_context['camera']
        cam = scene_context['camera']
        camera_info = <<~CAMERA
Camera Information (DO NOT CHANGE):
- Eye Position: (#{cam['eye']['x'].round}mm, #{cam['eye']['y'].round}mm, #{cam['eye']['z'].round}mm)
- Target: (#{cam['target']['x'].round}mm, #{cam['target']['y'].round}mm, #{cam['target']['z'].round}mm)
- FOV: #{cam['fov']}°
- Perspective: #{cam['perspective'] ? 'Yes' : 'No (Orthographic)'}
        CAMERA
      end

      # 보존 설정
      preserve_notes = []
      preserve_notes << "- PRESERVE exact camera angle and composition" if preserve_settings['camera'] != false
      preserve_notes << "- PRESERVE all existing furniture positions and materials" if preserve_settings['furniture'] != false
      preserve_notes << "- PRESERVE current lighting setup" if preserve_settings['lighting'] != false
      preserve_notes << "- PRESERVE material textures and colors" if preserve_settings['materials'] != false

      prompt = <<~PROMPT
[INPUT IMAGE = REFERENCE]
Using the provided SketchUp interior scene, add the following objects at their EXACT 3D world coordinates.
All measurements are in millimeters (mm). This is a PARTIAL MODIFICATION - only add the specified objects.

#{camera_info}

Objects to place:
#{hotspot_descriptions}

Additional Instructions: #{instruction}

CRITICAL RULES:
#{preserve_notes.join("\n")}
- Place objects at their EXACT world coordinates with correct perspective
- Match the scale using the provided size estimates (in mm)
- Apply correct rotation around Z-axis as specified
- Objects with "Floor Contact: Yes" must touch the ground plane (Z=0)
- The new objects must have realistic shadows matching scene lighting
- Result should be a photorealistic image, not a 3D model rendering
- DO NOT modify anything else in the scene
      PROMPT

      # 참조 이미지들 수집 (JavaScript에서 'image' 키 사용)
      reference_images = hotspots.map { |h| h['image'] }.compact

      puts "[SketchupShow] 참조 이미지 수: #{reference_images.length}"
      puts "[SketchupShow] 프롬프트: #{prompt[0..200]}..."

      if reference_images.any?
        puts "[SketchupShow] generate_with_references 호출..."
        @api_client.generate_with_references(base_image, reference_images, prompt)
      else
        puts "[SketchupShow] generate 호출 (참조 이미지 없음)..."
        @api_client.generate(base_image, prompt)
      end
    end

    # Mix: 인페인팅 (부분 수정)
    def mix_inpaint(data)
      base_image = data['baseImage']
      mask_image = data['maskImage']
      instruction = data['instruction']

      prompt = <<~PROMPT
Using the provided image, change only the [masked/highlighted area] to [#{instruction}].
Keep everything else in the image exactly the same, preserving the original style, lighting, and composition.

CRITICAL RULES:
- ONLY modify the highlighted/masked area
- Keep ALL other elements, furniture, and background unchanged
- Maintain consistent lighting and shadows
- The edit should blend seamlessly with the rest of the image
- Preserve the exact camera angle and perspective
      PROMPT

      # 마스크 이미지와 함께 전송
      @api_client.generate_with_references(base_image, [mask_image], prompt)
    end

    # Mix: 재질 변경
    def mix_material(data)
      base_image = data['baseImage']
      mask_image = data['maskImage']
      material_image = data['materialImage']
      description = data['description'] || 'the uploaded material'

      prompt = <<~PROMPT
Using the provided interior image, change the material/texture of the [masked area] to match the provided reference material image.

Material description: #{description}

CRITICAL RULES:
- Apply the new material ONLY to the masked area (walls, floor, or specified surface)
- Maintain the exact shape and geometry of the masked area
- Preserve proper perspective and depth when applying the texture
- Keep ALL other elements unchanged (furniture, objects, lighting)
- The new material should have realistic reflections and shadows
- Match the scale and pattern of the material naturally
      PROMPT

      # 베이스 이미지 + 마스크 + 재질 참조 이미지
      @api_client.generate_with_references(base_image, [mask_image, material_image], prompt)
    end

    # Mix: 평면도 → 아이소메트릭 (벽 높이/두께 파라미터 포함)
    def mix_floorplan(data)
      floorplan_image = data['floorplanImage'] || data['baseImage']
      style = data['style'] || 'modern'
      instruction = data['instruction'] || ''
      wall_height = data['wallHeight'] || 2700  # mm
      wall_thickness = data['wallThickness'] || 150  # mm

      style_descriptions = {
        'modern' => 'Modern minimalist style with clean lines, neutral colors, and contemporary furniture',
        'scandinavian' => 'Scandinavian style with light wood, white walls, cozy textiles, and natural elements',
        'industrial' => 'Industrial style with exposed brick, metal accents, dark tones, and vintage elements',
        'classic' => 'Classic traditional style with elegant furniture, rich colors, and ornate details',
        'luxury' => 'Luxury high-end style with premium materials, designer furniture, and sophisticated lighting'
      }

      style_desc = style_descriptions[style] || style_descriptions['modern']

      prompt = <<~PROMPT
Convert this 2D floor plan into a photorealistic isometric 3D visualization.

ARCHITECTURAL PARAMETERS:
- Wall Height: #{wall_height}mm (#{(wall_height / 1000.0).round(2)}m)
- Wall Thickness: #{wall_thickness}mm (#{(wall_thickness / 10.0).round(1)}cm)
- Units: All measurements in millimeters (mm)

Style: #{style_desc}

Additional instructions: #{instruction}

GENERATION REQUIREMENTS:
1. Analyze the floor plan layout, room dimensions, and spatial arrangement
2. Generate an isometric (30-degree angle) 3D view of the entire space
3. Build walls with EXACT height of #{wall_height}mm and thickness of #{wall_thickness}mm
4. Add appropriate furniture based on room types (bedroom, living room, kitchen, etc.)
5. Include realistic materials for walls, floors, and ceilings
6. Add natural and artificial lighting appropriate for each room
7. Include decorative elements like plants, artwork, and accessories
8. Maintain accurate proportions from the original floor plan
9. The result should be a cohesive, furnished interior in the specified style

SCALE REFERENCE:
- Standard door height: 2100mm
- Standard ceiling height: #{wall_height}mm
- Human eye level: 1600mm
- Standard furniture proportions based on these references

Output: High-quality isometric rendering with furniture, materials, and lighting
      PROMPT

      @api_client.generate(floorplan_image, prompt)
    end

    # ========================================
    # 로컬 웹 서버 (동기화용)
    # ========================================

    def web_sync_active?
      @local_server != nil
    end

    def get_local_ip
      Socket.ip_address_list.find { |addr|
        addr.ipv4? && !addr.ipv4_loopback?
      }&.ip_address || '127.0.0.1'
    end

    def start_local_server
      return if @local_server

      @local_port = 9876
      local_ip = get_local_ip

      @local_server_thread = Thread.new do
        begin
          @local_server = WEBrick::HTTPServer.new(
            Port: @local_port,
            BindAddress: '0.0.0.0',
            Logger: WEBrick::Log.new("/dev/null"),
            AccessLog: []
          )

          # CORS 및 데이터 API
          @local_server.mount_proc '/api/data' do |req, res|
            res['Access-Control-Allow-Origin'] = '*'
            res['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            res['Access-Control-Allow-Headers'] = 'Content-Type'
            res['Content-Type'] = 'application/json'

            if req.request_method == 'OPTIONS'
              res.status = 200
            else
              res.body = {
                source: @current_source_image,
                rendered: @current_image,
                timestamp: Time.now.to_i
              }.to_json
            end
          end

          # 상태 확인 API
          @local_server.mount_proc '/api/ping' do |req, res|
            res['Access-Control-Allow-Origin'] = '*'
            res['Content-Type'] = 'application/json'
            res.body = { status: 'ok', app: 'BananaShow', ip: local_ip, port: @local_port }.to_json
          end

          puts "[SketchupShow] 로컬 서버 시작: http://#{local_ip}:#{@local_port}"
          @local_server.start
        rescue StandardError => e
          puts "[SketchupShow] 로컬 서버 에러: #{e.message}"
        end
      end

      # 캡처 타이머 시작 (1초마다)
      @web_sync_timer = UI.start_timer(1, true) do
        capture_current_view if @local_server
      end

      "#{local_ip}:#{@local_port}"
    end

    def stop_local_server
      if @web_sync_timer
        UI.stop_timer(@web_sync_timer)
        @web_sync_timer = nil
      end

      if @local_server
        @local_server.shutdown
        @local_server = nil
      end

      if @local_server_thread
        @local_server_thread.kill
        @local_server_thread = nil
      end

      puts "[SketchupShow] 로컬 서버 중지"
    end

    def capture_current_view
      return unless @local_server

      begin
        view = Sketchup.active_model.active_view
        temp_path = File.join(ENV['TMPDIR'] || '/tmp', "nanobanana_live.png")
        view.write_image(temp_path, 1280, 720, true)

        if File.exist?(temp_path)
          @current_source_image = Base64.strict_encode64(File.binread(temp_path))
        end
      rescue StandardError => e
        # 조용히 실패
      end
    end

    # 하위 호환성
    def start_web_sync
      addr = start_local_server
      @main_dialog&.execute_script("onWebSyncStarted('#{addr}')")
      addr
    end

    def stop_web_sync
      stop_local_server
      @main_dialog&.execute_script("onWebSyncStopped()")
    end

    def sync_rendered_to_web
      # 로컬 서버에서는 @current_image가 자동으로 공유됨
    end

    # ========================================
    # 2차 생성 (이전 결과를 소스로 재생성, 새 패널에 표시)
    # ========================================
    def regenerate_image(source_base64, prompt, negative_prompt, panel_id)
      unless @api_client
        @main_dialog&.execute_script("onRegenerateError('API Key가 설정되지 않았습니다.', #{panel_id})")
        return
      end

      Thread.new do
        begin
          puts "[SketchupShow] 2차 생성 시작 (패널 #{panel_id})"

          # 네거티브 프롬프트 처리
          negative_section = ""
          if negative_prompt && !negative_prompt.empty?
            negative_section = "\n\n[NEGATIVE - AVOID]\n#{negative_prompt}"
          end

          # 프롬프트가 비어있으면 기본 프롬프트 사용
          render_prompt = if prompt && !prompt.empty?
            <<~PROMPT
★★★ IMAGE REFINEMENT REQUEST ★★★
Based on the attached rendered image, apply the following modifications while preserving the overall composition.

User Instructions: #{prompt}

CRITICAL RULES:
- PRESERVE the exact camera angle, perspective, and framing
- PRESERVE the spatial layout and furniture positions
- Apply requested modifications seamlessly
- Maintain photorealistic quality with consistent lighting
- DO NOT add elements that weren't requested
- DO NOT remove elements unless specifically requested
- DO NOT add downlights, spotlights, recessed lights, or any light fixtures not in the source
#{negative_section}
            PROMPT
          else
            <<~PROMPT
★★★ IMAGE ENHANCEMENT REQUEST ★★★
Enhance the attached rendered image while preserving all elements.

Improvements to apply:
- Enhance material textures and realism
- Improve lighting quality and shadow definition
- Increase overall photorealistic quality
- Refine details without changing the composition

CRITICAL RULES:
- PRESERVE the exact camera angle and composition
- PRESERVE all furniture positions and materials
- PRESERVE color tones (do not shift colors)
- DO NOT add or remove any objects
- DO NOT add downlights, spotlights, recessed lights, or any light fixtures not in the source
#{negative_section}
            PROMPT
          end

          puts "[SketchupShow] 2차 생성 프롬프트: #{render_prompt[0..200]}..."

          # API 호출 (이전 결과 이미지를 소스로)
          result = @api_client.generate(source_base64, render_prompt)

          if result && result[:image]
            puts "[SketchupShow] 2차 생성 완료 (패널 #{panel_id}), #{result[:image].length} bytes"

            # 폴링 큐에 추가 (execute_script 크래시 방지)
            @render_complete_queue ||= []
            @render_complete_queue << {
              scene: "regenerate_#{panel_id}",
              image: result[:image],
              panel_id: panel_id,
              timestamp: Time.now.to_i
            }
            puts "[SketchupShow] 2차 결과 큐에 추가: panel=#{panel_id}"
          else
            @main_dialog&.execute_script("onRegenerateError('결과를 받지 못했습니다.', #{panel_id})")
          end
        rescue StandardError => e
          puts "[SketchupShow] 2차 생성 에러: #{e.message}"
          @main_dialog&.execute_script("onRegenerateError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}', #{panel_id})")
        end
      end
    end

    # ========================================
    # 폴링 시스템 (execute_script 크래시 방지)
    # ========================================

    HISTORY_DIR = File.join(ENV['HOME'], '.sketchupshow')
    HISTORY_FILE = File.join(HISTORY_DIR, 'history.json')
    MAX_HISTORY_ITEMS = 500

    # 렌더링 완료 폴링 (JS가 주기적으로 호출)
    def poll_render_complete
      begin
        @render_complete_queue ||= []

        if @render_complete_queue.empty?
          @main_dialog&.execute_script("onPollResult(null)")
          return
        end

        item = @render_complete_queue.shift
        scene_name = item[:scene]
        image_data = item[:image]

        puts "[SketchupShow] 폴링 응답: #{scene_name}, #{image_data.to_s.length} bytes"

        # 이미지를 청크로 분할하여 @pending_chunks에 저장
        chunk_size = 30_000  # 30KB씩
        @pending_chunks = []
        @pending_scene = scene_name

        image_data.chars.each_slice(chunk_size) do |chunk|
          @pending_chunks << chunk.join
        end

        puts "[SketchupShow] 청크 준비 완료: #{@pending_chunks.length}개"

        safe_scene = scene_name.to_s.gsub("'", "\\\\'")

        # Ruby 타이머로 청크 자동 전송 (JS 콜백 의존 안 함)
        @main_dialog&.execute_script("window._chunkBuffer=''; window._chunkScene='#{safe_scene}';")
        send_chunk_auto(0, safe_scene)
      rescue StandardError => e
        puts "[SketchupShow] 폴링 오류: #{e.message}"
        @main_dialog&.execute_script("onPollResult(null)")
      end
    end

    # Ruby 타이머로 청크 자동 전송
    def send_chunk_auto(index, scene_name)
      return unless @pending_chunks && index < @pending_chunks.length

      chunk = @pending_chunks[index]
      is_last = (index == @pending_chunks.length - 1)
      escaped = chunk.gsub("\\", "\\\\\\\\").gsub("'", "\\\\'")

      puts "[SketchupShow] 청크 전송: #{index + 1}/#{@pending_chunks.length}"

      UI.start_timer(0.05, false) do
        begin
          # 청크를 버퍼에 추가
          @main_dialog&.execute_script("window._chunkBuffer+='#{escaped}';")

          if is_last
            # 마지막 청크 - 이미지 처리 호출
            puts "[SketchupShow] 마지막 청크 전송 완료"
            # JS에서 saveImageToFile 호출하도록 (base64 -> 파일 -> URL)
            @main_dialog&.execute_script("onChunkComplete(window._chunkBuffer, window._chunkScene);")
          else
            # 다음 청크 전송
            send_chunk_auto(index + 1, scene_name)
          end
        rescue StandardError => e
          puts "[SketchupShow] 청크 전송 오류: #{e.message}"
        end
      end
    end

    # base64 이미지를 파일로 저장 (JS에서 호출)
    def save_image_to_temp_file(base64, scene_name)
      begin
        puts "[SketchupShow] 이미지 파일 저장 시작: #{base64.length} bytes"

        temp_dir = File.join(ENV['HOME'], '.sketchupshow', 'renders')
        FileUtils.mkdir_p(temp_dir) unless File.directory?(temp_dir)

        filename = "render_#{Time.now.to_i}_#{rand(1000)}.png"
        file_path = File.join(temp_dir, filename)

        # base64 디코드하여 파일로 저장
        image_binary = Base64.decode64(base64)
        File.binwrite(file_path, image_binary)

        puts "[SketchupShow] 이미지 파일 저장 완료: #{file_path}"

        # JS에 파일 경로 전달
        safe_path = file_path.gsub("\\", "/").gsub("'", "\\\\'")
        safe_scene = scene_name.to_s.gsub("'", "\\\\'")
        @main_dialog&.execute_script("onImageFileSaved('#{safe_path}', '#{safe_scene}')")
      rescue StandardError => e
        puts "[SketchupShow] 이미지 파일 저장 오류: #{e.message}"
        puts e.backtrace.first(3).join("\n")
      end
    end

    # 파일에서 이미지 읽기 (폴링 결과용)
    def read_image_file(file_path, scene_name)
      begin
        puts "[SketchupShow] 이미지 파일 읽기: #{file_path}"
        if File.exist?(file_path)
          image_data = File.read(file_path)
          puts "[SketchupShow] 파일 크기: #{image_data.length} bytes"

          # 파일 삭제 (정리)
          File.delete(file_path) rescue nil

          safe_scene = scene_name.to_s.gsub("'", "\\\\'")

          # 이미지 데이터를 청크로 분할 (50KB씩 - 더 큰 청크로)
          chunk_size = 50_000
          chunks = []
          image_data.chars.each_slice(chunk_size) do |chunk|
            chunks << chunk.join
          end

          puts "[SketchupShow] 청크 전송 시작: #{chunks.length}개"

          # 타이머를 사용하여 청크를 순차적으로 전송 (각 청크 사이 10ms 딜레이)
          send_chunks_with_timer(chunks, 0, safe_scene)
        else
          puts "[SketchupShow] 파일 없음: #{file_path}"
          @main_dialog&.execute_script("onImageFileRead(null, '#{scene_name}')")
        end
      rescue StandardError => e
        puts "[SketchupShow] 파일 읽기 오류: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        @main_dialog&.execute_script("onImageFileRead(null, '#{scene_name}')")
      end
    end

    # 타이머를 사용하여 청크를 순차적으로 전송
    def send_chunks_with_timer(chunks, index, scene_name)
      return if index >= chunks.length

      chunk_data = chunks[index].gsub("'", "\\\\'").gsub("\\", "\\\\\\\\")
      is_last = (index == chunks.length - 1)

      @main_dialog&.execute_script("onImageChunk('#{chunk_data}', #{is_last}, '#{scene_name}')")

      if is_last
        puts "[SketchupShow] 청크 전송 완료"
      else
        # 다음 청크를 10ms 후에 전송
        UI.start_timer(0.01, false) do
          send_chunks_with_timer(chunks, index + 1, scene_name)
        end
      end
    end

    # 히스토리 파일에 저장
    def save_history_to_file(history_json)
      begin
        FileUtils.mkdir_p(HISTORY_DIR) unless File.directory?(HISTORY_DIR)
        history = JSON.parse(history_json)
        history = history.slice(0, MAX_HISTORY_ITEMS) if history.length > MAX_HISTORY_ITEMS
        File.write(HISTORY_FILE, JSON.pretty_generate(history))
        puts "[SketchupShow] 히스토리 저장 완료: #{history.length}개"
      rescue StandardError => e
        puts "[SketchupShow] 히스토리 저장 실패: #{e.message}"
      end
    end

    # 히스토리 파일에서 로드
    def load_history_from_file
      begin
        if File.exist?(HISTORY_FILE)
          history_json = File.read(HISTORY_FILE)
          history = JSON.parse(history_json)
          puts "[SketchupShow] 히스토리 로드: #{history.length}개"
          @main_dialog&.execute_script("onHistoryLoaded(#{history.to_json})")
        else
          puts "[SketchupShow] 히스토리 파일 없음"
          @main_dialog&.execute_script("onHistoryLoaded([])")
        end
      rescue StandardError => e
        puts "[SketchupShow] 히스토리 로드 실패: #{e.message}"
        @main_dialog&.execute_script("onHistoryLoaded([])")
      end
    end

    # ========================================
    # 도움말 및 정보
    # ========================================

    def show_help
      UI.openURL('https://github.com/nanobanana/sketchup-plugin/wiki')
    end

    def show_about
      message = <<~MSG
        #{PLUGIN_NAME}
        버전: #{PLUGIN_VERSION}

        SketchUp AI 실사 렌더링 플러그인
        Google Gemini API 기반

        #{PLUGIN_AUTHOR}
      MSG
      UI.messagebox(message, MB_OK)
    end
  end

  # 미러링용 ViewObserver (스로틀링 적용 - 부드러운 반응)
  class MirrorViewObserver < Sketchup::ViewObserver
    def initialize(plugin)
      @plugin = plugin
      @pending = false
      @last_capture = 0
    end

    def onViewChanged(view)
      return unless @plugin.mirror_active?
      return if @pending

      # 100ms 스로틀링
      now = Time.now.to_f
      return if (now - @last_capture) < 0.1

      @pending = true
      @last_capture = now

      # 다음 프레임에서 캡처 (UI 블로킹 방지)
      UI.start_timer(0.05, false) do
        @plugin.mirror_capture
        @pending = false
      end
    end
  end

  # 씬(페이지) 변경 감지용 Observer
  class PagesObserver < Sketchup::PagesObserver
    def initialize(plugin)
      @plugin = plugin
    end

    def onContentsModified(pages)
      @plugin.get_scenes
    end

    def onElementAdded(pages, page)
      @plugin.get_scenes
    end

    def onElementRemoved(pages, page)
      @plugin.get_scenes
    end
  end
end

# 플러그인 로드 시 초기화 (항상 실행 - load 명령으로 리로드 가능)
NanoBanana.initialize_plugin
