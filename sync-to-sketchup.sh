#!/bin/bash

# NanoBanana 개발 폴더 → SketchUp Plugins 폴더 동기화 스크립트

DEV_DIR="/Users/jinsoolee/Downloads/_개발프로젝트/활성/sketchup_Nanobanana/nano_banana_renderer"
PLUGIN_2022="/Users/jinsoolee/Library/Application Support/SketchUp 2022/SketchUp/Plugins/nano_banana_renderer"
PLUGIN_2024="/Users/jinsoolee/Library/Application Support/SketchUp 2024/SketchUp/Plugins/nano_banana_renderer"

echo "🍌 NanoBanana 동기화 시작..."
echo ""

# 개발 폴더 존재 확인
if [ ! -d "$DEV_DIR" ]; then
    echo "❌ 개발 폴더가 없습니다: $DEV_DIR"
    exit 1
fi

# SketchUp 2022 동기화
echo "📁 SketchUp 2022 동기화 중..."
rsync -av --delete "$DEV_DIR/" "$PLUGIN_2022/"
echo "✅ SketchUp 2022 완료"
echo ""

# SketchUp 2024 동기화
echo "📁 SketchUp 2024 동기화 중..."
rsync -av --delete "$DEV_DIR/" "$PLUGIN_2024/"
echo "✅ SketchUp 2024 완료"
echo ""

echo "🎉 동기화 완료!"
echo ""
echo "SketchUp을 재시작하면 변경사항이 적용됩니다."
