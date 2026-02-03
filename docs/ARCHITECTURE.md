# NanoBanana 아키텍처 설계 문서

## 1. 시스템 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SketchUp                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    NanoBanana Plugin                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │
│  │  │  main   │──│ services│──│   ui    │──│ storage │        │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
                    ┌───────────────────────────────┐
                    │      Google Gemini API        │
                    │   gemini-2.5-flash-image      │
                    └───────────────────────────────┘
```

## 2. 컴포넌트 구조

### 2.1 Core Layer

#### main.rb
- 플러그인 진입점
- SketchUp 메뉴 등록
- 전역 초기화

```ruby
module NanoBanana
  PLUGIN_NAME = "NanoBanana Renderer"
  PLUGIN_VERSION = "1.0.0"

  def self.initialize_plugin
    # 메뉴 등록
    # 툴바 등록
    # 이벤트 리스너 설정
  end
end
```

### 2.2 Services Layer

#### scene_exporter.rb
- SketchUp 뷰 → PNG 이미지 변환
- 씬 정보 수집 (카메라, 태그, 재질)
- 전처리 (가이드/치수선 제거)

#### prompt_builder.rb
- 3-Layer 프롬프트 구성
- 시맨틱 마스킹 프롬프트 생성
- 작업 유형별 프롬프트 템플릿

#### api_client.rb
- Gemini API HTTP 통신
- 요청/응답 처리
- 에러 핸들링 및 재시도

#### image_editor.rb
- 로컬 이미지 보정 로직
- JavaScript 연동 (Canvas API)

#### hotspot_manager.rb
- 오브젝트 배치 좌표 관리
- 위치 → 자연어 변환
- 스케일 계산

### 2.3 UI Layer

#### main_dialog.html
- 메인 렌더링 인터페이스
- 프롬프트 입력
- 결과 이미지 표시

#### settings_dialog.html
- API Key 입력/저장
- 연결 테스트

#### editor_dialog.html
- 이미지 보정 슬라이더
- 실시간 미리보기

#### hotspot_dialog.html
- 오브젝트 배치 UI
- 드래그&드롭 인터페이스

### 2.4 Storage Layer

#### config_store.rb
- API Key 암호화/복호화
- 설정 파일 관리
- 히스토리 저장

## 3. 데이터 흐름

### 3.1 1차 렌더링

```
┌──────────────┐    ┌────────────────┐    ┌───────────────┐
│ SketchUp 씬  │───▶│ scene_exporter │───▶│ Base64 이미지 │
└──────────────┘    └────────────────┘    └───────────────┘
                                                  │
                                                  ▼
┌──────────────┐    ┌────────────────┐    ┌───────────────┐
│ 렌더링 결과  │◀───│   api_client   │◀───│prompt_builder │
└──────────────┘    └────────────────┘    └───────────────┘
```

### 3.2 오브젝트 배치 후 재생성

```
┌──────────────┐    ┌────────────────┐
│ 렌더링 이미지│───▶│                │
└──────────────┘    │                │
                    │ hotspot_manager│───▶ 배치 프롬프트 생성
┌──────────────┐    │                │
│ 오브젝트 PNG │───▶│                │
└──────────────┘    └────────────────┘
                           │
                           ▼
                    ┌────────────────┐
                    │   api_client   │───▶ 최종 렌더링
                    └────────────────┘
```

## 4. 클래스 다이어그램

```
NanoBanana (module)
├── Main
│   ├── initialize_plugin()
│   ├── show_main_dialog()
│   └── show_settings_dialog()
│
├── SceneExporter
│   ├── export_current_view(options) → String (base64)
│   ├── collect_scene_info() → Hash
│   └── prepare_scene()
│
├── PromptBuilder
│   ├── LAYER_1_FIXED (constant)
│   ├── build(scene_info, user_input, operation) → String
│   ├── build_lighting_prompt(mode) → String
│   └── build_placement_prompt(hotspots) → String
│
├── ApiClient
│   ├── initialize(api_key)
│   ├── generate(image, prompt, refs) → String (base64)
│   ├── test_connection() → Boolean
│   └── handle_error(response)
│
├── ImageEditor
│   ├── apply_adjustments(image, params) → String
│   └── get_adjustment_css(params) → String
│
├── HotspotManager
│   ├── @hotspots : Array<Hotspot>
│   ├── add(x, y, image, name)
│   ├── remove(id)
│   ├── update_scale(id, scale)
│   └── build_placement_prompt() → String
│
├── Hotspot (data class)
│   ├── id, x, y, scale
│   ├── object_image, object_name
│   ├── position_description() → String
│   └── estimated_size_cm() → Integer
│
└── ConfigStore
    ├── save_api_key(key)
    ├── load_api_key() → String
    ├── save_history(item)
    └── load_history() → Array
```

## 5. 보안 아키텍처

### 5.1 API Key 저장

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│ 사용자 입력 │───▶│ AES-256 암호화│───▶│ 로컬 파일 저장  │
└─────────────┘    └─────────────┘    └─────────────────┘

저장 위치:
- macOS: ~/Library/Application Support/SketchUp 20XX/NanoBanana/
- Windows: %APPDATA%/SketchUp/SketchUp 20XX/NanoBanana/
```

### 5.2 암호화 키 생성

```ruby
# 머신 고유 정보 기반 키 생성
def generate_encryption_key
  machine_id = get_machine_identifier
  Digest::SHA256.hexdigest(machine_id + SALT)
end
```

## 6. 에러 처리 전략

### 6.1 API 에러

| 에러 코드 | 원인 | 대응 |
|-----------|------|------|
| 401 | API Key 무효 | 설정 다이얼로그 표시 |
| 429 | Rate Limit | 지수 백오프 재시도 |
| 500 | 서버 오류 | 재시도 (최대 3회) |
| Timeout | 네트워크 | 재시도 + 사용자 알림 |

### 6.2 로컬 에러

| 상황 | 대응 |
|------|------|
| 이미지 추출 실패 | 뷰 상태 확인 후 재시도 |
| 파일 저장 실패 | 권한 확인 + 대체 경로 |
| 메모리 부족 | 이미지 해상도 자동 조절 |

## 7. 성능 고려사항

### 7.1 이미지 처리

- 최대 해상도: 4K (3840 x 2160)
- 권장 해상도: 2K (1920 x 1080)
- Base64 인코딩 시 메모리 사용량 약 33% 증가

### 7.2 API 응답 시간

- 예상 응답 시간: 5-30초
- 타임아웃 설정: 60초
- 프로그레스 표시 필수

### 7.3 로컬 보정

- Canvas API 사용 시 실시간 처리 가능
- 4K 이미지 보정 시 약 100-300ms 소요
