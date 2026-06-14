#!/usr/bin/env python3
"""
推薦メニューセットに「一文の解説」を付けるための Cowork 入力ファイルを生成する。

既存のメニュー評価（generate_claude_input.py / pending_menus.md）とは
完全に別の、独立した週次 Cowork 動作。
generate_ai_selections.py / update_weekly.py が「セット」を生成した後に実行する。

フロー:
  1) npm run set:prepare   ← このスクリプト（Supabaseの推薦セット → Obsidianへ）
  2) Claude Desktop で「Kyowa セット解説」タスクを実行 → output/set_commentary.json
  3) npm run set:finish    ← import_set_commentary.py（解説をSupabaseへ反映）

出力先:
    C:\\Users\\Lenovo\\obsidian\\MyVault\\300_Projects\\kyowa-menu-analyzer\\input\\pending_sets.md

使い方:
    python ml/generate_set_commentary_input.py             # 直近10日分（推奨）
    python ml/generate_set_commentary_input.py --limit 14  # 直近14日分
    python ml/generate_set_commentary_input.py --all       # 解説が未設定の全件
    python ml/generate_set_commentary_input.py --dates 2026-06-08 2026-06-09
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# menu_recommender などに依存しないよう、Supabase ローダーのみ読み込む
sys.path.insert(0, str(Path(__file__).parent))
from supabase_data_loader import SupabaseDataLoader

# --- パス定義 ---
ML_DIR = Path(__file__).parent
PROFILE_FILE = ML_DIR / "data" / "user_preference_profile.json"

OBSIDIAN_PROJECT_DIR = Path(
    r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer"
)
INPUT_FILE = OBSIDIAN_PROJECT_DIR / "input" / "pending_sets.md"
STATUS_FILE = OBSIDIAN_PROJECT_DIR / "_STATUS_SETS.md"
OUTPUT_PATH_HINT = r"C:\Users\Lenovo\obsidian\MyVault\300_Projects\kyowa-menu-analyzer\output\set_commentary.json"

NUTRITION_KEYS = ["エネルギー", "たんぱく質", "脂質", "炭水化物", "野菜重量"]
NUTRITION_LABELS = {
    "エネルギー": "E",
    "たんぱく質": "P",
    "脂質": "F",
    "炭水化物": "C",
    "野菜重量": "V",
}


def load_preference_summary() -> str:
    """嗜好プロファイルを Claude 向けの短いサマリーにする"""
    if not PROFILE_FILE.exists():
        return "（嗜好プロファイル未生成）"
    try:
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            profile = json.load(f)
    except (json.JSONDecodeError, IOError):
        return "（嗜好プロファイル読み込み失敗）"

    claude = profile.get("claude_analysis", {})
    parts = []
    if claude.get("taste_preference"):
        parts.append(f"味の好み: {claude['taste_preference']}")
    if claude.get("nutrition_tendency"):
        parts.append(f"栄養傾向: {claude['nutrition_tendency']}")
    if claude.get("preferred_cooking_methods"):
        parts.append(f"好む調理法: {', '.join(claude['preferred_cooking_methods'])}")
    if claude.get("preferred_proteins"):
        parts.append(f"好む食材: {', '.join(claude['preferred_proteins'])}")
    if claude.get("preferred_cuisines"):
        parts.append(f"好むジャンル: {', '.join(claude['preferred_cuisines'])}")
    if claude.get("avoidance_patterns"):
        parts.append(f"避ける傾向: {', '.join(claude['avoidance_patterns'])}")
    return "\n".join(f"- {p}" for p in parts) if parts else "（嗜好情報なし）"


def fetch_selections(loader, limit=None, dates=None, only_missing=False) -> list:
    """Supabase から生成済みの推薦セットを取得"""
    query = loader.client.table("ai_selections").select(
        "date, date_label, selected_menus, set_comment"
    )
    if dates:
        query = query.in_("date", dates)
    query = query.order("date", desc=True)
    if limit:
        query = query.limit(limit)

    response = query.execute()
    rows = response.data or []

    if only_missing:
        rows = [r for r in rows if not (r.get("set_comment") or "").strip()]

    # 日付昇順に並べ替えて返す
    return sorted(rows, key=lambda r: r.get("date", ""))


def _fmt_nutrition(nutrition: dict) -> str:
    items = []
    for key in NUTRITION_KEYS:
        val = nutrition.get(key)
        if val is None or val == "":
            continue
        unit = "kcal" if key == "エネルギー" else "g"
        items.append(f"{NUTRITION_LABELS[key]}:{val}{unit}")
    return " / ".join(items)


def _set_totals(selected_menus: list) -> dict:
    totals = {k: 0.0 for k in NUTRITION_KEYS}
    for menu in selected_menus:
        nut = menu.get("nutrition", {}) or {}
        for key in NUTRITION_KEYS:
            v = nut.get(key, 0)
            if isinstance(v, (int, float)):
                totals[key] += v
    return totals


def generate_md(rows: list, preference_summary: str) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        "---",
        f"generated: {now}",
        f"count: {len(rows)}",
        "status: PENDING_SET_COMMENTARY",
        "---",
        "",
        "# 社食 AI推薦セット 解説リクエスト",
        "",
        f"**生成日時**: {now}  ",
        f"**対象セット数**: {len(rows)} 件",
        "",
        "---",
        "",
        "## このユーザーの食事嗜好",
        "",
        preference_summary,
        "",
        "---",
        "",
        "## 解説ルール",
        "",
        "各日付の「AI推薦セット」について、**日本語で一文（40〜70字程度）の解説**を書いてください。",
        "",
        "- そのセットが「どんな食事か」「なぜこのユーザーに合うか」を、上の嗜好を踏まえて自然な口語で。",
        "- 栄養バランス（カロリー・たんぱく質・野菜量など）に軽く触れてよい。",
        "- 主食・主菜・副菜などの組み合わせの良さを一言添えると良い。",
        "- 過度に専門的にせず、親しみやすく。絵文字は使わない。",
        "",
        "---",
        "",
        "## 出力形式",
        "",
        "解析完了後、**以下のパスに JSON 配列のみを保存**してください：",
        "",
        "```",
        OUTPUT_PATH_HINT,
        "```",
        "",
        "```json",
        "[",
        "  {",
        '    "date": "2026-06-08",',
        '    "comment": "高たんぱくな主菜に野菜の副菜とご飯を合わせた、あなた好みのバランス定食です。"',
        "  }",
        "]",
        "```",
        "",
        "> **注意**: `date` は下記の各セット見出しの日付（YYYY-MM-DD）と完全一致させてください。",
        "> JSON 配列のみを出力してください（説明文・コードブロック記号は不要）。",
        "",
        "---",
        "",
        "## 対象セット一覧",
        "",
    ]

    for row in rows:
        date = row.get("date", "")
        date_label = row.get("date_label", date)
        selected = row.get("selected_menus", []) or []

        lines.append(f"### {date}（{date_label}）")
        if not selected:
            lines.append("- （推薦セットなし）")
            lines.append("")
            continue

        for menu in selected:
            role = menu.get("roleLabel") or ""
            role_tag = f"[{role}] " if role else ""
            name = menu.get("name", "（名前なし）")
            nut = _fmt_nutrition(menu.get("nutrition", {}) or {})
            nut_text = f" — {nut}" if nut else ""
            lines.append(f"- {role_tag}{name}{nut_text}")

        totals = _set_totals(selected)
        total_text = (
            f"合計 E:{totals['エネルギー']:.0f}kcal / "
            f"P:{totals['たんぱく質']:.1f}g / "
            f"F:{totals['脂質']:.1f}g / "
            f"C:{totals['炭水化物']:.1f}g / "
            f"V:{totals['野菜重量']:.0f}g"
        )
        lines.append(f"- **{total_text}**")
        lines.append("")

    return "\n".join(lines)


def update_status(status: str, count: int):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    content = f"""# セット解説 処理状態

**状態**: {status}
**更新**: {now}
**対象件数**: {count} 件
"""
    if status == "PENDING_SET_COMMENTARY":
        content += f"""
## 次のステップ

Claude Desktop で「Kyowa セット解説」タスクを実行してください。

1. `input/pending_sets.md` を読み込み
2. 各日付のセットに一文の解説を作成
3. `output/set_commentary.json` に書き出し

解説完了後、ターミナルで以下を実行：

```powershell
cd D:\\301_Apps\\kyowa-menu-optimizer
npm run set:finish
```
"""
    elif status == "NO_PENDING_SETS":
        content += "\n解説対象のセットがありません。\n"

    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def parse_args():
    parser = argparse.ArgumentParser(description="推薦セット解説用 Cowork 入力 MD を生成")
    parser.add_argument("--limit", type=int, default=10, help="直近 N 件を対象（デフォルト10）")
    parser.add_argument("--all", action="store_true", help="解説が未設定の全件を対象")
    parser.add_argument("--dates", nargs="+", metavar="DATE", help="対象日付を明示指定（YYYY-MM-DD）")
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("📝 推薦セット解説リクエストの生成（Cowork 入力）")
    print("=" * 60)

    print("\n📡 Supabaseに接続中...")
    try:
        loader = SupabaseDataLoader()
    except Exception as e:
        print(f"❌ Supabase接続失敗: {e}")
        sys.exit(1)

    only_missing = args.all
    limit = None if (args.all or args.dates) else args.limit

    rows = fetch_selections(
        loader, limit=limit, dates=args.dates, only_missing=only_missing
    )

    if not rows:
        print("✅ 解説対象のセットがありません。")
        update_status("NO_PENDING_SETS", 0)
        sys.exit(0)

    print(f"✨ 解説対象セット: {len(rows)} 件")

    preference_summary = load_preference_summary()
    md = generate_md(rows, preference_summary)

    INPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(INPUT_FILE, "w", encoding="utf-8") as f:
        f.write(md)

    update_status("PENDING_SET_COMMENTARY", len(rows))

    print(f"✅ 入力ファイルを生成しました: {INPUT_FILE}")
    print(f"   状態ファイル: {STATUS_FILE}")
    print()
    print("👉 次のステップ: Claude Desktop で「Kyowa セット解説」タスクを実行してください")
    print("   完了後に: npm run set:finish")


if __name__ == "__main__":
    main()
