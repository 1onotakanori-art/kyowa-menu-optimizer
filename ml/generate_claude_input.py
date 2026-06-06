#!/usr/bin/env python3
"""
Claude Desktop Cowork 用の解析インプットファイルを生成するスクリプト

キャッシュに未登録のメニューを抽出し、Claude Desktop が読み込める
Markdown ファイルとして Obsidian Vault に書き出す。

出力先:
    C:\\Users\\Lenovo\\obsidian\\MyVault\\300_Projects\\kyowa-menu-analyzer\\input\\pending_menus.md

使い方:
    python ml/generate_claude_input.py               # 未キャッシュ分のみ（推奨）
    python ml/generate_claude_input.py --all         # キャッシュ済み含む全件
    python ml/generate_claude_input.py --since 30   # 直近30日分のみ対象
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# --- パス定義 ---
PROJECT_ROOT = Path(__file__).parent.parent
ML_DIR = Path(__file__).parent
CACHE_FILE = ML_DIR / "data" / "claude_menu_cache.json"

OBSIDIAN_PROJECT_DIR = Path(r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer")
INPUT_FILE = OBSIDIAN_PROJECT_DIR / "input" / "pending_menus.md"
STATUS_FILE = OBSIDIAN_PROJECT_DIR / "_STATUS.md"


def load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def collect_uncached_menus(force: bool = False, since_days: int = None) -> list:
    """キャッシュ未登録のメニューを全 menus/*.json から収集"""
    cache = load_cache()
    menus_dir = PROJECT_ROOT / "menus"
    all_menus: dict = {}

    cutoff = None
    if since_days is not None:
        cutoff = datetime.now() - timedelta(days=since_days)

    for menu_file in sorted(menus_dir.glob("menus_*.json")):
        if cutoff is not None:
            date_str = menu_file.stem.replace("menus_", "")
            try:
                file_date = datetime.strptime(date_str, "%Y-%m-%d")
                if file_date < cutoff:
                    continue
            except ValueError:
                continue

        with open(menu_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        for menu in data.get("menus", []):
            name = menu.get("name", "").strip()
            if name and name not in all_menus:
                all_menus[name] = menu

    if force:
        return list(all_menus.values())
    return [m for name, m in all_menus.items() if name not in cache]


def generate_md(menus: list) -> str:
    """解析リクエスト用 Markdown ファイルを生成"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        "---",
        f"generated: {now}",
        f"count: {len(menus)}",
        "status: PENDING",
        "---",
        "",
        "# 社食メニュー解析リクエスト",
        "",
        f"**生成日時**: {now}  ",
        f"**対象件数**: {len(menus)} 件",
        "",
        "---",
        "",
        "## 解析ルール",
        "",
        "各メニューについて以下のフィールドを判定してください：",
        "",
        "| フィールド | 値 |",
        "|---|---|",
        "| `cooking_method` | `揚げ物` / `煮物` / `焼き物` / `蒸し物` / `炒め物` / `生・冷製` / `和え物` のいずれか1つ |",
        "| `main_protein` | `鶏` / `豚` / `牛` / `魚介` / `卵` / `大豆` / `野菜中心` / `その他` のいずれか1つ |",
        "| `cuisine_style` | `和食` / `洋食` / `中華` / `エスニック` / `その他` のいずれか1つ |",
        "| `light_heavy` | 0.0（軽め）〜 1.0（がっつり） |",
        "| `refreshing` | 0.0〜1.0（さっぱり度） |",
        "| `spicy` | 0.0〜1.0（辛さ） |",
        "| `sweet` | 0.0〜1.0（甘さ） |",
        "| `health_impression` | 0.0（不健康）〜 1.0（健康的） |",
        "",
        "- メニュー名と栄養情報（カロリー・たんぱく質・脂質等）の**両方**を考慮して判断",
        "- 数値は小数点1桁（0.0, 0.1, …, 1.0）",
        "",
        "---",
        "",
        "## 出力形式",
        "",
        "解析完了後、**以下のパスに JSON 配列のみを保存**してください：",
        "",
        f"```",
        r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer\output\analysis_results.json",
        "```",
        "",
        "```json",
        "[",
        "  {",
        '    "name": "メニュー名（以下の一覧と完全一致）",',
        '    "cooking_method": "揚げ物",',
        '    "main_protein": "鶏",',
        '    "cuisine_style": "和食",',
        '    "light_heavy": 0.4,',
        '    "refreshing": 0.6,',
        '    "spicy": 0.0,',
        '    "sweet": 0.1,',
        '    "health_impression": 0.8',
        "  },",
        "  ...",
        "]",
        "```",
        "",
        "> **注意**: JSON 配列のみを出力してください。説明文・コードブロック記号は不要です。",
        "",
        "---",
        "",
        "## 対象メニュー一覧",
        "",
    ]

    for i, menu in enumerate(menus, 1):
        name = menu["name"]
        nutrition = menu.get("nutrition", {})

        lines.append(f"### {i}. {name}")

        nutrition_items = []
        for key in ["エネルギー", "たんぱく質", "脂質", "炭水化物", "食塩相当量"]:
            val = nutrition.get(key)
            if val is not None and val != "" and val != 0:
                unit = "kcal" if key == "エネルギー" else "g"
                nutrition_items.append(f"- {key}: {val}{unit}")

        if nutrition_items:
            lines.extend(nutrition_items)
        else:
            lines.append("- 栄養情報なし")

        lines.append("")

    return "\n".join(lines)


def update_status(status: str, menu_count: int = 0):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    content = f"""# 処理状態

**状態**: {status}
**更新**: {now}
**対象件数**: {menu_count} 件

"""
    if status == "PENDING_ANALYSIS":
        content += """## 次のステップ

Claude Desktop で「Kyowa メニュー解析」タスクを実行してください。

1. `input/pending_menus.md` を読み込み
2. 全メニューを解析
3. `output/analysis_results.json` に書き出し

解析完了後、ターミナルで以下を実行：

```powershell
cd D:\\301_Apps\\kyowa-menu-optimizer
npm run weekly:finish
```
"""
    elif status == "NO_PENDING_MENUS":
        content += "全メニューがキャッシュ済みです。解析不要です。\n"

    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    parser = argparse.ArgumentParser(
        description="Claude Cowork 用インプット MD を生成"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="キャッシュ済みを含む全件を対象にする",
    )
    parser.add_argument(
        "--since",
        type=int,
        default=None,
        metavar="DAYS",
        help="直近 N 日分のみ対象（例: 30）",
    )
    args = parser.parse_args()

    print("📋 キャッシュ未登録メニューを収集中...")
    menus = collect_uncached_menus(force=args.all, since_days=args.since)

    if not menus:
        print("✅ 全メニューがキャッシュ済みです。解析不要です。")
        update_status("NO_PENDING_MENUS", 0)
        sys.exit(0)

    print(f"✨ 新規（未解析）メニュー: {len(menus)} 件")

    # 出力ディレクトリ作成
    INPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # MD 生成・保存
    md_content = generate_md(menus)
    with open(INPUT_FILE, "w", encoding="utf-8") as f:
        f.write(md_content)

    # STATUS 更新
    update_status("PENDING_ANALYSIS", len(menus))

    print(f"✅ 入力ファイルを生成しました: {INPUT_FILE}")
    print(f"   状態ファイル: {STATUS_FILE}")
    print()
    print("👉 次のステップ: Claude Desktop で「Kyowa メニュー解析」タスクを実行してください")
    print("   完了後に: npm run weekly:finish")


if __name__ == "__main__":
    main()
