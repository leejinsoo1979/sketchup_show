#!/bin/bash
# NanoBanana 개발 폴더 → SketchUp 2022 플러그인 폴더 동기화 스크립트

DEV_DIR="/Users/jinsoolee/Downloads/_개발프로젝트/활성/sketchup_Nanobanana/nano_banana_renderer"
PLUGIN_DIR="/Users/jinsoolee/Library/Application Support/SketchUp 2022/SketchUp/Plugins/nano_banana_renderer"

echo "🔄 NanoBanana 동기화 시작..."
echo "   소스: $DEV_DIR"
echo "   대상: $PLUGIN_DIR"

# rsync로 동기화 (삭제된 파일도 반영)
rsync -av --delete "$DEV_DIR/" "$PLUGIN_DIR/"

echo "✅ 동기화 완료!"
echo ""
echo "SketchUp에서 다음 명령어로 리로드:"
echo "  load '/Users/jinsoolee/Library/Application Support/SketchUp 2022/SketchUp/Plugins/nano_banana_renderer/main.rb'"
