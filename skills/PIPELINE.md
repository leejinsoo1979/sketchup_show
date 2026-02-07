# PIPELINE.md — DAG 실행 파이프라인

---

## 실행 원칙

1. **자동 실행 없음.** 노드 연결/수정 시 실행하지 않는다.
2. **Make 버튼 클릭 시에만 실행한다.**
3. 선택된 노드를 기준으로 상위(upstream) 서브그래프를 추출하여 실행한다.
4. 같은 레벨의 노드는 병렬 실행한다 (Promise.all).
5. 캐시 히트 노드는 스킵한다.
6. 에러 발생 시 하위 노드를 blocked 상태로 전환한다.

---

## 노드 상태 머신

```
idle → queued → running → done
                    ↘ error

(외부 트리거)
idle → blocked   (상위 노드 error 시)
```

- `idle`: 초기 상태 또는 파라미터 변경 시
- `queued`: Make 클릭 후 실행 대기
- `running`: 엔진 API 호출 중
- `done`: 실행 완료 + 결과 저장됨
- `error`: 실행 실패
- `blocked`: 상위 노드 실패로 실행 불가
- `cancelled`: 사용자 취소

---

## Make 버튼 전체 흐름

```javascript
/**
 * Make 버튼 클릭 핸들러
 * @param {string|number} selectedNodeId - 선택된 노드 ID
 */
function onMakeClick(selectedNodeId) {
  var nodes = nodeEditor.nodes;
  var connections = nodeEditor.connections;

  // ── 1단계: 서브그래프 추출 ──
  var subgraphNodeIds = resolveUpstream(selectedNodeId, connections);
  var subgraphNodes = nodes.filter(function(n) {
    return subgraphNodeIds.has(n.id);
  });

  // ── 2단계: DAG 검증 ──
  if (detectCycle(subgraphNodeIds, connections)) {
    showError("순환 연결이 감지되었습니다");
    return;
  }

  // ── 3단계: 캐시 확인 ──
  for (var i = 0; i < subgraphNodes.length; i++) {
    var node = subgraphNodes[i];
    var cacheKey = computeCacheKey(node, nodes, connections);
    if (node.result && node.result.cacheKey === cacheKey) {
      // 파라미터 변경 없음 → 스킵
      node.status = "done";
    } else {
      node.status = "idle";  // 재실행 필요
    }
  }

  // ── 4단계: 비용 계산 ──
  var pendingNodes = subgraphNodes.filter(function(n) {
    return n.status !== "done";
  });
  var totalCost = pendingNodes.reduce(function(sum, n) {
    return sum + n.cost;
  }, 0);

  if (nodeEditor.credits < totalCost) {
    showError("크레딧이 부족합니다");
    return;
  }

  // ── 5단계: 토폴로지컬 정렬 ──
  var levels = topologicalSort(pendingNodes, connections);

  // ── 6단계: 실행 상태 진입 ──
  nodeEditor.isRunning = true;
  for (var j = 0; j < pendingNodes.length; j++) {
    updateNodeStatus(pendingNodes[j].id, "queued");
  }

  // ── 7단계: 레벨별 실행 ──
  executeLevels(levels, 0, function() {
    // ── 8단계: 히스토리 저장 ──
    nodeEditor.isRunning = false;
    saveSnapshot({
      nodes: nodeEditor.nodes,
      connections: nodeEditor.connections,
      creditUsed: totalCost,
      timestamp: new Date().toISOString()
    });
  }, function() {
    // 에러 시에도 실행 상태 해제
    nodeEditor.isRunning = false;
  });
}

/**
 * 레벨별 순차 실행 (각 레벨 내 노드는 병렬)
 * @param {Array[]} levels - 토폴로지컬 정렬된 레벨 배열
 * @param {number} index - 현재 레벨 인덱스
 * @param {Function} onComplete - 전체 완료 콜백
 * @param {Function} onError - 에러 콜백
 */
function executeLevels(levels, index, onComplete, onError) {
  if (index >= levels.length) {
    onComplete();
    return;
  }

  var level = levels[index];
  Promise.all(
    level.map(function(node) {
      return executeNode(node);
    })
  ).then(function() {
    executeLevels(levels, index + 1, onComplete, onError);
  }).catch(function(err) {
    onError(err);
  });
}
```

---

## 상위 서브그래프 추출

```javascript
/**
 * 선택된 노드의 상위(upstream) 서브그래프 노드 ID 집합을 반환한다
 * @param {string|number} nodeId - 시작 노드 ID
 * @param {Array} connections - 연결 배열 [{from, to}, ...]
 * @returns {Set} 서브그래프에 포함된 노드 ID 집합
 */
function resolveUpstream(nodeId, connections) {
  var result = new Set();
  var queue = [nodeId];

  while (queue.length > 0) {
    var current = queue.shift();
    if (result.has(current)) continue;
    result.add(current);

    // 이 노드의 입력을 제공하는 노드들
    var incomingConns = connections.filter(function(c) {
      return c.to === current;
    });
    for (var i = 0; i < incomingConns.length; i++) {
      queue.push(incomingConns[i].from);
    }
  }

  return result;
}
```

---

## 토폴로지컬 정렬 (Kahn's Algorithm)

```javascript
/**
 * Kahn's Algorithm으로 토폴로지컬 정렬 수행
 * @param {Array} nodes - 정렬할 노드 배열
 * @param {Array} connections - 연결 배열 [{from, to}, ...]
 * @returns {Array[]} 레벨별 노드 배열 (levels[0] = 루트 노드들)
 */
function topologicalSort(nodes, connections) {
  var nodeIds = new Set(nodes.map(function(n) { return n.id; }));
  var relevantConns = connections.filter(function(c) {
    return nodeIds.has(c.from) && nodeIds.has(c.to);
  });

  // in-degree 계산
  /** @type {Map<string|number, number>} */
  var inDegree = new Map();
  /** @type {Map<string|number, Array>} */
  var adj = new Map();

  var i, j;
  for (i = 0; i < nodes.length; i++) {
    inDegree.set(nodes[i].id, 0);
    adj.set(nodes[i].id, []);
  }

  for (i = 0; i < relevantConns.length; i++) {
    var conn = relevantConns[i];
    inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
    adj.get(conn.from).push(conn.to);
  }

  // 레벨별 수집
  var levels = [];
  var queue = nodes.filter(function(n) {
    return inDegree.get(n.id) === 0;
  });

  while (queue.length > 0) {
    levels.push(queue.slice());
    var next = [];

    for (i = 0; i < queue.length; i++) {
      var neighbors = adj.get(queue[i].id);
      for (j = 0; j < neighbors.length; j++) {
        var neighborId = neighbors[j];
        var newDeg = inDegree.get(neighborId) - 1;
        inDegree.set(neighborId, newDeg);
        if (newDeg === 0) {
          var found = nodes.find(function(n) { return n.id === neighborId; });
          if (found) next.push(found);
        }
      }
    }

    queue = next;
  }

  return levels;  // levels[0] = 루트 노드들, levels[1] = 다음 레벨, ...
}
```

---

## 단일 노드 실행

```javascript
/**
 * 단일 노드를 실행하고 결과를 저장한다
 * @param {Object} node - 실행할 노드 객체
 * @returns {Promise} 실행 완료 Promise
 */
function executeNode(node) {
  updateNodeStatus(node.id, "running");

  var inputResult = getInputResult(node);
  var preset = node.params.presetId
    ? getPresetById(node.params.presetId)
    : null;
  var assembled = assemblePrompt(node, preset);
  var prompt = assembled.prompt;
  var systemPrompt = assembled.systemPrompt;
  var negativePrompt = assembled.negativePrompt;

  /** @type {Promise} */
  var resultPromise;

  switch (node.type) {
    case "SOURCE":
      resultPromise = Promise.resolve({
        image: node.params.image,
        resolution: "original",
        timestamp: now(),
        cacheKey: computeCacheKey(node)
      });
      break;

    case "RENDER":
      resultPromise = api.render({
        engine: node.params.engine,
        image: inputResult.image,
        prompt: prompt,
        systemPrompt: systemPrompt,
        negativePrompt: negativePrompt,
        seed: node.params.seed,
        resolution: node.params.resolution
      });
      break;

    case "MODIFIER":
      resultPromise = api.modify({
        image: inputResult.image,
        prompt: prompt,
        systemPrompt: systemPrompt,
        negativePrompt: negativePrompt,
        mask: node.params.mask,
        maskLayers: node.params.maskLayers
      });
      break;

    case "UPSCALE":
      resultPromise = api.upscale({
        image: inputResult.image,
        scale: node.params.scale,
        optimizedFor: node.params.optimizedFor,
        creativity: node.params.creativity,
        detailStrength: node.params.detailStrength,
        similarity: node.params.similarity,
        promptStrength: node.params.promptStrength,
        prompt: prompt
      });
      break;

    case "VIDEO":
      resultPromise = api.generateVideo({
        engine: node.params.engine,
        image: inputResult.image,
        endFrame: node.params.endFrameImage,
        duration: node.params.duration,
        prompt: prompt
      });
      break;

    case "COMPARE":
      resultPromise = Promise.resolve({
        timestamp: now(),
        cacheKey: ""
      });
      break;

    default:
      resultPromise = Promise.resolve({
        timestamp: now(),
        cacheKey: ""
      });
      break;
  }

  return resultPromise.then(function(result) {
    result.cacheKey = computeCacheKey(node);
    var targetNode = nodeEditor.nodes.find(function(n) { return n.id === node.id; });
    if (targetNode) {
      targetNode.result = result;
      targetNode.status = "done";
    }
    nodeEditor.credits -= node.cost;
  }).catch(function(error) {
    var targetNode = nodeEditor.nodes.find(function(n) { return n.id === node.id; });
    if (targetNode) {
      targetNode.status = "error";
    }
    markDescendantsBlocked(node.id);
  });
}
```

---

## 에러 전파

```javascript
/**
 * 에러 발생 노드의 모든 하위 노드를 blocked 상태로 전환한다
 * @param {string|number} nodeId - 에러 발생 노드 ID
 */
function markDescendantsBlocked(nodeId) {
  var connections = nodeEditor.connections;
  var descendants = new Set();
  var queue = [nodeId];

  while (queue.length > 0) {
    var current = queue.shift();
    var outgoing = connections.filter(function(c) {
      return c.from === current;
    });
    for (var i = 0; i < outgoing.length; i++) {
      var conn = outgoing[i];
      if (!descendants.has(conn.to)) {
        descendants.add(conn.to);
        queue.push(conn.to);
        var targetNode = nodeEditor.nodes.find(function(n) {
          return n.id === conn.to;
        });
        if (targetNode) {
          targetNode.status = "blocked";
        }
      }
    }
  }
}
```

---

## 캐시 키 계산

```javascript
/**
 * 노드의 캐시 키를 계산한다
 * @param {Object} node - 대상 노드
 * @param {Array} [allNodes] - 전체 노드 배열
 * @param {Array} [connections] - 전체 연결 배열
 * @returns {string} SHA-256 해시 문자열
 */
function computeCacheKey(node, allNodes, connections) {
  var inputHash = getInputImageHash(node, allNodes, connections);
  var payload = JSON.stringify({
    type: node.type,
    params: sortedParams(node.params),
    inputHash: inputHash
  });
  return sha256(payload);
}

/**
 * 입력 이미지의 해시를 구한다 (상위 노드의 캐시키 사용)
 * @param {Object} node - 대상 노드
 * @param {Array} allNodes - 전체 노드 배열
 * @param {Array} connections - 전체 연결 배열
 * @returns {string} 입력 이미지 해시
 */
function getInputImageHash(node, allNodes, connections) {
  if (!connections) return "root";

  var incomingConn = null;
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].to === node.id) {
      incomingConn = connections[i];
      break;
    }
  }
  if (!incomingConn) return "root";

  var inputNode = null;
  for (var j = 0; j < allNodes.length; j++) {
    if (allNodes[j].id === incomingConn.from) {
      inputNode = allNodes[j];
      break;
    }
  }
  if (!inputNode || !inputNode.result || !inputNode.result.cacheKey) return "pending";

  return inputNode.result.cacheKey;
}
```

---

## 순환 감지

```javascript
/**
 * 서브그래프에 순환이 있는지 DFS로 검사한다
 * @param {Set} nodeIds - 검사할 노드 ID 집합
 * @param {Array} connections - 연결 배열 [{from, to}, ...]
 * @returns {boolean} 순환 존재 여부
 */
function detectCycle(nodeIds, connections) {
  var visited = new Set();
  var inStack = new Set();

  function dfs(nodeId) {
    visited.add(nodeId);
    inStack.add(nodeId);

    var outgoing = connections.filter(function(c) {
      return c.from === nodeId && nodeIds.has(c.to);
    });
    for (var i = 0; i < outgoing.length; i++) {
      var conn = outgoing[i];
      if (inStack.has(conn.to)) return true;       // 순환 발견
      if (!visited.has(conn.to) && dfs(conn.to)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  var iter = nodeIds.values();
  var item = iter.next();
  while (!item.done) {
    if (!visited.has(item.value) && dfs(item.value)) return true;
    item = iter.next();
  }

  return false;
}
```

---

## 비용 사전 표시

Make 버튼 옆에 표시할 예상 크레딧:

```javascript
/**
 * 선택된 노드 기준으로 실행에 필요한 크레딧을 추정한다
 * @param {string|number} selectedNodeId - 선택된 노드 ID
 * @returns {number} 예상 크레딧 비용
 */
function estimateCost(selectedNodeId) {
  var nodes = nodeEditor.nodes;
  var connections = nodeEditor.connections;
  var subgraphIds = resolveUpstream(selectedNodeId, connections);
  var subgraphNodes = nodes.filter(function(n) {
    return subgraphIds.has(n.id);
  });

  return subgraphNodes
    .filter(function(n) {
      if (n.status === "done") {
        var key = computeCacheKey(n, nodes, connections);
        return n.result && n.result.cacheKey !== key;  // 파라미터 변경됨
      }
      return true;  // 미실행
    })
    .reduce(function(sum, n) {
      return sum + n.cost;
    }, 0);
}
```
