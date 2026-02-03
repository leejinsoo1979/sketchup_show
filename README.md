# NanoBanana Renderer

SketchUp용 AI 실사 렌더링 플러그인 (Google Gemini API 기반)

![SketchUp](https://img.shields.io/badge/SketchUp-2024-red)
![Ruby](https://img.shields.io/badge/Ruby-2.7+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 주요 기능

### 🎨 AI 렌더링
- SketchUp 씬을 포토리얼리스틱 이미지로 변환
- 시간대 설정 (Day / Evening / Night)
- 조명 ON/OFF 제어
- FHD / QHD / 4K 해상도 지원

### 📷 카메라 컨트롤
- WASD 키보드 이동
- 2점 투시 자동 보정
- 높이 프리셋 (서기 / 앉기 / 낮음)
- FOV 프리셋 (광각 / 표준 / 망원)
- 실시간 미러링

### 🎬 씬 관리
- 멀티 씬 탭 지원
- 씬별 독립 렌더링
- 현재 뷰 씬 저장

### 🔀 Mix 기능
4가지 AI 이미지 편집 모드:

1. **Object Insert & Remove** - 3D 좌표 기반 오브젝트 배치
2. **Inpainting** - 마스크 영역 부분 수정
3. **Material Replace** - 재질/텍스처 교체
4. **Floorplan to Isometric** - 2D 평면도 → 3D 아이소메트릭 변환

## 설치 방법

### 1. 플러그인 복사
```
nano_banana_renderer.rb
nano_banana_renderer/
```
위 파일들을 SketchUp 플러그인 폴더에 복사:

**Mac:**
```
~/Library/Application Support/SketchUp 2024/SketchUp/Plugins/
```

**Windows:**
```
%APPDATA%\SketchUp\SketchUp 2024\SketchUp\Plugins\
```

### 2. API Key 설정
1. [Google AI Studio](https://aistudio.google.com/)에서 Gemini API Key 발급
2. SketchUp 실행 → Extensions → NanoBanana Renderer → 설정
3. API Key 입력 후 저장

## 사용 방법

1. **Extensions → NanoBanana Renderer → 렌더링 시작**
2. Mirror 버튼으로 실시간 뷰 확인
3. Time / Lights / Size 설정
4. **Convert** 버튼 → AI가 씬 분석
5. **Render** 버튼 → 포토리얼 이미지 생성
6. **Export** 버튼 → 이미지 저장

## 프로젝트 구조

```
nano_banana_renderer/
├── main.rb                 # 메인 진입점, 콜백 등록
├── services/
│   ├── api_client.rb       # Gemini API 클라이언트
│   ├── camera_tool.rb      # 카메라 컨트롤 도구
│   ├── config_store.rb     # 설정 저장/로드
│   ├── hotspot_manager.rb  # 3D 핫스팟 관리
│   ├── prompt_builder.rb   # AI 프롬프트 생성
│   └── scene_exporter.rb   # 씬 내보내기
└── ui/
    ├── main_dialog.html    # 메인 UI
    ├── mix_dialog.html     # Mix 기능 UI
    ├── editor_dialog.html  # 이미지 편집 UI
    ├── settings_dialog.html # 설정 UI
    └── hotspot_dialog.html # 핫스팟 배치 UI
```

## 기술 스택

- **Ruby** - SketchUp API 연동
- **HTML/CSS/JS** - UI 다이얼로그
- **Google Gemini API** - AI 이미지 생성
- **SketchUp Ruby API** - 3D 좌표 추출, 카메라 제어

## 요구 사항

- SketchUp 2024 이상
- Google Gemini API Key
- macOS 또는 Windows

## 라이선스

MIT License

## 개발자

NanoBanana Team
