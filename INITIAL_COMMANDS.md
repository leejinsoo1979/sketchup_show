# Claude Code 최초 명령어 모음

---

## 사용법

아래 명령어 중 하나를 선택해서 Claude Code 터미널에 그대로 붙여넣으면 됩니다.
- **Option A**: 전체를 한번에 스캐폴딩 + 핵심 구현까지
- **Option B**: 단계별로 하나씩 (추천 — 중간에 확인 가능)
- **Option C**: MVP 최소 기능만 먼저

---

## Option A: 전체 스캐폴딩 + 핵심 구현 (한 번에)

```
이 프로젝트는 Vizmaker 스타일의 노드 기반 AI 이미지 렌더링 에디터이다.

먼저 CLAUDE.md를 읽고, 이어서 docs/SPEC.md와 skills/ 폴더의 모든 .md 파일을 읽어라.
문서를 전부 읽은 뒤에 구현을 시작하라.

구현 순서:

1단계 — 프로젝트 스캐폴딩
- Vite + React 18 + TypeScript + Tailwind CSS 프로젝트를 생성하라
- reactflow, zustand, fabric (fabric.js), uuid 패키지를 설치하라
- CLAUDE.md에 정의된 디렉토리 구조대로 폴더와 빈 파일을 생성하라
- Tailwind 설정에서 다크 테마 색상을 추가하라 (캔버스 배경: #0d0d1a, 사이드바: #0f0f1f, 패널: #1a1a2e, Make 버튼: #00d4aa)

2단계 — 전체 레이아웃
- App.tsx에서 전체 레이아웃을 구성하라: 좌측 사이드바(56px) + 중앙 캔버스(flex-1) + 우측 Inspector 패널(320px) + 하단 프롬프트 바(48px)
- 좌측 사이드바에 아이콘 버튼 6개를 배치하라 (Render, History, Account, Tutorial, Support, Settings)
- 하단 바에 프롬프트 입력 필드 + Make 버튼 + Credits 표시를 배치하라
- UI_RULES.md의 레이아웃 명세를 정확히 따르라

3단계 — 상태 관리 (Zustand)
- graphStore.ts: nodes[], edges[], selectedNodeId, addNode, removeNode, updateNode, addEdge, removeEdge, selectNode, clearAll
- executionStore.ts: isRunning, currentNodeId, queue
- historyStore.ts: snapshots[], saveSnapshot, restoreSnapshot
- creditStore.ts: balance, deduct, estimateCost
- uiStore.ts: activeTab('preview'|'compare'|'draw'), zoom, pan

4단계 — React Flow 노드 캔버스
- NodeCanvas.tsx에 React Flow를 세팅하라 (다크 배경, 그리드, pan/zoom)
- NODE_TYPES.md를 참조하여 6개 커스텀 노드 컴포넌트를 구현하라: SourceNode, RenderNode, ModifierNode, UpscaleNode, VideoNode, CompareNode
- BaseNode.tsx에 공통 셸을 구현하라: 썸네일 이미지, 라벨(Render Mode + 프롬프트 요약), 입출력 포트(Handle), 상태 인디케이터(테두리 색상)
- 이미지 드래그 앤 드롭 → Source 노드 자동 생성을 구현하라
- 출력 포트 드래그 → 빈 캔버스 드롭 시 Render Mode 선택 메뉴 → 노드 생성 + 자동 연결

5단계 — Inspector 패널
- 우측 패널에 3개 탭(Preview, Compare, Draw)을 구현하라
- Preview 탭: 선택 노드의 결과 이미지 표시, 확대율/해상도 표시, 마우스 휠 줌
- Render Settings 섹션: 노드 타입별로 동적 전환 (RENDER → Main renderer, MODIFIER → Details editor, UPSCALE → Creative upscaler + 슬라이더들, VIDEO → Image to video + Engine/Duration)
- Prompt Presets 섹션: 3열 아이콘 그리드, PROMPT_PRESETS.md의 프리셋 ↔ 노드 타입 매핑대로 동적 전환
- 프리셋 아이콘 클릭 → 하단 프롬프트 바에 basePrompt 텍스트 자동 채움

6단계 — DAG 실행 파이프라인
- PIPELINE.md의 의사코드를 그대로 TypeScript로 구현하라
- pipelineExecutor.ts: resolveUpstream, topologicalSort, executeInOrder, executeNode
- cacheManager.ts: computeCacheKey (sha256 해시), 캐시 히트 시 스킵
- Make 버튼 클릭 → 선택 노드 기준 상위 서브그래프 추출 → 비용 계산 → 토폴로지컬 정렬 → 레벨별 병렬 실행
- 에러 전파: 실패 노드의 하위 노드를 blocked 상태로 전환
- 실행 완료 후 historyStore에 스냅샷 자동 저장

7단계 — Draw 탭
- Fabric.js 기반 드로잉 캔버스를 구현하라
- 도구바: Pen, Eraser, Move, Delete, Size 슬라이더, Color 드롭다운(Red/Green/Blue/Yellow)
- 드로잉 결과를 투명 배경 PNG 마스크로 변환하여 ModifierNode의 mask 파라미터에 저장
- Ctrl+V 이미지 붙여넣기 지원

8단계 — History 페이지
- 좌측 사이드바 History 클릭 → History 전체 페이지 전환
- 결과 이미지 그리드 (타임스탬프 포함)
- 각 카드에 Use(그래프 복원) / Save(이미지 다운로드) 버튼

9단계 — 컨텍스트 메뉴
- 캔버스 빈 영역 우클릭: Load image / Clear all / Rearrange nodes
- 노드 우클릭: Make / Duplicate / Delete / Compare A / Compare B
- Rearrange: DAG 기반 자동 정렬 (Source 좌측, 말단 하단)

모든 엔진 API 호출은 실제 API가 없으므로 mock 함수로 구현하라.
mock 함수는 2초 딜레이 후 입력 이미지를 그대로 반환하라.
나중에 실제 API로 교체할 수 있도록 adapters/ 폴더에 인터페이스를 분리하라.
```

---

## Option B: 단계별 실행 (추천)

한 단계씩 실행하고 결과를 확인한 뒤 다음 명령어를 던지는 방식.

### B-1: 스캐폴딩

```
CLAUDE.md를 읽고, docs/SPEC.md와 skills/ 폴더의 모든 .md 파일을 읽어라.

읽은 뒤 아래를 수행하라:

1. Vite + React 18 + TypeScript 프로젝트를 생성하라 (프로젝트명: vizmaker-editor)
2. 패키지 설치: reactflow zustand fabric uuid tailwindcss postcss autoprefixer @types/uuid
3. Tailwind CSS를 설정하라. 다크 테마 색상:
   - canvas-bg: #0d0d1a
   - sidebar-bg: #0f0f1f
   - panel-bg: #1a1a2e
   - node-bg: #2a2a3e
   - accent: #00d4aa
   - error: #ff4444
   - warning: #f0ad4e
4. CLAUDE.md에 정의된 /src 디렉토리 구조대로 폴더와 빈 index.ts 파일을 생성하라
5. src/types/node.ts에 NODE_TYPES.md의 모든 TypeScript 인터페이스를 정의하라 (NodeData, NodeResult, NodeType, NodeStatus, SourceParams, RenderParams, ModifierParams, UpscaleParams, VideoParams, CompareParams, MaskLayer, EdgeData, Graph)
6. src/presets/index.ts에 PROMPT_PRESETS.md의 모든 프리셋을 PromptPreset[] 배열로 정의하라

실제 컴포넌트 구현은 하지 마라. 타입과 구조만 잡아라.
```

### B-2: 레이아웃 + 사이드바

```
이전 단계에서 생성된 프로젝트 구조를 기반으로,

1. App.tsx에서 전체 레이아웃을 구현하라:
   - 좌측: LeftSidebar (56px 고정, 세로 아이콘 버튼 6개)
   - 중앙: NodeCanvas (flex-1)
   - 우측: InspectorPanel (320px 고정)
   - 하단: PromptBar + MakeButton (48px 고정, 전체 너비)
   
2. LeftSidebar.tsx: 아이콘 6개 (Render/History/Account/Tutorial/Support/Settings)
   - 활성 아이콘에 좌측 #00d4aa 세로 바 표시
   - 배경색 #0f0f1f
   
3. PromptBar.tsx: 텍스트 입력 필드
   - placeholder: "Enter your image prompt here..."
   - 배경색 #1a1a2e
   
4. MakeButton.tsx: 청록색(#00d4aa) 버튼
   - 좌측에 ✅ 아이콘 + "Make" 텍스트
   - 하단에 "Credits: 1" 회색 텍스트
   
5. InspectorPanel.tsx: 우측 패널 껍데기
   - 상단: [Enlarge] 버튼
   - 탭: Preview | Compare | Draw
   - 하단: Render Settings 섹션 + Prompt Presets 섹션 (빈 상태)
   
6. NodeCanvas.tsx: React Flow 기본 세팅
   - 배경: #0d0d1a, 그리드 표시
   - 빈 캔버스 상태에서 중앙에 "Drag and drop an image to get started, or [Browse]" 표시

UI_RULES.md의 레이아웃 명세를 정확히 따르라.
Vizmaker 스크린샷의 다크 테마를 재현하라.
```

### B-3: Zustand 상태 + 노드 컴포넌트

```
1. Zustand 스토어 5개를 구현하라:
   - graphStore.ts: nodes[], edges[], selectedNodeId + CRUD 액션
   - executionStore.ts: isRunning, currentNodeId, queue
   - historyStore.ts: snapshots[], saveSnapshot, restoreSnapshot
   - creditStore.ts: balance(초기값 100), deduct, estimateCost
   - uiStore.ts: activeTab, activeSidebarItem, zoom, pan

2. React Flow 커스텀 노드 6개를 구현하라 (NODE_TYPES.md 참조):
   - BaseNode.tsx: 공통 셸. 썸네일 이미지 영역 + 하단 라벨(2줄: Render Mode명 + 프롬프트 요약 40자) + 입력/출력 Handle + 상태별 테두리 색상
   - SourceNode: 이미지 썸네일 + "Source" 라벨. 입력 포트 없음, 출력 포트 1개
   - RenderNode: "1. Main renderer" 라벨. 입력 1개, 출력 1개
   - ModifierNode: "2. Details editor" 라벨. 입력 1개, 출력 1개
   - UpscaleNode: "3. Creative upscaler" 라벨. 입력 1개, 출력 1개
   - VideoNode: "4. Image to video" 라벨 + ▶ 오버레이. 입력 1~2개, 출력 1개
   - CompareNode: 입력 2개, 출력 없음

3. 이미지 드래그 앤 드롭 → Source 노드 자동 생성을 구현하라
4. 노드 클릭 → graphStore.selectedNodeId 갱신 → InspectorPanel 연동
5. 출력 포트 드래그 → 빈 캔버스 드롭 시 Render Mode 선택 드롭다운 → 노드 생성 + 엣지 자동 연결
```

### B-4: Inspector 패널 동적 UI

```
InspectorPanel을 완성하라.

1. Preview 탭:
   - 선택 노드의 result.image를 표시
   - 결과 없으면 빈 상태
   - 우측 상단에 확대율(%) + 해상도(WxH) 표시
   - 마우스 휠로 확대/축소

2. Render Settings 섹션:
   - 선택된 노드 타입에 따라 동적 변경
   - RENDER → Render Mode 드롭다운 (1. Main renderer / (exp) Exterior / (exp) Interior)
   - MODIFIER → Render Mode: "2. Details editor"
   - UPSCALE → Render Mode: "3. Creative upscaler" + Upscale(2x/4x), Optimized for(Standard/Detail/Smooth), Creativity 슬라이더(0~1), Detail strength 슬라이더, Similarity 슬라이더, Prompt strength 슬라이더
   - VIDEO → Render Mode: "4. Image to video" + Engine(Kling v2.1/Seedance), Video duration(5s/10s)
   - SOURCE, COMPARE → Render Settings 숨김

3. Prompt Presets 섹션:
   - 3열 아이콘 그리드
   - RENDER 선택 시: Screen to render, Image to sketch, Top view, Side view, Another view (5개)
   - MODIFIER 선택 시: Enhance realism, Volumetric rays, Make brighter, Closeup, Axonometry, Winter, Autumn, Technical drawings, Logo, Day to night, Night to day, Add people, Add blurred people, Add blurred cars, Add cars, Add flowers, Add grass, Add trees (18개)
   - UPSCALE 선택 시: Upscale (1개)
   - VIDEO 선택 시: Zoom in, Move forward, Orbit, Pan left (4개)
   - 프리셋 클릭 → 하단 PromptBar에 basePrompt 자동 채움

src/presets/index.ts의 프리셋 데이터를 사용하라.
```

### B-5: 실행 파이프라인

```
PIPELINE.md의 의사코드를 TypeScript로 구현하라.

1. src/engine/pipelineExecutor.ts:
   - resolveUpstream(nodeId, edges) → Set<string>
   - topologicalSort(nodes, edges) → NodeData[][] (레벨별 배열)
   - executeInOrder(levels) → Promise<void>
   - executePipeline(selectedNodeId) → Promise<void> (Make 버튼에서 호출)

2. src/engine/cacheManager.ts:
   - computeCacheKey(node, allNodes, edges) → string (sha256 해시)
   - 실제 sha256 대신 JSON.stringify 후 간단한 해시 함수 사용해도 됨

3. src/engine/adapters/:
   - EngineAdapter 인터페이스 정의
   - mainRenderer.ts: mock — 2초 딜레이 후 입력 이미지 그대로 반환
   - detailsEditor.ts: mock — 2초 딜레이
   - creativeUpscaler.ts: mock — 3초 딜레이
   - imageToVideo.ts: mock — 5초 딜레이

4. MakeButton 클릭 핸들러:
   - 선택 노드 기준 서브그래프 추출
   - 순환 검증
   - 비용 계산 + 잔액 확인
   - 캐시 확인 → 스킵 대상 제외
   - 토폴로지컬 정렬
   - 레벨별 Promise.all 실행
   - 실행 중 Make 버튼 비활성 + 노드 상태 실시간 갱신 (running → done)
   - 에러 시 하위 노드 blocked
   - 완료 후 히스토리 스냅샷 저장

5. Make 버튼 옆 Credits 표시를 실시간 갱신하라 (estimateCost 함수 사용)
```

### B-6: Draw 탭 + Compare 탭

```
1. Draw 탭 (Fabric.js):
   - 선택된 이미지 위에 자유 드로잉
   - 도구바: Pen(기본), Eraser, Move(커서), Delete(전체 삭제)
   - Size 슬라이더: 브러시 크기 조절
   - Color 드롭다운: Red / Green / Blue / Yellow
   - 드로잉 완료 후 투명 배경 PNG로 export → 선택 노드(MODIFIER)의 params.mask에 저장
   - Ctrl+V: 클립보드 이미지 붙여넣기 → 캔버스에 오브젝트로 추가, 드래그로 위치 조정

2. Compare 탭:
   - A/B 슬롯에 이미지 할당 (노드 우클릭 → Compare A / Compare B)
   - 중앙 수직 슬라이더 드래그로 좌/우 비교
   - A/B 모두 할당되지 않으면 빈 상태 메시지

3. 노드 우클릭 컨텍스트 메뉴 구현:
   - Make / Duplicate / Delete / Compare A / Compare B

4. 캔버스 빈 영역 우클릭 메뉴:
   - Load image... / Clear all / Rearrange nodes
```

### B-7: History + 마무리

```
1. History 페이지:
   - historyStore의 snapshots를 그리드로 표시
   - 각 카드: 결과 이미지 썸네일 + 타임스탬프 ("N minutes ago")
   - hover 시 Use / Save 버튼 표시
   - Use 클릭: graphStore에 해당 스냅샷의 nodes/edges 복원
   - Save 클릭: 결과 이미지를 브라우저 다운로드
   - 하단 "Load More" 버튼

2. Undo/Redo:
   - Ctrl+Z / Ctrl+Shift+Z
   - 그래프 편집(노드/엣지 CRUD, 위치 이동, 파라미터 변경)만 대상
   - AI 실행 결과는 Undo 대상 아님
   - 스택 최대 50개

3. Rearrange Nodes:
   - DAG 기반 자동 정렬
   - Source 노드 좌측, 수평 간격 250px, 수직 간격 150px
   - 분기 많은 노드 상단, 말단 노드 하단

4. 최종 점검:
   - 이미지 드롭 → Source 생성 → 출력 포트 드래그 → Render 노드 생성 → Make → 실행 완료 → 결과 썸네일 표시
   - 이 전체 흐름이 정상 동작하는지 확인하라
```

---

## Option C: MVP 최소 기능만

```
CLAUDE.md, docs/SPEC.md, skills/ 폴더의 모든 .md 파일을 읽어라.

MVP 범위만 구현하라:

1. Vite + React + TypeScript + Tailwind + React Flow + Zustand 프로젝트 생성
2. 다크 테마 레이아웃: 좌측 사이드바 + 중앙 캔버스 + 우측 패널 + 하단 프롬프트 바 + Make 버튼
3. Source 노드: 이미지 드래그 앤 드롭으로 생성
4. Render 노드: Source에서 연결, "Create photorealistic image" 기본 프롬프트
5. Modifier 노드: Render 결과에 프리셋 적용 (Enhance realism, Make brighter, Add people만)
6. Inspector 패널: 선택 노드에 따라 Render Settings + Prompt Presets 동적 전환
7. Make 버튼: DAG 토폴로지컬 정렬 → 순차 실행 (mock API, 2초 딜레이)
8. 노드 상태 표시: idle → running(스피너) → done(결과 썸네일)

엔진 API는 전부 mock이다. 2초 딜레이 후 입력 이미지를 그대로 반환하라.
Upscale, Video, Compare, Draw, History는 MVP에 포함하지 않는다.
```

---

## 참고: 프로젝트에 CLAUDE.md가 이미 있는 경우

Claude Code는 프로젝트 루트의 CLAUDE.md를 자동으로 읽습니다.
위 명령어에서 "CLAUDE.md를 읽어라"는 확인 차 넣은 것이며,
CLAUDE.md가 루트에 있으면 별도 지시 없이도 컨텍스트로 로드됩니다.

단, skills/ 폴더와 docs/ 폴더는 명시적으로 읽으라고 지시해야 합니다.
이것이 명령어 첫 줄에 "skills/ 폴더의 모든 .md 파일을 읽어라"를 넣은 이유입니다.
