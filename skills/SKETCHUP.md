# SKETCHUP.md — SketchUp Ruby 플러그인 명세

---

## 역할 정의

SketchUp Ruby 플러그인은 **Source 공급자 + 결과 소비자** 역할만 수행한다.

**수행한다:**
- Viewport 이미지 캡처
- Camera/Scene 메타데이터 수집
- Vizmaker Web UI 호출
- 결과 이미지 수신 및 SketchUp 적용

**수행하지 않는다:**
- 노드 실행
- 프롬프트 처리
- AI API 호출
- DAG 관리
- 그래프 상태 관리

---

## 플러그인 디렉토리 구조

```
vizmaker_sketchup/
  vizmaker.rb            # 메인 진입점
  ui/
    toolbar.rb           # 툴바 아이콘 등록
  capture/
    camera.rb            # 카메라 메타데이터 수집
    exporter.rb          # Viewport → 이미지 내보내기
  bridge/
    rest_client.rb       # Vizmaker REST API 통신
```

---

## Viewport 캡처

```ruby
module Vizmaker
  module Capture
    def self.export_viewport(options = {})
      view = Sketchup.active_model.active_view
      path = File.join(
        Dir.tmpdir,
        "vizmaker_capture_#{Time.now.to_i}.png"
      )

      view.write_image({
        filename: path,
        width: options[:width] || 1920,
        height: options[:height] || 1080,
        antialias: true,
        compression: 0.9
      })

      path
    end
  end
end
```

---

## Camera/Scene 메타데이터

```ruby
module Vizmaker
  module Capture
    def self.collect_metadata
      model = Sketchup.active_model
      view = model.active_view
      camera = view.camera

      {
        camera: {
          eye: camera.eye.to_a,
          target: camera.target.to_a,
          up: camera.up.to_a,
          fov: camera.fov,
          perspective: camera.perspective?,
          aspectRatio: camera.aspect_ratio
        },
        scene: {
          modelName: File.basename(model.path, ".skp"),
          sceneId: model.pages.selected_page&.name,
          style: model.styles.active_style.name,
          shadow: model.shadow_info["DisplayShadows"],
          shadowTime: model.shadow_info["ShadowTime"].to_s
        },
        rendering: {
          edgeDisplay: model.rendering_options["EdgeDisplayMode"],
          faceStyle: model.rendering_options["FaceStyle"],
          backgroundColor: model.rendering_options["BackgroundColor"].to_a
        }
      }
    end
  end
end
```

---

## Vizmaker 전송 데이터 포맷

```ruby
module Vizmaker
  module Bridge
    def self.send_to_vizmaker
      image_path = Capture.export_viewport
      meta = Capture.collect_metadata

      payload = {
        source: "sketchup",
        image: Base64.strict_encode64(File.binread(image_path)),
        meta: meta,
        timestamp: Time.now.iso8601
      }.to_json

      uri = URI("https://vizmaker.app/api/source")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true

      request = Net::HTTP::Post.new(uri)
      request.body = payload
      request.content_type = "application/json"

      response = http.request(request)

      if response.code == "200"
        result = JSON.parse(response.body)
        UI.openURL(result["editorUrl"])
      else
        UI.messagebox("전송 실패: #{response.code}")
      end
    end
  end
end
```

---

## 수신 JSON 구조 (Vizmaker → SketchUp)

```json
{
  "source": "sketchup",
  "image": "<base64>",
  "meta": {
    "camera": {
      "eye": [10.5, 3.2, -5.1],
      "target": [0, 1.5, 0],
      "up": [0, 1, 0],
      "fov": 35,
      "perspective": true,
      "aspectRatio": 1.778
    },
    "scene": {
      "modelName": "Interior_v5",
      "sceneId": "Scene_03",
      "style": "Default",
      "shadow": true,
      "shadowTime": "2025-06-15 14:00:00"
    },
    "rendering": {
      "edgeDisplay": 1,
      "faceStyle": 2,
      "backgroundColor": [255, 255, 255]
    }
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

이 JSON이 Vizmaker에 도착하면 Source 노드가 자동 생성된다:
- `origin: "sketchup"`
- `cameraLocked: true`
- `sceneMeta`에 위 meta 전체 저장

---

## 결과 수신

```ruby
module Vizmaker
  module Bridge
    def self.fetch_result(job_id)
      uri = URI("https://vizmaker.app/api/result/#{job_id}")
      response = Net::HTTP.get_response(uri)

      if response.code == "200"
        result = JSON.parse(response.body)
        image_data = Base64.decode64(result["image"])
        path = File.join(Dir.tmpdir, "vizmaker_result.png")
        File.binwrite(path, image_data)
        path
      else
        nil
      end
    end
  end
end
```

---

## 툴바 등록

```ruby
module Vizmaker
  module UI
    def self.register_toolbar
      cmd_send = ::UI::Command.new("Send to Vizmaker") {
        Bridge.send_to_vizmaker
      }
      cmd_send.tooltip = "Send current view to Vizmaker"
      cmd_send.small_icon = File.join(__dir__, "icons", "send_16.png")
      cmd_send.large_icon = File.join(__dir__, "icons", "send_24.png")

      cmd_refresh = ::UI::Command.new("Refresh Result") {
        Bridge.fetch_latest_result
      }
      cmd_refresh.tooltip = "Get latest render result"

      toolbar = ::UI::Toolbar.new("Vizmaker")
      toolbar.add_item(cmd_send)
      toolbar.add_item(cmd_refresh)
      toolbar.show
    end
  end
end
```

---

## 메뉴 등록

```ruby
extensions_menu = UI.menu("Extensions")
vizmaker_menu = extensions_menu.add_submenu("Vizmaker")
vizmaker_menu.add_item("Open Vizmaker") { Vizmaker::Bridge.send_to_vizmaker }
vizmaker_menu.add_item("Refresh Result") { Vizmaker::Bridge.fetch_latest_result }
```

---

## 웹 앱 연동 흐름

```
1. 사용자가 SketchUp 툴바의 "Send to Vizmaker" 클릭
2. Ruby → Viewport 캡처 + 메타데이터 수집
3. Ruby → REST POST로 Vizmaker API에 전송
4. Vizmaker API → Source 노드 자동 생성
5. Ruby → 브라우저에서 Vizmaker Web UI 오픈 (editorUrl)
6. 사용자가 Web UI에서 노드 구성 + Make 실행
7. 결과 확인 후 필요 시 Ruby에서 결과 이미지 fetch
```
