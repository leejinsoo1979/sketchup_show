// NanoBanana Renderer - Mix Mode
    // ========================================
    // Mix Mode - State & Elements
    // ========================================
    var mixState = {
      mode: 'add-remove',
      baseImage: null,
      baseImageBase64: null,
      objectImage: null,
      materialImage: null,
      floorplanImage: null,
      hotspots: [],
      selectedHotspot: null,
      brushSize: 30,
      brushColor: 'rgba(255, 59, 48, 0.5)',
      tool: 'brush',
      isDrawing: false,
      canvasScale: 1,
      sceneContext: null
    };

    const mixEl = {
      emptyState: document.getElementById('mix-empty-state'),
      canvasWrapper: document.getElementById('mix-canvas-wrapper'),
      mainCanvas: document.getElementById('mix-main-canvas'),
      maskCanvas: document.getElementById('mix-mask-canvas'),
      drawCanvas: document.getElementById('mix-draw-canvas'),
      loading: document.getElementById('mix-loading'),
      loadingText: document.getElementById('mix-loading-text'),
      loadingSubtext: document.getElementById('mix-loading-subtext'),
      statusText: document.getElementById('mix-status-text'),
      coordOverlay: document.getElementById('mix-coord-overlay'),
      coordWorld: document.getElementById('mix-coord-world'),
      coordScreen: document.getElementById('mix-coord-screen'),
      optionsTitle: document.getElementById('mix-options-title'),
      optionsSubtitle: document.getElementById('mix-options-subtitle'),
      btnApply: document.getElementById('mix-btn-apply'),
      btnBack: document.getElementById('mix-btn-back'),
      hotspotList: document.getElementById('mix-hotspot-list'),
      // Toolbars
      toolbarAddRemove: document.getElementById('mix-toolbar-add-remove'),
      toolbarMask: document.getElementById('mix-toolbar-mask'),
      toolbarFloorplan: document.getElementById('mix-toolbar-floorplan'),
      // Options panels
      optionsAddRemove: document.getElementById('mix-options-add-remove'),
      optionsInpaint: document.getElementById('mix-options-inpaint'),
      optionsMaterial: document.getElementById('mix-options-material'),
      optionsFloorplan: document.getElementById('mix-options-floorplan'),
      // Inputs
      brushSize: document.getElementById('mix-brush-size'),
      brushSizeValue: document.getElementById('mix-brush-size-value'),
      materialBrushSize: document.getElementById('mix-material-brush-size'),
      materialBrushSizeValue: document.getElementById('mix-material-brush-size-value')
    };

    function setMixStatus(text) {
      if (mixEl.statusText) mixEl.statusText.textContent = text;
    }

    // ========================================
    // Mix Mode - Initialization
    // ========================================
    function initMixMode() {
      // 선택된 패널의 이미지를 Mix 캔버스에 로드
      const selectedImage = getSelectedImage();
      if (selectedImage) {
        mixState.baseImageBase64 = selectedImage;
        loadMixBaseImage(selectedImage);
      }
      // 스케치업에 씬 컨텍스트 요청
      callRuby('mix_get_scene_context');
    }

    function loadMixBaseImage(base64) {
      const img = new Image();
      img.onload = () => {
        mixState.baseImage = img;

        const container = document.querySelector('.mix-canvas-container');
        const maxW = container.clientWidth - 40;
        const maxH = container.clientHeight - 40;

        let w = img.width;
        let h = img.height;

        if (w > maxW) {
          const ratio = maxW / w;
          w = maxW;
          h = h * ratio;
        }
        if (h > maxH) {
          const ratio = maxH / h;
          h = maxH;
          w = w * ratio;
        }

        mixState.canvasScale = w / img.width;

        mixEl.mainCanvas.width = w;
        mixEl.mainCanvas.height = h;
        mixEl.maskCanvas.width = w;
        mixEl.maskCanvas.height = h;
        mixEl.drawCanvas.width = w;
        mixEl.drawCanvas.height = h;

        const ctx = mixEl.mainCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        mixEl.emptyState.classList.add('hidden');
        mixEl.canvasWrapper.classList.remove('hidden');

        setMixStatus('Image loaded');
        updateMixApplyButton();
      };
      img.src = 'data:image/png;base64,' + base64;
    }

    // ========================================
    // Mix Mode - Mode Switching
    // ========================================
    document.querySelectorAll('.mix-mode-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.mix-mode-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        switchMixSubMode(item.dataset.mixmode);
      });
    });

    function switchMixSubMode(mode) {
      mixState.mode = mode;

      // Hide all
      mixEl.toolbarAddRemove.classList.add('hidden');
      mixEl.toolbarMask.classList.add('hidden');
      mixEl.toolbarFloorplan.classList.add('hidden');
      mixEl.optionsAddRemove.classList.add('hidden');
      mixEl.optionsInpaint.classList.add('hidden');
      mixEl.optionsMaterial.classList.add('hidden');
      mixEl.optionsFloorplan.classList.add('hidden');

      // Show relevant
      switch(mode) {
        case 'add-remove':
          mixEl.toolbarAddRemove.classList.remove('hidden');
          mixEl.optionsAddRemove.classList.remove('hidden');
          mixEl.optionsTitle.textContent = 'Object Insert & Remove';
          mixEl.optionsSubtitle.textContent = '3D 좌표 기반 오브젝트 배치';
          mixEl.drawCanvas.style.cursor = 'crosshair';
          break;
        case 'inpaint':
          mixEl.toolbarMask.classList.remove('hidden');
          mixEl.optionsInpaint.classList.remove('hidden');
          mixEl.optionsTitle.textContent = 'Inpainting';
          mixEl.optionsSubtitle.textContent = '마스킹 영역만 수정';
          mixEl.drawCanvas.style.cursor = 'crosshair';
          break;
        case 'material':
          mixEl.toolbarMask.classList.remove('hidden');
          mixEl.optionsMaterial.classList.remove('hidden');
          mixEl.optionsTitle.textContent = 'Material Replace';
          mixEl.optionsSubtitle.textContent = '재질 투영 및 교체';
          mixEl.drawCanvas.style.cursor = 'crosshair';
          break;
        case 'floorplan':
          mixEl.toolbarFloorplan.classList.remove('hidden');
          mixEl.optionsFloorplan.classList.remove('hidden');
          mixEl.optionsTitle.textContent = 'Floorplan to Isometric';
          mixEl.optionsSubtitle.textContent = '2D → 3D 변환';
          mixEl.drawCanvas.style.cursor = 'default';
          break;
      }

      // Clear mask
      const ctx = mixEl.maskCanvas.getContext('2d');
      ctx.clearRect(0, 0, mixEl.maskCanvas.width, mixEl.maskCanvas.height);

      updateMixApplyButton();
      setMixStatus('Mode: ' + mode);
    }

    // ========================================
    // Mix Mode - Apply Button Logic
    // ========================================
    function updateMixApplyButton() {
      let canApply = false;

      switch(mixState.mode) {
        case 'add-remove':
          canApply = mixState.baseImage && mixState.hotspots.length > 0;
          break;
        case 'inpaint':
          canApply = mixState.baseImage && hasMixMaskContent() &&
                     document.getElementById('mix-inpaint-instruction').value.trim();
          break;
        case 'material':
          canApply = mixState.baseImage && hasMixMaskContent() && mixState.materialImage;
          break;
        case 'floorplan':
          canApply = mixState.floorplanImage;
          break;
      }

      mixEl.btnApply.disabled = !canApply;
    }

    function hasMixMaskContent() {
      const ctx = mixEl.maskCanvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, mixEl.maskCanvas.width, mixEl.maskCanvas.height);
      return imageData.data.some((v, i) => i % 4 === 3 && v > 0);
    }

    // ========================================
    // Mix Mode - Drawing (Mask)
    // ========================================
    let mixLastX, mixLastY;

    mixEl.drawCanvas.addEventListener('mousedown', (e) => {
      if (mixState.mode !== 'inpaint' && mixState.mode !== 'material') return;

      mixState.isDrawing = true;
      const rect = mixEl.drawCanvas.getBoundingClientRect();
      mixLastX = e.clientX - rect.left;
      mixLastY = e.clientY - rect.top;
    });

    mixEl.drawCanvas.addEventListener('mousemove', (e) => {
      const rect = mixEl.drawCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Show coordinates
      if (mixState.mode === 'add-remove') {
        mixEl.coordOverlay.classList.add('visible');
        mixEl.coordScreen.textContent = `X: ${Math.round(x / mixState.canvasScale)} Y: ${Math.round(y / mixState.canvasScale)}`;
      }

      if (!mixState.isDrawing) return;
      if (mixState.mode !== 'inpaint' && mixState.mode !== 'material') return;

      const ctx = mixEl.maskCanvas.getContext('2d');
      const brushSize = mixState.mode === 'material' ?
        parseInt(mixEl.materialBrushSize.value) : parseInt(mixEl.brushSize.value);

      ctx.beginPath();
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (mixState.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = mixState.brushColor;
      }

      ctx.moveTo(mixLastX, mixLastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      mixLastX = x;
      mixLastY = y;
    });

    mixEl.drawCanvas.addEventListener('mouseup', () => {
      mixState.isDrawing = false;
      updateMixApplyButton();
    });

    mixEl.drawCanvas.addEventListener('mouseleave', () => {
      mixState.isDrawing = false;
      mixEl.coordOverlay.classList.remove('visible');
    });

    // ========================================
    // Mix Mode - Tool Buttons
    // ========================================
    document.getElementById('mix-tool-brush').addEventListener('click', () => {
      mixState.tool = 'brush';
      document.getElementById('mix-tool-brush').classList.add('active');
      document.getElementById('mix-tool-eraser').classList.remove('active');
    });

    document.getElementById('mix-tool-eraser').addEventListener('click', () => {
      mixState.tool = 'eraser';
      document.getElementById('mix-tool-eraser').classList.add('active');
      document.getElementById('mix-tool-brush').classList.remove('active');
    });

    document.getElementById('mix-tool-clear-mask').addEventListener('click', () => {
      const ctx = mixEl.maskCanvas.getContext('2d');
      ctx.clearRect(0, 0, mixEl.maskCanvas.width, mixEl.maskCanvas.height);
      updateMixApplyButton();
    });

    // Brush size sliders
    mixEl.brushSize.addEventListener('input', () => {
      mixEl.brushSizeValue.textContent = mixEl.brushSize.value + 'px';
    });

    mixEl.materialBrushSize.addEventListener('input', () => {
      mixEl.materialBrushSizeValue.textContent = mixEl.materialBrushSize.value + 'px';
    });

    // Color buttons
    document.querySelectorAll('.mix-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mix-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mixState.brushColor = btn.dataset.color;
      });
    });

    // ========================================
    // Mix Mode - File Uploads
    // ========================================
    document.getElementById('mix-upload-object').addEventListener('click', () => {
      document.getElementById('mix-object-file').click();
    });

    document.getElementById('mix-object-file').addEventListener('change', (e) => {
      handleMixFileUpload(e.target.files[0], 'object');
    });

    document.getElementById('mix-upload-material').addEventListener('click', () => {
      document.getElementById('mix-material-file').click();
    });

    document.getElementById('mix-material-file').addEventListener('change', (e) => {
      handleMixFileUpload(e.target.files[0], 'material');
    });

    document.getElementById('mix-upload-floorplan').addEventListener('click', () => {
      document.getElementById('mix-floorplan-file').click();
    });

    document.getElementById('mix-floorplan-file').addEventListener('change', (e) => {
      handleMixFileUpload(e.target.files[0], 'floorplan');
    });

    function handleMixFileUpload(file, type) {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];

        switch(type) {
          case 'object':
            mixState.objectImage = base64;
            document.getElementById('mix-object-preview').src = e.target.result;
            document.getElementById('mix-object-preview').classList.remove('hidden');
            document.getElementById('mix-upload-object').classList.add('has-image');
            break;
          case 'material':
            mixState.materialImage = base64;
            document.getElementById('mix-material-preview').src = e.target.result;
            document.getElementById('mix-material-preview').classList.remove('hidden');
            document.getElementById('mix-upload-material').classList.add('has-image');
            break;
          case 'floorplan':
            mixState.floorplanImage = base64;
            document.getElementById('mix-floorplan-preview').src = e.target.result;
            document.getElementById('mix-floorplan-preview').classList.remove('hidden');
            document.getElementById('mix-upload-floorplan').classList.add('has-image');
            break;
        }

        updateMixApplyButton();
      };
      reader.readAsDataURL(file);
    }

    // ========================================
    // Mix Mode - Hotspot System
    // ========================================
    mixEl.drawCanvas.addEventListener('click', (e) => {
      if (mixState.mode !== 'add-remove') return;

      const rect = mixEl.drawCanvas.getBoundingClientRect();
      const screenX = Math.round((e.clientX - rect.left) / mixState.canvasScale);
      const screenY = Math.round((e.clientY - rect.top) / mixState.canvasScale);

      // 스케치업에 3D 좌표 요청
      callRuby('mix_get_3d_coord', screenX, screenY);
    });

    function onMixHotspotFromSketchUp(dataJson) {
      const data = JSON.parse(dataJson);

      const id = 'hotspot-' + Date.now();
      const objectName = document.getElementById('mix-object-name');
      const objectWidth = document.getElementById('mix-object-width');
      const objectHeight = document.getElementById('mix-object-height');
      const objectDepth = document.getElementById('mix-object-depth');

      const hotspot = {
        id,
        position: data.position,
        normal: data.normal,
        screenPos: data.screen_pos,
        floorReference: data.floor_reference,
        name: objectName.value || 'Object ' + (mixState.hotspots.length + 1),
        image: mixState.objectImage,
        estimatedSize: {
          width: parseInt(objectWidth.value) || 500,
          height: parseInt(objectHeight.value) || 800,
          depth: parseInt(objectDepth.value) || 500
        },
        scale: 1.0,
        rotation: 0
      };

      mixState.hotspots.push(hotspot);
      renderMixHotspots();
      updateMixHotspotList();
      updateMixApplyButton();

      setMixStatus(`Hotspot added at (${Math.round(data.position.x)}, ${Math.round(data.position.y)}, ${Math.round(data.position.z)}) mm`);
    }

    function renderMixHotspots() {
      // Remove existing markers
      document.querySelectorAll('.mix-hotspot-marker').forEach(m => m.remove());

      mixState.hotspots.forEach((h, i) => {
        const marker = document.createElement('div');
        marker.className = 'mix-hotspot-marker';
        marker.textContent = i + 1;

        const screenX = h.screenPos.x * mixState.canvasScale;
        const screenY = h.screenPos.y * mixState.canvasScale;
        marker.style.left = screenX + 'px';
        marker.style.top = screenY + 'px';
        marker.dataset.id = h.id;

        if (mixState.selectedHotspot === h.id) {
          marker.classList.add('selected');
        }

        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          mixState.selectedHotspot = h.id;
          renderMixHotspots();
          updateMixHotspotList();
        });

        mixEl.canvasWrapper.appendChild(marker);
      });
    }

    function updateMixHotspotList() {
      if (mixState.hotspots.length === 0) {
        mixEl.hotspotList.innerHTML = `
          <div class="mix-empty-state" style="font-size:11px;padding:16px;color:#555;">
            스케치업 뷰포트에서 클릭하여 핫스팟을 추가하세요
          </div>`;
        return;
      }

      mixEl.hotspotList.innerHTML = mixState.hotspots.map((h, i) => `
        <div class="mix-hotspot-item ${mixState.selectedHotspot === h.id ? 'selected' : ''}" data-id="${h.id}">
          <div class="mix-hotspot-item-header">
            <div class="mix-hotspot-item-num">${i + 1}</div>
            <div class="mix-hotspot-item-info">
              <div class="mix-hotspot-item-name">${h.name}</div>
              <div class="mix-hotspot-item-coords">
                X: ${Math.round(h.position.x)} Y: ${Math.round(h.position.y)} Z: ${Math.round(h.position.z)} mm
              </div>
            </div>
            <button class="mix-hotspot-item-delete" data-id="${h.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `).join('');

      // Event handlers
      mixEl.hotspotList.querySelectorAll('.mix-hotspot-item').forEach(item => {
        item.addEventListener('click', () => {
          mixState.selectedHotspot = item.dataset.id;
          renderMixHotspots();
          updateMixHotspotList();
        });
      });

      mixEl.hotspotList.querySelectorAll('.mix-hotspot-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          mixState.hotspots = mixState.hotspots.filter(h => h.id !== id);
          if (mixState.selectedHotspot === id) mixState.selectedHotspot = null;
          renderMixHotspots();
          updateMixHotspotList();
          updateMixApplyButton();
        });
      });
    }

    // ========================================
    // Mix Mode - Apply & Callbacks
    // ========================================
    mixEl.btnApply.addEventListener('click', applyMix);
    mixEl.btnBack.addEventListener('click', () => {
      // 메뉴 아이콘 상태 업데이트
      document.querySelectorAll('.icon-menu-item').forEach(i => i.classList.remove('active'));
      document.getElementById('menu-render').classList.add('active');
      switchToRenderMode();
    });

    function applyMix() {
      showMixLoading('Processing...', 'AI가 씬을 분석하고 있습니다');

      const data = {
        mode: mixState.mode,
        sceneContext: mixState.sceneContext
      };

      switch(mixState.mode) {
        case 'add-remove':
          data.baseImage = mixState.baseImageBase64;
          data.hotspots = mixState.hotspots.map(h => ({
            position: h.position,
            normal: h.normal,
            screenPos: h.screenPos,
            floorReference: h.floorReference,
            name: h.name,
            image: h.image,
            estimatedSize: h.estimatedSize,
            scale: h.scale,
            rotation: h.rotation
          }));
          data.instruction = document.getElementById('mix-object-instruction').value;
          break;

        case 'inpaint':
          data.baseImage = mixState.baseImageBase64;
          data.maskImage = mixCanvasToBase64(mixEl.maskCanvas);
          data.instruction = document.getElementById('mix-inpaint-instruction').value;
          data.preserve = {
            lighting: document.getElementById('mix-preserve-lighting').checked,
            style: document.getElementById('mix-preserve-style').checked
          };
          break;

        case 'material':
          data.baseImage = mixState.baseImageBase64;
          data.maskImage = mixCanvasToBase64(mixEl.maskCanvas);
          data.materialImage = mixState.materialImage;
          data.description = document.getElementById('mix-material-description').value;
          break;

        case 'floorplan':
          data.floorplanImage = mixState.floorplanImage;
          data.parameters = {
            wallHeight: parseInt(document.getElementById('mix-wall-height').value),
            wallThickness: parseInt(document.getElementById('mix-wall-thickness').value),
            style: document.getElementById('mix-floorplan-style').value
          };
          data.instruction = document.getElementById('mix-floorplan-instruction').value;
          break;
      }

      callRuby('mix_apply', JSON.stringify(data));
    }

    function mixCanvasToBase64(canvas) {
      return canvas.toDataURL('image/png').split(',')[1];
    }

    function showMixLoading(text, subtext) {
      mixEl.loadingText.textContent = text || 'Processing...';
      mixEl.loadingSubtext.textContent = subtext || '';
      mixEl.loading.classList.remove('hidden');
    }

    function hideMixLoading() {
      mixEl.loading.classList.add('hidden');
    }

    // Ruby Callbacks for Mix Mode
    function onMixSceneContextLoaded(contextJson) {
      mixState.sceneContext = JSON.parse(contextJson);
      document.getElementById('mix-scene-info').textContent =
        `Camera: FOV ${mixState.sceneContext.camera.fov.toFixed(0)}°`;
    }

    function onMixCoordReceived(coordJson) {
      const data = JSON.parse(coordJson);
      mixEl.coordWorld.textContent = `X: ${Math.round(data.position.x)} Y: ${Math.round(data.position.y)} Z: ${Math.round(data.position.z)}`;
      onMixHotspotFromSketchUp(coordJson);
    }

    function onMixComplete(resultBase64) {
      hideMixLoading();

      const img = new Image();
      img.onload = () => {
        const ctx = mixEl.mainCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, mixEl.mainCanvas.width, mixEl.mainCanvas.height);

        // Clear
        const maskCtx = mixEl.maskCanvas.getContext('2d');
        maskCtx.clearRect(0, 0, mixEl.maskCanvas.width, mixEl.maskCanvas.height);
        mixState.hotspots = [];
        mixState.selectedHotspot = null;
        renderMixHotspots();
        updateMixHotspotList();

        setMixStatus('Mix complete!');
      };
      img.src = 'data:image/png;base64,' + resultBase64;
    }

    function onMixError(message) {
      hideMixLoading();
      setMixStatus('Error: ' + message);
      alert('Mix Error: ' + message);
    }

    // Input listeners for Apply button
    document.getElementById('mix-inpaint-instruction').addEventListener('input', updateMixApplyButton);
