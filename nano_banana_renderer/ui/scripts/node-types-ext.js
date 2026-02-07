// NanoBanana - Extended Node Types (modifier, upscale, video, compare)
// Extends nodeEditor with new node types

(function() {
  // 새 노드 타입 기본 데이터
  var extDefaults = {
    modifier: function() {
      return {
        prompt: '',
        presetId: null,
        negativePrompt: '',
        mask: null,
        customPrompt: ''
      };
    },
    upscale: function() {
      return {
        scale: 2,
        optimizedFor: 'standard',
        creativity: 0.5,
        detailStrength: 0.5,
        similarity: 0.5,
        promptStrength: 0.5,
        prompt: 'Upscale',
        customPrompt: ''
      };
    },
    video: function() {
      return {
        engine: 'kling',
        duration: 5,
        prompt: 'Move forward',
        endFrameImage: null,
        customPrompt: ''
      };
    },
    compare: function() {
      return {
        mode: 'slider',
        imageA: null,
        imageB: null
      };
    }
  };

  // 새 노드 타입 아이콘
  var extIcons = {
    modifier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    upscale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M9 8l-3 4 3 4"/><path d="M15 8l3 4-3 4"/></svg>'
  };

  var extTitles = {
    modifier: 'Modifier',
    upscale: 'Upscale',
    video: 'Video',
    compare: 'Compare'
  };

  // 기존 getDefaultData 확장
  var origGetDefault = nodeEditor.getDefaultData;
  nodeEditor.getDefaultData = function(type) {
    if (extDefaults[type]) return extDefaults[type]();
    return origGetDefault.call(this, type);
  };

  // 기존 renderNode 확장 - icons/titles에 새 타입 추가
  var origRenderNode = nodeEditor.renderNode;
  nodeEditor.renderNode = function(node, positionOnly) {
    // icons/titles 주입 (renderNode 내부에서 참조하는 로컬 변수를 오버라이드 못하므로
    // 별도 처리: 새 타입은 여기서 직접 렌더링)
    if (extIcons[node.type]) {
      this._renderExtNode(node, positionOnly);
      return;
    }
    origRenderNode.call(this, node, positionOnly);
  };

  // 새 타입 노드 렌더링
  nodeEditor._renderExtNode = function(node, positionOnly) {
    var canvas = document.getElementById('node-canvas');
    var el = document.getElementById('node-' + node.id);
    var isNew = !el;

    if (isNew) {
      el = document.createElement('div');
      el.id = 'node-' + node.id;
      el.className = 'node node-' + node.type;
      if (node.dirty) el.classList.add('dirty');
      el.style.willChange = 'transform';
      canvas.appendChild(el);
      var self = this;
      el.addEventListener('mousedown', function(e) { self.onNodeMouseDown(e, node); });
      el.addEventListener('click', function(e) { e.stopPropagation(); self.selectNode(node.id); });
    }

    el.style.transform = 'translate(' + node.x + 'px, ' + node.y + 'px)';
    el.classList.toggle('dirty', node.dirty);
    el.classList.toggle('selected', this.selectedNode === node.id);

    if (positionOnly) return;

    var currentState = (node.thumbnail || '') + '|' + node.type + '|' + node.dirty;
    if (!isNew && el._cachedState === currentState) return;
    el._cachedState = currentState;

    var icon = extIcons[node.type];
    var title = extTitles[node.type];
    var hasImage = !!node.thumbnail;

    // 미니툴바
    var toolbarHtml = '';
    if (hasImage) {
      toolbarHtml = '<div class="node-mini-toolbar">';
      toolbarHtml += '<button class="node-mini-toolbar-btn" data-add="modifier" title="Add Modifier">' + extIcons.modifier + '</button>';
      toolbarHtml += '<button class="node-mini-toolbar-btn" data-add="upscale" title="Add Upscale">' + extIcons.upscale + '</button>';
      if (node.type !== 'video') {
        toolbarHtml += '<button class="node-mini-toolbar-btn" data-add="video" title="Add Video">' + extIcons.video + '</button>';
      }
      toolbarHtml += '</div>';
    }

    // 포트 설정 (compare: 2입력 0출력, video: 1입력 0출력)
    var inputPort = '<div class="node-port node-port-input" data-port="input"></div>';
    var outputPort = '<div class="node-port node-port-output" data-port="output"></div>';
    if (node.type === 'compare') {
      outputPort = '';
    } else if (node.type === 'video') {
      outputPort = '';
    }

    if (hasImage) {
      var imgSrc = node.thumbnail.startsWith('data:') ? node.thumbnail : 'data:image/png;base64,' + node.thumbnail;
      el.innerHTML = toolbarHtml +
        '<div class="node-thumbnail" style="border-radius:6px;"><img src="' + imgSrc + '"></div>' +
        '<div class="node-ports">' + inputPort + outputPort + '</div>' +
        '<div class="node-progress"><div class="node-progress-bar"></div></div>' +
        '<div class="node-label-outside"><div class="node-title">' + title + '</div></div>';
    } else {
      el.innerHTML = toolbarHtml +
        '<div class="node-thumbnail"><div class="node-header-icon">' + icon + '</div></div>' +
        '<div class="node-ports">' + inputPort + outputPort + '</div>' +
        '<div class="node-progress"><div class="node-progress-bar"></div></div>' +
        '<div class="node-label-outside"><div class="node-title">' + title + '</div></div>';
    }

    // 포트 이벤트
    var self = this;
    el.querySelectorAll('.node-port').forEach(function(port) {
      port.addEventListener('mousedown', function(e) { e.stopPropagation(); self.startConnect(node.id, port.dataset.port); });
      port.addEventListener('mouseup', function(e) { e.stopPropagation(); self.endConnect(node.id, port.dataset.port); });
    });

    // 미니툴바 이벤트
    el.querySelectorAll('.node-mini-toolbar-btn').forEach(function(btn) {
      btn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      btn.addEventListener('click', function(e) { e.stopPropagation(); self.addNodeBelow(node, btn.dataset.add); });
    });

    requestAnimationFrame(function() { el._cachedHeight = el.offsetHeight; });
  };

  // addNodeBelow 확장 - 새 타입 자동 연결
  var origAddNodeBelow = nodeEditor.addNodeBelow;
  nodeEditor.addNodeBelow = function(clickedNode, newType) {
    if (!extDefaults[newType]) {
      return origAddNodeBelow.call(this, clickedNode, newType);
    }

    // 같은 타입 중 가장 아래 노드 찾기
    var sameTypeNodes = this.nodes.filter(function(n) { return n.type === newType; });
    var targetX, targetY;

    if (sameTypeNodes.length > 0) {
      var bottomNode = sameTypeNodes.reduce(function(a, b) { return a.y > b.y ? a : b; });
      targetX = bottomNode.x;
      targetY = bottomNode.y + 260;
    } else {
      targetX = clickedNode.x + 400;
      targetY = clickedNode.y;
    }

    var newNode = this.addNode(newType, targetX, targetY);
    // 자동 연결: 클릭한 노드 → 새 노드
    if (newType !== 'compare') {
      this.connect(clickedNode.id, newNode.id);
    }
  };

  // execute 확장 - DAG 순서로 모든 노드 타입 실행
  var origExecute = nodeEditor.execute;
  nodeEditor.execute = async function() {
    if (!this.dirty) return;

    var makeBtn = document.getElementById('node-make-btn');
    makeBtn.disabled = true;
    makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Processing...';

    var self = this;
    var sortedIds = this.topologicalSort();

    for (var i = 0; i < sortedIds.length; i++) {
      var nodeId = sortedIds[i];
      var node = this.nodes.find(function(n) { return n.id === nodeId; });
      if (!node || !node.dirty) continue;

      var el = document.getElementById('node-' + node.id);
      if (el) el.classList.add('processing');

      if (node.type === 'source') {
        await this.executeSourceNode(node);
      } else if (node.type === 'renderer' || node.type === 'modifier') {
        await this.executeRendererNode(node);
      } else if (node.type === 'upscale') {
        await this._executeUpscaleNode(node);
      } else if (node.type === 'video') {
        await this._executeVideoNode(node);
      }
      // compare는 실행 없음

      node.dirty = false;
      if (el) el.classList.remove('processing');
      this.renderNode(node);
    }

    this.dirty = false;
    makeBtn.disabled = false;
    makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Make';
  };

  // Upscale 노드 실행 (렌더러와 동일한 Ruby 콜백 사용)
  nodeEditor._executeUpscaleNode = async function(node) {
    var inputConn = this.connections.find(function(c) { return c.to === node.id; });
    if (!inputConn) return;
    var srcNode = this.nodes.find(function(n) { return n.id === inputConn.from; });
    if (!srcNode || !srcNode.data.image) return;

    var self = this;
    var renderId = 'node_' + node.id;

    return new Promise(function(resolve) {
      window._nodeRendererCallbacks[renderId] = function(result) {
        if (result.success) {
          node.thumbnail = result.image;
          node.data.image = result.image;
          self.renderNode(node);
          if (self.selectedNode === node.id) self.updateInspector();
          requestAnimationFrame(function() { self.renderConnections(); });
        }
        resolve();
      };

      var prompt = node.data.customPrompt || node.data.prompt || 'Upscale';
      sketchup.startRender('day', 'on', prompt, '', renderId);

      setTimeout(function() {
        if (window._nodeRendererCallbacks[renderId]) {
          window._nodeRendererCallbacks[renderId]({ success: false, error: 'Timeout' });
        }
      }, 120000);
    });
  };

  // Video 노드 실행
  nodeEditor._executeVideoNode = async function(node) {
    var inputConn = this.connections.find(function(c) { return c.to === node.id; });
    if (!inputConn) return;
    var srcNode = this.nodes.find(function(n) { return n.id === inputConn.from; });
    if (!srcNode || !srcNode.data.image) return;

    var self = this;
    var renderId = 'node_' + node.id;

    return new Promise(function(resolve) {
      window._nodeRendererCallbacks[renderId] = function(result) {
        if (result.success) {
          node.thumbnail = result.image;
          node.data.image = result.image;
          self.renderNode(node);
          if (self.selectedNode === node.id) self.updateInspector();
          requestAnimationFrame(function() { self.renderConnections(); });
        }
        resolve();
      };

      var prompt = node.data.customPrompt || node.data.prompt || 'Move forward';
      sketchup.startRender('day', 'on', prompt, '', renderId);

      setTimeout(function() {
        if (window._nodeRendererCallbacks[renderId]) {
          window._nodeRendererCallbacks[renderId]({ success: false, error: 'Timeout' });
        }
      }, 120000);
    });
  };

  // 연결 규칙 강화 - DAG 순환 금지, Video 출력 금지
  var origConnect = nodeEditor.connect;
  nodeEditor.connect = function(fromId, toId) {
    var fromNode = this.nodes.find(function(n) { return n.id === fromId; });
    var toNode = this.nodes.find(function(n) { return n.id === toId; });
    if (!fromNode || !toNode) return;

    // Video는 출력 불가 (말단)
    if (fromNode.type === 'video') return;
    // Compare는 출력 불가
    if (fromNode.type === 'compare') return;

    // 순환 검사
    if (this._hasCycle(fromId, toId)) return;

    origConnect.call(this, fromId, toId);
  };

  // 순환 검사
  nodeEditor._hasCycle = function(fromId, toId) {
    var visited = {};
    var self = this;
    function dfs(id) {
      if (id === fromId) return true;
      if (visited[id]) return false;
      visited[id] = true;
      var outConns = self.connections.filter(function(c) { return c.from === id; });
      for (var i = 0; i < outConns.length; i++) {
        if (dfs(outConns[i].to)) return true;
      }
      return false;
    }
    return dfs(toId);
  };

})();
