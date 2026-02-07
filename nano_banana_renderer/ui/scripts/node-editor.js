// NanoBanana Renderer - Node Editor
    // ========================================
    // Node Editor System
    // ========================================
    var nodeEditor = {
      nodes: [],
      connections: [],
      nextNodeId: 1,
      selectedNode: null,
      draggingNode: null,
      dragOffset: { x: 0, y: 0 },
      connecting: null, // 연결 중인 노드 ID
      dirty: false,

      // 확장 레지스트리 (extension에서 새 타입 등록용)
      _icons: {},
      _titles: {},
      _noOutputTypes: {},
      _noInputTypes: {},

      // 캔버스 줌/팬
      _zoom: 1,
      _zoomMin: 0.3,
      _zoomMax: 2,
      _panX: 0,
      _panY: 0,
      _isPanning: false,
      _panStart: { x: 0, y: 0 },

      // 노드 추가
      addNode: function(type, x, y) {
        this.pushUndo();
        const node = {
          id: this.nextNodeId++,
          type: type,
          x: x,
          y: y,
          dirty: true,
          status: 'idle',
          data: this.getDefaultData(type),
          thumbnail: null
        };
        this.nodes.push(node);
        this.renderNode(node);
        this.selectNode(node.id);
        this.markDirty();
        return node;
      },

      // 같은 타입의 노드 중 가장 아래에 있는 노드를 찾아서 그 아래에 배치
      addNodeBelow: function(clickedNode, newType) {
        // 같은 타입의 기존 노드들 중 가장 아래(y가 큰) 노드 찾기
        const sameTypeNodes = this.nodes.filter(n => n.type === newType);
        let targetX, targetY;

        if (sameTypeNodes.length > 0) {
          // 같은 타입 중 가장 아래 노드 찾기
          const bottomNode = sameTypeNodes.reduce((a, b) => a.y > b.y ? a : b);
          targetX = bottomNode.x;
          targetY = bottomNode.y + 260; // 카드 높이 + 간격
        } else {
          // 같은 타입이 없으면 클릭한 노드 기준 배치
          if (newType === 'source') {
            // 소스 카드가 없으면 클릭한 카드 왼쪽에 아래로
            const sourceNodes = this.nodes.filter(n => n.type === 'source');
            targetX = sourceNodes.length > 0 ? sourceNodes[0].x : 80;
            targetY = clickedNode.y + 260;
          } else if (newType === 'renderer') {
            const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
            targetX = rendererNodes.length > 0 ? rendererNodes[0].x : 480;
            targetY = clickedNode.y + 260;
          } else {
            // animation - renderer 아래에 배치
            const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
            if (rendererNodes.length > 0) {
              const bottomRenderer = rendererNodes.reduce((a, b) => a.y > b.y ? a : b);
              targetX = bottomRenderer.x;
              targetY = bottomRenderer.y + 260;
            } else {
              targetX = 480;
              targetY = clickedNode.y + 260;
            }
          }
        }

        const newNode = this.addNode(newType, targetX, targetY);

        // 자동 연결: 소스→렌더러, 렌더러→애니메이션
        if (newType === 'renderer') {
          const sourceNodes = this.nodes.filter(n => n.type === 'source');
          if (sourceNodes.length > 0) {
            this.connect(sourceNodes[sourceNodes.length - 1].id, newNode.id);
          }
        } else if (newType === 'animation') {
          const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
          if (rendererNodes.length > 0) {
            this.connect(rendererNodes[rendererNodes.length - 1].id, newNode.id);
          }
        }
      },

      // 기본 데이터
      getDefaultData: function(type) {
        if (type === 'source') {
          return {
            time: 'day',
            light: 'on',
            image: null
          };
        } else if (type === 'renderer') {
          return {
            engine: 'gemini-2.0-flash-exp',
            resolution: '2048',
            aspect: 'original',
            presets: [],
            customPrompt: '',
            negativePrompt: ''
          };
        } else if (type === 'animation') {
          return {
            fps: 24,
            duration: 3,
            style: 'smooth',
            prompt: ''
          };
        }
        return {};
      },

      // 노드 렌더링 (positionOnly=true면 위치만 업데이트, innerHTML 재생성 안함)
      renderNode: function(node, positionOnly) {
        const canvas = document.getElementById('node-canvas');
        let el = document.getElementById('node-' + node.id);
        const isNew = !el;

        if (isNew) {
          el = document.createElement('div');
          el.id = 'node-' + node.id;
          el.className = 'node node-' + node.type;
          if (node.dirty) el.classList.add('dirty');
          el.style.willChange = 'transform';
          canvas.appendChild(el);

          // 드래그 이벤트
          el.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, node));
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
          });
        }

        // transform으로 위치 지정 (left/top 대신 GPU 가속)
        el.style.transform = `translate(${node.x}px, ${node.y}px)`;
        el.classList.toggle('dirty', node.dirty);
        el.classList.toggle('selected', this.selectedNode === node.id);

        // 드래그 중이면 위치만 업데이트하고 끝
        if (positionOnly) return;

        // 내용 변경 필요 여부 체크 (캐시된 상태와 비교)
        var stateExtra = (node.data.engine || '') + (node.data.scale || '') + (node.data.duration || '') + (node.data.presetId || '') + (node.data.presets ? node.data.presets.join(',') : '') + (node.data.customPrompt || '').substring(0, 40);
        const currentState = (node.thumbnail || '') + '|' + node.type + '|' + node.dirty + '|' + stateExtra;
        if (!isNew && el._cachedState === currentState) return;
        el._cachedState = currentState;

        const icons = {
          source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
          renderer: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.435,3.06H5.565a2.5,2.5,0,0,0-2.5,2.5V18.44a2.507,2.507,0,0,0,2.5,2.5h12.87a2.507,2.507,0,0,0,2.5-2.5V5.56A2.5,2.5,0,0,0,18.435,3.06ZM4.065,5.56a1.5,1.5,0,0,1,1.5-1.5h12.87a1.5,1.5,0,0,1,1.5,1.5v8.66l-3.88-3.88a1.509,1.509,0,0,0-2.12,0l-4.56,4.57a.513.513,0,0,1-.71,0l-.56-.56a1.522,1.522,0,0,0-2.12,0l-1.92,1.92Zm15.87,12.88a1.5,1.5,0,0,1-1.5,1.5H5.565a1.5,1.5,0,0,1-1.5-1.5v-.75L6.7,15.06a.5.5,0,0,1,.35-.14.524.524,0,0,1,.36.14l.55.56a1.509,1.509,0,0,0,2.12,0l4.57-4.57a.5.5,0,0,1,.71,0l4.58,4.58Z"/><path d="M8.062,10.565a2.5,2.5,0,1,1,2.5-2.5A2.5,2.5,0,0,1,8.062,10.565Zm0-4a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,8.062,6.565Z"/></svg>',
          animation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M2 15h20M7 4v16M12 4v16M17 4v16"/><path d="M10 11.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>'
        };
        const icon = nodeEditor._icons[node.type] || icons[node.type] || icons.renderer;

        var title = '';
        var sublabel = '';
        // 노드 순번 계산
        var orderNum = 1;
        var orderedTypes = ['source', 'renderer', 'modifier', 'upscale', 'video', 'compare'];
        for (var oi = 0; oi < orderedTypes.length; oi++) {
          if (orderedTypes[oi] === node.type) break;
          if (this.nodes.some(function(n) { return n.type === orderedTypes[oi]; })) orderNum++;
        }

        if (node.type === 'source') {
          title = 'Source';
          sublabel = '';
        } else if (node.type === 'renderer') {
          var eng = node.data.engine || 'gemini-2.0-flash-exp';
          var modelNames = {
            'gemini-2.0-flash-exp': 'Flash 2.0',
            'gemini-2.5-flash-image': 'Flash 2.5',
            'gemini-3-pro-image': 'Gemini 3 Pro',
            'imagen-4.0-fast-generate-001': 'Imagen 4 Fast',
            'imagen-4.0-generate-001': 'Imagen 4',
            'photorealistic-fx': 'PhotoFX',
            'sdxl-controlnet': 'SDXL ControlNet',
            'flux-canny': 'Flux Canny'
          };
          var modelName = modelNames[eng] || eng;
          title = orderNum + '. Renderer (' + modelName + ')';
          sublabel = 'Create photorealistic image';
        } else if (node.type === 'modifier') {
          title = orderNum + '. Details editor';
          sublabel = 'Refine and edit details';
        } else if (node.type === 'upscale') {
          title = orderNum + '. Upscaler ' + (node.data.scale || 2) + 'x';
          sublabel = 'Enhance resolution';
        } else if (node.type === 'video') {
          var vidEng = node.data.engine === 'seedance' ? 'Seedance' : 'Kling';
          title = orderNum + '. ' + vidEng + ' ' + (node.data.duration || 5) + 's';
          sublabel = 'Generate video from image';
        } else if (node.type === 'compare') {
          title = 'Compare';
          sublabel = 'Side-by-side comparison';
        } else {
          title = nodeEditor._titles[node.type] || node.type;
          sublabel = '';
        }
        const hasImage = !!node.thumbnail;

        // 미니툴바: 이미지 있는 카드만 표시
        const showToolbar = hasImage;
        // 미니툴바 버튼: 노드 타입에 따라 다른 액션 표시
        var extraBtns = '';
        if (hasImage && (node.type === 'renderer' || node.type === 'modifier')) {
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="modifier" title="Add Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>';
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="upscale" title="Add Upscale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/></svg></button>';
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="video" title="Add Video"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg></button>';
        }
        const miniToolbar = showToolbar ? `
          <div class="node-mini-toolbar">
            <button class="node-mini-toolbar-btn" data-add="source" title="Add Source">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="14" height="18" rx="2"/><rect x="7" y="6" width="8" height="5" rx="1"/><line x1="7" y1="14" x2="15" y2="14"/><line x1="7" y1="17" x2="12" y2="17"/><circle cx="17" cy="18" r="4.5" fill="#1c2128" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="16" x2="17" y2="20"/><line x1="15" y1="18" x2="19" y2="18"/></svg>
            </button>
            <button class="node-mini-toolbar-btn" data-add="renderer" title="Add Renderer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="10" r="2"/><path d="M3 17l4.5-4.5a1.5 1.5 0 0 1 2.1 0l3.9 3.9"/><path d="M14 15l1.5-1.5a1.5 1.5 0 0 1 2.1 0L21 17"/><path d="M17 3l2 2.5L17 8" stroke-width="1.5" fill="none"/></svg>
            </button>${extraBtns}
          </div>` : '';

        if (hasImage) {
          const existingImg = el.querySelector('.node-thumbnail img');
          if (existingImg && el._hasImage) {
            existingImg.src = 'data:image/png;base64,' + node.thumbnail;
            return;
          }
          el._hasImage = true;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail" style="border-radius:10px;">
              <img src="data:image/png;base64,${node.thumbnail}">
            </div>
            <div class="node-ports">
              ${(node.type === 'source' || nodeEditor._noInputTypes[node.type]) ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              ${nodeEditor._noOutputTypes[node.type] ? '' : '<div class="node-port node-port-output" data-port="output"></div>'}
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
              ${sublabel ? '<div class="node-sublabel">' + sublabel + '</div>' : ''}
            </div>
          `;
        } else {
          el._hasImage = false;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail">
              <div class="node-header-icon">${icon}</div>
            </div>
            <div class="node-ports">
              ${(node.type === 'source' || nodeEditor._noInputTypes[node.type]) ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              ${nodeEditor._noOutputTypes[node.type] ? '' : '<div class="node-port node-port-output" data-port="output"></div>'}
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
              ${sublabel ? '<div class="node-sublabel">' + sublabel + '</div>' : ''}
            </div>
          `;
        }

        // 포트 이벤트
        el.querySelectorAll('.node-port').forEach(port => {
          port.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startConnect(node.id, port.dataset.port);
          });
          port.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            this.endConnect(node.id, port.dataset.port);
          });
        });

        // 미니툴바 버튼 이벤트
        el.querySelectorAll('.node-mini-toolbar-btn').forEach(btn => {
          btn.addEventListener('mousedown', (e) => e.stopPropagation());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const addType = btn.dataset.add;
            this.addNodeBelow(node, addType);
          });
        });

        // 높이 캐시 (즉시 측정 - 연결선 좌표 정확도를 위해)
        el._cachedHeight = el.offsetHeight || 200;
      },

      // 노드 선택 (CSS 클래스만 토글, innerHTML 재생성 안함)
      selectNode: function(nodeId) {
        const prevId = this.selectedNode;
        this.selectedNode = nodeId;
        // 이전 선택 해제
        if (prevId) {
          const prevEl = document.getElementById('node-' + prevId);
          if (prevEl) prevEl.classList.remove('selected');
        }
        // 새 선택 적용
        if (nodeId) {
          const newEl = document.getElementById('node-' + nodeId);
          if (newEl) newEl.classList.add('selected');
        }
        this.updateInspector();
      },

      // Inspector 업데이트
      updateInspector: function() {
        const emptyEl = document.getElementById('node-inspector-empty');
        const sourceEl = document.getElementById('inspector-source');
        const rendererEl = document.getElementById('inspector-renderer');
        const previewEl = document.getElementById('node-preview-image');
        const bottomPrompt = document.getElementById('node-prompt-input');
        const bottomNegative = document.getElementById('node-prompt-negative-input');
        const promptTabs = document.querySelectorAll('.node-prompt-tab');
        const autoBtn = document.getElementById('node-prompt-auto-btn');

        emptyEl.classList.add('hidden');
        sourceEl.classList.add('hidden');
        rendererEl.classList.add('hidden');

        if (!this.selectedNode) {
          emptyEl.classList.remove('hidden');
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          bottomPrompt.value = '';
          bottomPrompt.disabled = true;
          bottomPrompt.placeholder = 'Select a Renderer node to enter prompt...';
          bottomNegative.value = '';
          promptTabs.forEach(function(t) { t.disabled = true; t.classList.remove('active'); });
          promptTabs[0].classList.add('active');
          document.querySelectorAll('.node-prompt-content').forEach(function(c) { c.classList.remove('active'); });
          document.querySelector('.node-prompt-content[data-prompt-content="main"]').classList.add('active');
          autoBtn.disabled = true;
          return;
        }

        const node = this.nodes.find(n => n.id === this.selectedNode);
        if (!node) {
          emptyEl.classList.remove('hidden');
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          return;
        }

        // Preview 이미지 업데이트
        if (node.data.image) {
          previewEl.innerHTML = '<img src="data:image/png;base64,' + node.data.image + '" alt="Preview">';
        } else {
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
        }
        // Enlarge 모드 활성 시 enlarged 이미지도 동기화
        var enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview && enlargedPreview.classList.contains('active')) {
          var enlargedImage = document.getElementById('node-enlarged-image');
          if (node.data.image) {
            enlargedImage.innerHTML = '<img src="data:image/png;base64,' + node.data.image + '" alt="Enlarged Preview">';
          } else {
            enlargedImage.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          }
        }

        if (node.type === 'source') {
          sourceEl.classList.remove('hidden');
          // Time 버튼 상태
          sourceEl.querySelectorAll('[data-time]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.time === node.data.time);
          });
          // Light 버튼 상태
          sourceEl.querySelectorAll('[data-light]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.light === node.data.light);
          });
          bottomPrompt.value = '';
          bottomPrompt.disabled = true;
          bottomPrompt.placeholder = 'Select a Renderer node to enter prompt...';
          bottomNegative.value = '';
          promptTabs.forEach(function(t) { t.disabled = true; });
          autoBtn.disabled = true;
        } else if (node.type === 'renderer') {
          rendererEl.classList.remove('hidden');
          // 모델 드롭다운 상태 업데이트
          var modelMenu = document.getElementById('node-model-menu');
          var modelSelectedText = document.getElementById('node-model-selected-text');
          if (modelMenu) {
            var currentModel = node.data.engine || 'gemini-2.0-flash-exp';
            modelMenu.querySelectorAll('.dropdown-item').forEach(function(item) {
              var isSelected = item.dataset.value === currentModel;
              item.classList.toggle('selected', isSelected);
              if (isSelected && modelSelectedText) {
                modelSelectedText.textContent = item.childNodes[0].textContent.trim();
              }
            });
          }
          // Resolution 버튼 상태
          rendererEl.querySelectorAll('[data-res]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.res === node.data.resolution);
          });
          // Aspect 버튼 상태
          rendererEl.querySelectorAll('[data-aspect]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.aspect === node.data.aspect);
          });
          // Presets 버튼 상태
          rendererEl.querySelectorAll('[data-preset]').forEach(btn => {
            btn.classList.toggle('active', node.data.presets.includes(btn.dataset.preset));
          });
          // Custom prompt - Inspector와 하단 바 동기화
          const customPrompt = node.data.customPrompt || '';
          document.getElementById('node-custom-prompt').value = customPrompt;
          bottomPrompt.value = customPrompt;
          bottomPrompt.disabled = false;
          bottomPrompt.placeholder = 'Enter rendering prompt...';
          // Negative prompt 동기화
          bottomNegative.value = node.data.negativePrompt || '';
          promptTabs.forEach(function(t) { t.disabled = false; });
          autoBtn.disabled = false;
        }
      },

      // 드래그 시작
      _dragEl: null,
      _dragConns: null, // 드래그 중 업데이트할 연결 정보 캐시
      onNodeMouseDown: function(e, node) {
        if (e.target.classList.contains('node-port')) return;
        this.draggingNode = node;
        // 줌 보정된 드래그 오프셋
        var canvasPos = this.screenToCanvas(e.clientX, e.clientY);
        this.dragOffset = {
          x: canvasPos.x - node.x,
          y: canvasPos.y - node.y
        };
        var el = document.getElementById('node-' + node.id);
        if (el) el.classList.add('dragging');
        this._dragEl = el;
        // 드래그 시작 시 관련 연결 정보를 미리 캐시
        var dc = [];
        var nw = 320, nid = node.id;
        for (var i = 0; i < this.connections.length; i++) {
          var c = this.connections[i];
          if (c.from !== nid && c.to !== nid) continue;
          var otherNode = null;
          var otherEl = null;
          var isFrom = c.from === nid;
          if (isFrom) {
            for (var j = 0; j < this.nodes.length; j++) { if (this.nodes[j].id === c.to) { otherNode = this.nodes[j]; break; } }
            otherEl = otherNode ? document.getElementById('node-' + otherNode.id) : null;
          } else {
            for (var j = 0; j < this.nodes.length; j++) { if (this.nodes[j].id === c.from) { otherNode = this.nodes[j]; break; } }
            otherEl = otherNode ? document.getElementById('node-' + otherNode.id) : null;
          }
          dc.push({ idx: i, isFrom: isFrom, otherNode: otherNode, otherH: otherEl ? (otherEl._cachedHeight || 200) : 200 });
        }
        this._dragConns = dc;
        e.preventDefault();
      },

      // 연결 시작
      startConnect: function(nodeId, portType) {
        if (portType === 'output') {
          this.connecting = { fromId: nodeId, fromPort: 'output' };
        }
      },

      // 연결 끝
      endConnect: function(nodeId, portType) {
        if (this.connecting && portType === 'input' && this.connecting.fromId !== nodeId) {
          this.connect(this.connecting.fromId, nodeId);
        }
        this.connecting = null;
      },

      // 연결 생성
      connect: function(fromId, toId) {
        // 중복 체크
        const exists = this.connections.some(c => c.from === fromId && c.to === toId);
        if (exists) return;

        this.pushUndo();

        // 기존 입력 연결 제거 (하나의 입력만 허용)
        this.connections = this.connections.filter(c => c.to !== toId);

        this.connections.push({ from: fromId, to: toId });
        this.renderConnections();
        this.updatePortStates();
        this.markDirty();
      },

      // 포트 연결 상태 CSS 업데이트
      updatePortStates: function() {
        // 모든 포트에서 connected 제거
        document.querySelectorAll('.node-port.connected').forEach(p => p.classList.remove('connected'));
        // 연결된 포트에 connected 추가
        this.connections.forEach(conn => {
          const fromEl = document.getElementById('node-' + conn.from);
          const toEl = document.getElementById('node-' + conn.to);
          if (fromEl) {
            const outPort = fromEl.querySelector('.node-port-output');
            if (outPort) outPort.classList.add('connected');
          }
          if (toEl) {
            const inPort = toEl.querySelector('.node-port-input');
            if (inPort) inPort.classList.add('connected');
          }
        });
      },

      // 연결선 렌더링 (Canvas 기반 - DOM 조작 없음)
      _connCanvas: null,
      _connCtx: null,
      _ensureCanvas: function() {
        if (this._connCtx) return;
        this._connCanvas = document.getElementById('node-connections');
        this._connCtx = this._connCanvas.getContext('2d');
      },
      _resizeCanvas: function() {
        var c = this._connCanvas;
        // Canvas는 node-canvas 안에 있지만, 크기는 node-canvas-area 기준
        var area = document.getElementById('node-canvas-area');
        var aw = area.clientWidth;
        var ah = area.clientHeight;
        // 줌 역보정: CSS scale이 적용되므로 실제 필요 크기는 area/zoom
        var needW = Math.ceil(aw / this._zoom) + 2000;
        var needH = Math.ceil(ah / this._zoom) + 2000;
        if (c.width !== needW || c.height !== needH) {
          c.width = needW;
          c.height = needH;
          // CSS 크기도 동기화 (canvas attribute와 CSS가 다르면 스케일링 발생)
          c.style.width = needW + 'px';
          c.style.height = needH + 'px';
        }
      },

      // 캔버스 줌/팬 적용
      _zoomRafId: null,
      _applyZoom: function() {
        var canvas = document.getElementById('node-canvas');
        var grid = document.querySelector('.node-canvas-grid');
        var t = 'scale(' + this._zoom + ') translate(' + this._panX + 'px,' + this._panY + 'px)';
        canvas.style.transform = t;
        canvas.style.transformOrigin = '0 0';
        grid.style.transform = t;
        grid.style.transformOrigin = '0 0';
        // node-canvas 크기를 줌 역수로 확대하여 area를 항상 덮도록
        var area = document.getElementById('node-canvas-area');
        var invZoom = 1 / this._zoom;
        canvas.style.width = (area.clientWidth * invZoom + 2000) + 'px';
        canvas.style.height = (area.clientHeight * invZoom + 2000) + 'px';
        // throttle renderConnections to next animation frame
        if (!this._zoomRafId) {
          var self = this;
          this._zoomRafId = requestAnimationFrame(function() {
            self._zoomRafId = null;
            self.renderConnections();
          });
        }
        // 줌 레벨 표시 업데이트
        var label = document.getElementById('node-zoom-label');
        if (label) label.textContent = Math.round(this._zoom * 100) + '%';
      },

      setZoom: function(newZoom, pivotX, pivotY) {
        var oldZoom = this._zoom;
        newZoom = Math.max(this._zoomMin, Math.min(this._zoomMax, newZoom));
        if (newZoom === oldZoom) return;
        // 피벗 포인트 기준 줌 (마우스 위치 유지)
        if (pivotX !== undefined && pivotY !== undefined) {
          // 현재 월드 좌표
          var wx = (pivotX / oldZoom) - this._panX;
          var wy = (pivotY / oldZoom) - this._panY;
          // 새 줌에서의 팬 오프셋
          this._panX = (pivotX / newZoom) - wx;
          this._panY = (pivotY / newZoom) - wy;
        }
        this._zoom = newZoom;
        this._applyZoom();
      },

      resetZoom: function() {
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._applyZoom();
      },

      // 화면 좌표 → 캔버스 좌표 변환
      screenToCanvas: function(sx, sy) {
        var area = document.getElementById('node-canvas-area');
        var rect = area.getBoundingClientRect();
        var x = (sx - rect.left) / this._zoom - this._panX;
        var y = (sy - rect.top) / this._zoom - this._panY;
        return { x: x, y: y };
      },
      // 데이터 흐름 파티클 애니메이션 상태
      _flowAnimFrame: null,
      _flowPhase: 0,

      renderConnections: function() {
        this._ensureCanvas();
        this._resizeCanvas();
        var ctx = this._connCtx;
        var w = this._connCanvas.width;
        var h = this._connCanvas.height;
        ctx.clearRect(0, 0, w, h);

        var nw = 320;
        var isRunning = this.isRunning;

        for (var i = 0; i < this.connections.length; i++) {
          var conn = this.connections[i];
          var fn = null, tn = null;
          for (var j = 0; j < this.nodes.length; j++) {
            if (this.nodes[j].id === conn.from) fn = this.nodes[j];
            if (this.nodes[j].id === conn.to) tn = this.nodes[j];
            if (fn && tn) break;
          }
          if (!fn || !tn) continue;
          var fe = document.getElementById('node-' + fn.id);
          var te = document.getElementById('node-' + tn.id);
          if (!fe || !te) continue;
          var fh = fe.offsetHeight || 200;
          var th = te.offsetHeight || 200;
          fe._cachedHeight = fh;
          te._cachedHeight = th;

          var x1 = fn.x + nw, y1 = fn.y + fh * 0.5;
          var x2 = tn.x, y2 = tn.y + th * 0.5;

          var dist = Math.abs(x2 - x1);
          var dx = Math.max(50, dist * 0.4);
          if (x1 > x2) {
            dx = Math.max(80, dist * 0.5 + 40);
          }

          // 이 연결이 활성(데이터 흐르는 중)인지 확인
          var isActive = isRunning && (
            fn.status === 'done' && (tn.status === 'running' || tn.status === 'queued') ||
            fn.status === 'running' || tn.status === 'running'
          );

          // 선 그리기
          ctx.save();
          // glow layer
          ctx.strokeStyle = isActive ? 'rgba(0, 212, 170, 0.3)' : 'rgba(0, 212, 170, 0.15)';
          ctx.lineWidth = isActive ? 10 : 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
          ctx.stroke();
          // main line
          ctx.strokeStyle = isActive ? '#00e6b8' : '#00d4aa';
          ctx.lineWidth = isActive ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
          ctx.stroke();

          // 파티클 애니메이션 — 실행 중인 연결에만
          if (isActive) {
            var phase = this._flowPhase;
            var particleCount = 8;
            for (var p = 0; p < particleCount; p++) {
              var t = ((phase + p / particleCount) % 1);
              // 베지어 곡선 위의 점 계산
              var u = 1 - t;
              var cx1 = x1 + dx, cy1 = y1;
              var cx2 = x2 - dx, cy2 = y2;
              var px = u*u*u*x1 + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*x2;
              var py = u*u*u*y1 + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*y2;
              // 파티클 크기 (중앙에서 크고 끝에서 작게)
              var size = 4 + 3 * Math.sin(t * Math.PI);
              var alpha = 0.6 + 0.4 * Math.sin(t * Math.PI);
              // glow
              ctx.shadowColor = 'rgba(0, 230, 184, 0.8)';
              ctx.shadowBlur = 8;
              ctx.fillStyle = 'rgba(0, 255, 200, ' + alpha + ')';
              ctx.beginPath();
              ctx.arc(px, py, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }

          ctx.restore();

          // 화살표
          var arrowSize = 7;
          var ax = -1, ay = 0;
          ctx.fillStyle = isActive ? '#00e6b8' : '#00d4aa';
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 + ax * arrowSize - ay * arrowSize * 0.6, y2 + ay * arrowSize + ax * arrowSize * 0.6);
          ctx.lineTo(x2 + ax * arrowSize + ay * arrowSize * 0.6, y2 + ay * arrowSize - ax * arrowSize * 0.6);
          ctx.closePath();
          ctx.fill();
        }
      },

      // 데이터 흐름 애니메이션 시작/정지
      startFlowAnimation: function() {
        console.log('[NodeEditor] startFlowAnimation called, existing frame:', this._flowAnimFrame);
        if (this._flowAnimFrame) return;
        var self = this;
        function animate() {
          self._flowPhase = (self._flowPhase + 0.012) % 1;
          self.renderConnections();
          self._flowAnimFrame = requestAnimationFrame(animate);
        }
        self._flowAnimFrame = requestAnimationFrame(animate);
        console.log('[NodeEditor] Flow animation started, frameId:', self._flowAnimFrame);
      },

      stopFlowAnimation: function() {
        console.log('[NodeEditor] stopFlowAnimation called');
        if (this._flowAnimFrame) {
          cancelAnimationFrame(this._flowAnimFrame);
          this._flowAnimFrame = null;
        }
        this._flowPhase = 0;
        this.renderConnections();
      },

      // Dirty 표시
      markDirty: function() {
        this.dirty = true;
        document.getElementById('node-make-btn').disabled = false;
        this.updateCreditsDisplay();
      },

      // 노드 삭제
      deleteNode: function(nodeId) {
        this.pushUndo();
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        const el = document.getElementById('node-' + nodeId);
        if (el) el.remove();
        this.renderConnections();
        if (this.selectedNode === nodeId) {
          this.selectedNode = null;
          this.updateInspector();
        }
      },

      // Make 실행 — node-types-ext.js에서 토폴로지 정렬 버전으로 오버라이드됨
      // 이 기본 버전은 Source→Renderer 직접 실행 (fallback)
      execute: async function() {
        console.log('[NodeEditor] Base execute called (should be overridden by node-types-ext.js)');
        if (!this.dirty) return;
        var self = this;

        var makeBtn = document.getElementById('node-make-btn');
        makeBtn.disabled = true;
        // Make 버튼 타이머
        this._startTime = Date.now();
        function _fmt(ms) {
          var s = Math.floor(ms / 1000); var m = Math.floor(s / 60); s = s % 60;
          return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 1 0 10 10"/></svg> ' + _fmt(0);
        this._timerInterval = setInterval(function() {
          makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 1 0 10 10"/></svg> ' + _fmt(Date.now() - self._startTime);
        }, 1000);

        // Source 먼저 실행
        var sourceNodes = this.nodes.filter(function(n) { return n.type === 'source'; });
        for (var i = 0; i < sourceNodes.length; i++) {
          await this.executeSourceNode(sourceNodes[i]);
          sourceNodes[i].dirty = false;
          this.renderNode(sourceNodes[i]);
        }

        // Renderer 병렬 실행
        var rendererNodes = this.nodes.filter(function(n) { return n.type === 'renderer' && n.dirty; });
        var promises = rendererNodes.map(function(n) {
          return self.executeRendererNode(n).then(function() {
            n.dirty = false;
            self.renderNode(n);
          });
        });
        await Promise.all(promises);

        // 완료
        if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
        var sec = ((Date.now() - this._startTime) / 1000).toFixed(1);
        this.dirty = false;
        makeBtn.disabled = false;
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg> Done ' + sec + 's';
        setTimeout(function() {
          makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Make';
        }, 3000);
      },

      // Source 노드 실행
      executeSourceNode: async function(node) {
        console.log('[NodeEditor] executeSourceNode called for node:', node.id, 'imageSize:', state.imageSize);
        const self = this;
        return new Promise((resolve) => {
          // 캡처 요청
          window._nodeSourceCallback = (imageBase64) => {
            console.log('[NodeEditor] Source callback received, image length:', imageBase64 ? imageBase64.length : 0);
            node.data.image = imageBase64;
            node.thumbnail = imageBase64;
            node.dirty = false;
            self.renderNode(node);
            self.updateInspector();
            // 높이 변경 후 연결선 재계산
            requestAnimationFrame(() => self.renderConnections());
            resolve();
          };
          console.log('[NodeEditor] Calling sketchup.captureScene...');
          sketchup.captureScene(state.imageSize);
          // 타임아웃 fallback
          setTimeout(() => {
            if (window._nodeSourceCallback) {
              console.warn('[NodeEditor] Source capture timeout! Resolving without image.');
              window._nodeSourceCallback = null;
              resolve();
            }
          }, 10000);
        });
      },

      // 렌더링 로딩 오버레이 표시
      _showRenderingOverlay: function(node) {
        console.log('[NodeEditor] _showRenderingOverlay called for node:', node.id, node.type);
        var el = document.getElementById('node-' + node.id);
        if (!el) { console.warn('[NodeEditor] No DOM element for node-' + node.id); return; }

        // 소스 이미지를 블러 처리해서 썸네일에 표시
        var inputConn = this.connections.find(function(c) { return c.to === node.id; });
        if (inputConn) {
          var inputNode = this.nodes.find(function(n) { return n.id === inputConn.from; });
          if (inputNode && inputNode.thumbnail) {
            var thumb = el.querySelector('.node-thumbnail');
            if (thumb) {
              thumb.innerHTML = '<img src="data:image/png;base64,' + inputNode.thumbnail + '" style="filter:blur(12px) brightness(0.5);transform:scale(1.1);">';
            }
          }
        }

        // 회전 보더 스피너
        if (!el.querySelector('.node-border-spinner')) {
          var spinner = document.createElement('div');
          spinner.className = 'node-border-spinner';
          spinner.innerHTML = '<div class="node-border-spinner-mask"></div>';
          el.appendChild(spinner);
        }

        // 오버레이
        var overlay = document.createElement('div');
        overlay.className = 'node-running-overlay';
        overlay.innerHTML =
          '<div class="node-shimmer"></div>' +
          '<div class="node-running-content">' +
            '<div class="node-running-ring"><div class="node-running-ring-inner"></div></div>' +
            '<div class="node-running-timer" id="node-timer-' + node.id + '">00:00</div>' +
            '<div class="node-running-label">Rendering...</div>' +
          '</div>';
        var thumbEl = el.querySelector('.node-thumbnail');
        if (thumbEl) {
          thumbEl.style.position = 'relative';
          thumbEl.appendChild(overlay);
        }

        // 상태 클래스
        el.classList.add('status-running', 'processing');

        // 노드별 타이머
        el._nodeTimerStart = Date.now();
        el._nodeTimerInterval = setInterval(function() {
          var timerEl = document.getElementById('node-timer-' + node.id);
          if (!timerEl) return;
          var elapsed = Math.floor((Date.now() - el._nodeTimerStart) / 1000);
          var m = Math.floor(elapsed / 60);
          var s = elapsed % 60;
          timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }, 1000);
      },

      // 렌더링 로딩 오버레이 제거
      _hideRenderingOverlay: function(node) {
        console.log('[NodeEditor] _hideRenderingOverlay called for node:', node.id);
        var el = document.getElementById('node-' + node.id);
        if (!el) return;
        // 모든 오버레이 제거 (중복 생성 대비)
        var overlays = el.querySelectorAll('.node-running-overlay');
        for (var i = 0; i < overlays.length; i++) overlays[i].remove();
        var spinners = el.querySelectorAll('.node-border-spinner');
        for (var i = 0; i < spinners.length; i++) spinners[i].remove();
        el.classList.remove('status-running', 'processing');
        if (el._nodeTimerInterval) {
          clearInterval(el._nodeTimerInterval);
          el._nodeTimerInterval = null;
        }
        el._nodeTimerStart = null;
      },

      // Renderer 노드 실행 (병렬 지원)
      executeRendererNode: async function(node) {
        console.log('[NodeEditor] executeRendererNode called for node:', node.id);
        // 입력 연결 찾기
        const inputConn = this.connections.find(c => c.to === node.id);
        if (!inputConn) { console.warn('[NodeEditor] No input connection for node:', node.id); return Promise.reject(new Error('No input connection')); }

        const sourceNode = this.nodes.find(n => n.id === inputConn.from);
        if (!sourceNode || !sourceNode.data.image) { console.warn('[NodeEditor] No source image for node:', node.id); return Promise.reject(new Error('No source image')); }

        const self = this;
        const renderId = 'node_' + node.id;

        // 로딩 애니메이션 시작 (node-types-ext.js의 _updateNodeStatus에서 이미 오버레이가 있으면 스킵)
        var existingOverlay = document.querySelector('#node-' + node.id + ' .node-running-overlay');
        if (!existingOverlay) {
          console.log('[NodeEditor] Showing rendering overlay for node:', node.id);
          this._showRenderingOverlay(node);
        } else {
          console.log('[NodeEditor] Overlay already exists for node:', node.id, '(from _updateNodeStatus)');
        }

        return new Promise((resolve, reject) => {
          // 노드별 콜백 등록
          window._nodeRendererCallbacks[renderId] = (result) => {
            console.log('[NodeEditor] Render callback fired for:', renderId, 'success:', result.success);
            try {
              // 로딩 애니메이션 종료
              self._hideRenderingOverlay(node);

              if (result.success) {
                node.thumbnail = result.image;
                node.data.image = result.image;
                self.renderNode(node);
                if (self.selectedNode === node.id) {
                  self.updateInspector();
                }
                requestAnimationFrame(() => self.renderConnections());
                self.saveToHistory({
                  image: result.image,
                  prompt: node.data.customPrompt || '',
                  negativePrompt: node.data.negativePrompt || '',
                  nodeType: 'renderer'
                });
                resolve();
              } else {
                console.error('[Node] Render failed:', renderId, result.error);
                var el = document.getElementById('node-' + node.id);
                if (el) el.classList.add('status-error');
                reject(new Error(result.error || 'Render failed'));
              }
            } catch (err) {
              console.error('[NodeEditor] Callback error:', err);
              reject(err);
            }
          };

          // 프롬프트 조합
          var prompt = self.assemblePrompt(node);
          var negPrompt = self.assembleNegativePrompt(node);

          console.log('[NodeEditor] Callback registered for:', renderId);
          console.log('[NodeEditor] Prompt length:', prompt.length, 'NegPrompt length:', negPrompt.length);
          console.log('[NodeEditor] Source time:', sourceNode.data.time, 'light:', sourceNode.data.light);

          // 렌더링 요청
          sketchup.startRender(
            sourceNode.data.time || 'day',
            sourceNode.data.light || 'on',
            prompt,
            negPrompt,
            renderId,
            node.data.engine || 'main'
          );

          // 타임아웃 fallback (120초)
          setTimeout(() => {
            if (window._nodeRendererCallbacks[renderId]) {
              console.warn('[Node] Render timeout:', renderId);
              delete window._nodeRendererCallbacks[renderId];
              self._hideRenderingOverlay(node);
              var el = document.getElementById('node-' + node.id);
              if (el) el.classList.add('status-error');
              reject(new Error('Render timeout (120s)'));
            }
          }, 120000);
        });
      },

      // ========================================
      // 프롬프트 조립 함수
      // ========================================

      // 프리셋 ID로 프리셋 객체 조회
      getPresetById: function(node) {
        var category = node.type === 'renderer' ? 'render' : node.type;
        var presets = nodePresets[category];
        if (!presets) return null;

        // renderer는 presets 배열(복수), 나머지는 presetId(단수)
        if (node.type === 'renderer' && node.data.presets && node.data.presets.length > 0) {
          var presetId = node.data.presets[0];
          for (var i = 0; i < presets.length; i++) {
            if (presets[i].id === presetId) return presets[i];
          }
        } else if (node.data.presetId) {
          for (var i = 0; i < presets.length; i++) {
            if (presets[i].id === node.data.presetId) return presets[i];
          }
        }
        return null;
      },

      // 프롬프트 조립: 프리셋 + 커스텀 결합
      assemblePrompt: function(node) {
        var preset = this.getPresetById(node);
        var custom = node.data.customPrompt || '';

        if (!preset) {
          return custom || 'Create photorealistic interior render';
        }

        // mergeMode 처리: replace면 프리셋만, append면 프리셋+커스텀
        var mergeMode = preset.mergeMode || 'append';
        if (mergeMode === 'replace' || !custom) {
          return preset.prompt;
        }
        return preset.prompt + '. ' + custom;
      },

      // 시스템 프롬프트 조립 (visualConstraints + forbiddenChanges)
      assembleSystemPrompt: function(node) {
        var preset = this.getPresetById(node);
        if (!preset) return '';
        var parts = [];
        if (preset.visualConstraints) parts.push(preset.visualConstraints);
        if (preset.forbiddenChanges) parts.push(preset.forbiddenChanges);
        return parts.join('\n');
      },

      // 네거티브 프롬프트 조립
      assembleNegativePrompt: function(node) {
        var preset = this.getPresetById(node);
        var customNeg = node.data.negativePrompt || '';
        var presetNeg = preset ? (preset.negative || '') : '';

        if (presetNeg && customNeg) {
          return presetNeg + ', ' + customNeg;
        }
        return presetNeg || customNeg;
      },

      // Topological Sort
      topologicalSort: function() {
        const result = [];
        const visited = new Set();
        const nodeMap = new Map(this.nodes.map(n => [n.id, n]));

        const visit = (nodeId) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);

          // 입력 노드들 먼저 방문
          this.connections
            .filter(c => c.to === nodeId)
            .forEach(c => visit(c.from));

          result.push(nodeId);
        };

        this.nodes.forEach(n => visit(n.id));
        return result;
      },

      // ========================================
      // 크레딧 시스템
      // ========================================
      credits: 100,

      _costTable: { source: 0, renderer: 1, modifier: 1, upscale: 2, video: 5, compare: 0 },

      getCostForNode: function(node) {
        if (node.type === 'upscale') return node.data.scale === 4 ? 4 : 2;
        if (node.type === 'video') return node.data.duration >= 10 ? 10 : 5;
        return this._costTable[node.type] || 0;
      },

      estimateCost: function() {
        var total = 0;
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          if (n.dirty && n.status !== 'blocked') {
            total += this.getCostForNode(n);
          }
        }
        return total;
      },

      updateCreditsDisplay: function() {
        var el = document.getElementById('node-credits-display');
        if (!el) return;
        var cost = this.estimateCost();
        el.textContent = 'Credits: ' + this.credits + (cost > 0 ? ' (-' + cost + ')' : '');

        var makeBtn = document.getElementById('node-make-btn');
        if (makeBtn && cost > this.credits) {
          makeBtn.disabled = true;
          el.style.color = '#ff4444';
        } else if (makeBtn && !this.isRunning) {
          makeBtn.disabled = !this.dirty;
          el.style.color = '#7d8590';
        }
      },

      // ========================================
      // 컨텍스트 메뉴
      // ========================================
      _contextMenuEl: null,

      showContextMenu: function(x, y, items) {
        this.hideContextMenu();
        var menu = document.createElement('div');
        menu.className = 'node-context-menu';

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.divider) {
            var div = document.createElement('div');
            div.className = 'node-context-menu-divider';
            menu.appendChild(div);
            continue;
          }
          var el = document.createElement('div');
          el.className = 'node-context-menu-item' + (item.danger ? ' danger' : '');
          el.textContent = item.label;
          el.addEventListener('click', (function(action) {
            return function() { nodeEditor.hideContextMenu(); action(); };
          })(item.action));
          menu.appendChild(el);
        }

        // 뷰포트 경계 확인
        document.body.appendChild(menu);
        var rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        this._contextMenuEl = menu;
      },

      hideContextMenu: function() {
        if (this._contextMenuEl) {
          this._contextMenuEl.remove();
          this._contextMenuEl = null;
        }
      },

      // ========================================
      // 노드 복제
      // ========================================
      duplicateNode: function(nodeId) {
        var orig = this.nodes.find(function(n) { return n.id === nodeId; });
        if (!orig) return null;

        var newData = JSON.parse(JSON.stringify(orig.data));
        // 이미지 데이터는 복제하지 않음
        delete newData.image;

        var newNode = this.addNode(orig.type, orig.x + 40, orig.y + 40);
        newNode.data = newData;
        newNode.dirty = true;
        newNode.thumbnail = null;
        this.renderNode(newNode);
        return newNode;
      },

      // ========================================
      // 노드 자동 정렬
      // ========================================
      rearrangeNodes: function() {
        if (this.nodes.length === 0) return;

        // BFS 레이어 계산
        var inDegree = {};
        var children = {};
        for (var i = 0; i < this.nodes.length; i++) {
          inDegree[this.nodes[i].id] = 0;
          children[this.nodes[i].id] = [];
        }
        for (var i = 0; i < this.connections.length; i++) {
          var c = this.connections[i];
          if (inDegree[c.to] !== undefined) inDegree[c.to]++;
          if (children[c.from]) children[c.from].push(c.to);
        }

        var queue = [];
        for (var id in inDegree) {
          if (inDegree[id] === 0) queue.push(parseInt(id));
        }

        var depth = 0;
        while (queue.length > 0) {
          var nextQueue = [];
          for (var q = 0; q < queue.length; q++) {
            var nid = queue[q];
            var node = this.nodes.find(function(n) { return n.id === nid; });
            if (node) {
              node.x = depth * 400 + 80;
              node.y = q * 260 + 80;
            }
            var kids = children[nid] || [];
            for (var k = 0; k < kids.length; k++) {
              inDegree[kids[k]]--;
              if (inDegree[kids[k]] === 0) nextQueue.push(kids[k]);
            }
          }
          queue = nextQueue;
          depth++;
        }

        // 전체 재렌더
        for (var i = 0; i < this.nodes.length; i++) {
          this.renderNode(this.nodes[i]);
        }
        this.renderConnections();
      },

      // ========================================
      // Undo / Redo
      // ========================================
      _undoStack: [],
      _redoStack: [],
      _maxUndoSize: 50,

      pushUndo: function() {
        var snapshot = this._serializeGraph();
        this._undoStack.push(snapshot);
        if (this._undoStack.length > this._maxUndoSize) {
          this._undoStack.shift();
        }
        // 새 액션 시 redo 스택 초기화
        this._redoStack = [];
      },

      undo: function() {
        if (this._undoStack.length === 0) return;
        var current = this._serializeGraph();
        this._redoStack.push(current);
        var snapshot = this._undoStack.pop();
        this._restoreGraph(snapshot);
      },

      redo: function() {
        if (this._redoStack.length === 0) return;
        var current = this._serializeGraph();
        this._undoStack.push(current);
        var snapshot = this._redoStack.pop();
        this._restoreGraph(snapshot);
      },

      _serializeGraph: function() {
        var nodesData = [];
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          var dataCopy = JSON.parse(JSON.stringify(n.data));
          // 이미지 데이터 제외 (메모리 절약)
          delete dataCopy.image;
          delete dataCopy.mask;
          nodesData.push({
            id: n.id,
            type: n.type,
            x: n.x,
            y: n.y,
            dirty: n.dirty,
            status: n.status || 'idle',
            data: dataCopy,
            hasThumbnail: !!n.thumbnail
          });
        }
        return JSON.stringify({
          nodes: nodesData,
          connections: this.connections.slice(),
          nextNodeId: this.nextNodeId
        });
      },

      _restoreGraph: function(snapshotStr) {
        var snapshot = JSON.parse(snapshotStr);

        // 기존 DOM 제거
        var container = document.getElementById('node-canvas');
        var nodeEls = container.querySelectorAll('.node');
        for (var i = 0; i < nodeEls.length; i++) {
          nodeEls[i].remove();
        }

        // 데이터 복원
        this.connections = snapshot.connections;
        this.nextNodeId = snapshot.nextNodeId;
        this.nodes = [];

        for (var i = 0; i < snapshot.nodes.length; i++) {
          var sn = snapshot.nodes[i];
          var node = {
            id: sn.id,
            type: sn.type,
            x: sn.x,
            y: sn.y,
            dirty: sn.dirty,
            status: sn.status || 'idle',
            data: sn.data,
            thumbnail: null
          };
          this.nodes.push(node);
          this.renderNode(node);
        }

        this.renderConnections();
        this.selectNode(null);
      },

      // ============= History =============
      _history: [],
      _maxHistory: 50,

      saveToHistory: function(snapshot) {
        // snapshot: { image, prompt, negativePrompt, nodeType, timestamp }
        if (!snapshot || !snapshot.image) return;
        snapshot.timestamp = snapshot.timestamp || Date.now();
        snapshot.id = 'hist-' + snapshot.timestamp + '-' + Math.random().toString(36).substr(2, 4);
        this._history.unshift(snapshot);
        if (this._history.length > this._maxHistory) {
          this._history.pop();
        }
      },

      renderHistoryPage: function() {
        var grid = document.getElementById('node-history-grid');
        if (!grid) return;

        if (this._history.length === 0) {
          grid.innerHTML = '<div class="node-history-empty">No history yet. Render some images to see them here.</div>';
          return;
        }

        var html = '';
        for (var i = 0; i < this._history.length; i++) {
          var item = this._history[i];
          var imgSrc = item.image.startsWith('data:') ? item.image : 'data:image/png;base64,' + item.image;
          var date = new Date(item.timestamp);
          var timeStr = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
          html += '<div class="node-history-card" data-hist-idx="' + i + '">' +
            '<div class="node-history-card-img"><img src="' + imgSrc + '" alt="History"></div>' +
            '<div class="node-history-card-info">' +
              '<span class="node-history-card-type">' + (item.nodeType || 'render') + '</span>' +
              '<span class="node-history-card-time">' + timeStr + '</span>' +
            '</div>' +
            '<div class="node-history-card-overlay">' +
              '<button class="node-history-use-btn" data-hist-idx="' + i + '">Use</button>' +
            '</div>' +
          '</div>';
        }
        grid.innerHTML = html;
      },

      toggleHistoryPage: function() {
        var page = document.getElementById('node-history-page');
        if (!page) return;
        var isVisible = !page.classList.contains('hidden');
        if (isVisible) {
          page.classList.add('hidden');
        } else {
          this.renderHistoryPage();
          page.classList.remove('hidden');
        }
      },

      loadHistoryItem: function(index) {
        var item = this._history[index];
        if (!item) return;
        // 선택된 노드가 있으면 결과 이미지 적용
        if (this.selectedNode) {
          var node = this.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
          if (node) {
            node.data.image = item.image;
            node.dirty = false;
            this.renderNode(node);
            this.updateInspector();
          }
        }
        // History 페이지 닫기
        var page = document.getElementById('node-history-page');
        if (page) page.classList.add('hidden');
      },

      // ============= Cache Key =============

      // djb2 해시 함수
      _djb2Hash: function(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
          hash = ((hash << 5) + hash) + str.charCodeAt(i);
          hash = hash & hash; // 32비트 정수로 유지
        }
        return hash >>> 0; // unsigned
      },

      computeCacheKey: function(node) {
        // type + 정렬된 파라미터 + 입력 해시
        var parts = [node.type];

        // 파라미터 정렬
        var keys = Object.keys(node.data).sort();
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          // image, mask, videoUrl은 제외 (결과 데이터)
          if (k === 'image' || k === 'mask' || k === 'videoUrl') continue;
          var v = node.data[k];
          if (typeof v === 'object') v = JSON.stringify(v);
          parts.push(k + '=' + v);
        }

        // 입력 노드의 캐시 키 포함
        var conn = this.connections.find(function(c) { return c.to === node.id; });
        if (conn) {
          var inputNode = this.nodes.find(function(n) { return n.id === conn.from; });
          if (inputNode && inputNode._cacheKey) {
            parts.push('input=' + inputNode._cacheKey);
          }
        }

        return this._djb2Hash(parts.join('|')).toString(36);
      },

      // 실행 전 캐시 키 비교
      shouldSkipExecution: function(node) {
        var newKey = this.computeCacheKey(node);
        if (node._cacheKey === newKey && node.data.image && !node.dirty) {
          return true; // 캐시 히트, 실행 스킵
        }
        node._cacheKey = newKey;
        return false;
      },

      // ============= Minimap =============

      renderMinimap: function() {
        var enlargedImage = document.getElementById('node-enlarged-image');
        var enlargedPreview = document.getElementById('node-enlarged-preview');
        if (!enlargedPreview || !enlargedPreview.classList.contains('active')) return;

        // 미니맵: 전체 노드를 축소 렌더링
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x + 320 > maxX) maxX = n.x + 320;
          if (n.y + 200 > maxY) maxY = n.y + 200;
        }
        if (this.nodes.length === 0) return;

        var padding = 40;
        var graphW = (maxX - minX) + padding * 2;
        var graphH = (maxY - minY) + padding * 2;

        var containerW = enlargedImage.clientWidth || 400;
        var containerH = enlargedImage.clientHeight || 300;
        var scale = Math.min(containerW / graphW, containerH / graphH, 1);

        var html = '<div class="minimap-container" style="position:relative;width:' + (graphW * scale) + 'px;height:' + (graphH * scale) + 'px;margin:auto;">';
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          var nx = (n.x - minX + padding) * scale;
          var ny = (n.y - minY + padding) * scale;
          var nw = 320 * scale;
          var nh = 180 * scale;
          var icon = this._icons[n.type] || '?';
          var title = this._titles[n.type] || n.type;
          var statusClass = n.status ? ' status-' + n.status : '';
          html += '<div class="minimap-node' + statusClass + '" style="position:absolute;left:' + nx + 'px;top:' + ny + 'px;width:' + nw + 'px;height:' + nh + 'px;" title="' + title + ' #' + n.id + '">';
          html += '<span style="font-size:' + Math.max(10, 12 * scale) + 'px;">' + icon + ' ' + title + '</span>';
          html += '</div>';
        }
        html += '</div>';
        enlargedImage.innerHTML = html;
      }
    };

    // Node Editor 이벤트
    document.getElementById('node-canvas-area').addEventListener('click', (e) => {
      if (e.target.id === 'node-canvas-area' || e.target.classList.contains('node-canvas-grid')) {
        nodeEditor.selectNode(null);
      }
    });

    // 드래그 mousemove - RAF + Canvas 직접 그리기
    var _dragRAF = 0;
    var _dragMX = 0, _dragMY = 0;
    document.addEventListener('mousemove', (e) => {
      // 캔버스 팬 모드
      if (nodeEditor._isPanning) {
        var dx = e.clientX - nodeEditor._panStart.x;
        var dy = e.clientY - nodeEditor._panStart.y;
        nodeEditor._panX = nodeEditor._panStartPanX + dx / nodeEditor._zoom;
        nodeEditor._panY = nodeEditor._panStartPanY + dy / nodeEditor._zoom;
        nodeEditor._applyZoom();
        return;
      }
      if (!nodeEditor.draggingNode) return;
      _dragMX = e.clientX;
      _dragMY = e.clientY;
      if (_dragRAF) return;
      _dragRAF = requestAnimationFrame(function() {
        _dragRAF = 0;
        var dn = nodeEditor.draggingNode;
        if (!dn) return;
        // 줌 보정된 캔버스 좌표
        var cp = nodeEditor.screenToCanvas(_dragMX, _dragMY);
        var nx = cp.x - nodeEditor.dragOffset.x;
        var ny = cp.y - nodeEditor.dragOffset.y;
        dn.x = nx;
        dn.y = ny;
        var del = nodeEditor._dragEl;
        if (del) del.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
        nodeEditor.renderConnections();
      });
    });

    document.addEventListener('mouseup', () => {
      if (nodeEditor._isPanning) {
        nodeEditor._isPanning = false;
        return;
      }
      if (nodeEditor.draggingNode) {
        nodeEditor.pushUndo();
        if (nodeEditor._dragEl) nodeEditor._dragEl.classList.remove('dragging');
        nodeEditor.renderConnections();
      }
      nodeEditor.draggingNode = null;
      nodeEditor._dragEl = null;
      nodeEditor._dragConns = null;
      nodeEditor.connecting = null;
    });

    // 툴바 버튼
    document.getElementById('node-add-source').addEventListener('click', () => {
      nodeEditor.addNode('source', 100 + Math.random() * 100, 100 + Math.random() * 100);
    });

    document.getElementById('node-add-renderer').addEventListener('click', () => {
      nodeEditor.addNode('renderer', 400 + Math.random() * 100, 100 + Math.random() * 100);
    });

    document.getElementById('node-delete').addEventListener('click', () => {
      if (nodeEditor.selectedNode) {
        nodeEditor.deleteNode(nodeEditor.selectedNode);
      }
    });

    document.getElementById('node-make-btn').addEventListener('click', () => {
      nodeEditor.execute();
    });

    // Inspector 이벤트 - Source
    document.getElementById('inspector-source').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-time], [data-light]');
      if (!btn) return;

      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node) return;

      if (btn.dataset.time) {
        node.data.time = btn.dataset.time;
        node.dirty = true;
      }
      if (btn.dataset.light) {
        node.data.light = btn.dataset.light;
        node.dirty = true;
      }

      nodeEditor.markDirty();
      nodeEditor.renderNode(node);
      nodeEditor.updateInspector();
    });

    document.getElementById('node-source-capture').addEventListener('click', () => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && node.type === 'source') {
        nodeEditor.executeSourceNode(node);
      }
    });

    // Inspector 이벤트 - Renderer
    // 노드 모델 드롭다운 토글
    var nodeModelDropdown = document.getElementById('node-model-dropdown');
    if (nodeModelDropdown) {
      var nodeModelSelected = document.getElementById('node-model-selected');
      var nodeModelMenu = document.getElementById('node-model-menu');

      nodeModelSelected.addEventListener('click', function(e) {
        e.stopPropagation();
        nodeModelDropdown.classList.toggle('open');
      });

      nodeModelMenu.addEventListener('click', function(e) {
        var item = e.target.closest('.dropdown-item');
        if (!item) return;
        e.stopPropagation();

        var modelValue = item.dataset.value;
        var modelText = item.childNodes[0].textContent.trim();

        // 선택 상태 업데이트
        nodeModelMenu.querySelectorAll('.dropdown-item').forEach(function(di) {
          di.classList.remove('selected');
        });
        item.classList.add('selected');
        document.getElementById('node-model-selected-text').textContent = modelText;
        nodeModelDropdown.classList.remove('open');

        // 노드 데이터에 모델 저장
        var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
        if (node) {
          node.data.engine = modelValue;
          node.dirty = true;
          nodeEditor.markDirty();
          nodeEditor.renderNode(node);
        }
      });

      // 외부 클릭 시 닫기
      document.addEventListener('click', function() {
        nodeModelDropdown.classList.remove('open');
      });
    }

    document.getElementById('inspector-renderer').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-res], [data-aspect], [data-preset]');
      if (!btn) return;

      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node) return;

      if (btn.dataset.res) {
        node.data.resolution = btn.dataset.res;
        node.dirty = true;
      }
      if (btn.dataset.aspect) {
        node.data.aspect = btn.dataset.aspect;
        node.dirty = true;
      }
      if (btn.dataset.preset) {
        var presetId = btn.dataset.preset;
        var idx = node.data.presets.indexOf(presetId);
        if (idx >= 0) {
          node.data.presets.splice(idx, 1);
        } else {
          node.data.presets.push(presetId);
        }
        node.dirty = true;

        // 프리셋 프롬프트를 하단 바에 즉시 반영
        var preset = nodePresets.render.find(function(p) { return p.id === presetId; });
        if (preset && idx < 0) {
          // 새로 선택됨 → 프리셋 프롬프트로 채움
          node.data.customPrompt = preset.prompt;
          node.data.negativePrompt = preset.negative || '';
          document.getElementById('node-prompt-input').value = preset.prompt;
          document.getElementById('node-prompt-negative-input').value = preset.negative || '';
          var inspPrompt = document.getElementById('node-custom-prompt');
          if (inspPrompt) inspPrompt.value = preset.prompt;
        }
      }

      nodeEditor.markDirty();
      nodeEditor.renderNode(node);
      nodeEditor.updateInspector();
    });

    document.getElementById('node-custom-prompt').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && node.type === 'renderer') {
        node.data.customPrompt = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
        nodeEditor.renderNode(node);
      }
    });

    // 아코디언 토글 이벤트
    document.querySelectorAll('.node-inspector-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });

    // Inspector 탭 이벤트 - 컨텐츠 전환
    document.querySelectorAll('.node-inspector-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        // 탭 활성 상태
        document.querySelectorAll('.node-inspector-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 컨텐츠 전환
        document.querySelectorAll('.node-preview-tab-content').forEach(c => c.classList.remove('active'));
        const content = document.querySelector('.node-preview-tab-content[data-content="' + tabName + '"]');
        if (content) content.classList.add('active');
        // Enlarge 모드 활성화 시 동기화
        const enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview.classList.contains('active')) {
          document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
          const matchTab = document.querySelector('.node-enlarged-tab[data-tab="' + tabName + '"]');
          if (matchTab) matchTab.classList.add('active');
        }
      });
    });

    // Enlarge 버튼 토글
    document.getElementById('node-enlarge-btn').addEventListener('click', () => {
      const enlargedPreview = document.getElementById('node-enlarged-preview');
      const canvasArea = document.getElementById('node-canvas-area');
      const inspectorPreview = document.querySelector('.node-inspector-preview');
      const enlargeBtn = document.getElementById('node-enlarge-btn');
      const isActive = enlargedPreview.classList.toggle('active');

      canvasArea.classList.toggle('minimized', isActive);
      inspectorPreview.classList.toggle('minimap-mode', isActive);
      enlargeBtn.classList.toggle('active', isActive);

      if (isActive) {
        // 현재 Inspector 프리뷰 이미지를 enlarged로 복사
        const previewImg = document.querySelector('#node-preview-image img');
        const enlargedImage = document.getElementById('node-enlarged-image');
        if (previewImg) {
          enlargedImage.innerHTML = '<img src="' + previewImg.src + '" alt="Enlarged Preview">';
        } else if (!nodeEditor.selectedNode && nodeEditor.nodes.length > 0) {
          // 노드 미선택 시 미니맵 표시
          nodeEditor.renderMinimap();
        } else {
          enlargedImage.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
        }
        // 현재 Inspector 탭 상태를 enlarged 탭에 동기화
        const activeTab = document.querySelector('.node-inspector-tab.active');
        if (activeTab) {
          document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
          const matchTab = document.querySelector('.node-enlarged-tab[data-tab="' + activeTab.dataset.tab + '"]');
          if (matchTab) matchTab.classList.add('active');
        }
      }
    });

    // Enlarged 뷰 탭 이벤트
    document.querySelectorAll('.node-enlarged-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        // Enlarged 탭 활성 상태
        document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Inspector 탭도 동기화
        document.querySelectorAll('.node-inspector-tab').forEach(t => t.classList.remove('active'));
        const matchTab = document.querySelector('.node-inspector-tab[data-tab="' + tabName + '"]');
        if (matchTab) matchTab.classList.add('active');
        // Inspector 컨텐츠도 전환
        document.querySelectorAll('.node-preview-tab-content').forEach(c => c.classList.remove('active'));
        const content = document.querySelector('.node-preview-tab-content[data-content="' + tabName + '"]');
        if (content) content.classList.add('active');
      });
    });

    // 하단 프롬프트 바 입력 연동 (renderer, modifier, upscale, video 모두 지원)
    var _promptNodeTypes = { renderer: true, modifier: true, upscale: true, video: true };
    document.getElementById('node-prompt-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && _promptNodeTypes[node.type]) {
        node.data.customPrompt = e.target.value;
        var inspectorPrompt = document.getElementById('node-custom-prompt');
        if (inspectorPrompt) inspectorPrompt.value = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // Negative 프롬프트 연동
    document.getElementById('node-prompt-negative-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && _promptNodeTypes[node.type]) {
        node.data.negativePrompt = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // 프롬프트 탭 전환
    document.querySelectorAll('.node-prompt-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        if (this.disabled) return;
        var tabName = this.dataset.promptTab;
        document.querySelectorAll('.node-prompt-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        document.querySelectorAll('.node-prompt-content').forEach(function(c) { c.classList.remove('active'); });
        var content = document.querySelector('.node-prompt-content[data-prompt-content="' + tabName + '"]');
        if (content) content.classList.add('active');
      });
    });

    // Auto 프롬프트 생성 버튼
    document.getElementById('node-prompt-auto-btn').addEventListener('click', () => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node || !_promptNodeTypes[node.type]) return;

      // Source 노드 찾기
      const inputConn = nodeEditor.connections.find(c => c.to === node.id);
      if (!inputConn) return;
      const sourceNode = nodeEditor.nodes.find(n => n.id === inputConn.from);
      if (!sourceNode) return;

      const style = (node.data.presets && node.data.presets.length > 0)
        ? node.data.presets.join(', ') : '';
      const time = sourceNode.data.time || 'day';
      const light = sourceNode.data.light || 'on';

      // Auto 프롬프트 콜백 등록
      window._nodeAutoPromptCallback = (prompt) => {
        node.data.customPrompt = prompt;
        document.getElementById('node-prompt-input').value = prompt;
        const inspectorPrompt = document.getElementById('node-custom-prompt');
        if (inspectorPrompt) inspectorPrompt.value = prompt;
        node.dirty = true;
        nodeEditor.markDirty();
        window._nodeAutoPromptCallback = null;
      };

      sketchup.generateAutoPrompt(style, time, light);
    });

    // 키보드 단축키: Escape, Undo, Redo
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        nodeEditor.hideContextMenu();
        const enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview && enlargedPreview.classList.contains('active')) {
          document.getElementById('node-enlarge-btn').click();
        }
      }
      // Ctrl+Z = Undo, Ctrl+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        nodeEditor.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        nodeEditor.redo();
      }
      // Delete 키로 선택 노드 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (nodeEditor.selectedNode) {
          nodeEditor.deleteNode(nodeEditor.selectedNode);
        }
      }
    });

    // 컨텍스트 메뉴: 캔버스 우클릭
    document.getElementById('node-canvas-area').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      var nodeEl = e.target.closest('.node');
      if (nodeEl) {
        // 노드 우클릭
        var nodeId = parseInt(nodeEl.id.replace('node-', ''));
        nodeEditor.selectNode(nodeId);
        var ctxItems = [
          { label: 'Make', action: function() { nodeEditor.execute(); } },
          { label: 'Duplicate', action: function() { nodeEditor.duplicateNode(nodeId); } },
          { label: '---' },
          { label: 'Compare A', action: function() { nodeEditor._compareA = nodeId; } },
          { label: 'Compare B', action: function() { nodeEditor._compareB = nodeId; } },
          { label: '---' },
          { label: 'Delete', danger: true, action: function() { nodeEditor.deleteNode(nodeId); } }
        ];
        nodeEditor.showContextMenu(e.clientX, e.clientY, ctxItems);
      } else {
        // 캔버스 빈 영역 우클릭 — 줌 보정
        var cp = nodeEditor.screenToCanvas(e.clientX, e.clientY);
        var cx = cp.x, cy = cp.y;
        nodeEditor.showContextMenu(e.clientX, e.clientY, [
          { label: 'Add Source', action: function() { nodeEditor.addNode('source', cx, cy); } },
          { label: 'Add Renderer', action: function() { nodeEditor.addNode('renderer', cx, cy); } },
          { label: 'Add Modifier', action: function() { nodeEditor.addNode('modifier', cx, cy); } },
          { label: 'Add Upscale', action: function() { nodeEditor.addNode('upscale', cx, cy); } },
          { label: 'Add Video', action: function() { nodeEditor.addNode('video', cx, cy); } },
          { label: 'Add Compare', action: function() { nodeEditor.addNode('compare', cx, cy); } },
          { label: '---' },
          { label: 'Rearrange Nodes', action: function() { nodeEditor.rearrangeNodes(); } },
          { label: 'Clear All', danger: true, action: function() {
            if (nodeEditor.nodes.length === 0) return;
            nodeEditor.pushUndo();
            nodeEditor.nodes = [];
            nodeEditor.connections = [];
            nodeEditor.selectedNode = null;
            var area = document.getElementById('node-canvas-area');
            area.querySelectorAll('.node').forEach(function(n) { n.remove(); });
            nodeEditor.renderConnections();
            nodeEditor.updateInspector();
          }}
        ]);
      }
    });

    // 클릭으로 컨텍스트 메뉴 닫기
    document.addEventListener('click', () => {
      nodeEditor.hideContextMenu();
    });

    // History 버튼 이벤트
    document.getElementById('menu-history').addEventListener('click', () => {
      // 노드 모드일 때만 History 페이지 토글
      var nodeContainer = document.getElementById('node-editor-container');
      if (nodeContainer && !nodeContainer.classList.contains('hidden')) {
        nodeEditor.toggleHistoryPage();
      }
    });

    // History 닫기 버튼
    var histClose = document.getElementById('node-history-close');
    if (histClose) {
      histClose.addEventListener('click', () => {
        var page = document.getElementById('node-history-page');
        if (page) page.classList.add('hidden');
      });
    }

    // History 카드 Use 버튼
    document.getElementById('node-history-grid').addEventListener('click', (e) => {
      var useBtn = e.target.closest('.node-history-use-btn');
      if (useBtn) {
        var idx = parseInt(useBtn.dataset.histIdx);
        nodeEditor.loadHistoryItem(idx);
      }
    });

    // ==========================================
    // 캔버스 줌 (마우스 휠) & 팬 (스페이스+드래그 or 중간 버튼)
    // ==========================================
    var canvasArea = document.getElementById('node-canvas-area');

    // 마우스 휠 줌 (multiplicative for natural feel)
    canvasArea.addEventListener('wheel', function(e) {
      e.preventDefault();
      var rect = canvasArea.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var factor = e.deltaY > 0 ? 0.92 : 1.08;
      var newZoom = nodeEditor._zoom * factor;
      nodeEditor.setZoom(newZoom, mx, my);
    }, { passive: false });

    // 캔버스 빈 영역 드래그로 팬 (스페이스바 누른 상태 또는 중간 버튼)
    var _spaceDown = false;
    document.addEventListener('keydown', function(e) {
      if (e.code === 'Space' && !e.target.matches('input,textarea')) {
        _spaceDown = true;
        canvasArea.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', function(e) {
      if (e.code === 'Space') {
        _spaceDown = false;
        canvasArea.style.cursor = '';
      }
    });

    canvasArea.addEventListener('mousedown', function(e) {
      // 스페이스+클릭 또는 중간 버튼으로 팬
      if (_spaceDown || e.button === 1) {
        e.preventDefault();
        nodeEditor._isPanning = true;
        nodeEditor._panStart = { x: e.clientX, y: e.clientY };
        nodeEditor._panStartPanX = nodeEditor._panX;
        nodeEditor._panStartPanY = nodeEditor._panY;
        canvasArea.style.cursor = 'grabbing';
      }
    });

    canvasArea.addEventListener('mouseup', function() {
      if (nodeEditor._isPanning) {
        canvasArea.style.cursor = _spaceDown ? 'grab' : '';
      }
    });

    // 줌 리셋 버튼 (더블클릭으로 리셋)
    canvasArea.addEventListener('dblclick', function(e) {
      if (e.target.id === 'node-canvas-area' || e.target.classList.contains('node-canvas-grid')) {
        nodeEditor.resetZoom();
      }
    });

    // 프롬프트 바 리사이즈 드래그 핸들
    var promptBar = document.querySelector('.node-bottom-bar');
    var promptHandle = document.getElementById('node-prompt-resize-handle');
    if (promptHandle) {
      var _resizing = false;
      var _resizeStartY = 0;
      var _resizeStartH = 0;

      promptHandle.addEventListener('mousedown', function(e) {
        _resizing = true;
        _resizeStartY = e.clientY;
        _resizeStartH = promptBar.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      document.addEventListener('mousemove', function(e) {
        if (!_resizing) return;
        var dy = _resizeStartY - e.clientY;
        var newH = Math.max(60, Math.min(400, _resizeStartH + dy));
        promptBar.style.height = newH + 'px';
        // textarea도 함께 늘어남
        var ta = document.getElementById('node-prompt-input');
        if (ta) ta.style.height = Math.max(24, newH - 50) + 'px';
      });

      document.addEventListener('mouseup', function() {
        if (_resizing) {
          _resizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
