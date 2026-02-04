# frozen_string_literal: true

# NanoBanana Renderer - SketchUp AI 렌더링 플러그인
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
  PLUGIN_NAME = 'NanoBanana Renderer'
  PLUGIN_VERSION = '1.0.0'
  PLUGIN_AUTHOR = 'NanoBanana Team'
  PLUGIN_DESCRIPTION = 'SketchUp AI 실사 렌더링 플러그인 (Google Gemini 기반)'

  # 플러그인 루트 경로
  PLUGIN_ROOT = File.dirname(__FILE__)

  # 서비스 모듈 로드
  require_relative 'services/config_store'
  require_relative 'services/scene_exporter'
  require_relative 'services/prompt_builder'
  require_relative 'services/api_client'
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

    # 플러그인 초기화
    def initialize_plugin
      @config_store = ConfigStore.new
      api_key = @config_store.load_api_key
      @gemini_model = @config_store.load_setting('gemini_model') || 'gemini-2.5-flash'
      @api_client = ApiClient.new(api_key, @gemini_model) if api_key && !api_key.empty?

      register_menu
      register_toolbar

      # 로컬 웹 서버 자동 시작
      start_local_server

      puts "[NanoBanana] 플러그인 초기화 완료 (v#{PLUGIN_VERSION})"
    end

    # 메뉴 등록
    def register_menu
      menu = UI.menu('Extensions')
      submenu = menu.add_submenu(PLUGIN_NAME)

      submenu.add_item('렌더링 시작') { show_main_dialog }
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
      cmd_render = UI::Command.new('렌더링') { show_main_dialog }
      cmd_render.tooltip = 'NanoBanana 렌더링 시작'
      cmd_render.status_bar_text = 'AI 실사 렌더링을 시작합니다'
      # cmd_render.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_small.png')
      # cmd_render.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_large.png')
      toolbar.add_item(cmd_render)

      # 설정 버튼
      cmd_settings = UI::Command.new('설정') { show_settings_dialog }
      cmd_settings.tooltip = 'NanoBanana 설정'
      cmd_settings.status_bar_text = 'API Key 및 설정을 관리합니다'
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
        puts "[NanoBanana] 2점 투시 적용됨"
      end
    rescue StandardError => e
      puts "[NanoBanana] 2점 투시 에러: #{e.message}"
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

      puts "[NanoBanana] 미러링 시작"
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

      puts "[NanoBanana] 미러링 중지"
    end

    # 미러링 캡처 (적정 해상도)
    def mirror_capture
      return unless @mirror_active
      return unless @main_dialog

      begin
        temp_path = "/tmp/nanobanana_mirror.jpg"
        view = Sketchup.active_model.active_view

        # HD 해상도 (1280x720)
        view.write_image({
          filename: temp_path,
          width: 1280,
          height: 720,
          antialias: false,
          compression: 0.7
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
        preferences_key: 'NanoBanana_MainDialog_v2',
        width: 1400,
        height: 800,
        min_width: 1000,
        min_height: 600,
        resizable: true
      }

      @main_dialog = UI::HtmlDialog.new(options)
      @main_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/main_dialog.html'))

      # 콜백 등록
      register_main_callbacks(@main_dialog)

      @main_dialog.show
    end

    def register_main_callbacks(dialog)
      # 씬 캡처
      dialog.add_action_callback('capture_scene') do |_ctx, size|
        capture_scene(size || '3840')
      end

      # 렌더링 시작 (새 UI: time + light + prompt + negative 파라미터)
      dialog.add_action_callback('start_render') do |_ctx, time_preset, light_switch, prompt, negative_prompt|
        # UI에서 직접 입력한 프롬프트가 있으면 사용
        @converted_prompt = prompt if prompt && !prompt.empty?
        @negative_prompt = negative_prompt if negative_prompt && !negative_prompt.empty?
        start_render_with_preset(time_preset, light_switch)
      end

      # Auto 프롬프트 생성 요청 (스타일 파라미터 추가)
      dialog.add_action_callback('generate_auto_prompt') do |_ctx, style|
        generate_auto_prompt(style || '')
      end

      # 이미지 저장
      dialog.add_action_callback('save_image') do |_ctx, filename|
        save_image(filename || '')
      end

      # 설정 다이얼로그 열기
      dialog.add_action_callback('open_settings') do |_ctx|
        show_settings_dialog
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

      # 카메라 이동
      dialog.add_action_callback('cam_move') do |_ctx, direction|
        camera_move(direction)
      end

      # 카메라 회전
      dialog.add_action_callback('cam_rotate') do |_ctx, direction|
        camera_rotate(direction)
      end

      # 카메라 높이 프리셋
      dialog.add_action_callback('cam_height') do |_ctx, preset|
        camera_set_height(preset)
      end

      # 카메라 FOV 프리셋
      dialog.add_action_callback('cam_fov') do |_ctx, preset|
        camera_set_fov(preset)
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
      dialog.add_action_callback('select_scene') do |_ctx, scene_name|
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

      # 2차 생성 (이전 결과를 소스로 사용)
      dialog.add_action_callback('regenerate') do |_ctx, source_base64, prompt, panel_id|
        regenerate_image(source_base64, prompt, panel_id.to_i)
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
        puts "[NanoBanana] 첫 번째 씬으로 전환: #{first_page.name}"
        # 자동 미러링 즉시 시작
        start_mirror
        @main_dialog.execute_script("setMirrorActive(true)") if @main_dialog
      end
    rescue StandardError => e
      puts "[NanoBanana] 씬 목록 에러: #{e.message}"
    end

    def select_scene(scene_name)
      model = Sketchup.active_model
      pages = model.pages

      page = pages[scene_name]
      if page
        pages.selected_page = page
        model.active_view.invalidate
        puts "[NanoBanana] 씬 전환: #{scene_name}"

        # 씬 전환 후 즉시 미러 캡처 (미러링 활성화 상태면)
        if @mirror_active
          # 약간의 딜레이 후 캡처 (SketchUp 렌더링 완료 대기)
          UI.start_timer(0.1, false) { mirror_capture }
        end
      else
        puts "[NanoBanana] 씬을 찾을 수 없음: #{scene_name}"
      end
    rescue StandardError => e
      puts "[NanoBanana] 씬 전환 에러: #{e.message}"
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
      puts "[NanoBanana] 씬 추가: #{name}"

      # 목록 갱신
      get_scenes
    rescue StandardError => e
      puts "[NanoBanana] 씬 추가 에러: #{e.message}"
    end

    # PagesObserver 등록
    def register_pages_observer
      return if @pages_observer

      @pages_observer = PagesObserver.new(self)
      Sketchup.active_model.pages.add_observer(@pages_observer)
      puts "[NanoBanana] PagesObserver 등록됨"
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
        dialog_title: '설정 - NanoBanana',
        preferences_key: 'NanoBanana_SettingsDialog',
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
          puts "[NanoBanana] 설정 저장 오류: #{e.message}"
        end
      end

      # 설정 로드
      dialog.add_action_callback('load_settings') do |_ctx|
        settings = @config_store.load_settings
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
        dialog_title: '이미지 보정 - NanoBanana',
        preferences_key: 'NanoBanana_EditorDialog',
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

            puts "[NanoBanana] Editor AI Generate - Texture: #{texture_intensity}"
            puts "[NanoBanana] Prompt: #{prompt[0..200]}..."

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
            puts "[NanoBanana] Editor AI Error: #{e.message}"
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
        dialog_title: '오브젝트 배치 - NanoBanana',
        preferences_key: 'NanoBanana_HotspotDialog',
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
    def capture_scene(size = '3840')
      begin
        temp_path = "/tmp/nanobanana_capture.png"
        model = Sketchup.active_model
        view = model.active_view

        # 사이즈별 해상도 설정 (16:9 비율)
        sizes = {
          '1920' => { width: 1920, height: 1080 },  # FHD
          '2560' => { width: 2560, height: 1440 },  # QHD
          '3840' => { width: 3840, height: 2160 }   # 4K
        }
        resolution = sizes[size] || sizes['3840']

        keys = {
          :filename => temp_path,
          :width => resolution[:width],
          :height => resolution[:height],
          :antialias => true,
          :transparent => false
        }

        success = view.write_image(keys)

        unless success
          raise "이미지 내보내기 실패"
        end

        @current_image = Base64.strict_encode64(File.binread(temp_path))
        File.delete(temp_path) rescue nil

        puts "[NanoBanana] 캡처 완료 (#{resolution[:width]}x#{resolution[:height]})"

        # UI에 캡처 완료 알림 (프롬프트 생성 시작)
        if @main_dialog
          @main_dialog.execute_script("onCaptureComplete('#{@current_image}', 0)")
          @main_dialog.execute_script("setStatus('Analyzing scene...')")
        end

        # ★ Convert 핵심: 씬 분석하여 재질/구조 데이터만 추출 (프롬프트는 별도)
        analyze_scene_only

      rescue StandardError => e
        puts "[NanoBanana] 캡처 에러: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        if @main_dialog
          @main_dialog.execute_script("onCaptureError('#{e.message}')")
        end
      end
    end

    # 씬 분석 - 재질/구조 데이터만 추출 (프롬프트 생성 X)
    def analyze_scene_only
      unless @api_client
        puts "[NanoBanana] API 클라이언트 없음 - 분석 스킵"
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

          puts "[NanoBanana] 씬 분석 시작 (데이터 추출만)..."

          @main_dialog&.execute_script("updateConvertProgress('이미지 캡처 완료', '공간 구조 분석 중...')")
          sleep(0.3)

          @main_dialog&.execute_script("updateConvertProgress('AI 분석 요청', '재질 및 색상 데이터 추출 중...')")

          # Gemini에게 이미지 분석 요청
          result = @api_client.analyze_scene(@current_image, analysis_prompt)

          @main_dialog&.execute_script("updateConvertProgress('AI 응답 수신', '데이터 처리 중...')")

          if result && result[:text]
            @scene_analysis = result[:text]
            puts "[NanoBanana] 씬 분석 완료"
            puts @scene_analysis[0..300] + "..."

            # Convert 완료 - 프롬프트는 비워두고 활성화만
            @main_dialog&.execute_script("onConvertComplete('')")
          else
            puts "[NanoBanana] 씬 분석 실패"
            @scene_analysis = nil
            @main_dialog&.execute_script("onConvertError('씬 분석 실패')")
          end

        rescue StandardError => e
          puts "[NanoBanana] 씬 분석 에러: #{e.message}"
          @scene_analysis = nil
          @main_dialog&.execute_script("onConvertError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # Auto 프롬프트 생성 (분석 데이터 + 스타일 기반 + SketchUp 재질 정보)
    def generate_auto_prompt(user_style = '')
      unless @api_client
        puts "[NanoBanana] API 클라이언트 없음"
        return
      end

      unless @current_image
        puts "[NanoBanana] 이미지 없음"
        return
      end

      Thread.new do
        begin
          @main_dialog&.execute_script("onAutoPromptStart()")

          # ★★★ SketchUp 모델에서 재질 정보 추출 ★★★
          materials_info = extract_materials_info
          puts "[NanoBanana] 추출된 재질 정보:"
          puts materials_info[0..500] + "..."

          # 스타일이 있으면 스타일 기반 프롬프트 생성
          style_instruction = if user_style && !user_style.empty?
            <<~STYLE
**[사용자 요청 스타일]**
#{user_style}

위 스타일을 반영하여 공간의 분위기, 조명, 마감재 표현을 최적화하세요.
단, 레이아웃과 가구 배치는 절대 변경하지 마세요.
            STYLE
          else
            ""
          end

          prompt_request = <<~PROMPT
이 스케치업 씬을 분석하여, 형태/구도/재질을 100% 동일하게 유지하는 실사 렌더링 프롬프트를 생성해줘.

★★★ 중요: 아래 SketchUp 모델의 재질 정보를 반드시 참고하세요 ★★★
이 정보는 스케치업 모델에서 직접 추출한 정확한 재질 데이터입니다.
각 재질의 이름, RGB 색상, 명도 톤을 정확히 유지해야 합니다.

[SketchUp 모델 재질 데이터]
#{materials_info}

★★★ 중요: 스케치업에 보이는 재질 색상과 텍스처를 절대 변경하지 마세요 ★★★
- 나무 패널이면 나무 패널 그대로
- 회색 벽이면 회색 벽 그대로
- 흰색 천장이면 흰색 천장 그대로
- 가구 색상도 원본 그대로
#{style_instruction}
다음 형식으로 프롬프트를 작성해줘:

[STRICT REFERENCE MODE]
이 스케치업 이미지를 실사 렌더링으로 변환. 카메라 앵글, 구도, 원근감 100% 유지.

[절대 변경 금지 - 레이아웃]
(보이는 모든 요소의 정확한 위치와 형태를 나열)

[절대 변경 금지 - 재질 색상]
위 [SketchUp 모델 재질 데이터]를 참고하여 정확한 재질명과 색상을 명시:
- 바닥: (재질명, RGB값, 톤 포함)
- 천장: (재질명, RGB값, 톤 포함)
- 벽면: (각 벽면의 재질명, RGB값, 톤 포함)
- 가구: (각 가구의 재질명, RGB값, 톤 포함)

[조명 기구 위치]
(보이는 조명 기구의 위치와 형태만 설명, 켜짐/꺼짐은 사용자가 별도 지정)

[출력 품질]
8K 포토리얼, PBR 재질, 글로벌 일루미네이션.

★★★ CRITICAL - OBJECT COUNT RULE ★★★
- DO NOT ADD any objects, plants, decorations, accessories, or items that do not exist in the source image
- DO NOT REMOVE any objects that exist in the source image
- EXACT SAME number of items: if source has 2 chairs, output must have exactly 2 chairs
- EXACT SAME positions: every object must remain in its original location
- NO creative additions: no vases, no plants, no books, no decorations unless they exist in source
- If it's not visible in the SketchUp source, it MUST NOT appear in the render

---
[NEGATIVE]
adding objects, removing objects, extra furniture, additional plants, extra decorations, new accessories, creative additions, object count change, 레이아웃 변경, 가구 추가, 가구 삭제, 소품 추가, 식물 추가, 장식 추가, 재질 색상 변경, 만화/일러스트 스타일, 사람, 동물, 텍스트, 워터마크
          PROMPT

          result = @api_client.analyze_scene(@current_image, prompt_request)

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
            elsif clean_prompt =~ /---\s*\n(.+)/m
              negative_prompt = $1.strip
              main_prompt = clean_prompt.sub(/---\s*\n.+/m, '').strip
            end

            puts "[NanoBanana] Auto 프롬프트 생성 완료"

            escaped_main = main_prompt.to_json
            escaped_negative = negative_prompt.to_json
            @main_dialog&.execute_script("onAutoPromptComplete(#{escaped_main}, #{escaped_negative})")
          else
            puts "[NanoBanana] Auto 프롬프트 생성 실패"
            @main_dialog&.execute_script("onAutoPromptError('프롬프트 생성 실패')")
          end

        rescue StandardError => e
          puts "[NanoBanana] Auto 프롬프트 에러: #{e.message}"
          @main_dialog&.execute_script("onAutoPromptError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # 렌더링 시작 (새 UI용 - time preset + light switch)
    def start_render_with_preset(time_preset, light_switch)
      unless @api_client
        UI.messagebox('API Key가 설정되지 않았습니다. 설정에서 API Key를 입력하세요.', MB_OK)
        return
      end

      unless @current_image
        UI.messagebox('먼저 씬을 캡처하세요.', MB_OK)
        return
      end

      # 현재 씬 이름 가져오기
      model = Sketchup.active_model
      current_scene = model.pages.selected_page&.name || 'Unknown'

      # 렌더링 시작 시 현재 이미지를 별도로 복사 (다른 씬 작업해도 영향 없음)
      render_source_image = @current_image.dup

      # UI에 렌더링 시작 알림 (씬 이름 포함)
      @main_dialog&.execute_script("onRenderStart('#{current_scene}')")

      Thread.new do
        begin
          # 시간대와 조명 설정으로 프롬프트 생성
          prompt = build_render_prompt(time_preset, light_switch)
          puts "[NanoBanana] Prompt: #{prompt[0..200]}..."
          puts "[NanoBanana] 렌더링 씬: #{current_scene}"

          # API 호출 (레퍼런스 이미지 있으면 사용)
          result = if @reference_image
            puts "[NanoBanana] 레퍼런스 이미지 사용"
            @api_client.generate_with_references(render_source_image, [@reference_image], prompt)
          else
            @api_client.generate(render_source_image, prompt)
          end

          if result && result[:image]
            # 렌더링 결과를 저장 (Export 기능에서 사용)
            @current_image = result[:image]
            # 렌더링 완료 (씬 이름과 함께 전달)
            @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', '#{current_scene}')")
            # 웹 동기화 전송
            sync_rendered_to_web if @web_sync_active
          else
            @main_dialog&.execute_script("onRenderError('렌더링 결과를 받지 못했습니다.', '#{current_scene}')")
          end
        rescue StandardError => e
          puts "[NanoBanana] Render Error: #{e.message}"
          @main_dialog&.execute_script("onRenderError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}', '#{current_scene}')")
        end
      end
    end

    # 모델에서 재질 정보 추출 (상세)
    def extract_materials_info
      model = Sketchup.active_model
      materials = model.materials

      return "재질 정보 없음" if materials.count == 0

      material_list = []

      materials.each do |mat|
        # 재질 이름 (가장 중요!)
        name = mat.name

        # 색상 정보 (RGB + 명도 분석)
        color_desc = ""
        if mat.color
          c = mat.color
          r, g, b = c.red, c.green, c.blue

          # 명도 계산 (0-255)
          luminance = (0.299 * r + 0.587 * g + 0.114 * b).to_i

          # 색상 톤 분류
          tone = if luminance < 60
            "매우 어두움(Very Dark)"
          elsif luminance < 100
            "어두움(Dark)"
          elsif luminance < 150
            "중간(Medium)"
          elsif luminance < 200
            "밝음(Light)"
          else
            "매우 밝음(Very Light)"
          end

          color_desc = "RGB(#{r},#{g},#{b}), 명도:#{luminance}, 톤:#{tone}"
        end

        # 텍스처 정보
        texture_desc = ""
        if mat.texture
          tex = mat.texture
          filename = File.basename(tex.filename) rescue "unknown"
          texture_desc = "텍스처파일: #{filename}"
        end

        # 재질 설명 생성 (이름 강조)
        desc = "★ 재질명: \"#{name}\""
        desc += " | #{color_desc}" if color_desc != ""
        desc += " | #{texture_desc}" if texture_desc != ""
        desc += " | 투명도: #{(mat.alpha * 100).to_i}%" if mat.alpha < 1.0

        material_list << desc
      end

      # 우드 재질 특별 경고 추가
      wood_materials = materials.select { |m| m.name.downcase.include?('wood') || m.name.downcase.include?('walnut') || m.name.downcase.include?('oak') || m.name.downcase.include?('원목') || m.name.downcase.include?('월넛') || m.name.downcase.include?('오크') }

      warning = ""
      if wood_materials.any?
        warning = "\n\n⚠️ 우드 재질 경고:\n"
        wood_materials.each do |wm|
          c = wm.color
          if c
            lum = (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue).to_i
            warning += "- \"#{wm.name}\"은 명도 #{lum}입니다. "
            if lum < 100
              warning += "이것은 어두운 우드(월넛/다크브라운)입니다. 밝은 오크로 변경 금지!\n"
            else
              warning += "이것은 밝은 우드(오크/라이트브라운)입니다. 어두운 월넛으로 변경 금지!\n"
            end
          end
        end
      end

      material_list.join("\n") + warning
    rescue StandardError => e
      puts "[NanoBanana] 재질 추출 에러: #{e.message}"
      "재질 정보 추출 실패"
    end

    # 렌더링 프롬프트 생성
    def build_render_prompt(time_preset, light_switch)
      # 시간대별 조명 설정
      time_desc = case time_preset
      when 'day'
        "주간 자연광 (부드러운 주간광)"
      when 'evening'
        "Golden hour 오후 5:00 PM, 따뜻한 석양빛"
      when 'night'
        "밤 9:00 PM, 어두운 외부, 실내 조명만"
      else
        "주간 자연광"
      end

      # 조명 ON/OFF 설정
      light_desc = case light_switch
      when 'on'
        "실내 조명 점등 (따뜻한 3000K, 과장 없이 현실적으로)"
      when 'off'
        "실내 조명 OFF - 자연광만 사용"
      else
        "실내 조명 점등"
      end

      # 네거티브 프롬프트 처리
      negative_section = ""
      if @negative_prompt && !@negative_prompt.empty?
        puts "[NanoBanana] 네거티브 프롬프트 적용: #{@negative_prompt[0..50]}..."
        negative_section = <<~NEGATIVE

★★★ NEGATIVE PROMPT - DO NOT INCLUDE THESE ★★★
#{@negative_prompt}

        NEGATIVE
      end

      # Convert 여부에 따라 다른 프롬프트 생성
      if @converted_prompt && !@converted_prompt.empty?
        # ★ Convert 완료 - AI가 생성한 상세 프롬프트 사용
        puts "[NanoBanana] Convert 모드 - AI 생성 프롬프트 사용"
        puts "[NanoBanana] 조명 설정: #{light_desc}"

        # 조명 설정을 프롬프트 앞에 강조
        lighting_prefix = <<~LIGHTING
★★★ CRITICAL LIGHTING INSTRUCTION - MUST FOLLOW ★★★
- Time: #{time_desc}
- Interior Lights: #{light_desc}
#{light_switch == 'off' ? '- ALL INTERIOR LIGHTS MUST BE OFF. No lamp glow, no ceiling lights, no artificial lighting. Only natural daylight from windows.' : '- Interior lights should be ON with warm 3000K tone.'}

        LIGHTING

        lighting_prefix + @converted_prompt + negative_section
      else
        # Convert 안함 - 기본 렌더링
        puts "[NanoBanana] 일반 모드 - 기본 프롬프트"
        <<~PROMPT
첨부된 건축/인테리어 이미지를 포토리얼리스틱 사진으로 변환하세요.
구조와 형태를 최대한 유지하고, 사실적인 재질감과 조명을 표현해주세요.

조명 설정:
- 시간대: #{time_desc}
- 실내조명: #{light_desc}
#{negative_section}
        PROMPT
      end
    end


    # 이미지 저장
    def save_image(filename)
      puts "[NanoBanana] save_image 호출됨, filename: #{filename}"
      puts "[NanoBanana] @current_image 존재: #{@current_image ? '있음 (' + @current_image.length.to_s + ' bytes)' : '없음'}"

      unless @current_image
        puts "[NanoBanana] 저장할 이미지가 없습니다"
        @main_dialog&.execute_script("setStatus('No image to save')")
        return
      end

      # 설정에서 저장 경로 및 파일명 형식 로드
      settings = @config_store.load_settings
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
          default_dir = File.join(File.dirname(model_path), 'NanoBanana_Renders')
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
        puts "[NanoBanana] 이미지 저장 완료: #{save_path}"
        # UI 상태바에만 표시
        @main_dialog&.execute_script("setStatus('Saved: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[NanoBanana] 저장 실패: #{e.message}"
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
        settings = @config_store.load_settings
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
      settings = @config_store.load_settings
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
        puts "[NanoBanana] 보정 이미지 저장 완료: #{save_path}"
        @editor_dialog&.execute_script("alert('저장 완료: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[NanoBanana] 저장 실패: #{e.message}"
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

    # 모델 저장
    def save_model(model)
      @config_store.save_setting('gemini_model', model)
      @gemini_model = model
      @api_client.model = model if @api_client
      puts "[NanoBanana] Gemini 모델 설정: #{model}"
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
        dialog_title: 'Prompt - NanoBanana',
        preferences_key: 'NanoBanana_PromptDialog',
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

          puts "[NanoBanana] Prompt 적용: #{@converted_prompt[0..100]}..."
          puts "[NanoBanana] Reference 이미지: #{@reference_image ? '있음' : '없음'}"

          # 메인 다이얼로그에 프롬프트 업데이트 알림
          @main_dialog&.execute_script("onPromptUpdated()")

          dialog.close
        rescue StandardError => e
          puts "[NanoBanana] Prompt 적용 에러: #{e.message}"
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
        dialog_title: 'Mix - NanoBanana',
        preferences_key: 'NanoBanana_MixDialog',
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
        puts "[NanoBanana] 3D 좌표 추출 에러: #{e.message}"
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
        puts "[NanoBanana] 씬 컨텍스트 추출 에러: #{e.message}"
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
            puts "[NanoBanana] Mix Error: #{e.message}"
            @mix_dialog&.execute_script("onMixError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}')")
          end
        end
      rescue StandardError => e
        @mix_dialog&.execute_script("onMixError('데이터 파싱 오류: #{e.message}')")
      end
    end

    # Mix: 요소 추가/삭제 (3D 좌표 기반)
    def mix_add_remove(data)
      base_image = data['baseImage']
      hotspots = data['hotspots'] || []
      instruction = data['instruction'] || ''
      scene_context = data['sceneContext']
      preserve_settings = data['preserveSettings'] || {}

      # 핫스팟 정보를 3D 좌표 기반 프롬프트로 변환
      hotspot_descriptions = hotspots.map.with_index do |h, i|
        pos = h['position'] || {}
        size = h['estimatedSize'] || {}
        rotation = h['rotation'] || 0
        scale = h['scale'] || 1.0

        <<~HOTSPOT
Object #{i + 1} - "#{h['objectName'] || 'Unknown'}":
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

      # 참조 이미지들 수집
      reference_images = hotspots.map { |h| h['objectImage'] }.compact

      if reference_images.any?
        @api_client.generate_with_references(base_image, reference_images, prompt)
      else
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

          puts "[NanoBanana] 로컬 서버 시작: http://#{local_ip}:#{@local_port}"
          @local_server.start
        rescue StandardError => e
          puts "[NanoBanana] 로컬 서버 에러: #{e.message}"
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

      puts "[NanoBanana] 로컬 서버 중지"
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
    # 2차 생성 (이전 결과를 소스로 재생성)
    # ========================================
    def regenerate_image(source_base64, prompt, panel_id)
      unless @api_client
        @main_dialog&.execute_script("onRegenerateError('API Key가 설정되지 않았습니다.', #{panel_id})")
        return
      end

      Thread.new do
        begin
          puts "[NanoBanana] 2차 생성 시작 (패널 #{panel_id})"

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
            PROMPT
          end

          puts "[NanoBanana] 2차 생성 프롬프트: #{render_prompt[0..200]}..."

          # API 호출 (이전 결과 이미지를 소스로)
          result = @api_client.generate(source_base64, render_prompt)

          if result && result[:image]
            @main_dialog&.execute_script("onRegenerateComplete('#{result[:image]}', #{panel_id})")
            puts "[NanoBanana] 2차 생성 완료 (패널 #{panel_id})"
          else
            @main_dialog&.execute_script("onRegenerateError('결과를 받지 못했습니다.', #{panel_id})")
          end
        rescue StandardError => e
          puts "[NanoBanana] 2차 생성 에러: #{e.message}"
          @main_dialog&.execute_script("onRegenerateError('#{e.message.gsub("'", "\\'").gsub("\n", ' ')}', #{panel_id})")
        end
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

  # 미러링용 ViewObserver (스로틀 제거 - 즉각 반응)
  class MirrorViewObserver < Sketchup::ViewObserver
    def initialize(plugin)
      @plugin = plugin
      @capturing = false
    end

    def onViewChanged(view)
      return unless @plugin.mirror_active?
      return if @capturing  # 중복 캡처 방지

      @capturing = true
      @plugin.mirror_capture
      @capturing = false
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

# 플러그인 로드 시 초기화
unless file_loaded?(__FILE__)
  NanoBanana.initialize_plugin
  file_loaded(__FILE__)
end
