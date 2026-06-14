#!/usr/bin/env python3
"""
Claude Desktop が生成したセット解説（一文）を Supabase に反映するスクリプト。

generate_set_commentary_input.py（npm run set:prepare）で書き出した
pending_sets.md を Claude Desktop が解説し、output/set_commentary.json に
保存した後に実行する。

  set_commentary.json 形式:
  [
    { "date": "2026-06-08", "comment": "..." },
    ...
  ]

更新先: ai_selections.set_comment（再生成しても消えない専用カラム）
        ※ 事前に docs/AI_SELECTIONS_TABLE.sql の ALTER 文を実行しておくこと。

使い方:
    python ml/import_set_commentary.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from supabase_data_loader import SupabaseDataLoader

# --- パス定義 ---
ML_DIR = Path(__file__).parent

OBSIDIAN_PROJECT_DIR = Path(
    r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer"
)
OUTPUT_FILE = OBSIDIAN_PROJECT_DIR / "output" / "set_commentary.json"
INPUT_FILE = OBSIDIAN_PROJECT_DIR / "input" / "pending_sets.md"
STATUS_FILE = OBSIDIAN_PROJECT_DIR / "_STATUS_SETS.md"
ARCHIVE_DIR = OBSIDIAN_PROJECT_DIR / "archive"

MAX_COMMENT_LEN = 200


def load_results() -> list:
    if not OUTPUT_FILE.exists():
        print("❌ 出力ファイルが見つかりません:")
        print(f"   {OUTPUT_FILE}")
        print()
        print("Claude Desktop で「Kyowa セット解説」タスクを実行し、")
        print("set_commentary.json が output/ フォルダに保存されているか確認してください。")
        sys.exit(1)

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        raw = f.read().strip()

    # JSON 配列を抽出（余分なテキストが付いた場合に対応）
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

    return results


def validate_entry(entry: dict):
    """(date, comment) を返す。不正なら None"""
    if not isinstance(entry, dict):
        return None
    date = (entry.get("date") or "").strip()
    comment = (entry.get("comment") or "").strip()
    if not date or not comment:
        return None
    # 簡易な日付フォーマットチェック
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return None
    if len(comment) > MAX_COMMENT_LEN:
        comment = comment[:MAX_COMMENT_LEN].rstrip()
    return date, comment


def archive_files(timestamp: str):
    ARCHIVE_DIR.mkdir(exist_ok=True)
    moved = []
    for src, dst_name in [
        (INPUT_FILE, f"pending_sets_{timestamp}.md"),
        (OUTPUT_FILE, f"set_commentary_{timestamp}.json"),
    ]:
        if src.exists():
            dst = ARCHIVE_DIR / dst_name
            src.rename(dst)
            moved.append(dst_name)
    return moved


def update_status(ok: int, errors: int):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    content = f"""# セット解説 処理状態

**状態**: COMMENTARY_IMPORTED
**更新**: {now}
**反映件数**: {ok} 件 / エラー: {errors} 件

解説が Supabase の ai_selections.set_comment に反映されました。
GitHub Pages から自動的に表示されます。
"""
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    print("=" * 60)
    print("📥 セット解説のインポート → Supabase反映")
    print("=" * 60)

    results = load_results()
    print(f"📋 解説結果: {len(results)} 件")

    print("\n📡 Supabaseに接続中...")
    try:
        loader = SupabaseDataLoader()
    except Exception as e:
        print(f"❌ Supabase接続失敗: {e}")
        sys.exit(1)

    ok = 0
    errors = 0
    for entry in results:
        validated = validate_entry(entry)
        if not validated:
            print(f"  ⚠️  スキップ（不正なエントリ）: {entry}")
            errors += 1
            continue

        date, comment = validated
        try:
            response = (
                loader.client.table("ai_selections")
                .update({"set_comment": comment})
                .eq("date", date)
                .execute()
            )
            if response.data:
                print(f"  ✓ {date}: {comment}")
                ok += 1
            else:
                print(f"  ⚠️  {date}: 該当セットが見つかりません（先にセットを生成してください）")
                errors += 1
        except Exception as e:
            msg = str(e)
            print(f"  ❌ {date}: 更新失敗: {msg}")
            if "set_comment" in msg and "column" in msg.lower():
                print(
                    "     → ai_selections に set_comment カラムが無い可能性があります。\n"
                    "       docs/AI_SELECTIONS_TABLE.sql の ALTER 文を実行してください:\n"
                    "       ALTER TABLE ai_selections ADD COLUMN IF NOT EXISTS set_comment TEXT;"
                )
            errors += 1

    print(f"\n✅ 反映: {ok} 件、エラー: {errors} 件")

    # アーカイブ（成功があった場合のみ）
    if ok > 0:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        moved = archive_files(timestamp)
        if moved:
            print(f"   アーカイブ: {', '.join(moved)}")

    update_status(ok, errors)

    print("\n" + "=" * 60)
    print("✅ セット解説インポート完了")
    print("=" * 60)
    print("\n✅ GitHub Pages から自動的に表示されます。")

    sys.exit(0 if errors == 0 else 2)


if __name__ == "__main__":
    main()
