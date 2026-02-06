# UI_DESIGN.md — Vizmaker 스크린샷 기반 UI 정밀 명세

> 이 문서는 Vizmaker 실제 스크린샷 11장을 픽셀 단위로 분석한 결과이다.
> Claude Code는 이 문서를 UI 구현의 최우선 참조로 사용하라.
> **이모지를 아이콘으로 절대 사용하지 마라.** 모든 아이콘은 SVG 또는 lucide-react 아이콘 라이브러리를 사용한다.

---

## 아이콘 규칙 (절대 위반 금지)

- **이모지 사용 금지.** 어떤 상황에서도 이모지를 UI 아이콘으로 렌더링하면 안 된다.
- 모든 아이콘은 `lucide-react` 라이브러리를 사용한다.
- 아이콘 색상: 비활성 `#888888`, 활성 `#ffffff`
- 아이콘 크기: 사이드바 20px, 프리셋 그리드 내부 40~48px, 섹션 헤더 16px
- 프리셋 아이콘은 **커스텀 SVG 일러스트레이션**이다. lucide에 없는 것은 간결한 라인 아트 SVG로 직접 그린다. 배경 없이 단색(흰색) 선화 스타일.

---

## 1. 전체 레이아웃 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  타이틀 바 (28px 높이)                                           │
│  "VizMaker | Server connection: Connected"   배경: #0a0a14       │
│                                              텍스트: #888        │
├──────┬──────────────────────────────────┬───────────────────────┤
│      │                                  │                       │
│ 좌측  │      중앙 캔버스                  │    우측 패널           │
│ 사이드 │      (React Flow)               │    (Inspector)        │
│ 바    │                                  │                       │
│ 56px │                                  │     ~320px            │
│      │                                  │                       │
│      │                                  │                       │
│      │                                  │                       │
│      │                                  │                       │
├──────┴──────────────────────────────────┴───────────────────────┤
│  하단 프롬프트 바 (52px 높이)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 색상 팔레트 (스크린샷에서 추출)

### 배경

| 요소 | HEX | 설명 |
|---|---|---|
| 타이틀 바 | `#0a0a14` | 가장 어두운 배경 |
| 좌측 사이드바 | `#0f0f1a` | 거의 검정에 가까운 네이비 |
| 중앙 캔버스 | `#111118` | 노드 배경보다 어두운 바탕 |
| 우측 패널 배경 | `#1a1a24` | 약간 밝은 다크 |
| 하단 프롬프트 바 | `#1a1a24` | 우측 패널과 동일 |
| 드롭다운 배경 | `#1e1e2a` | 패널보다 미세하게 밝음 |
| 드롭다운 항목 hover | `#2a2a36` | |
| 컨텍스트 메뉴 | `#1e1e2a` | 둥근 모서리 8px |

### 노드 카드

| 요소 | HEX |
|---|---|
| 노드 카드 배경 | `#ffffff` (이미지 영역) / `#1a1a24` (라벨 영역) |
| 노드 테두리 (idle) | 없음 — 흰색 그림자/광택 효과 |
| 노드 선택 테두리 | `#ffffff` 점선 (dashed), 2px |
| 노드 연결선 (edge) | `#555555`, 두께 2px, 베지어 커브 |
| 노드 포트 (handle) | `#888888` 원, 지름 8px, 테두리 2px |

### 악센트

| 요소 | HEX |
|---|---|
| Make 버튼 배경 | `#00c9a7` → `#00d4aa` (그라데이션 또는 단색 청록) |
| Make 버튼 텍스트 | `#ffffff` |
| Browse 버튼 | `#00c9a7` (Make와 동일) |
| 활성 사이드바 인디케이터 | `#00c9a7` 좌측 세로 바, 3px 폭 |
| 활성 탭 텍스트 | `#ffffff` |
| 비활성 탭 텍스트 | `#666666` |
| 프로그레스 바 (실행 중) | `#ff4466` → `#ff6688` 핑크/레드 그라데이션 |
| 슬라이더 트랙 | `#333340` |
| 슬라이더 thumb | `#00c9a7` (청록) |
| 슬라이더 활성 구간 | `#00c9a7` |
| Credits 텍스트 | `#666666` |

### 텍스트

| 요소 | HEX | 폰트 |
|---|---|---|
| 일반 텍스트 | `#ffffff` | 14px |
| 보조 텍스트 | `#888888` | 12px |
| 프롬프트 입력 | `#ffffff` on `#1a1a24` | 14px |
| 프롬프트 placeholder | `#555555` | 14px |
| 섹션 제목 | `#ffffff` | 14px, medium weight |
| 노드 라벨 (제목) | `#cccccc` | 11px |
| 노드 라벨 (프롬프트) | `#888888` | 10px |
| 프리셋 라벨 | `#cccccc` | 11px, 아이콘 아래 중앙 정렬 |

---

## 3. 좌측 사이드바 (56px)

스크린샷에서 확인된 정확한 구조:

```
┌──────┐
│ [렌더] │  ← 활성 시 좌측에 #00c9a7 세로 바
│      │
│ [히스토리]│
│      │
│ [계정] │
│      │
│ [튜토리얼]│
│      │
│      │  ← 빈 공간 (flex-grow)
│      │
│ [서포트]│
│      │
│ [설정] │
└──────┘
```

### 아이콘 매핑 (lucide-react)

| 위치 | 라벨 | lucide-react 아이콘 | 비고 |
|---|---|---|---|
| 상단 1 | Render | `LayoutGrid` 또는 `Monitor` | Vizmaker에서는 격자+모니터 형태의 커스텀 아이콘. 가장 가까운 것: `Monitor` |
| 상단 2 | History | `RotateCcw` | 시계 반대 방향 화살표 |
| 상단 3 | Account | `Users` | 두 사람 실루엣 |
| 상단 4 | Tutorial | `PlaySquare` | 재생 버튼이 있는 사각형 |
| 하단 1 | Support | `HelpCircle` | 물음표 원 |
| 하단 2 | Settings | `Settings` | 톱니바퀴 |

### 스타일 상세
- 배경: `#0f0f1a`
- 우측 경계선: `1px solid #222233`
- 아이콘 크기: 20px
- 아이콘 색상: 비활성 `#666666`, 활성 `#ffffff`
- 아이콘 아래 라벨: 10px, `#666666`, 활성 시 `#ffffff`
- 활성 인디케이터: 좌측 가장자리에 `3px × 40px` 크기의 `#00c9a7` 세로 바
- 각 버튼 영역: 56px × 56px, 아이콘 + 라벨 세로 중앙 정렬
- History 페이지 진입 시: "Render" 라벨이 "History" 라벨과 교체되며 아이콘도 전환

---

## 4. 중앙 캔버스 (Node Graph)

### 배경
- 색상: `#111118`
- 그리드 패턴: 미세한 점 또는 선 그리드, 색상 `#1a1a24`, 간격 20px
- 캔버스는 무한 pan/zoom

### 빈 캔버스 상태 (스크린샷 6)
- 중앙에 수직 정렬:
  - 아이콘: 점선 사각형 + 이미지 + 커서 (SVG, 약 80×80px, 색상 `#555555`)
  - 텍스트: "Drag and drop an image to get started, or" (색상 `#888888`, 14px)
  - 버튼: [Browse] — `#00c9a7` 배경, `#ffffff` 텍스트, 둥근 모서리 6px, 패딩 8px 20px
  - 아이콘 좌측에 작은 폴더 아이콘 (`FolderOpen` from lucide, 14px)

### 노드 카드 디자인 (핵심)

스크린샷에서 관찰된 노드 카드 구조:

```
┌────────────────────────┐
│                        │
│    이미지 썸네일         │  ← 흰색 배경, 노드 전체 너비
│    (160×120 정도)       │
│                        │
│                   [◆]  │  ← 출력 포트 (우측 중앙, 카드 바깥)
├────────────────────────┤
│  라벨 줄 1 (진하게)      │  ← "1. Main renderer" or "Source"
│  라벨 줄 2 (연하게)      │  ← "Create photorealistic image" (프롬프트 요약)
└────────────────────────┘
```

**Source 노드:**
- 이미지 썸네일만 표시
- 하단 라벨: "Source" 단일 줄
- 선택 시: 흰색 점선 테두리
- 출력 포트: 우측 중앙

**Render/Modifier/Upscale 노드:**
- 이미지 썸네일 (결과 이미지, 없으면 어두운 placeholder)
- 라벨 줄 1: Render Mode 이름 (예: "1. Main renderer", "2. Details editor", "3. Creative upscaler")
- 라벨 줄 2: 프롬프트 요약 (회색, 40자 이내 말줄임)
- 입력 포트: 좌측 중앙
- 출력 포트: 우측 중앙

**Video 노드:**
- 이미지 썸네일 위에 ▶ (재생) 오버레이 (반투명 원 + 삼각형)
- 라벨 줄 1: "4. Image to video"
- 라벨 줄 2: 프롬프트 (예: "Move forward")

### 노드 카드 치수
- 너비: ~160px (줌 100% 기준)
- 이미지 영역 높이: ~120px
- 라벨 영역 높이: ~40px
- 전체 높이: ~160px
- 모서리 둥글기: 4px
- 그림자: `0 2px 8px rgba(0,0,0,0.5)`

### 포트 (Handle)
- 모양: 원 (8px 지름)
- 테두리: `2px solid #888`
- 배경: `#333`
- 연결 중: 배경 `#00c9a7`
- 입력 포트: 노드 좌측 중앙 (이미지 영역 높이 기준)
- 출력 포트: 노드 우측 중앙

### 연결선 (Edge)
- 타입: 베지어 커브
- 색상: `#555555`
- 두께: 2px
- 포트 간 곡선 연결
- 화살표 없음 (방향은 좌→우로 암시)

### 컨텍스트 메뉴 (우클릭, 스크린샷 9)

캔버스 빈 영역 우클릭:
```
┌──────────────────┐
│ Load image...    │
│ Clear all        │
│ Rearrange nodes  │
└──────────────────┘
```
- 배경: `#1e1e2a`
- 텍스트: `#cccccc`, 14px
- hover: `#2a2a36` 배경
- 모서리: 8px 둥글기
- 패딩: 8px 16px per item
- 그림자: `0 4px 16px rgba(0,0,0,0.6)`
- 구분선 없음

---

## 5. 우측 Inspector 패널 (~320px)

### 전체 구조 (위에서 아래로 스크롤)

```
┌───────────────────────────┐
│ [■ Enlarge] 버튼 (우측 상단)│  ← 패널 최상단
├───────────────────────────┤
│ Preview | Compare | Draw   │  ← 탭 바 (활성: 흰색+밑줄, 비활성: 회색)
├───────────────────────────┤
│                           │
│   결과 이미지 프리뷰        │  ← ~200px 높이
│   (또는 미니 노드 그래프)   │
│              65%  832×1048│  ← 우측 상단에 확대율 + 해상도
│                           │
├───────────────────────────┤
│ [🔲] Render settings  [^] │  ← 섹션 헤더, 접기 가능
├───────────────────────────┤
│ Render Mode:              │
│ [2. Details editor    ▼]  │  ← 드롭다운
│                           │
│ (Upscale 모드일 때만:)     │
│ Upscale:     [2x      ▼]  │
│ Optimized for [Standard▼]  │
│ Creativity ●━━━━━━━ 0.00  │  ← 슬라이더
│ Detail str ●━━━━━━━ 0.00  │
│ Similarity ●━━━━━━━ 0.00  │
│ Prompt str ●━━━━━━━ 0.00  │
│                           │
│ (Video 모드일 때만:)       │
│ Engine:    [Kling v2.1 ▼]  │
│ Video dur: [5 seconds  ▼]  │
├───────────────────────────┤
│ [📋] Prompt Presets   [^] │  ← 섹션 헤더
├───────────────────────────┤
│ ┌─────┬─────┬─────┐      │
│ │ SVG │ SVG │ SVG │      │  ← 3열 그리드
│ │icon │icon │icon │      │
│ │label│label│label│      │
│ ├─────┼─────┼─────┤      │
│ │     │     │     │      │
│ │     │     │     │      │
│ └─────┴─────┴─────┘      │
└───────────────────────────┘
```

### Enlarge 버튼
- 위치: 우측 패널 최상단 우측
- 아이콘: `Maximize2` (lucide) + "Enlarge" 텍스트
- 색상: `#888888`
- 클릭 시: 결과 이미지를 중앙 캔버스 전체에 확대 표시

### 탭 바
- 3개 탭: Preview | Compare | Draw
- 활성 탭: `#ffffff` 텍스트, 하단에 `2px solid #ffffff` 밑줄
- 비활성 탭: `#666666` 텍스트
- 탭 사이 간격: 24px
- 높이: 40px

### 프리뷰 영역

**결과 이미지 있을 때:**
- 이미지를 패널 너비에 맞춰 표시
- 우측 상단에 확대율 (예: "65%") — 연두색 원형 배지, 폰트 12px
- 그 아래에 해상도 (예: "832 × 1048") — `#666666`, 10px

**미니 노드 그래프 (스크린샷 8, 10):**
- 프리뷰 이미지 아래 또는 대신에 미니 노드 그래프 표시
- 현재 선택 노드가 하이라이트
- 각 미니 노드에 결과 썸네일 포함
- 노드 간 연결선 표시
- 가로 스크롤 가능
- 미니 노드 클릭 → 해당 노드 선택 전환
- 미니 노드 하단에 라벨 (예: "Source", "1. Main renderer", "2. Details editor")

### Render Settings 섹션
- 섹션 헤더: 좌측에 아이콘 (`Monitor` lucide, 16px), "Render settings" 텍스트, 우측에 접기 화살표 (`ChevronUp` lucide)
- 구분선: `1px solid #222233`

**드롭다운 스타일:**
- 배경: `#1e1e2a`
- 텍스트: `#cccccc`
- 테두리: `1px solid #333340`
- 모서리: 6px
- 높이: 36px
- 화살표: `ChevronDown` (lucide, 14px)
- 열린 상태 (스크린샷 3): 아래로 펼쳐짐, 선택 항목 좌측에 `3px #00c9a7` 세로 바

**드롭다운 항목 목록 (Render Mode):**
1. Main renderer
2. Details editor
3. Creative upscaler
4. Image to video
5. (experimental) Exterior render
6. (experimental) Interior render

**슬라이더 스타일 (Upscale 모드, 스크린샷 2):**
- 라벨: 좌측 정렬, `#cccccc`, 13px
- 값: 우측 정렬, `#ffffff`, 13px (예: "0.00")
- 트랙: 높이 4px, 배경 `#333340`, 모서리 둥글기 2px
- thumb: 원형, 12px 지름, `#00c9a7`
- 활성 구간 (좌측~thumb): `#00c9a7`

### Prompt Presets 섹션
- 섹션 헤더: 좌측 아이콘 (`FileText` or `ClipboardList` lucide, 16px), "Prompt Presets" 텍스트, 우측 접기 화살표
- 3열 그리드, gap 8px

**프리셋 카드 스타일:**
- 크기: 약 90×80px
- 배경: `#1e1e2a`
- 모서리: 8px
- hover: `#2a2a36`
- 선택 시: `1px solid #00c9a7`

**프리셋 아이콘 스타일 (매우 중요):**
- 흰색 단색 선화 (line art) SVG
- 배경 없음 (투명)
- 선 두께: 1.5~2px
- 크기: 40×40px
- 색상: `#aaaaaa`, hover 시 `#ffffff`
- **이모지 금지. 절대 이모지로 대체하지 마라.**

**프리셋 아이콘 SVG 설명 (스크린샷에서 관찰):**

| 프리셋 | SVG 설명 | 가까운 lucide 아이콘 (없으면 커스텀) |
|---|---|---|
| Screen to render | 점선 큐브 + 화살표 | 커스텀 SVG |
| Image to sketch | 큐브 + 연필 효과 | 커스텀 SVG |
| Top view | 위에서 본 큐브 + 화살표 | 커스텀 SVG |
| Side view | 옆에서 본 큐브 + 화살표 | 커스텀 SVG |
| Another view | 큐브 + 다른 방향 화살표 | 커스텀 SVG |
| Enhance realism | 큐브 + 돋보기/반짝임 | 커스텀 SVG |
| Volumetric rays | 빛 줄기 방사 형태 | `Sun` + 확장선 |
| Make brighter | 슬라이더 + 밝기 바 | 커스텀 SVG |
| Closeup | 돋보기 + 확대 뷰 | `Search` 변형 |
| Axonometry | 축측투영 큐브 | 커스텀 SVG |
| Winter | 눈꽃 결정 | `Snowflake` (lucide) |
| Autumn | 나뭇잎 | `Leaf` (lucide) |
| Technical drawings | 건축 도면 격자 | `Grid3x3` 변형 |
| Logo | 체인링크/클립 형태 | `Link` 변형 |
| Day to night | 해 + 달 (좌→우) | `SunMoon` (lucide) |
| Night to day | 달 + 해 (좌→우) | `MoonStar` → `Sun` |
| Add people | 사람 2명 실루엣 | `Users` (lucide) |
| Add blurred people | 모션 블러 사람 | 커스텀 SVG |
| Add blurred cars | 모션 블러 자동차 | 커스텀 SVG |
| Add cars | 자동차 실루엣 | `Car` (lucide) |
| Add flowers | 꽃 실루엣 | `Flower2` (lucide) |
| Add grass | 풀잎 실루엣 | `Sprout` (lucide) |
| Add trees | 나무 실루엣 | `TreePine` (lucide) |
| Upscale | 돋보기 + 확대 | `SearchCode` 변형 |
| Zoom in (video) | 카메라 + 줌인 | 커스텀 SVG (산 풍경 + 화살표) |

**중요: lucide에 없는 프리셋 아이콘은 아래 규칙으로 커스텀 SVG를 생성하라:**
- viewBox: `0 0 40 40`
- 선 색상: `currentColor` (CSS로 `#aaaaaa` / `#ffffff` 전환)
- 선 두께: `stroke-width="1.5"`
- fill: `none`
- 건축/3D 큐브 계열은 등각투영(isometric) 큐브를 기본 형태로 사용
- 단순하고 인식 가능한 형태. 복잡한 디테일 금지.

---

## 6. 하단 프롬프트 바 (52px)

```
┌──────────────────────────────────────────────┬───────────────┐
│ [프롬프트 텍스트 입력]                   [×]   │  [✓ Make]     │
│                                              │   Credits: 1  │
└──────────────────────────────────────────────┴───────────────┘
```

### 상세 스타일
- 전체 높이: 52px
- 좌측 경계: 사이드바(56px)부터 시작
- 배경: `#1a1a24`
- 상단 경계선: `1px solid #222233`

**프롬프트 입력 필드:**
- 배경: `#111118` (캔버스보다 약간 밝음)
- 테두리: `1px solid #333340`
- 모서리: 6px
- 높이: 36px
- 텍스트: `#ffffff`, 14px
- placeholder: "Enter your image prompt here..." — `#555555`
- 우측에 [×] 클리어 버튼: `X` (lucide, 14px), `#666666`, hover 시 `#ffffff`

**Make 버튼:**
- 배경: `#00c9a7`
- 텍스트: `#ffffff`, 14px, bold
- 좌측 아이콘: `Check` (lucide, 14px) — 체크마크
- 모서리: 6px
- 크기: ~100px × 36px
- hover: `#00ddb8` (약간 밝게)
- 비활성 (실행 중 또는 크레딧 부족): 배경 `#333340`, 텍스트 `#666666`

**Credits 표시:**
- Make 버튼 바로 아래 (또는 우측): "Credits: 1"
- 색상: `#666666`, 11px

**실행 중 프로그레스 바 (스크린샷 8):**
- 프롬프트 바 하단에 2px 높이의 프로그레스 바
- 색상: 핑크/레드 그라데이션 `#ff4466`
- 좌에서 우로 진행
- 프롬프트 텍스트도 핑크 배경으로 하이라이트되는 효과

---

## 7. Draw 탭 (스크린샷 5)

Draw 탭 활성 시 중앙 캔버스 대신 드로잉 캔버스가 표시된다.

### 상단 도구바 (캔버스 위)
```
[✏] [◯] [▷] [🗑] | Size: [●━━━━━━━] | [Green ▼]
```

| 도구 | lucide 아이콘 | 설명 |
|---|---|---|
| Pen | `Pen` | 기본 드로잉 (활성: `#00c9a7` 배경) |
| Eraser | `Eraser` | 지우기 |
| Move/Select | `MousePointer` | 오브젝트 이동 |
| Delete | `Trash2` | 전체 삭제 |

- 도구 버튼: 32×32px, 활성 시 `#00c9a7` 배경 + 흰색 아이콘
- Size 슬라이더: 트랙 `#333340`, thumb `#00c9a7`
- Color 드롭다운: "Green" 텍스트 + 색상 원형 인디케이터
  - 옵션: Red / Green / Blue / Yellow
  - 각 옵션 좌측에 해당 색상의 원형 인디케이터 (8px)

### 드로잉 캔버스
- 결과 이미지 위에 투명 오버레이
- 브러시 색상: 선택된 색상 (반투명, opacity 0.7)
- 드로잉은 자유 곡선 (freehand)

---

## 8. Video 재생 UI (스크린샷 4)

Preview 탭에서 Video 노드 결과 표시 시:

```
┌────────────────────────────────────┐
│                                    │
│         비디오 재생 영역             │
│                                    │
├────────────────────────────────────┤
│ [⏸][□] ───●──────────── 00:02/00:05 [⛶]│
└────────────────────────────────────┘
```

- 재생/일시정지: `Play` / `Pause` (lucide)
- 정지: `Square` (lucide)
- 타임라인: 슬라이더, thumb `#00c9a7`
- 시간: "00:02 / 00:05" — `#888888`
- 전체화면: `Maximize` (lucide)

---

## 9. History 페이지 (스크린샷 11)

좌측 사이드바 History 클릭 시 전체 화면 전환.

### 레이아웃
```
┌──────┬──────────────────────────────────────────────────┐
│ 사이드 │ History                                         │
│ 바    │ ℹ Hint: You can get more details about generated│
│      │   image by clicking on the image          [×]   │
│      │                                                  │
│      │ ┌─────┬─────┬─────┬─────┬─────┬─────┐          │
│      │ │     │[Use]│     │     │     │     │          │
│      │ │     │[Save]│     │     │     │     │          │
│      │ │ img │ img │ img │ img │ img │ img │          │
│      │ │⏱2m │⏱3m │⏱4m │⏱4m │⏱4m │⏱4m │          │
│      │ ├─────┼─────┼─────┼─────┼─────┼─────┤          │
│      │ │     │     │     │     │     │[Use]│          │
│      │ │ img │ img │ img │ img │ img │[Save]│          │
│      │ │⏱4m │⏱5m │⏱6m │⏱7m │⏱8m │⏱9m │          │
│      │ └─────┴─────┴─────┴─────┴─────┴─────┘          │
│      │                                                  │
│      │            [Load More]                           │
└──────┴──────────────────────────────────────────────────┘
```

### 상세
- 사이드바: History 아이콘 활성 (청록 세로 바), "Render" 라벨이 최상단에 표시
- 제목: "History" — `#ffffff`, 24px, bold
- 힌트 배너: 배경 `#1a1a24`, 좌측 `ℹ` 아이콘 (파란색 원), 우측 [×] 닫기
- 이미지 그리드: 6열, gap 4px
- 카드 크기: 약 200×160px
- hover 시: Use / Save 버튼이 카드 상단에 오버레이 표시
  - Use 버튼: `#1a1a24` 배경, `#ffffff` 텍스트, 좌측 `ArrowDownToLine` 아이콘 (lucide)
  - Save 버튼: `#1a1a24` 배경, `#ffffff` 텍스트, 좌측 `Download` 아이콘 (lucide)
- 타임스탬프: 카드 하단, `Clock` 아이콘 (lucide, 10px) + "N minutes ago" — `#888888`, 11px
- [Load More] 버튼: 하단 중앙, `#333340` 배경, `#cccccc` 텍스트, 모서리 6px

---

## 10. 폰트

- 기본 폰트: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 대안: `"Roboto"`, `"Helvetica Neue"`
- 고정폭 (코드/수치): `"JetBrains Mono", "Fira Code", monospace`

---

## 11. 구현 시 필수 설치 패키지

```bash
npm install lucide-react
```

아이콘 import 예시:
```typescript
import {
  Monitor, RotateCcw, Users, PlaySquare,
  HelpCircle, Settings, ChevronDown, ChevronUp,
  Check, X, Maximize2, Search, Pen, Eraser,
  MousePointer, Trash2, Play, Pause, Square,
  Maximize, Clock, Download, ArrowDownToLine,
  FolderOpen, Snowflake, Leaf, Car, Flower2,
  Sprout, TreePine, Sun, Moon, Link
} from 'lucide-react'
```

---

## 12. 반응형/크기 제약

- 최소 창 너비: 1200px
- 최소 창 높이: 700px
- 우측 패널: 고정 320px, 축소 불가
- 좌측 사이드바: 고정 56px
- 중앙 캔버스: `calc(100vw - 56px - 320px)`
- 하단 바: 고정 52px
- 스크롤: 우측 패널만 세로 스크롤 허용, 캔버스는 pan/zoom

---

## 13. 애니메이션/트랜지션

| 요소 | 효과 |
|---|---|
| 탭 전환 | 없음 (즉시) |
| 드롭다운 열기 | 150ms ease-out |
| 노드 상태 변경 | 테두리 색상 300ms transition |
| hover 효과 | 150ms ease |
| 프로그레스 바 | linear, 실시간 업데이트 |
| 노드 드래그 | transform, 부드러운 이동 |
| 패널 접기/펼치기 | 200ms ease, height 애니메이션 |
