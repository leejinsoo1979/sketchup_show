# frozen_string_literal: true

# NanoBanana Renderer - 웹 동기화
# 로컬 WEBrick 서버, 동기화 기능

module NanoBanana
  class << self
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

      # 브릿지 명령 큐 (WEBrick 스레드에서 push, 메인 스레드 타이머에서 실행)
      # WEBrick 핸들러에서 SketchUp API를 직접 호출하면 안 된다.
      @bridge_commands = []
      @bridge_mutex = Mutex.new
      @bridge_scenes_body = { scenes: [], timestamp: 0 }.to_json

      cors = proc do |res|
        res['Access-Control-Allow-Origin'] = '*'
        res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        res['Access-Control-Allow-Headers'] = 'Content-Type'
        # Chrome PNA/LNA: 공개 https 사이트(Vercel 배포)에서 localhost 브릿지 접근 허용
        res['Access-Control-Allow-Private-Network'] = 'true'
        res['Content-Type'] = 'application/json'
      end

      @local_server_thread = Thread.new do
        begin
          @local_server = WEBrick::HTTPServer.new(
            Port: @local_port,
            BindAddress: '0.0.0.0',
            Logger: WEBrick::Log.new(File::NULL), # /dev/null 하드코딩은 Windows에서 서버 기동 실패
            AccessLog: []
          )

          # 현재 캡처 데이터
          @local_server.mount_proc '/api/data' do |req, res|
            cors.call(res)
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

          # 상태 확인
          @local_server.mount_proc '/api/ping' do |_req, res|
            cors.call(res)
            res.body = {
              status: 'ok', app: 'VizMaker Bridge',
              ip: local_ip, port: @local_port,
              sketchup: Sketchup.version
            }.to_json
          end

          # API Key 자동 전달 (신뢰된 출처만: 우리 앱/사이트)
          # 사용자가 앱에 키를 다시 입력할 필요를 없앤다
          @local_server.mount_proc '/api/apikey' do |req, res|
            origin = req['Origin'].to_s
            trusted = origin.empty? ||
                      origin == 'null' ||
                      origin.start_with?('http://localhost') ||
                      origin.start_with?('http://127.0.0.1') ||
                      origin == 'https://hyper-real-3vvh.vercel.app'
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif trusted
              key = @config_store&.load_api_key
              res.body = { apiKey: key || '' }.to_json
            else
              res.status = 403
              res.body = { apiKey: '', error: 'origin not allowed' }.to_json
            end
          end

          # 씬 목록 (메인 스레드가 갱신한 캐시를 그대로 반환)
          @local_server.mount_proc '/api/scenes' do |_req, res|
            cors.call(res)
            res.body = @bridge_scenes_body
          end

          # 앱 → SketchUp 명령 (씬 전환, 카메라, 즉시 캡처)
          @local_server.mount_proc '/api/command' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif req.request_method == 'POST'
              begin
                cmd = JSON.parse(req.body.to_s)
                @bridge_mutex.synchronize { @bridge_commands << cmd }
                res.body = { accepted: true }.to_json
              rescue JSON::ParserError
                res.status = 400
                res.body = { accepted: false, error: 'invalid json' }.to_json
              end
            else
              res.status = 405
              res.body = { accepted: false, error: 'POST only' }.to_json
            end
          end

          # 앱 → SketchUp 렌더 결과 수신
          @local_server.mount_proc '/api/result' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif req.request_method == 'POST'
              begin
                data = JSON.parse(req.body.to_s)
                @web_received_result = data['image']
                puts "[NanoBanana] 브릿지: 렌더 결과 수신 (node=#{data['nodeId']})"
                res.body = { received: true }.to_json
              rescue JSON::ParserError
                res.status = 400
                res.body = { received: false, error: 'invalid json' }.to_json
              end
            else
              res.status = 405
              res.body = { received: false, error: 'POST only' }.to_json
            end
          end

          puts "[NanoBanana] 로컬 서버 시작: http://#{local_ip}:#{@local_port}"
          @local_server.start
        rescue StandardError => e
          puts "[NanoBanana] 로컬 서버 에러: #{e.message}"
        end
      end

      # 캡처 + 씬 목록 캐시 타이머 (1초마다, 메인 스레드)
      @web_sync_timer = UI.start_timer(1, true) do
        if @local_server
          capture_current_view
          update_bridge_scenes
        end
      end

      # 명령 처리 타이머 (0.3초마다, 메인 스레드 — 씬 전환 반응성 확보)
      @bridge_command_timer = UI.start_timer(0.3, true) do
        process_bridge_commands if @local_server
      end

      "#{local_ip}:#{@local_port}"
    end

    # 앱에서 보낸 명령을 메인 스레드에서 실행
    def process_bridge_commands
      cmds = @bridge_mutex.synchronize do
        list = @bridge_commands.dup
        @bridge_commands.clear
        list
      end

      cmds.each do |cmd|
        begin
          case cmd['type']
          when 'select_scene'
            pages = Sketchup.active_model.pages
            page = pages[cmd['name'].to_s]
            if page
              pages.selected_page = page
              Sketchup.active_model.active_view.invalidate
              puts "[NanoBanana] 브릿지: 씬 전환 -> #{cmd['name']}"
              capture_current_view
              update_bridge_scenes
            end
          when 'camera'
            case cmd['action']
            when 'move' then camera_move(cmd['value'].to_s)
            when 'rotate' then camera_rotate(cmd['value'].to_s)
            when 'height' then camera_set_height(cmd['value'].to_s)
            when 'fov' then camera_set_fov(cmd['value'].to_s)
            when 'two_point' then apply_two_point_perspective
            end
            capture_current_view
          when 'capture'
            capture_current_view
          end
        rescue StandardError => e
          puts "[NanoBanana] 브릿지 명령 에러(#{cmd['type']}): #{e.message}"
        end
      end
    end

    # 씬 목록 캐시 갱신 (메인 스레드 전용)
    def update_bridge_scenes
      model = Sketchup.active_model
      return unless model

      pages = model.pages
      selected = pages.selected_page&.name
      scenes = pages.map { |p| { name: p.name, active: p.name == selected } }
      @bridge_scenes_body = { scenes: scenes, timestamp: Time.now.to_i }.to_json
    rescue StandardError => e
      puts "[NanoBanana] 씬 캐시 에러: #{e.message}"
    end

    def stop_local_server
      if @bridge_command_timer
        UI.stop_timer(@bridge_command_timer)
        @bridge_command_timer = nil
      end

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
        temp_path = File.join(Dir.tmpdir, 'nanobanana_live.png')
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
  end
end
