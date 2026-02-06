# NanoBanana SketchUp AI 렌더링 플러그인

## 프로젝트 개요

SketchUp 전용 AI 실사 렌더링 플러그인입니다.
Google Gemini API를 활용하여 인테리어 씬을 실사 이미지로 변환합니다.

## 절대 규칙 (Critical Rules)

### 1. SketchUp 모델 보호
- **벽, 바닥, 천장, 창문, 가구의 형상과 위치는 절대 변경 금지**
- AI는 오직 실사화, 조명, 분위기, 합성만 담당
- 모든 재생성은 시맨틱 마스킹 프롬프트로 구조 고정

### 2. 보안
- API Key는 로컬에 AES-256 암호화 저장
- .skp 파일에 API Key 포함 금지
- 모든 네트워크 통신은 HTTPS only

### 3. 코드 작성 규칙
- SketchUp Ruby API 2021+ 호환
- 들여쓰기: 2 spaces
- 모든 클래스는 `NanoBanana` 모듈 내부에 정의
- 에러 처리 필수 (begin/rescue)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 플러그인 | SketchUp Ruby API |
| UI | HtmlDialog (HTML/CSS/JS) |
| AI API | Google Gemini (`gemini-2.5-flash-image`) |
| 암호화 | OpenSSL AES-256 |
| 이미지 처리 | Canvas API (로컬 보정) |

## 프로젝트 구조

```
nano_banana_renderer/
├── main.rb                          # 진입점, 메뉴 등록
├── ui/
│   ├── main_dialog.html             # 메인 렌더링 UI
│   ├── settings_dialog.html         # API Key 설정
│   ├── editor_dialog.html           # 이미지 보정
│   └── hotspot_dialog.html          # 오브젝트 배치
├── services/
│   ├── scene_exporter.rb            # SketchUp → PNG
│   ├── prompt_builder.rb            # 3-Layer 프롬프트 조합
│   ├── semantic_mask_builder.rb     # 시맨틱 마스킹 프롬프트
│   ├── api_client.rb                # Gemini API 통신
│   ├── image_editor.rb              # 로컬 보정 처리
│   └── hotspot_manager.rb           # 오브젝트 배치 관리
├── assets/
│   └── object_library/              # 기본 오브젝트 PNG
├── storage/
│   └── config_store.rb              # API Key 암호화 저장
└── docs/
    ├── ARCHITECTURE.md
    ├── API_SPEC.md
    ├── WORKFLOW.md
    ├── UI_SPEC.md
    └── PROMPT_SYSTEM.md
```

## 핵심 워크플로우

```
SketchUp 씬 → 1차 렌더링 → 로컬 보정 → 조명 변경 → 오브젝트 배치 → 최종 재생성
```

## 개발 우선순위

1. 🔴 플러그인 골격 (main.rb)
2. 🔴 API Key 관리 (config_store.rb)
3. 🔴 씬 추출 (scene_exporter.rb)
4. 🔴 API 통신 (api_client.rb)
5. 🔴 프롬프트 시스템 (prompt_builder.rb)
6. 🔴 메인 UI (main_dialog.html)
7. 🟡 이미지 보정 (image_editor.rb)
8. 🟡 낮/밤/조명 컨트롤
9. 🟡 핫스팟 오브젝트 배치
10. 🟢 결과 관리/히스토리

## 참조 문서

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - 전체 아키텍처
- [API_SPEC.md](docs/API_SPEC.md) - Gemini API 명세
- [WORKFLOW.md](docs/WORKFLOW.md) - 워크플로우 상세
- [UI_SPEC.md](docs/UI_SPEC.md) - UI 컴포넌트 명세
- [PROMPT_SYSTEM.md](docs/PROMPT_SYSTEM.md) - 프롬프트 설계

## 테스트 체크리스트

- [ ] API Key 없이 렌더 버튼 비활성화
- [ ] 1차 렌더링 후 벽/가구 형태 유지
- [ ] 로컬 보정 시 API 호출 없음
- [ ] 낮/밤 전환 후 구조 변형 없음
- [ ] 핫스팟 오브젝트 위치/스케일 정확도
- [ ] 최종 재생성 후 배치 상태 유지

---

## 🚨 작업 규칙 (절대 준수)

### Git 복원/복구 시 필수 사항
- **복원/복구 전 반드시 사용자 허락 받을 것**
- **커밋 해시 또는 날짜/시간을 명시할 것**
  - 예: "2026-02-05 21:30 커밋 7f2acec로 복원할까요?"
- **허락 없이 `git checkout`, `git reset`, `git restore` 절대 금지**

---

## ⚠️ 중요 기술 이슈 (반드시 읽을 것)

### HtmlDialog 이미지 전송 크래시 문제

**문제**: `execute_script()`로 큰 데이터(~1MB base64)를 한 번에 전송하면 HtmlDialog가 크래시됨

**해결책 (현재 구현)**: JS-driven 청크 폴링
1. Ruby가 이미지를 30KB 청크로 분할하여 `@pending_chunks` 배열에 저장
2. Ruby가 `onChunkStart(sceneName, totalChunks)` 호출
3. JS가 `sketchup.getNextChunk()` 콜백으로 청크 요청
4. Ruby가 `onChunkData(data, isLast)` 호출하여 한 청크 전송
5. JS가 10ms 딜레이 후 다음 청크 요청 반복
6. 마지막 청크 수신 시 이미지 조합하여 처리

**관련 코드**:
- `main.rb`: `poll_render_complete()`, `get_next_chunk()`
- `main_dialog.html`: `onChunkStart()`, `onChunkData()`

**절대 하지 말 것**:
- ❌ `execute_script()`로 500KB 이상 데이터 한 번에 전송
- ❌ Thread 내에서 직접 `execute_script()` 호출 (UI.start_timer 사용)

### 2차 렌더링 (regenerate) 필수 파라미터

**문제**: 2차 렌더링 호출 시 `negative_prompt` 파라미터 누락하면 작동 안 함

**해결책**: JS에서 `sketchup.regenerate()` 호출 시 4개 파라미터 필수
```javascript
sketchup.regenerate(sourceBase64, prompt, negativePrompt, panelId);
```

### SketchUp 플러그인 배포 경로

```
~/Library/Application Support/SketchUp 2022/SketchUp/Plugins/nano_banana_renderer/
```

수정 후 반드시 이 경로로 복사해야 SketchUp에서 반영됨

### 히스토리 저장 위치

```
~/.sketchupshow/history.json
```

최대 500개 항목 저장

---

## Vizmaker 노드 에디터 (신규 개발)

기존 플러그인에 Vizmaker 스타일의 노드 기반 AI 렌더링 에디터를 webapp/ 폴더에 추가 개발한다.
기존 Ruby 플러그인(nano_banana_renderer/)은 그대로 유지하며, SketchUp 브릿지 역할을 한다.

상세 지시는 아래 문서를 참조하라:

1. **BRIEFING.md** — 프로젝트 브리핑 (최상위 지시, 두 레이어 역할 분담, 금지 사항)
2. **docs/SPEC.md** — Vizmaker 전체 기획 문서
3. **skills/UI_DESIGN.md** — UI 픽셀 단위 명세
4. **skills/NODE_TYPES.md** — 노드 타입별 상세 정의
5. **skills/PROMPT_PRESETS.md** — 프롬프트 프리셋 전체 목록
6. **skills/PIPELINE.md** — DAG 실행 파이프라인 의사코드
7. **skills/UI_RULES.md** — UI/UX 동작 규칙
8. **skills/SKETCHUP.md** — SketchUp 연동 명세
9. **INITIAL_COMMANDS.md** — 클로드 코드 최초 명령어
