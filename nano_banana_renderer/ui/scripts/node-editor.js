// NanoBanana Renderer - Node Editor
    // ========================================
    // Node Editor System
    // ========================================
    const nodeEditor = {
      nodes: [],
      connections: [],
      nextNodeId: 1,
      selectedNode: null,
      draggingNode: null,
      dragOffset: { x: 0, y: 0 },
      connecting: null, // 연결 중인 노드 ID
      dirty: false,

      // 노드 추가
      addNode: function(type, x, y) {
        const node = {
          id: this.nextNodeId++,
          type: type,
          x: x,
          y: y,
          dirty: true,
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
            mode: 'nanobanana-pro',
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
        const currentState = (node.thumbnail || '') + '|' + node.type + '|' + node.dirty;
        if (!isNew && el._cachedState === currentState) return;
        el._cachedState = currentState;

        const icons = {
          source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
          renderer: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.435,3.06H5.565a2.5,2.5,0,0,0-2.5,2.5V18.44a2.507,2.507,0,0,0,2.5,2.5h12.87a2.507,2.507,0,0,0,2.5-2.5V5.56A2.5,2.5,0,0,0,18.435,3.06ZM4.065,5.56a1.5,1.5,0,0,1,1.5-1.5h12.87a1.5,1.5,0,0,1,1.5,1.5v8.66l-3.88-3.88a1.509,1.509,0,0,0-2.12,0l-4.56,4.57a.513.513,0,0,1-.71,0l-.56-.56a1.522,1.522,0,0,0-2.12,0l-1.92,1.92Zm15.87,12.88a1.5,1.5,0,0,1-1.5,1.5H5.565a1.5,1.5,0,0,1-1.5-1.5v-.75L6.7,15.06a.5.5,0,0,1,.35-.14.524.524,0,0,1,.36.14l.55.56a1.509,1.509,0,0,0,2.12,0l4.57-4.57a.5.5,0,0,1,.71,0l4.58,4.58Z"/><path d="M8.062,10.565a2.5,2.5,0,1,1,2.5-2.5A2.5,2.5,0,0,1,8.062,10.565Zm0-4a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,8.062,6.565Z"/></svg>',
          animation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M2 15h20M7 4v16M12 4v16M17 4v16"/><path d="M10 11.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>'
        };
        const icon = icons[node.type] || icons.renderer;

        const titles = { source: 'Source', renderer: 'Renderer', animation: 'Animation' };
        const title = titles[node.type] || node.type;
        const hasImage = !!node.thumbnail;

        // 미니툴바: 이미지 없는 카드는 툴바 표시 안함
        const showToolbar = hasImage;
        const showAnimation = node.type === 'renderer' && hasImage;
        const animBtn = showAnimation ? `
            <button class="node-mini-toolbar-btn" data-add="animation" title="Add Animation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20"/><path d="M7 4v5M12 4v5M17 4v5"/><path d="M10 14l5 3-5 3z" fill="currentColor" stroke="none"/></svg>
            </button>` : '';
        const miniToolbar = showToolbar ? `
          <div class="node-mini-toolbar">
            <button class="node-mini-toolbar-btn" data-add="source" title="Add Source">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="14" height="18" rx="2"/><rect x="7" y="6" width="8" height="5" rx="1"/><line x1="7" y1="14" x2="15" y2="14"/><line x1="7" y1="17" x2="12" y2="17"/><circle cx="17" cy="18" r="4.5" fill="#1c2128" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="16" x2="17" y2="20"/><line x1="15" y1="18" x2="19" y2="18"/></svg>
            </button>
            <button class="node-mini-toolbar-btn" data-add="renderer" title="Add Renderer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="10" r="2"/><path d="M3 17l4.5-4.5a1.5 1.5 0 0 1 2.1 0l3.9 3.9"/><path d="M14 15l1.5-1.5a1.5 1.5 0 0 1 2.1 0L21 17"/><path d="M17 3l2 2.5L17 8" stroke-width="1.5" fill="none"/></svg>
            </button>${animBtn}
          </div>` : '';

        if (hasImage) {
          const existingImg = el.querySelector('.node-thumbnail img');
          if (existingImg && el._hasImage) {
            existingImg.src = 'data:image/png;base64,' + node.thumbnail;
            return;
          }
          el._hasImage = true;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail" style="border-radius:6px;">
              <img src="data:image/png;base64,${node.thumbnail}">
            </div>
            <div class="node-ports">
              ${node.type === 'source' ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              <div class="node-port node-port-output" data-port="output"></div>
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
            </div>
          `;
        } else {
          el._hasImage = false;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail">
              <div class="node-header-icon">${icon}</div>
            </div>
            <div class="node-ports">
              ${node.type === 'source' ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              <div class="node-port node-port-output" data-port="output"></div>
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
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

        // 높이 캐시 (다음 프레임에서 측정 - 현재 프레임의 레이아웃 계산 안 함)
        requestAnimationFrame(() => {
          el._cachedHeight = el.offsetHeight;
        });
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
        const negativeRow = document.querySelector('.node-prompt-negative-row');
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
          negativeRow.classList.remove('visible');
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
          negativeRow.classList.remove('visible');
          autoBtn.disabled = true;
        } else if (node.type === 'renderer') {
          rendererEl.classList.remove('hidden');
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
          negativeRow.classList.add('visible');
          autoBtn.disabled = false;
        }
      },

      // 드래그 시작
      onNodeMouseDown: function(e, node) {
        if (e.target.classList.contains('node-port')) return;
        this.draggingNode = node;
        this.dragOffset = {
          x: e.clientX - node.x,
          y: e.clientY - node.y
        };
        const el = document.getElementById('node-' + node.id);
        if (el) el.classList.add('dragging');
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

      // 연결선 렌더링 (노드 좌표 기반으로 직접 계산 - 리플로우 완전 회피)
      _connPaths: [],  // SVG path 엘리먼트 캐시
      renderConnections: function() {
        const svg = document.getElementById('node-connections');
        const nodeWidth = 320;
        let pathIndex = 0;

        this.connections.forEach(conn => {
          const fromNode = this.nodes.find(n => n.id === conn.from);
          const toNode = this.nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return;

          // 캐시된 높이 사용 (리플로우 완전 회피)
          const fromEl = document.getElementById('node-' + fromNode.id);
          const toEl = document.getElementById('node-' + toNode.id);
          if (!fromEl || !toEl) return;
          const fromH = fromEl._cachedHeight || 200;
          const toH = toEl._cachedHeight || 200;

          // 포트 중심점 정확 계산
          // output 포트: right:-8px, 12px 원 → 중심 X = nodeWidth + 8 - 6 = nodeWidth + 2
          // input 포트: left:-8px, 12px 원 → 중심 X = -8 + 6 = -2
          // 포트 Y: top:50%; margin-top:-8px → 중심 = nodeHeight/2 - 8 + 8 = nodeHeight/2
          const x1 = fromNode.x + nodeWidth + 2;
          const y1 = fromNode.y + fromH * 0.5;
          const x2 = toNode.x - 2;
          const y2 = toNode.y + toH * 0.5;

          // 부드러운 베지어 커브 (수평 탄젠트)
          const dx = Math.abs(x2 - x1) * 0.5;
          const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

          let path;
          if (pathIndex < this._connPaths.length) {
            path = this._connPaths[pathIndex];
            path.setAttribute('d', d);
          } else {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'node-connection');
            svg.appendChild(path);
            this._connPaths.push(path);
          }
          path.setAttribute('d', d);
          pathIndex++;
        });

        // 남은 path 숨기기 (제거 대신 재사용)
        while (pathIndex < this._connPaths.length) {
          this._connPaths[pathIndex].setAttribute('d', '');
          pathIndex++;
        }
      },

      // Dirty 표시
      markDirty: function() {
        this.dirty = true;
        document.getElementById('node-make-btn').disabled = false;
      },

      // 노드 삭제
      deleteNode: function(nodeId) {
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

      // Make 실행 (Source → 병렬 Renderer)
      execute: async function() {
        if (!this.dirty) return;

        const makeBtn = document.getElementById('node-make-btn');
        makeBtn.disabled = true;
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Processing...';

        const self = this;

        // 1단계: Source 노드 먼저 순차 실행
        const sourceNodes = this.nodes.filter(n => n.type === 'source');
        for (const node of sourceNodes) {
          const el = document.getElementById('node-' + node.id);
          if (el) el.classList.add('processing');
          await this.executeSourceNode(node);
          node.dirty = false;
          if (el) el.classList.remove('processing');
          this.renderNode(node);
        }

        // 2단계: Renderer 노드 병렬 실행
        const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
        if (rendererNodes.length > 0) {
          // 모든 렌더러에 processing 표시
          rendererNodes.forEach(node => {
            const el = document.getElementById('node-' + node.id);
            if (el) el.classList.add('processing');
          });

          // 병렬 실행
          const renderPromises = rendererNodes.map(node => {
            return self.executeRendererNode(node).then(() => {
              node.dirty = false;
              const el = document.getElementById('node-' + node.id);
              if (el) el.classList.remove('processing');
              self.renderNode(node);
            });
          });

          await Promise.all(renderPromises);
        }

        this.dirty = false;
        makeBtn.disabled = false;
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Make';
      },

      // Source 노드 실행
      executeSourceNode: async function(node) {
        const self = this;
        return new Promise((resolve) => {
          // 캡처 요청
          window._nodeSourceCallback = (imageBase64) => {
            node.data.image = imageBase64;
            node.thumbnail = imageBase64;
            node.dirty = false;
            self.renderNode(node);
            self.updateInspector();
            // 높이 변경 후 연결선 재계산
            requestAnimationFrame(() => self.renderConnections());
            resolve();
          };
          sketchup.captureScene(state.imageSize);
          // 타임아웃 fallback
          setTimeout(() => {
            if (window._nodeSourceCallback) {
              resolve();
            }
          }, 10000);
        });
      },

      // Renderer 노드 실행 (병렬 지원)
      executeRendererNode: async function(node) {
        // 입력 연결 찾기
        const inputConn = this.connections.find(c => c.to === node.id);
        if (!inputConn) return;

        const sourceNode = this.nodes.find(n => n.id === inputConn.from);
        if (!sourceNode || !sourceNode.data.image) return;

        const self = this;
        const renderId = 'node_' + node.id;

        return new Promise((resolve) => {
          // 노드별 콜백 등록
          window._nodeRendererCallbacks[renderId] = (result) => {
            if (result.success) {
              node.thumbnail = result.image;
              node.data.image = result.image;
              self.renderNode(node);
              // 선택된 노드면 Inspector 프리뷰 업데이트
              if (self.selectedNode === node.id) {
                self.updateInspector();
              }
              // 높이 변경 후 연결선 재계산
              requestAnimationFrame(() => self.renderConnections());
            } else {
              console.error('[Node] Render failed:', renderId, result.error);
            }
            resolve();
          };

          // 프롬프트 조합
          let prompt = node.data.customPrompt || 'Create photorealistic interior render';
          if (node.data.presets && node.data.presets.length > 0) {
            prompt += '. Style: ' + node.data.presets.join(', ');
          }
          const negPrompt = node.data.negativePrompt || '';

          // 렌더링 요청 (render_id 포함 → Ruby Thread로 병렬 실행)
          sketchup.startRender(
            sourceNode.data.time,
            sourceNode.data.light,
            prompt,
            negPrompt,
            renderId
          );

          // 타임아웃 fallback (120초)
          setTimeout(() => {
            if (window._nodeRendererCallbacks[renderId]) {
              console.warn('[Node] Render timeout:', renderId);
              window._nodeRendererCallbacks[renderId]({ success: false, error: 'Timeout' });
            }
          }, 120000);
        });
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
      }
    };

    // Node Editor 이벤트
    document.getElementById('node-canvas-area').addEventListener('click', (e) => {
      if (e.target.id === 'node-canvas-area' || e.target.classList.contains('node-canvas-grid')) {
        nodeEditor.selectNode(null);
      }
    });

    // 드래그 mousemove - requestAnimationFrame으로 throttle + positionOnly 렌더링
    let _dragRafId = null;
    document.addEventListener('mousemove', (e) => {
      if (!nodeEditor.draggingNode) return;
      const nx = e.clientX - nodeEditor.dragOffset.x;
      const ny = e.clientY - nodeEditor.dragOffset.y;
      nodeEditor.draggingNode.x = nx;
      nodeEditor.draggingNode.y = ny;
      if (!_dragRafId) {
        _dragRafId = requestAnimationFrame(() => {
          nodeEditor.renderNode(nodeEditor.draggingNode, true);
          nodeEditor.renderConnections();
          _dragRafId = null;
        });
      }
    });

    document.addEventListener('mouseup', () => {
      if (_dragRafId) { cancelAnimationFrame(_dragRafId); _dragRafId = null; }
      if (nodeEditor.draggingNode) {
        const el = document.getElementById('node-' + nodeEditor.draggingNode.id);
        if (el) el.classList.remove('dragging');
      }
      nodeEditor.draggingNode = null;
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
        const idx = node.data.presets.indexOf(btn.dataset.preset);
        if (idx >= 0) {
          node.data.presets.splice(idx, 1);
        } else {
          node.data.presets.push(btn.dataset.preset);
        }
        node.dirty = true;
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

    // 하단 프롬프트 바 입력 연동
    document.getElementById('node-prompt-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode && n.type === 'renderer');
      if (node) {
        node.data.customPrompt = e.target.value;
        const inspectorPrompt = document.getElementById('node-custom-prompt');
        if (inspectorPrompt) inspectorPrompt.value = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // Negative 프롬프트 연동
    document.getElementById('node-prompt-negative-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode && n.type === 'renderer');
      if (node) {
        node.data.negativePrompt = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // Auto 프롬프트 생성 버튼
    document.getElementById('node-prompt-auto-btn').addEventListener('click', () => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode && n.type === 'renderer');
      if (!node) return;

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

    // Escape 키로 Enlarge 모드 해제
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview && enlargedPreview.classList.contains('active')) {
          document.getElementById('node-enlarge-btn').click();
        }
      }
    });
