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

```typescript
async function onMakeClick(selectedNodeId: string): Promise<void> {
  const { nodes, edges } = graphStore.getState()

  // ── 1단계: 서브그래프 추출 ──
  const subgraphNodeIds = resolveUpstream(selectedNodeId, edges)
  const subgraphNodes = nodes.filter(n => subgraphNodeIds.has(n.id))

  // ── 2단계: DAG 검증 ──
  if (detectCycle(subgraphNodeIds, edges)) {
    showError("순환 연결이 감지되었습니다")
    return
  }

  // ── 3단계: 캐시 확인 ──
  for (const node of subgraphNodes) {
    const cacheKey = computeCacheKey(node, nodes, edges)
    if (node.result && node.result.cacheKey === cacheKey) {
      // 파라미터 변경 없음 → 스킵
      node.status = "done"
    } else {
      node.status = "idle"  // 재실행 필요
    }
  }

  // ── 4단계: 비용 계산 ──
  const pendingNodes = subgraphNodes.filter(n => n.status !== "done")
  const totalCost = pendingNodes.reduce((sum, n) => sum + n.cost, 0)

  if (creditStore.getState().balance < totalCost) {
    showError("크레딧이 부족합니다")
    return
  }

  // ── 5단계: 토폴로지컬 정렬 ──
  const levels = topologicalSort(pendingNodes, edges)

  // ── 6단계: 실행 상태 진입 ──
  executionStore.getState().setRunning(true)
  for (const node of pendingNodes) {
    updateNodeStatus(node.id, "queued")
  }

  // ── 7단계: 레벨별 실행 ──
  try {
    for (const level of levels) {
      await Promise.all(
        level.map(node => executeNode(node))
      )
    }
  } finally {
    executionStore.getState().setRunning(false)
  }

  // ── 8단계: 히스토리 저장 ──
  historyStore.getState().saveSnapshot({
    graph: graphStore.getState(),
    creditUsed: totalCost,
    timestamp: new Date().toISOString()
  })
}
```

---

## 상위 서브그래프 추출

```typescript
function resolveUpstream(
  nodeId: string,
  edges: EdgeData[]
): Set<string> {
  const result = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (result.has(current)) continue
    result.add(current)

    // 이 노드의 입력을 제공하는 노드들
    const incomingEdges = edges.filter(e => e.to === current)
    for (const edge of incomingEdges) {
      queue.push(edge.from)
    }
  }

  return result
}
```

---

## 토폴로지컬 정렬 (Kahn's Algorithm)

```typescript
function topologicalSort(
  nodes: NodeData[],
  edges: EdgeData[]
): NodeData[][] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const relevantEdges = edges.filter(
    e => nodeIds.has(e.from) && nodeIds.has(e.to)
  )

  // in-degree 계산
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adj.set(node.id, [])
  }

  for (const edge of relevantEdges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1)
    adj.get(edge.from)!.push(edge.to)
  }

  // 레벨별 수집
  const levels: NodeData[][] = []
  let queue = nodes.filter(n => inDegree.get(n.id) === 0)

  while (queue.length > 0) {
    levels.push([...queue])
    const next: NodeData[] = []

    for (const node of queue) {
      for (const neighborId of adj.get(node.id)!) {
        const newDeg = inDegree.get(neighborId)! - 1
        inDegree.set(neighborId, newDeg)
        if (newDeg === 0) {
          next.push(nodes.find(n => n.id === neighborId)!)
        }
      }
    }

    queue = next
  }

  return levels  // levels[0] = 루트 노드들, levels[1] = 다음 레벨, ...
}
```

---

## 단일 노드 실행

```typescript
async function executeNode(node: NodeData): Promise<void> {
  updateNodeStatus(node.id, "running")

  try {
    const inputResult = getInputResult(node)
    const preset = node.params.presetId
      ? getPresetById(node.params.presetId)
      : null
    const { prompt, systemPrompt, negativePrompt } = assemblePrompt(node, preset)

    let result: NodeResult

    switch (node.type) {
      case "SOURCE":
        result = {
          image: node.params.image,
          resolution: "original",
          timestamp: now(),
          cacheKey: computeCacheKey(node)
        }
        break

      case "RENDER":
        result = await api.render({
          engine: node.params.engine,
          image: inputResult.image,
          prompt,
          systemPrompt,
          negativePrompt,
          seed: node.params.seed,
          resolution: node.params.resolution
        })
        break

      case "MODIFIER":
        result = await api.modify({
          image: inputResult.image,
          prompt,
          systemPrompt,
          negativePrompt,
          mask: node.params.mask,
          maskLayers: node.params.maskLayers
        })
        break

      case "UPSCALE":
        result = await api.upscale({
          image: inputResult.image,
          scale: node.params.scale,
          optimizedFor: node.params.optimizedFor,
          creativity: node.params.creativity,
          detailStrength: node.params.detailStrength,
          similarity: node.params.similarity,
          promptStrength: node.params.promptStrength,
          prompt
        })
        break

      case "VIDEO":
        result = await api.generateVideo({
          engine: node.params.engine,
          image: inputResult.image,
          endFrame: node.params.endFrameImage,
          duration: node.params.duration,
          prompt
        })
        break

      case "COMPARE":
        result = { timestamp: now(), cacheKey: "" }
        break
    }

    result.cacheKey = computeCacheKey(node)
    graphStore.getState().updateNode(node.id, { result, status: "done" })
    creditStore.getState().deduct(node.cost)

  } catch (error) {
    graphStore.getState().updateNode(node.id, { status: "error" })
    markDescendantsBlocked(node.id)
  }
}
```

---

## 에러 전파

```typescript
function markDescendantsBlocked(nodeId: string): void {
  const { edges } = graphStore.getState()
  const descendants = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const outgoing = edges.filter(e => e.from === current)
    for (const edge of outgoing) {
      if (!descendants.has(edge.to)) {
        descendants.add(edge.to)
        queue.push(edge.to)
        graphStore.getState().updateNode(edge.to, { status: "blocked" })
      }
    }
  }
}
```

---

## 캐시 키 계산

```typescript
function computeCacheKey(
  node: NodeData,
  allNodes?: NodeData[],
  edges?: EdgeData[]
): string {
  const inputHash = getInputImageHash(node, allNodes, edges)
  const payload = JSON.stringify({
    type: node.type,
    params: sortedParams(node.params),
    inputHash
  })
  return sha256(payload)
}

function getInputImageHash(
  node: NodeData,
  allNodes: NodeData[],
  edges: EdgeData[]
): string {
  const incomingEdge = edges.find(e => e.to === node.id)
  if (!incomingEdge) return "root"

  const inputNode = allNodes.find(n => n.id === incomingEdge.from)
  if (!inputNode?.result?.cacheKey) return "pending"

  return inputNode.result.cacheKey
}
```

---

## 순환 감지

```typescript
function detectCycle(nodeIds: Set<string>, edges: EdgeData[]): boolean {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    inStack.add(nodeId)

    const outgoing = edges.filter(e => e.from === nodeId && nodeIds.has(e.to))
    for (const edge of outgoing) {
      if (inStack.has(edge.to)) return true      // 순환 발견
      if (!visited.has(edge.to) && dfs(edge.to)) return true
    }

    inStack.delete(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId) && dfs(nodeId)) return true
  }

  return false
}
```

---

## 비용 사전 표시

Make 버튼 옆에 표시할 예상 크레딧:

```typescript
function estimateCost(selectedNodeId: string): number {
  const { nodes, edges } = graphStore.getState()
  const subgraphIds = resolveUpstream(selectedNodeId, edges)
  const subgraphNodes = nodes.filter(n => subgraphIds.has(n.id))

  return subgraphNodes
    .filter(n => {
      if (n.status === "done") {
        const key = computeCacheKey(n, nodes, edges)
        return n.result?.cacheKey !== key  // 파라미터 변경됨
      }
      return true  // 미실행
    })
    .reduce((sum, n) => sum + n.cost, 0)
}
```
