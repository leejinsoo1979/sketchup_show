/**
 * NanoBanana Main Dialog JavaScript
 */

// State
const state = {
  hasImage: false,
  isRendering: false,
  currentTimePreset: 'day',    // neutral, day, evening, night
  currentLightSwitch: 'on',    // on, off
  currentStylePreset: 'photorealistic', // photorealistic, warm_tone, cool_tone, high_contrast
  apiConnected: false
};

// DOM Elements
const elements = {
  canvas: document.getElementById('preview-canvas'),
  canvasContainer: document.getElementById('canvas-container'),
  emptyPreview: document.getElementById('empty-preview'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  stylePreset: document.getElementById('style-preset'),
  btnCapture: document.getElementById('btn-capture'),
  btnRender: document.getElementById('btn-render'),
  btnAdjust: document.getElementById('btn-adjust'),
  btnPlace: document.getElementById('btn-place'),
  btnSave: document.getElementById('btn-save'),
  btnSettings: document.getElementById('btn-settings'),
  statusMessage: document.getElementById('status-message'),
  apiStatusDot: document.getElementById('api-status-dot'),
  apiStatusText: document.getElementById('api-status-text')
};

// Canvas Context
const ctx = elements.canvas.getContext('2d');

// ========================================
// SketchUp Communication
// ========================================

window.sketchup = {
  captureScene: function() {
    window.location = 'skp:capture_scene';
  },
  // style_key: photorealistic, warm_tone, cool_tone, high_contrast
  startRender: function(styleKey) {
    window.location = 'skp:start_render@' + encodeURIComponent(styleKey || 'photorealistic');
  },
  // lighting_key: neutral, day, evening, night
  // light_switch: on, off
  changeLighting: function(lightingKey, lightSwitch) {
    window.location = 'skp:change_lighting@' + lightingKey + '@' + lightSwitch;
  },
  saveImage: function(filename) {
    window.location = 'skp:save_image@' + encodeURIComponent(filename || '');
  },
  openSettings: function() {
    window.location = 'skp:open_settings';
  },
  openEditor: function() {
    window.location = 'skp:open_editor';
  },
  openHotspot: function() {
    window.location = 'skp:open_hotspot';
  },
  checkApiStatus: function() {
    window.location = 'skp:check_api_status';
  }
};

// ========================================
// Ruby Callbacks
// ========================================

// 씬 캡처 완료
function onCaptureComplete(imageBase64) {
  loadImageToCanvas(imageBase64);
  state.hasImage = true;
  updateUI();
  setStatus('씬 캡처 완료');
}

// 씬 정보 업데이트
function onSceneInfoUpdate(sceneInfo) {
  console.log('Scene Info:', sceneInfo);
  // 필요시 씬 정보 활용
}

// 캡처 에러
function onCaptureError(message) {
  hideLoading();
  setStatus('캡처 실패: ' + message);
  alert('씬 캡처 실패: ' + message);
}

// 렌더링 시작
function onRenderStart() {
  state.isRendering = true;
  showLoading('렌더링 중...');
  updateUI();
}

// 렌더링 완료
function onRenderComplete(imageBase64) {
  loadImageToCanvas(imageBase64);
  state.hasImage = true;
  state.isRendering = false;
  hideLoading();
  updateUI();
  setStatus('렌더링 완료');
}

// 렌더링 에러
function onRenderError(message) {
  state.isRendering = false;
  hideLoading();
  updateUI();
  setStatus('렌더링 실패: ' + message);
  alert('렌더링 실패: ' + message);
}

// API 상태 업데이트
function onApiStatusUpdate(connected) {
  state.apiConnected = connected;
  updateApiStatus(connected);
  updateUI();
}

// 이미지 업데이트 (보정/재생성 후)
function updatePreviewImage(imageBase64) {
  loadImageToCanvas(imageBase64);
  state.hasImage = true;
  updateUI();
}

// ========================================
// Image Handling
// ========================================

function loadImageToCanvas(base64) {
  const img = new Image();
  img.onload = function() {
    // Canvas 크기 조정
    const maxWidth = elements.canvasContainer.offsetWidth - 20;
    const maxHeight = 400;

    let width = img.width;
    let height = img.height;

    // 비율 유지하며 크기 조정
    if (width > maxWidth) {
      height = height * (maxWidth / width);
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = width * (maxHeight / height);
      height = maxHeight;
    }

    elements.canvas.width = width;
    elements.canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    // Empty state 숨김
    elements.emptyPreview.classList.add('hidden');
    elements.canvas.classList.remove('hidden');
  };
  img.src = 'data:image/png;base64,' + base64;
}

// ========================================
// UI Updates
// ========================================

function updateUI() {
  const hasImage = state.hasImage;
  const isRendering = state.isRendering;
  const apiConnected = state.apiConnected;

  // 버튼 상태
  elements.btnCapture.disabled = isRendering;
  elements.btnRender.disabled = !hasImage || isRendering || !apiConnected;
  elements.btnAdjust.disabled = !hasImage || isRendering;
  elements.btnPlace.disabled = !hasImage || isRendering;
  elements.btnSave.disabled = !hasImage || isRendering;
}

function updateApiStatus(connected) {
  if (connected) {
    elements.apiStatusDot.classList.add('connected');
    elements.apiStatusText.textContent = 'API 연결됨';
  } else {
    elements.apiStatusDot.classList.remove('connected');
    elements.apiStatusText.textContent = 'API 연결 안됨';
  }
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function showLoading(text) {
  elements.loadingText.textContent = text || '처리 중...';
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

// ========================================
// Event Handlers
// ========================================

// 씬 캡처
elements.btnCapture.addEventListener('click', function() {
  showLoading('씬 캡처 중...');
  sketchup.captureScene();
});

// 렌더링 (스타일 프리셋 기반)
elements.btnRender.addEventListener('click', function() {
  const stylePreset = document.getElementById('style-preset');
  const styleKey = stylePreset ? stylePreset.value : 'photorealistic';
  state.currentStylePreset = styleKey;
  sketchup.startRender(styleKey);
});

// 보정
elements.btnAdjust.addEventListener('click', function() {
  sketchup.openEditor();
});

// 배치
elements.btnPlace.addEventListener('click', function() {
  sketchup.openHotspot();
});

// 저장
elements.btnSave.addEventListener('click', function() {
  sketchup.saveImage('');
});

// 설정
elements.btnSettings.addEventListener('click', function() {
  sketchup.openSettings();
});

// 시간대 프리셋 버튼 (neutral, day, evening, night)
document.querySelectorAll('#time-preset-group .lighting-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const timePreset = this.dataset.time;

    // 시간대 그룹 내 active 전환
    document.querySelectorAll('#time-preset-group .lighting-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    this.classList.add('active');

    state.currentTimePreset = timePreset;

    // 현재 이미지가 있고 API가 연결되어 있으면 조명 변경 API 호출
    if (state.hasImage && state.apiConnected) {
      sketchup.changeLighting(state.currentTimePreset, state.currentLightSwitch);
    }
  });
});

// 실내 조명 ON/OFF 버튼
document.querySelectorAll('#light-switch-group .lighting-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const lightSwitch = this.dataset.light;

    // 조명 스위치 그룹 내 active 전환
    document.querySelectorAll('#light-switch-group .lighting-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    this.classList.add('active');

    state.currentLightSwitch = lightSwitch;

    // 현재 이미지가 있고 API가 연결되어 있으면 조명 변경 API 호출
    if (state.hasImage && state.apiConnected) {
      sketchup.changeLighting(state.currentTimePreset, state.currentLightSwitch);
    }
  });
});

// ========================================
// Initialization
// ========================================

function init() {
  // 초기 상태
  elements.canvas.classList.add('hidden');
  updateUI();

  // API 상태 확인
  setTimeout(function() {
    sketchup.checkApiStatus();
  }, 500);

  setStatus('준비됨');
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init);
