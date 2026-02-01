#!/bin/bash
# テスト用スクリプト - GitHub Token を使わずに動作確認

echo "========================================="
echo "スクリプト構文チェック"
echo "========================================="
echo ""

echo "1. sync-training-data.js"
node --check sync-training-data.js
if [ $? -eq 0 ]; then
  echo "   ✅ 構文OK"
else
  echo "   ❌ 構文エラー"
  exit 1
fi

echo ""
echo "2. scrape-and-upload.js"
node --check scrape-and-upload.js
if [ $? -eq 0 ]; then
  echo "   ✅ 構文OK"
else
  echo "   ❌ 構文エラー"
  exit 1
fi

echo ""
echo "3. lib/github-utils.js"
node --check lib/github-utils.js
if [ $? -eq 0 ]; then
  echo "   ✅ 構文OK"
else
  echo "   ❌ 構文エラー"
  exit 1
fi

echo ""
echo "========================================="
echo "すべてのスクリプトの構文チェック完了"
echo "========================================="
