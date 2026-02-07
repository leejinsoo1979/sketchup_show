# SKETCHUP.md — SketchUp Ruby 플러그인 연동 명세

---

## 역할 정의

SketchUp Ruby 플러그인은 **Source 공급자 + 결과 소비자** 역할만 수행한다.

**수행한다:**
- Viewport 이미지 캡처 (Edge OFF 처리 포함)
- Camera/Scene 메타데이터 수집
- AI API 호출 (Gemini / Replicate)
- HtmlDialog 내부에서 노드 에디터 UI 호스팅
- 청크 기반 이미지 전송 (HtmlDialog 크래시 방지)
- 결과 이미지 저장 및 히스토리 관리

**수행하지 않는다:**
- DAG 실행 (JS 측에서 처리)
- 그래프 상태 관리 (JS 측에서 처리)
- 노드 레이아웃/렌더링 (JS 측에서 처리)

---

## 플러그인 디렉토리 구조

```
nano_banana_renderer/
  main.rb                          # 진입점, HtmlDialog 생성, 콜백 등록, 전역 상태
  services/
    scene_exporter.rb              # Viewport → PNG 추출, 씬 정보 수집
    api_client.rb                  # Gemini API 통신 (재시도 로직, 에러 클래스)
    replicate_client.rb            # Replicate API 통신 (ControlNet)
    prompt_engine.rb               # 3-Layer 프롬프트 시스템
    prompt_builder.rb              # 프롬프트 조합
    config_store.rb                # API Key AES-256 암호화 저장/로드
    render_engine.rb               # 렌더링 실행 (동기 + 병렬 Thread)
    image_manager.rb               # 이미지 저장, 히스토리, 2차 생성
    camera_control.rb              # 카메라 이동/회전/FOV/높이 제어
    camera_tool.rb                 # SketchUp Tool 인터페이스
    scene_manager.rb               # 씬(페이지) 목록, 전환, 추가
    settings_manager.rb            # API Key/모델/엔진 설정 관리
    secondary_dialogs.rb           # 보조 다이얼로그 (에디터, 핫스팟 등)
    mix_engine.rb                  # 이미지 믹싱 처리
    hotspot_manager.rb             # 오브젝트 배치 관리
    web_sync.rb                    # 외부 웹 동기화 (Vercel)
  ui/
    main_dialog.html               # 메인 UI (노드 에디터 포함)
    settings_dialog.html           # API Key 설정 다이얼로그
    editor_dialog.html             # 이미지 보정 다이얼로그
    hotspot_dialog.html            # 오브젝트 배치 다이얼로그
    mix_dialog.html                # 이미지 믹싱 다이얼로그
    prompt_dialog.html             # 프롬프트 편집 다이얼로그
    scripts/
      core.js                     # 공통 유틸리티
      node-presets.js              # 프리셋 데이터
      node-editor.js               # 노드 에디터 코어
      render-mode.js               # 렌더 모드 로직
      mix-mode.js                  # 모드 믹싱
      node-types-ext.js            # 확장 노드 타입
      node-inspector-ext.js        # 확장 인스펙터
    styles/
      common.css                   # 공통 스타일
      main-base.css                # 메인 기본 스타일
      main-render.css              # 렌더 모드 스타일
      main-mix.css                 # 믹스 모드 스타일
      main-node-editor.css         # 노드 에디터 CSS
```

---

## 통신 아키텍처

노드 에디터는 SketchUp의 **HtmlDialog (Chromium 88 CEF)** 내부에서 실행된다.
별도의 REST API, WebSocket, 외부 브라우저를 사용하지 않는다.

### 통신 방식

| 방향 | 메커니즘 | 예시 |
|------|----------|------|
| Ruby → JS | `dialog.execute_script("functionName(data)")` | `onRenderComplete(base64, sceneName)` |
| JS → Ruby | `window.sketchup.callbackName(args)` | `sketchup.capture_scene('1024')` |
| 콜백 등록 | `dialog.add_action_callback("name") { \|ctx, args\| ... }` | `add_action_callback('start_render')` |

### 대용량 데이터 전송 제약

`execute_script()`로 큰 데이터(~1MB base64)를 한 번에 전송하면 HtmlDialog가 크래시된다.

**절대 하지 말 것:**
- `execute_script()`로 500KB 이상 데이터 한 번에 전송
- Thread 내에서 직접 `execute_script()` 호출 (`UI.start_timer` 사용 필수)

---

## 대용량 데이터 전송: 30KB 청크 폴링

Ruby → JS로 이미지 등 대용량 데이터를 전송할 때는 청크 폴링 패턴을 사용한다.

### 전송 흐름

```
1. Ruby: 이미지 Base64를 30KB 청크로 분할 → @pending_chunks 배열에 저장
2. Ruby: execute_script("onChunkStart(sceneName, totalChunks)")  → JS에 전송 시작 알림
3. JS:   sketchup.getNextChunk() 콜백으로 다음 청크 요청
4. Ruby: execute_script("onChunkData(chunkData, isLast)")        → 한 청크 전송
5. JS:   10ms 딜레이 후 다음 청크 요청 반복 (setTimeout)
6. JS:   isLast === true → 모든 청크 조합 → 완성된 이미지 처리
```

### Ruby 측 참조 코드

```ruby
# main.rb 내부

# 청크 저장소
@pending_chunks = []

# 이미지를 청크로 분할하여 전송 시작
def send_image_chunked(dialog, image_base64, scene_name)
  chunk_size = 30_000  # 30KB per chunk
  chunks = image_base64.scan(/.{1,#{chunk_size}}/)
  @pending_chunks = chunks

  total = chunks.length
  dialog.execute_script("onChunkStart('#{scene_name}', #{total})")
end

# JS에서 getNextChunk 콜백이 오면 다음 청크 전송
dialog.add_action_callback('getNextChunk') do |_ctx|
  if @pending_chunks && !@pending_chunks.empty?
    chunk = @pending_chunks.shift
    is_last = @pending_chunks.empty? ? 'true' : 'false'
    dialog.execute_script("onChunkData('#{chunk}', #{is_last})")
  end
end
```

### JS 측 참조 코드

```javascript
// main_dialog.html 내부

var chunkBuffer = '';
var totalChunks = 0;
var receivedChunks = 0;

function onChunkStart(sceneName, total) {
  chunkBuffer = '';
  totalChunks = total;
  receivedChunks = 0;
  // 프로그레스 표시 시작
}

function onChunkData(data, isLast) {
  chunkBuffer += data;
  receivedChunks++;

  if (isLast) {
    // 전체 이미지 조합 완료 → Source 노드에 로드
    var fullBase64 = chunkBuffer;
    chunkBuffer = '';
    handleImageReceived(fullBase64);
  } else {
    // 10ms 후 다음 청크 요청
    setTimeout(function() {
      sketchup.getNextChunk();
    }, 10);
  }
}
```

---

## Viewport 캡처

```ruby
module NanoBanana
  class SceneExporter
    DEFAULT_WIDTH = 1920
    DEFAULT_HEIGHT = 1080

    def initialize
      @model = Sketchup.active_model
      @view = @model.active_view
    end

    def export_current_view(options = {})
      width = options[:width] || DEFAULT_WIDTH
      height = options[:height] || DEFAULT_HEIGHT
      antialias = options.fetch(:antialias, true)
      transparent = options.fetch(:transparent, false)

      original_state = save_render_state

      begin
        prepare_scene_for_export

        temp_file = Tempfile.new(['nanobanana_export', '.png'])
        temp_path = temp_file.path
        temp_file.close

        export_options = {
          filename: temp_path,
          width: width,
          height: height,
          antialias: antialias,
          transparent: transparent
        }

        success = @view.write_image(export_options)
        raise "이미지 내보내기에 실패했습니다." unless success

        image_data = File.binread(temp_path)
        base64_image = Base64.strict_encode64(image_data)
        scene_info = collect_scene_info

        {
          image: base64_image,
          scene_info: scene_info,
          width: width,
          height: height
        }
      ensure
        restore_render_state(original_state)
        File.delete(temp_path) if File.exist?(temp_path)
      end
    end
  end
end
```

### 캡처 시 Edge OFF 처리

`render_engine.rb`의 `capture_scene` 메서드는 캡처 전 Edge(윤곽선)를 끈다.
AI가 3D 모델의 Edge를 인식하면 결과물 품질이 떨어지기 때문이다.

```ruby
# 캡처 전
rendering_options["DrawEdges"] = false
rendering_options["DrawProfileEdges"] = false
rendering_options["DrawDepthQue"] = false
rendering_options["ExtendLines"] = false

# 캡처 실행
view.write_image(keys)

# 캡처 후 원래 설정 복원
rendering_options["DrawEdges"] = original_edges
# ... 나머지 복원
```

### HtmlDialog 콜백에서 캡처 호출

```ruby
# main.rb - 콜백 등록
dialog.add_action_callback('capture_scene') do |_ctx, json_args|
  args = parse_json_args(json_args)
  size = args[0] || '1024'
  capture_scene(size)
end
```

```javascript
// JS에서 호출
sketchup.capture_scene('1024');
// → Ruby에서 캡처 실행 → onCaptureComplete(base64, 0) 콜백으로 결과 반환
```

---

## Camera/Scene 메타데이터

```ruby
module NanoBanana
  class SceneExporter
    def collect_scene_info
      camera = @view.camera

      {
        camera_position: point_to_array(camera.eye),
        camera_target: point_to_array(camera.target),
        camera_up: vector_to_array(camera.up),
        fov: camera.fov,
        aspect_ratio: camera.aspect_ratio,
        perspective: camera.perspective?,

        scene_name: current_scene_name,
        tags: collect_tags,
        materials: collect_materials,

        model_name: @model.name,
        model_path: @model.path,

        style_name: @model.styles.active_style&.name,
        shadow_enabled: @model.shadow_info['DisplayShadows'],

        space_type: detect_space_type,
        estimated_room_size: estimate_room_size
      }
    end
  end
end
```

이 메타데이터는 캡처 이미지와 함께 JS에 전달되어 Source 노드의 `sceneMeta`에 저장된다.

---

## 등록된 콜백 목록 (main.rb)

노드 에디터에서 Ruby 기능을 호출할 때 사용하는 콜백 목록이다.

### 씬 캡처/제어

| 콜백 이름 | 방향 | 용도 |
|-----------|------|------|
| `capture_scene` | JS → Ruby | Viewport 이미지 캡처 |
| `get_scenes` | JS → Ruby | 씬(페이지) 목록 요청 |
| `select_scene` | JS → Ruby | 씬 전환 |
| `add_scene` | JS → Ruby | 새 씬 추가 |
| `apply_2point` | JS → Ruby | 2점 투시 적용 |

### 렌더링

| 콜백 이름 | 방향 | 용도 |
|-----------|------|------|
| `start_render` | JS → Ruby | AI 렌더링 실행 (time, light, prompt, negative, renderId) |
| `regenerate` | JS → Ruby | 2차 생성 (sourceBase64, prompt, panelId) |
| `generate_auto_prompt` | JS → Ruby | Auto 프롬프트 생성 (style, time, light) |

### 카메라 제어

| 콜백 이름 | 방향 | 용도 |
|-----------|------|------|
| `cam_move` | JS → Ruby | 카메라 이동 (up/down/left/right/forward/back) |
| `cam_rotate` | JS → Ruby | 카메라 회전 (left/right/up/down) |
| `cam_height` | JS → Ruby | 카메라 높이 프리셋 |
| `cam_fov` | JS → Ruby | 카메라 FOV 프리셋 |
| `start_mirror` | JS → Ruby | 뷰포트 미러링 시작 |
| `stop_mirror` | JS → Ruby | 뷰포트 미러링 중지 |

### 설정

| 콜백 이름 | 방향 | 용도 |
|-----------|------|------|
| `save_api_key` | JS → Ruby | Gemini API Key 저장 |
| `load_api_key` | JS → Ruby | Gemini API Key 로드 |
| `save_replicate_token` | JS → Ruby | Replicate 토큰 저장 |
| `load_replicate_token` | JS → Ruby | Replicate 토큰 로드 |
| `set_engine` | JS → Ruby | 렌더 엔진 선택 (gemini/replicate) |
| `get_engine` | JS → Ruby | 현재 엔진 조회 |
| `save_model` | JS → Ruby | AI 모델명 저장 |
| `load_model` | JS → Ruby | AI 모델명 로드 |
| `test_connection` | JS → Ruby | API 연결 테스트 |
| `check_api_status` | JS → Ruby | API 상태 확인 |

### 이미지/히스토리

| 콜백 이름 | 방향 | 용도 |
|-----------|------|------|
| `save_image` | JS → Ruby | 결과 이미지 파일 저장 |
| `save_history` | JS → Ruby | 히스토리 JSON 저장 |
| `load_history` | JS → Ruby | 히스토리 JSON 로드 |
| `getNextChunk` | JS → Ruby | 다음 청크 데이터 요청 |

### Ruby → JS 콜백 (execute_script)

| 함수 이름 | 방향 | 용도 |
|-----------|------|------|
| `onCaptureComplete(base64, index)` | Ruby → JS | 캡처 완료 |
| `onCaptureError(message)` | Ruby → JS | 캡처 에러 |
| `onRenderStart(sceneName)` | Ruby → JS | 렌더링 시작 알림 |
| `onRenderComplete(base64, sceneName)` | Ruby → JS | 렌더링 결과 전달 |
| `onRenderError(message, sceneName)` | Ruby → JS | 렌더링 에러 |
| `onNodeRenderComplete(renderId, base64)` | Ruby → JS | 병렬 렌더링 결과 (노드 에디터용) |
| `onNodeRenderError(renderId, message)` | Ruby → JS | 병렬 렌더링 에러 (노드 에디터용) |
| `onChunkStart(sceneName, totalChunks)` | Ruby → JS | 청크 전송 시작 |
| `onChunkData(data, isLast)` | Ruby → JS | 청크 데이터 전달 |
| `onConvertComplete(prompt)` | Ruby → JS | 씬 분석/변환 완료 |
| `onConvertError(message)` | Ruby → JS | 씬 분석/변환 에러 |
| `onRegenerateComplete(base64, panelId)` | Ruby → JS | 2차 생성 완료 |
| `onRegenerateError(message, panelId)` | Ruby → JS | 2차 생성 에러 |
| `onHistoryLoaded(jsonArray)` | Ruby → JS | 히스토리 데이터 로드 |
| `onEngineLoaded(engine)` | Ruby → JS | 현재 엔진 정보 |
| `setStatus(message)` | Ruby → JS | 상태바 메시지 |

---

## 노드 에디터 병렬 렌더링

노드 에디터에서 Make 버튼을 클릭하면, 각 렌더 노드는 고유한 `renderId`와 함께 `start_render` 콜백을 호출한다.
Ruby는 Thread를 사용하여 병렬로 API 호출을 실행하고, `UI.start_timer`를 통해 결과를 JS에 반환한다.

### JS → Ruby (렌더링 요청)

```javascript
// 노드 에디터에서 렌더 실행
// 5번째 인자 renderId가 있으면 병렬 렌더링 모드
sketchup.start_render(
  JSON.stringify([timePreset, lightSwitch, prompt, negativePrompt, renderId])
);
```

### Ruby 병렬 실행 (render_engine.rb)

```ruby
def start_render_parallel(time_preset, light_switch, render_id, user_prompt, user_negative)
  # Thread 시작 전에 공유 상태를 지역 변수로 복사
  render_source_image = @current_image.dup
  api_client = @api_client
  dialog = @main_dialog

  Thread.new do
    begin
      result = api_client.generate(render_source_image, prompt)

      if result && result[:image]
        # UI.start_timer로 메인 스레드에서 execute_script 호출
        UI.start_timer(0, false) {
          dialog&.execute_script("onNodeRenderComplete('#{render_id}', '#{result[:image]}')")
        }
      else
        UI.start_timer(0, false) {
          dialog&.execute_script("onNodeRenderError('#{render_id}', '결과 없음')")
        }
      end
    rescue StandardError => e
      UI.start_timer(0, false) {
        dialog&.execute_script("onNodeRenderError('#{render_id}', '#{e.message}')")
      }
    end
  end
end
```

### Ruby → JS (결과 반환)

```javascript
// 노드별 렌더링 결과 수신
function onNodeRenderComplete(renderId, base64) {
  // renderId로 해당 노드를 찾아 결과 이미지 설정
  // 노드 에디터 상태 업데이트
}

function onNodeRenderError(renderId, message) {
  // renderId로 해당 노드를 찾아 에러 상태 설정
}
```

---

## 통신 흐름도

```
[SketchUp Ruby]                    [HtmlDialog JS (노드 에디터)]
     │                                    │
     │  ── HtmlDialog 생성 ──             │
     │  dialog.set_file('main_dialog.html')
     │  register_main_callbacks(dialog)   │
     │  dialog.show                       │
     │────────────────────────────────────>│  노드 에디터 UI 로드
     │                                    │
     │  sketchup.capture_scene('1024')    │
     │<────────────────────────────────────│  씬 캡처 요청
     │                                    │
     │  [Edge OFF → write_image → Edge 복원]
     │  execute_script("onCaptureComplete(base64, 0)")
     │────────────────────────────────────>│  Source 노드에 이미지 로드
     │                                    │
     │  (대용량 이미지의 경우 청크 전송)   │
     │  execute_script("onChunkStart(name, total)")
     │────────────────────────────────────>│  청크 수신 준비
     │                                    │
     │  sketchup.getNextChunk()           │
     │<────────────────────────────────────│  다음 청크 요청
     │  execute_script("onChunkData(data, false)")
     │────────────────────────────────────>│  청크 수신 → 버퍼 축적
     │  ... (반복) ...                    │
     │  execute_script("onChunkData(data, true)")
     │────────────────────────────────────>│  마지막 청크 → 이미지 조합
     │                                    │
     │  sketchup.start_render(args)       │
     │<────────────────────────────────────│  AI 렌더링 요청
     │                                    │
     │  [Thread에서 API 호출]             │
     │  [Gemini/Replicate → 결과 수신]    │
     │                                    │
     │  UI.start_timer(0, false) {        │
     │    execute_script("onNodeRenderComplete(id, base64)")
     │  }                                 │
     │────────────────────────────────────>│  렌더링 결과 → 노드에 표시
     │                                    │
     │  sketchup.save_image(filename)     │
     │<────────────────────────────────────│  결과 이미지 저장 요청
     │                                    │
     │  [UI.savepanel → 파일 저장]        │
     │  execute_script("setStatus('Saved: ...')")
     │────────────────────────────────────>│  저장 완료 알림
```

---

## 메뉴 및 툴바 등록

```ruby
module NanoBanana
  class << self
    def register_menu
      menu = UI.menu('Extensions')
      submenu = menu.add_submenu(PLUGIN_NAME)
      submenu.add_item('루비실행') { show_main_dialog }
      submenu.add_separator
      submenu.add_item('설정') { show_settings_dialog }
    end

    def register_toolbar
      toolbar = UI::Toolbar.new(PLUGIN_NAME)

      cmd_render = UI::Command.new('렌더링') { show_main_dialog }
      cmd_render.tooltip = 'NanoBanana 렌더링 시작'
      cmd_render.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_small.png')
      cmd_render.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_large.png')
      toolbar.add_item(cmd_render)

      toolbar.show
    end
  end
end
```

---

## HtmlDialog 생성

```ruby
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

  register_main_callbacks(@main_dialog)

  @main_dialog.show
end
```

노드 에디터 UI는 `main_dialog.html` 내부에서 로드된다.
별도의 브라우저 창이나 외부 URL을 열지 않는다.

---

## Thread 안전성 규칙

SketchUp Ruby에서 Thread를 사용할 때 반드시 지켜야 할 규칙이다.

1. **Thread 내에서 `execute_script()` 직접 호출 금지**
   - 반드시 `UI.start_timer(0, false) { ... }` 로 감싸서 메인 스레드에서 실행

2. **Thread 시작 전 공유 상태 복사**
   - `@current_image`, `@api_client` 등을 지역 변수로 복사한 뒤 Thread에 전달
   - Thread 실행 중 메인 스레드에서 상태가 변경될 수 있으므로 원본 참조 금지

3. **에러 핸들링 필수**
   - Thread 내부의 모든 코드를 `begin/rescue`로 감싸야 함
   - 에러 발생 시에도 `UI.start_timer`를 통해 JS에 에러 알림 전송

```ruby
# 올바른 패턴
render_source = @current_image.dup  # 복사
api = @api_client                    # 참조 저장
dlg = @main_dialog                   # 참조 저장

Thread.new do
  begin
    result = api.generate(render_source, prompt)
    UI.start_timer(0, false) {
      dlg&.execute_script("onResult('#{result[:image]}')")
    }
  rescue => e
    UI.start_timer(0, false) {
      dlg&.execute_script("onError('#{e.message}')")
    }
  end
end
```

---

## 플러그인 배포 경로

```
~/Library/Application Support/SketchUp 2022/SketchUp/Plugins/nano_banana_renderer/
```

파일 수정 후 반드시 이 경로로 복사해야 SketchUp에서 반영된다.

---

## 히스토리 저장 위치

```
~/.sketchupshow/history.json
```

최대 500개 항목 저장. `image_manager.rb`에서 관리한다.

---

## 해상도 프리셋

`render_engine.rb`에서 사용하는 캡처 해상도 옵션이다.

| 사이즈 코드 | 해상도 | 용도 |
|------------|--------|------|
| `1024` | 1920x1080 (FHD) | 속도 우선 (기본값) |
| `1536` | 2560x1440 (2K) | 밸런스 |
| `1920` | 3840x2160 (4K) | 고품질 |

캡처된 이미지는 JPEG 85% 품질로 압축된다 (PNG 대비 70% 용량 감소).

---

## Chromium 88 CEF 제약 사항

HtmlDialog는 Chromium 88 기반이다. 최신 브라우저 기능 사용 시 호환성을 확인해야 한다.

**사용 가능:**
- ES2020 (optional chaining `?.`, nullish coalescing `??`)
- CSS Grid, Flexbox
- Canvas API
- `fetch` API
- `Promise`, `async/await`
- `var`, `let`, `const`

**사용 불가 또는 주의:**
- ES2022+ 문법 (top-level await, `Array.at()`, `structuredClone`)
- CSS Container Queries
- `import` / `export` (ES Modules) — `<script type="module">` 미지원
- `SharedArrayBuffer`, `Atomics`
- WebSocket (`wss://`) — 로컬호스트 예외 가능하나 불안정

**대응 전략:**
- 모든 JS는 전역 스코프 또는 IIFE로 작성
- 파일 분할 시 `<script src="...">` 순서로 로드
- 크로스 파일 변수 공유는 `var` 사용 (const/let은 블록 스코프이므로 파일 간 공유 불가)
