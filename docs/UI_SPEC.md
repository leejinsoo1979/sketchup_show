# NanoBanana UI 컴포넌트 명세

## 1. UI 개요

### 1.1 다이얼로그 구성

| 다이얼로그 | 파일 | 용도 |
|-----------|------|------|
| 메인 | main_dialog.html | 렌더링, 결과 표시 |
| 설정 | settings_dialog.html | API Key 관리 |
| 편집 | editor_dialog.html | 이미지 보정 |
| 배치 | hotspot_dialog.html | 오브젝트 배치 |

### 1.2 기술 스택

- HTML5 + CSS3 + Vanilla JavaScript
- SketchUp HtmlDialog API
- Canvas API (이미지 처리)

---

## 2. 메인 다이얼로그 (main_dialog.html)

### 2.1 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  NanoBanana Renderer                              [설정] [닫기] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │                    [이미지 미리보기]                       │ │
│  │                       (캔버스)                            │ │
│  │                                                           │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  스타일 프롬프트:                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Modern interior, warm natural lighting, photorealistic    │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [프리셋 ▼]                                                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  조명 설정:                                                     │
│  시간대:  [☀️ 낮] [🌅 저녁] [🌙 밤]                             │
│  조명:    [💡 ON] [⚫ OFF]                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [📷 씬 캡처]  [🎨 렌더링]  [✏️ 보정]  [📦 배치]  [💾 저장]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 HTML 구조

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>NanoBanana Renderer</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <!-- 헤더 -->
  <header class="header">
    <h1>NanoBanana Renderer</h1>
    <div class="header-buttons">
      <button id="btn-settings" class="icon-btn" title="설정">⚙️</button>
      <button id="btn-close" class="icon-btn" title="닫기">✕</button>
    </div>
  </header>

  <!-- 이미지 미리보기 -->
  <section class="preview-section">
    <div class="canvas-container">
      <canvas id="preview-canvas"></canvas>
      <div id="loading-overlay" class="hidden">
        <div class="spinner"></div>
        <span>렌더링 중...</span>
      </div>
      <div id="empty-state">
        <p>씬을 캡처하여 시작하세요</p>
      </div>
    </div>
  </section>

  <!-- 프롬프트 입력 -->
  <section class="prompt-section">
    <label for="style-prompt">스타일 프롬프트:</label>
    <textarea id="style-prompt" rows="3" placeholder="Modern interior, warm natural lighting..."></textarea>
    <div class="preset-dropdown">
      <select id="preset-select">
        <option value="">프리셋 선택...</option>
        <option value="modern">모던 인테리어</option>
        <option value="scandinavian">스칸디나비안</option>
        <option value="industrial">인더스트리얼</option>
        <option value="minimal">미니멀</option>
        <option value="luxury">럭셔리</option>
      </select>
    </div>
  </section>

  <!-- 조명 설정 -->
  <section class="lighting-section">
    <div class="lighting-group">
      <label>시간대:</label>
      <div class="btn-group">
        <button id="btn-day" class="lighting-btn active" data-mode="day">☀️ 낮</button>
        <button id="btn-evening" class="lighting-btn" data-mode="evening">🌅 저녁</button>
        <button id="btn-night" class="lighting-btn" data-mode="night">🌙 밤</button>
      </div>
    </div>
    <div class="lighting-group">
      <label>조명:</label>
      <div class="btn-group">
        <button id="btn-lights-on" class="lighting-btn" data-mode="lights_on">💡 ON</button>
        <button id="btn-lights-off" class="lighting-btn" data-mode="lights_off">⚫ OFF</button>
      </div>
    </div>
  </section>

  <!-- 액션 버튼 -->
  <section class="action-section">
    <button id="btn-capture" class="action-btn primary">📷 씬 캡처</button>
    <button id="btn-render" class="action-btn primary" disabled>🎨 렌더링</button>
    <button id="btn-adjust" class="action-btn" disabled>✏️ 보정</button>
    <button id="btn-place" class="action-btn" disabled>📦 배치</button>
    <button id="btn-save" class="action-btn" disabled>💾 저장</button>
  </section>

  <!-- 상태 메시지 -->
  <footer class="status-bar">
    <span id="status-message">준비됨</span>
  </footer>

  <script src="scripts/main.js"></script>
</body>
</html>
```

### 2.3 JavaScript 인터페이스

```javascript
// Ruby ↔ JavaScript 통신

// Ruby → JavaScript 콜백
function onCaptureComplete(imageBase64) {
  // 캡처 완료 시 이미지 표시
}

function onRenderComplete(imageBase64) {
  // 렌더링 완료 시 결과 표시
}

function onRenderError(errorMessage) {
  // 에러 표시
}

function onRenderProgress(progress) {
  // 진행률 업데이트 (0-100)
}

// JavaScript → Ruby 호출
function captureScene() {
  sketchup.captureScene();
}

function startRender(prompt) {
  sketchup.startRender(prompt);
}

function changeLighting(mode) {
  sketchup.changeLighting(mode);
}

function saveImage(filename) {
  sketchup.saveImage(filename);
}

function openSettings() {
  sketchup.openSettings();
}

function openEditor(imageBase64) {
  sketchup.openEditor(imageBase64);
}

function openHotspotDialog(imageBase64) {
  sketchup.openHotspotDialog(imageBase64);
}
```

---

## 3. 설정 다이얼로그 (settings_dialog.html)

### 3.1 레이아웃

```
┌─────────────────────────────────────────────┐
│  설정                              [닫기]   │
├─────────────────────────────────────────────┤
│                                             │
│  API Key:                                   │
│  ┌───────────────────────────────────────┐ │
│  │ ••••••••••••••••••••••••              │ │
│  └───────────────────────────────────────┘ │
│  [👁️ 보기]                                  │
│                                             │
│  상태: ✅ 연결됨                            │
│                                             │
│  [연결 테스트]                              │
│                                             │
├─────────────────────────────────────────────┤
│  출력 설정:                                 │
│                                             │
│  해상도:  [1920x1080 ▼]                    │
│  품질:    [높음 ▼]                          │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│            [저장]    [취소]                 │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.2 HTML 구조

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>설정</title>
  <link rel="stylesheet" href="styles/settings.css">
</head>
<body>
  <header class="header">
    <h1>설정</h1>
    <button id="btn-close" class="icon-btn">✕</button>
  </header>

  <main class="content">
    <!-- API Key 섹션 -->
    <section class="section">
      <h2>API Key</h2>
      <div class="input-group">
        <input type="password" id="api-key-input" placeholder="Gemini API Key 입력">
        <button id="btn-toggle-visibility" class="icon-btn">👁️</button>
      </div>
      <div class="status-row">
        <span>상태:</span>
        <span id="connection-status" class="status-badge">확인 필요</span>
      </div>
      <button id="btn-test-connection" class="secondary-btn">연결 테스트</button>
    </section>

    <!-- 출력 설정 -->
    <section class="section">
      <h2>출력 설정</h2>
      <div class="form-row">
        <label for="resolution">해상도:</label>
        <select id="resolution">
          <option value="1280x720">1280 x 720 (HD)</option>
          <option value="1920x1080" selected>1920 x 1080 (Full HD)</option>
          <option value="2560x1440">2560 x 1440 (2K)</option>
          <option value="3840x2160">3840 x 2160 (4K)</option>
        </select>
      </div>
      <div class="form-row">
        <label for="quality">품질:</label>
        <select id="quality">
          <option value="low">낮음 (빠름)</option>
          <option value="medium">보통</option>
          <option value="high" selected>높음</option>
        </select>
      </div>
    </section>
  </main>

  <footer class="footer">
    <button id="btn-save" class="primary-btn">저장</button>
    <button id="btn-cancel" class="secondary-btn">취소</button>
  </footer>

  <script src="scripts/settings.js"></script>
</body>
</html>
```

---

## 4. 이미지 보정 다이얼로그 (editor_dialog.html)

### 4.1 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  이미지 보정                                           [닫기]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────┐  ┌───────────────────────┐│
│  │                                 │  │ 조정                  ││
│  │                                 │  │                       ││
│  │      [이미지 미리보기]          │  │ 온도    [──●────] +15 ││
│  │                                 │  │ 색조    [────●──]  0  ││
│  │                                 │  │ 밝기    [───●───] +10 ││
│  │                                 │  │ 대비    [───●───] +5  ││
│  │                                 │  │ 하이라이트[──●────] -10││
│  │                                 │  │ 그림자  [────●──] +20 ││
│  └─────────────────────────────────┘  │ 화이트  [────●──]  0  ││
│                                       │ 생동감  [───●───] +15 ││
│                                       │ 채도    [───●───] +10 ││
│                                       │ 선예도  [───●───] +25 ││
│                                       │                       ││
│                                       │ [초기화]              ││
│                                       └───────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    [적용]    [취소]                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 HTML 구조

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>이미지 보정</title>
  <link rel="stylesheet" href="styles/editor.css">
</head>
<body>
  <header class="header">
    <h1>이미지 보정</h1>
    <button id="btn-close" class="icon-btn">✕</button>
  </header>

  <main class="content">
    <div class="preview-panel">
      <canvas id="editor-canvas"></canvas>
    </div>

    <div class="controls-panel">
      <h2>조정</h2>

      <div class="slider-group">
        <label>온도</label>
        <input type="range" id="slider-temperature" min="-100" max="100" value="0">
        <span class="value" id="value-temperature">0</span>
      </div>

      <div class="slider-group">
        <label>색조</label>
        <input type="range" id="slider-tint" min="-100" max="100" value="0">
        <span class="value" id="value-tint">0</span>
      </div>

      <div class="slider-group">
        <label>밝기</label>
        <input type="range" id="slider-brightness" min="-100" max="100" value="0">
        <span class="value" id="value-brightness">0</span>
      </div>

      <div class="slider-group">
        <label>대비</label>
        <input type="range" id="slider-contrast" min="-100" max="100" value="0">
        <span class="value" id="value-contrast">0</span>
      </div>

      <div class="slider-group">
        <label>하이라이트</label>
        <input type="range" id="slider-highlights" min="-100" max="100" value="0">
        <span class="value" id="value-highlights">0</span>
      </div>

      <div class="slider-group">
        <label>그림자</label>
        <input type="range" id="slider-shadows" min="-100" max="100" value="0">
        <span class="value" id="value-shadows">0</span>
      </div>

      <div class="slider-group">
        <label>화이트</label>
        <input type="range" id="slider-whites" min="-100" max="100" value="0">
        <span class="value" id="value-whites">0</span>
      </div>

      <div class="slider-group">
        <label>생동감</label>
        <input type="range" id="slider-vibrance" min="-100" max="100" value="0">
        <span class="value" id="value-vibrance">0</span>
      </div>

      <div class="slider-group">
        <label>채도</label>
        <input type="range" id="slider-saturation" min="-100" max="100" value="0">
        <span class="value" id="value-saturation">0</span>
      </div>

      <div class="slider-group">
        <label>선예도</label>
        <input type="range" id="slider-sharpness" min="0" max="100" value="0">
        <span class="value" id="value-sharpness">0</span>
      </div>

      <button id="btn-reset" class="secondary-btn">초기화</button>
    </div>
  </main>

  <footer class="footer">
    <button id="btn-apply" class="primary-btn">적용</button>
    <button id="btn-cancel" class="secondary-btn">취소</button>
  </footer>

  <script src="scripts/editor.js"></script>
</body>
</html>
```

---

## 5. 핫스팟 배치 다이얼로그 (hotspot_dialog.html)

### 5.1 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  오브젝트 배치                                         [닫기]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │              [이미지 + 핫스팟 표시]                        │ │
│  │                                                           │ │
│  │                    (+)                                    │ │
│  │                              (+)                          │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 배치된 오브젝트                                           │ │
│  │ ┌─────────────────────────────────────────────────────┐   │ │
│  │ │ [🪑] 암체어       [스케일: ===●===] 100%  [삭제]    │   │ │
│  │ │ [💡] 플로어램프   [스케일: ====●==] 120%  [삭제]    │   │ │
│  │ └─────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [+ 라이브러리에서 추가]    [+ 이미지 업로드]                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│              [재생성]    [취소]                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 HTML 구조

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>오브젝트 배치</title>
  <link rel="stylesheet" href="styles/hotspot.css">
</head>
<body>
  <header class="header">
    <h1>오브젝트 배치</h1>
    <button id="btn-close" class="icon-btn">✕</button>
  </header>

  <main class="content">
    <!-- 이미지 + 핫스팟 영역 -->
    <section class="canvas-section">
      <div class="canvas-wrapper">
        <canvas id="hotspot-canvas"></canvas>
        <div id="instruction-overlay">
          이미지를 클릭하여 오브젝트를 배치할 위치를 선택하세요
        </div>
      </div>
    </section>

    <!-- 배치된 오브젝트 목록 -->
    <section class="objects-section">
      <h2>배치된 오브젝트</h2>
      <div id="objects-list" class="objects-list">
        <!-- 동적으로 추가됨 -->
        <div class="empty-message">배치된 오브젝트가 없습니다</div>
      </div>
    </section>

    <!-- 추가 버튼 -->
    <section class="add-section">
      <button id="btn-add-library" class="add-btn">
        <span class="icon">📚</span>
        라이브러리에서 추가
      </button>
      <button id="btn-add-upload" class="add-btn">
        <span class="icon">📤</span>
        이미지 업로드
      </button>
      <input type="file" id="file-input" accept="image/png,image/jpeg" hidden>
    </section>
  </main>

  <footer class="footer">
    <button id="btn-regenerate" class="primary-btn" disabled>재생성</button>
    <button id="btn-cancel" class="secondary-btn">취소</button>
  </footer>

  <!-- 라이브러리 모달 -->
  <div id="library-modal" class="modal hidden">
    <div class="modal-content">
      <header class="modal-header">
        <h2>오브젝트 라이브러리</h2>
        <button class="modal-close">✕</button>
      </header>
      <div class="library-grid" id="library-grid">
        <!-- 동적으로 채워짐 -->
      </div>
    </div>
  </div>

  <script src="scripts/hotspot.js"></script>
</body>
</html>
```

### 5.3 오브젝트 아이템 템플릿

```html
<!-- 동적으로 생성되는 오브젝트 아이템 -->
<div class="object-item" data-id="{id}">
  <div class="object-preview">
    <img src="data:image/png;base64,{thumbnail}" alt="{name}">
  </div>
  <div class="object-info">
    <span class="object-name">{name}</span>
    <div class="scale-control">
      <label>스케일:</label>
      <input type="range" class="scale-slider" min="10" max="200" value="100">
      <span class="scale-value">100%</span>
    </div>
  </div>
  <button class="delete-btn" title="삭제">🗑️</button>
</div>
```

---

## 6. 공통 스타일 (styles/common.css)

```css
/* 공통 변수 */
:root {
  --primary-color: #4A90D9;
  --primary-hover: #357ABD;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;

  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-dark: #343a40;

  --text-primary: #212529;
  --text-secondary: #6c757d;
  --text-light: #ffffff;

  --border-color: #dee2e6;
  --border-radius: 6px;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

  --transition: all 0.2s ease;
}

/* 기본 스타일 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-primary);
  line-height: 1.5;
}

/* 버튼 */
.primary-btn {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: var(--transition);
}

.primary-btn:hover {
  background: var(--primary-hover);
}

.primary-btn:disabled {
  background: var(--secondary-color);
  cursor: not-allowed;
  opacity: 0.6;
}

.secondary-btn {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 10px 20px;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 14px;
  transition: var(--transition);
}

.secondary-btn:hover {
  background: var(--border-color);
}

.icon-btn {
  background: transparent;
  border: none;
  padding: 8px;
  cursor: pointer;
  font-size: 16px;
  border-radius: var(--border-radius);
  transition: var(--transition);
}

.icon-btn:hover {
  background: var(--bg-secondary);
}

/* 입력 필드 */
input[type="text"],
input[type="password"],
textarea,
select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-size: 14px;
  transition: var(--transition);
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

/* 슬라이더 */
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  border-radius: 50%;
  cursor: pointer;
  transition: var(--transition);
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* 상태 배지 */
.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.success {
  background: rgba(40, 167, 69, 0.1);
  color: var(--success-color);
}

.status-badge.error {
  background: rgba(220, 53, 69, 0.1);
  color: var(--danger-color);
}

.status-badge.warning {
  background: rgba(255, 193, 7, 0.1);
  color: var(--warning-color);
}

/* 로딩 스피너 */
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--bg-secondary);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 유틸리티 */
.hidden {
  display: none !important;
}

.text-center {
  text-align: center;
}

.mt-1 { margin-top: 8px; }
.mt-2 { margin-top: 16px; }
.mt-3 { margin-top: 24px; }
.mb-1 { margin-bottom: 8px; }
.mb-2 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 24px; }
```

---

## 7. Ruby-JavaScript 통신 규약

### 7.1 Ruby → JavaScript

```ruby
# Ruby에서 JavaScript 함수 호출
dialog.execute_script("onCaptureComplete('#{image_base64}')")
dialog.execute_script("onRenderComplete('#{result_base64}')")
dialog.execute_script("onRenderError('#{error_message}')")
dialog.execute_script("onRenderProgress(#{progress})")
dialog.execute_script("onConnectionStatus(#{connected})")
```

### 7.2 JavaScript → Ruby

```javascript
// JavaScript에서 Ruby 콜백 호출
window.sketchup = {
  captureScene: function() {
    window.location = 'skp:capture_scene';
  },
  startRender: function(prompt) {
    window.location = 'skp:start_render@' + encodeURIComponent(prompt);
  },
  changeLighting: function(mode) {
    window.location = 'skp:change_lighting@' + mode;
  },
  saveImage: function(filename) {
    window.location = 'skp:save_image@' + encodeURIComponent(filename);
  },
  saveApiKey: function(key) {
    window.location = 'skp:save_api_key@' + encodeURIComponent(key);
  },
  testConnection: function() {
    window.location = 'skp:test_connection';
  },
  addHotspot: function(x, y, imageBase64, name) {
    var data = JSON.stringify({x: x, y: y, image: imageBase64, name: name});
    window.location = 'skp:add_hotspot@' + encodeURIComponent(data);
  },
  regenerateWithHotspots: function() {
    window.location = 'skp:regenerate_with_hotspots';
  }
};
```

### 7.3 Ruby 콜백 등록

```ruby
dialog.add_action_callback("capture_scene") do |action_context|
  # 씬 캡처 처리
end

dialog.add_action_callback("start_render") do |action_context, prompt|
  # 렌더링 시작
end

dialog.add_action_callback("change_lighting") do |action_context, mode|
  # 조명 변경
end

dialog.add_action_callback("save_image") do |action_context, filename|
  # 이미지 저장
end
```
