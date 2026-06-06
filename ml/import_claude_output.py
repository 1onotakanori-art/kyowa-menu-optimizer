#!/usr/bin/env python3
"""
Claude Desktop が生成した解析結果をキャッシュに統合するスクリプト

Claude Desktop Cowork タスクが output/analysis_results.json を書き出した後に実行する。
バリデーション → キャッシュ統合 → アーカイブ まで一括処理。

使い方:
    python ml/import_claude_output.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# --- パス定義 ---
ML_DIR = Path(__file__).parent
CACHE_FILE = ML_DIR / "data" / "claude_menu_cache.json"

OBSIDIAN_PROJECT_DIR = Path(
    r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer"
)
OUTPUT_FILE = OBSIDIAN_PROJECT_DIR / "output" / "analysis_results.json"
INPUT_FILE = OBSIDIAN_PROJECT_DIR / "input" / "pending_menus.md"
STATUS_FILE = OBSIDIAN_PROJECT_DIR / "_STATUS.md"
ARCHIVE_DIR = OBSIDIAN_PROJECT_DIR / "archive"

# --- 有効な分類値（claude_analyzer.py と同一） ---
VALID_COOKING = ["揚げ物", "煮物", "焼き物", "蒸し物", "炒め物", "生・冷製", "和え物"]
VALID_PROTEINS = ["鶏", "豚", "牛", "魚介", "卵", "大豆", "野菜中心", "その他"]
VALID_CUISINES = ["和食", "洋食", "中華", "エスニック", "その他"]


def load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _clamp(val, default: float = 0.5) -> float:
    """0.0〜1.0 に丸める。変換不能な値はデフォルト値を返す"""
    try:
        f = float(val)
        return round(max(0.0, min(1.0, f)), 1)
    except (ValueError, TypeError):
        return default


def validate_entry(entry: dict) -> dict:
    """エントリをバリデーション・正規化して返す"""
    name = entry.get("name", "").strip()
    if not name:
        raise ValueError("name フィールドが空です")

    cooking = entry.get("cooking_method", "その他")
    if cooking not in VALID_COOKING:
        cooking = "その他"

    protein = entry.get("main_protein", "その他")
    if protein not in VALID_PROTEINS:
        protein = "その他"

    cuisine = entry.get("cuisine_style", "その他")
    if cuisine not in VALID_CUISINES:
        cuisine = "その他"

    return {
        "name": name,
        "cooking_method": cooking,
        "main_protein": protein,
        "cuisine_style": cuisine,
        "light_heavy": _clamp(entry.get("light_heavy")),
        "refreshing": _clamp(entry.get("refreshing")),
        "spicy": _clamp(entry.get("spicy")),
        "sweet": _clamp(entry.get("sweet")),
        "health_impression": _clamp(entry.get("health_impression")),
    }


def archive_files(timestamp: str):
    """処理済みの input/output ファイルをアーカイブフォルダへ移動"""
    ARCHIVE_DIR.mkdir(exist_ok=True)
    moved = []

    for src, dst_name in [
        (INPUT_FILE, f"pending_menus_{timestamp}.md"),
        (OUTPUT_FILE, f"analysis_results_{timestamp}.json"),
    ]:
        if src.exists():
            dst = ARCHIVE_DIR / dst_name
            src.rename(dst)
            moved.append(dst_name)

    return moved


def update_status(status: str, ok: int, errors: int, added: int, total_cache: int):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    content = f"""# 処理状態

**状態**: {status}
**更新**: {now}
**処理件数**: {ok} 件 / エラー: {errors} 件
**キャッシュ追加**: {added} 件（計 {total_cache} 件）

解析結果がキャッシュに統合されました。
次回スクレイプ時に `npm run weekly:prepare` を実行してください。
"""
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    print("=" * 60)
    print("📥 Claude 解析結果のインポート")
    print("=" * 60)

    # NO_PENDING_MENUS チェック：新規メニューがなければスキップ
    if STATUS_FILE.exists():
        status_text = STATUS_FILE.read_text(encoding="utf-8")
        if "NO_PENDING_MENUS" in status_text:
            print("✅ 新規メニューなし（NO_PENDING_MENUS）。インポートをスキップします。")
            sys.exit(0)

    # 出力ファイルの存在確認
    if not OUTPUT_FILE.exists():
        print(f"❌ 出力ファイルが見つかりません:")
        print(f"   {OUTPUT_FILE}")
        print()
        print("Claude Desktop で「Kyowa メニュー解析」タスクを実行し、")
        print(f"analysis_results.json が output/ フォルダに保存されているか確認してください。")
        sys.exit(1)

    print(f"📂 読み込み: {OUTPUT_FILE}")

    # JSON 読み込み
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        raw = f.read().strip()

    # JSON 配列を抽出（Claude が余分なテキストを付けた場合に対応）
    import re
    if not raw.startswith("["):
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        else:
            print("❌ JSON 配列が見つかりません。ファイルの内容を確認してください。")
            print(f"   先頭100文字: {raw[:100]}")
            sys.exit(1)

    try:
        results = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"❌ JSON パースエラー: {e}")
        sys.exit(1)

    if not isinstance(results, list):
        print("❌ 出力が JSON 配列ではありません")
        sys.exit(1)

    print(f"📋 解析結果: {len(results)} 件")

    # キャッシュ読み込み
    cache = load_cache()
    original_count = len(cache)
    print(f"📦 既存キャッシュ: {original_count} 件")

    # バリデーション・マージ
    ok = 0
    errors = 0
    for entry in results:
        try:
            validated = validate_entry(entry)
            cache[validated["name"]] = validated
            ok += 1
        except (ValueError, KeyError) as e:
            print(f"  ⚠️  スキップ: {e} — {entry.get('name', '(name なし)')}")
            errors += 1

    # キャッシュ保存
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

    added = len(cache) - original_count
    print(f"✅ キャッシュ統合: {ok} 件処理、{added} 件追加、{errors} 件エラー")
    print(f"   キャッシュ総数: {len(cache)} メニュー")
    print(f"   保存先: {CACHE_FILE}")

    # アーカイブ
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    moved = archive_files(timestamp)
    if moved:
        print(f"   アーカイブ: {', '.join(moved)}")

    # STATUS 更新
    update_status("IMPORT_COMPLETE", ok, errors, added, len(cache))

    print()
    print("=" * 60)
    print("✅ インポート完了")
    print("=" * 60)

    if errors > 0:
        print(f"\n⚠️  {errors} 件のエントリでエラーがありました（スキップ済み）")

    sys.exit(0 if errors == 0 else 2)


if __name__ == "__main__":
    main()
