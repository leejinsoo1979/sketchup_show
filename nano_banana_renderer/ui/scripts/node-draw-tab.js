// NanoBanana - Draw Tab (Canvas 2D Mask Drawing)
// Modifier 노드의 마스크 영역을 드로잉으로 지정
(function() {
  'use strict';

  var MASK_COLORS = {
    '#ff0000': [255, 0, 0],
    '#00ff00': [0, 255, 0],
    '#0088ff': [0, 136, 255],
    '#ffff00': [255, 255, 0]
  };

  var drawTab = {
    canvas: null,
    ctx: null,
    wrapper: null,
    isDrawing: false,
    tool: 'pen',       // pen | eraser
    color: '#ff0000',
    brushSize: 10,
    bgImage: null,      // 배경 이미지 (source/renderer 결과)
    _targetNodeId: null, // mask를 저장할 modifier 노드 ID

    init: function() {
      this.canvas = document.getElementById('draw-canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.wrapper = document.getElementById('draw-canvas-wrapper');
      if (!this.canvas || !this.ctx) return;

      var self = this;

      // 마우스 이벤트
      this.canvas.addEventListener('mousedown', function(e) { self._onMouseDown(e); });
      this.canvas.addEventListener('mousemove', function(e) { self._onMouseMove(e); });
      this.canvas.addEventListener('mouseup', function() { self._onMouseUp(); });
      this.canvas.addEventListener('mouseleave', function() { self._onMouseUp(); });

      // 툴바 이벤트
      var toolbar = document.getElementById('draw-toolbar');
      if (toolbar) {
        toolbar.addEventListener('click', function(e) {
          var toolBtn = e.target.closest('.draw-tool-btn');
          if (toolBtn) {
            var tool = toolBtn.dataset.tool;
            if (tool === 'clear') {
              self.clearCanvas();
              return;
            }
            self.setTool(tool);
            toolbar.querySelectorAll('.draw-tool-btn').forEach(function(b) {
              b.classList.toggle('active', b.dataset.tool === tool);
            });
          }
          var colorBtn = e.target.closest('.draw-color-btn');
          if (colorBtn) {
            self.setColor(colorBtn.dataset.color);
            toolbar.querySelectorAll('.draw-color-btn').forEach(function(b) {
              b.classList.toggle('active', b.dataset.color === colorBtn.dataset.color);
            });
          }
        });
      }

      // 브러시 크기 슬라이더
      var slider = document.getElementById('draw-brush-size');
      var label = document.getElementById('draw-size-label');
      if (slider) {
        slider.addEventListener('input', function() {
          self.brushSize = parseInt(slider.value);
          if (label) label.textContent = slider.value;
        });
      }

      // Ctrl+V 이미지 붙여넣기
      document.addEventListener('paste', function(e) {
        var drawContent = document.querySelector('.node-preview-tab-content[data-content="draw"]');
        if (!drawContent || !drawContent.classList.contains('active')) return;

        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            var blob = items[i].getAsFile();
            var reader = new FileReader();
            reader.onload = function(ev) {
              self.loadBackgroundImage(ev.target.result);
            };
            reader.readAsDataURL(blob);
            e.preventDefault();
            break;
          }
        }
      });
    },

    setTool: function(tool) {
      this.tool = tool;
      if (this.canvas) {
        this.canvas.style.cursor = (tool === 'eraser') ? 'cell' : 'crosshair';
      }
    },

    setColor: function(color) {
      this.color = color;
    },

    clearCanvas: function() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (this.bgImage) {
        this._drawBackground();
      }
    },

    // 배경 이미지 로드 (source/renderer 결과 이미지)
    loadBackgroundImage: function(dataUrl) {
      var self = this;
      var img = new Image();
      img.onload = function() {
        self.bgImage = img;
        self._resizeCanvas();
        self._drawBackground();
      };
      img.src = dataUrl;
    },

    // 선택된 노드의 입력 이미지를 배경으로 로드
    loadFromNode: function(nodeId) {
      this._targetNodeId = nodeId;
      if (!nodeEditor || !nodeEditor.nodes) return;

      var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
      if (!node) return;

      // modifier 노드의 입력 이미지 찾기
      var conn = nodeEditor.connections.find(function(c) { return c.to === nodeId; });
      if (conn) {
        var inputNode = nodeEditor.nodes.find(function(n) { return n.id === conn.from; });
        if (inputNode && inputNode.data && inputNode.data.image) {
          this.loadBackgroundImage(inputNode.data.image);
          return;
        }
      }

      // 입력 이미지가 없으면 빈 캔버스
      this.bgImage = null;
      this._resizeCanvas();
      if (this.ctx) {
        this.ctx.fillStyle = '#1c2128';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    },

    // 마스크 이미지를 PNG data URL로 내보내기
    exportMask: function() {
      if (!this.canvas) return null;

      // 배경 없이 드로잉만 추출할 임시 캔버스 생성
      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.canvas.width;
      tempCanvas.height = this.canvas.height;
      var tempCtx = tempCanvas.getContext('2d');

      // 원본 캔버스 복사
      tempCtx.drawImage(this.canvas, 0, 0);

      // 배경 이미지가 있으면 제거 (difference blend)
      if (this.bgImage) {
        tempCtx.globalCompositeOperation = 'destination-out';
        // 배경과 동일 영역을 지워서 마스크만 남기는 대신,
        // 간단히 전체 캔버스를 마스크로 사용 (배경 포함)
        tempCtx.globalCompositeOperation = 'source-over';
      }

      return tempCanvas.toDataURL('image/png');
    },

    // 마스크를 대상 노드에 저장
    saveMaskToNode: function() {
      if (!this._targetNodeId || !nodeEditor) return;
      var node = nodeEditor.nodes.find(function(n) { return n.id === drawTab._targetNodeId; });
      if (!node || node.type !== 'modifier') return;

      var maskData = this.exportMask();
      if (maskData) {
        node.data.mask = maskData;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    },

    _resizeCanvas: function() {
      if (!this.canvas || !this.wrapper) return;
      var wrapperW = this.wrapper.clientWidth || 400;
      var wrapperH = this.wrapper.clientHeight || 300;

      if (this.bgImage) {
        var ratio = this.bgImage.width / this.bgImage.height;
        var canvasW = wrapperW;
        var canvasH = canvasW / ratio;
        if (canvasH > wrapperH) {
          canvasH = wrapperH;
          canvasW = canvasH * ratio;
        }
        this.canvas.width = canvasW;
        this.canvas.height = canvasH;
      } else {
        this.canvas.width = wrapperW;
        this.canvas.height = wrapperH;
      }
    },

    _drawBackground: function() {
      if (!this.ctx || !this.bgImage) return;
      this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
    },

    _getPos: function(e) {
      var rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    },

    _onMouseDown: function(e) {
      this.isDrawing = true;
      var pos = this._getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);

      if (this.tool === 'eraser') {
        this.ctx.globalCompositeOperation = 'destination-out';
      } else {
        this.ctx.globalCompositeOperation = 'source-over';
      }

      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // 점 찍기
      this.ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
      this.ctx.stroke();
    },

    _onMouseMove: function(e) {
      if (!this.isDrawing) return;
      var pos = this._getPos(e);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    },

    _onMouseUp: function() {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.ctx.globalCompositeOperation = 'source-over';

      // 자동으로 마스크 저장
      this.saveMaskToNode();
    }
  };

  // 전역 등록
  window.drawTab = drawTab;

  // DOM 준비 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { drawTab.init(); });
  } else {
    drawTab.init();
  }
})();
