#!/usr/bin/env python3
"""
週次メニュー更新スクリプト

新しく追加されたメニューファイルのみを対象に Claude 解析を実行し、
AI推薦を再生成します。既存キャッシュを最大限活用するため、
週次更新のコストは最小限に抑えられます。

使い方:
    # 先週以降のファイルを自動検出して更新（標準）
    python ml/update_weekly.py

    # 特定日付以降のファイルのみ対象
    python ml/update_weekly.py --since 2026-04-01

    # 特定日付だけ対象
    python ml/update_weekly.py --dates 2026-04-07 2026-04-08 2026-04-09

    # コスト・処理対象の確認のみ（API呼び出しなし）
    python ml/update_weekly.py --dry-run

    # Claude解析・再学習をスキップし、推薦再生成のみ
    python ml/update_weekly.py --regen-only

    # Claude解析は実行するが、モデル再学習をスキップ
    python ml/update_weekly.py --skip-retrain

環境変数:
    ANTHROPIC_API_KEY: Claude API キー
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# プロジェクトルートとMLディレクトリをパスに追加
PROJECT_ROOT = Path(__file__).parent.parent
ML_DIR = Path(__file__).parent
sys.path.insert(0, str(ML_DIR))


def parse_args():
    parser = argparse.ArgumentParser(
        description="週次メニュー更新（新規メニューのみClaude解析）"
    )
    parser.add_argument(
        "--since",
        type=str,
        default=None,
        help="この日付以降のメニューファイルを対象（YYYY-MM-DD）。未指定時は7日前以降",
    )
    parser.add_argument(
        "--dates",
        nargs="+",
        default=None,
        help="対象日付を直接指定（例: 2026-04-07 2026-04-08）",
    )
    parser.add_argument(
        "--regen-only",
        action="store_true",
        help="Claude解析・再学習をスキップし、推薦再生成のみ実行",
    )
    parser.add_argument(
        "--skip-retrain",
        action="store_true",
        help="Claude解析は実行するが、モデル再学習をスキップ",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際のAPI呼び出しを行わず、処理対象メニューと推定コストのみ表示",
    )
    return parser.parse_args()


def get_target_menu_files(args) -> list:
    """対象メニューファイルを取得"""
    menus_dir = PROJECT_ROOT / "menus"
    all_files = sorted(menus_dir.glob("menus_*.json"))

    if args.dates:
        # 日付直接指定
        target_dates = set(args.dates)
        files = [f for f in all_files if f.stem.replace("menus_", "") in target_dates]
    else:
        # since 日付以降のファイルを自動検出
        if args.since:
            cutoff = datetime.strptime(args.since, "%Y-%m-%d")
        else:
            cutoff = datetime.now() - timedelta(days=7)

        files = []
        for f in all_files:
            date_str = f.stem.replace("menus_", "")
            try:
                file_date = datetime.strptime(date_str, "%Y-%m-%d")
                if file_date >= cutoff:
                    files.append(f)
            except ValueError:
                pass

    return files


def collect_menus(menu_files: list, cache: dict) -> tuple:
    """
    対象ファイルから全メニューを収集し、
    キャッシュ未登録の新規メニューを特定する。
    戻り値: (全ユニークメニューリスト, 新規メニューリスト)
    """
    all_menus = {}
    for menu_file in menu_files:
        with open(menu_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for menu in data.get("menus", []):
            name = menu.get("name", "")
            if name and name not in all_menus:
                all_menus[name] = menu

    new_menus = [m for name, m in all_menus.items() if name not in cache]
    return list(all_menus.values()), new_menus


def estimate_cost(new_menu_count: int) -> str:
    """Claude Haiku API コストを概算"""
    batch_size = 15
    num_batches = math.ceil(new_menu_count / batch_size) if new_menu_count > 0 else 0
    # Haiku: input $0.80/M tokens, output $4/M tokens
    # 1バッチ ≈ 入力300 + 出力800 tokens（概算）
    input_cost = num_batches * 300 * 0.80 / 1_000_000
    output_cost = num_batches * 800 * 4.00 / 1_000_000
    total = input_cost + output_cost
    return f"${total:.4f} (約{num_batches}回のAPIコール)"


def step_analyze(all_menus: list, new_menus: list):
    """Step: Claude 解析（新規メニューのみ）"""
    from claude_analyzer import ClaudeMenuAnalyzer

    try:
        analyzer = ClaudeMenuAnalyzer()
    except ValueError as e:
        print(f"❌ {e}")
        sys.exit(1)

    # analyze_menus はキャッシュ済みを自動スキップするため、全リスト渡しでOK
    analyzer.analyze_menus(all_menus)
    analyzer.print_stats()


def step_retrain():
    """Step: モデル再学習"""
    from menu_recommender import MenuRecommender

    print("\n🤖 モデル再学習中...")
    recommender = MenuRecommender()
    recommender.load_data()
    recommender.prepare_features()
    recommender.train_models()
    recommender.analyze_feature_importance()
    recommender.save_model()
    print("✅ モデル再学習・保存完了")


def step_regen(menu_files: list):
    """Step: 指定日付のAI推薦を再生成してSupabaseに保存"""
    from menu_recommender import MenuRecommender
    from supabase_data_loader import SupabaseDataLoader
    from generate_ai_selections import generate_ai_selections_for_date, upload_to_supabase

    model_path = ML_DIR / "model" / "menu_recommender.pkl"
    if not model_path.exists():
        print("❌ モデルが見つかりません。先に学習を実行してください")
        print("   python ml/menu_recommender.py")
        return

    recommender = MenuRecommender.load_model(str(model_path))

    try:
        loader = SupabaseDataLoader()
    except Exception as e:
        print(f"❌ Supabase接続失敗: {e}")
        return

    generated = 0
    uploaded = 0
    for menu_file in menu_files:
        date_str = menu_file.stem.replace("menus_", "")
        with open(menu_file, "r", encoding="utf-8") as f:
            menus_data = json.load(f)

        result = generate_ai_selections_for_date(recommender, date_str, menus_data)
        if result:
            generated += 1
            if upload_to_supabase(loader, result):
                uploaded += 1

    print(f"✅ {generated}日分の推薦を生成、{uploaded}日分をSupabaseに保存")


def main():
    args = parse_args()

    print("=" * 60)
    print("🔄 週次メニュー更新")
    print("=" * 60)

    # Step 1: 対象ファイルを特定
    menu_files = get_target_menu_files(args)
    if not menu_files:
        print("\n⚠️  対象ファイルが見つかりません")
        print("   オプション例:")
        print("     --since 2026-04-01")
        print("     --dates 2026-04-07 2026-04-08")
        return

    print(f"\n📁 対象メニューファイル: {len(menu_files)}件")
    for f in menu_files:
        print(f"   {f.name}")

    # --- 推薦再生成のみモード ---
    if args.regen_only:
        print("\n⏩ --regen-only モード: Claude解析・再学習をスキップ")
        step_regen(menu_files)
        print("\n✅ 更新完了")
        return

    # Step 2: キャッシュ読み込みと新規メニュー特定
    from claude_analyzer import CACHE_FILE

    cache = {}
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)

    print(f"\n📦 キャッシュ登録済みメニュー: {len(cache)}件")

    all_menus, new_menus = collect_menus(menu_files, cache)
    print(f"📋 対象ユニークメニュー: {len(all_menus)}件")
    print(f"✨ 新規（未解析）メニュー: {len(new_menus)}件")
    print(f"💰 推定APIコスト: {estimate_cost(len(new_menus))}")

    # --dry-run: ここで終了
    if args.dry_run:
        print("\n🔍 --dry-run モード: 実際の処理は行いません")
        if new_menus:
            print("\n未解析メニュー一覧:")
            for m in new_menus:
                print(f"   - {m['name']}")
        return

    # Step 3: Claude 解析（新規メニューのみ）
    if new_menus:
        print(f"\n🧠 Claude Haiku でメニュー意味解析中...")
        step_analyze(all_menus, new_menus)
    else:
        print("\n✅ 全メニューがキャッシュ済みのため、Claude解析をスキップ")

    # Step 4: モデル再学習
    if not args.skip_retrain:
        step_retrain()
    else:
        print("\n⏩ --skip-retrain モード: 再学習をスキップ")

    # Step 5: AI推薦を対象日付のみ再生成
    print(f"\n🎯 AI推薦再生成中（{len(menu_files)}日分)...")
    step_regen(menu_files)

    print("\n" + "=" * 60)
    print("✅ 週次更新完了！")
    print("=" * 60)


if __name__ == "__main__":
    main()
