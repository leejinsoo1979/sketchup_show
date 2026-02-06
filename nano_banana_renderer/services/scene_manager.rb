# frozen_string_literal: true

# NanoBanana Renderer - 씬(페이지) 관리
# 씬 목록, 전환, 추가, PagesObserver

module NanoBanana
  class << self
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
  end
end
