#!/usr/bin/env python3
"""
Claude Haiku によるメニュー意味解析モジュール

メニュー名と栄養情報から、正規表現では捉えられない
セマンティック特徴量（調理法・主食材・ジャンル・味の傾向等）を抽出する。

結果はローカルキャッシュ (ml/data/claude_menu_cache.json) に保存し、
同一メニューへの再呼び出しを防ぐ。

環境変数:
    ANTHROPIC_API_KEY: Anthropic API キー（必須）

使い方:
    # 単体実行（全メニューを解析してキャッシュ生成）
    python ml/claude_analyzer.py

    # モジュールとして使用
    from claude_analyzer import ClaudeMenuAnalyzer
    analyzer = ClaudeMenuAnalyzer()
    features = analyzer.get_features("蒸し鶏&ブロッコリー")
"""

import json
import os
import time
from pathlib import Path
from typing import Optional

# --- 定数 ---
MODEL_NAME = "claude-haiku-4-20250414"
CACHE_FILE = Path(__file__).parent / "data" / "claude_menu_cache.json"
BATCH_SIZE = 15  # 1回のAPIコールで処理するメニュー数

# Claude 解析が返す特徴量の定義
COOKING_METHODS = ["揚げ物", "煮物", "焼き物", "蒸し物", "炒め物", "生・冷製", "和え物"]
MAIN_PROTEINS = ["鶏", "豚", "牛", "魚介", "卵", "大豆", "野菜中心", "その他"]
CUISINE_STYLES = ["和食", "洋食", "中華", "エスニック", "その他"]

# 特徴量名のプレフィックス(MLモデルで使用)
FEATURE_NAMES = (
    [f"claude_cook_{m}" for m in COOKING_METHODS]     # 7 dim
    + [f"claude_prot_{p}" for p in MAIN_PROTEINS]     # 8 dim
    + [f"claude_cuisine_{c}" for c in CUISINE_STYLES]  # 5 dim
    + [
        "claude_light_heavy",       # 軽め0 〜 がっつり1
        "claude_refreshing",        # さっぱり度 0-1
        "claude_spicy",             # 辛さ 0-1
        "claude_sweet",             # 甘さ 0-1
        "claude_health_impression", # 健康的印象 0-1
    ]
)  # 合計 25 dim

ZERO_FEATURES = {name: 0.0 for name in FEATURE_NAMES}

# --- システムプロンプト ---
SYSTEM_PROMPT = """\
あなたは社食メニューの分類専門AIです。
与えられたメニューリスト（名前と栄養情報）を分析し、各メニューについて以下の分類をJSON配列で返してください。

各メニューに対して以下を返してください:
{
  "name": "メニュー名（入力と同一）",
  "cooking_method": "揚げ物|煮物|焼き物|蒸し物|炒め物|生・冷製|和え物 のいずれか1つ",
  "main_protein": "鶏|豚|牛|魚介|卵|大豆|野菜中心|その他 のいずれか1つ",
  "cuisine_style": "和食|洋食|中華|エスニック|その他 のいずれか1つ",
  "light_heavy": 0.0~1.0の数値（0=軽め、1=がっつり）,
  "refreshing": 0.0~1.0の数値（さっぱり度）,
  "spicy": 0.0~1.0の数値（辛さ）,
  "sweet": 0.0~1.0の数値（甘さ）,
  "health_impression": 0.0~1.0の数値（0=不健康、1=健康的）
}

ルール:
- メニュー名と栄養情報（カロリー、たんぱく質、脂質、炭水化物等）の両方を考慮して判断
- cooking_method, main_protein, cuisine_style は必ず指定されたカテゴリのいずれか1つのみ
- 数値は小数点1桁まで（0.0, 0.1, ..., 1.0）
- 必ずJSON配列のみを返し、他のテキストは含めない
"""


class ClaudeMenuAnalyzer:
    """Claude Haiku を使ったメニュー意味解析"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY が設定されていません。\n"
                "  export ANTHROPIC_API_KEY='sk-ant-...'\n"
                "を実行してください。"
            )
        self._client = None
        self.cache = self._load_cache()
        self._stats = {"cache_hits": 0, "api_calls": 0, "menus_analyzed": 0}

    @property
    def client(self):
        """遅延初期化でAnthropic clientを生成"""
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    # --- キャッシュ管理 ---
    def _load_cache(self) -> dict:
        """キャッシュファイルを読み込み"""
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                print(f"📦 Claude解析キャッシュ読み込み: {len(data)} メニュー")
                return data
            except (json.JSONDecodeError, IOError):
                print("⚠️  キャッシュファイルが破損しています。再作成します。")
        return {}

    def _save_cache(self):
        """キャッシュファイルを保存"""
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.cache, f, ensure_ascii=False, indent=2)

    # --- 単一メニューの特徴量取得 ---
    def get_features(self, menu_name: str) -> dict:
        """
        メニュー名に対応する特徴量辞書を返す。
        キャッシュにない場合はゼロベクトルを返す（バッチ解析を推奨）。
        """
        if menu_name in self.cache:
            self._stats["cache_hits"] += 1
            return self._to_feature_dict(self.cache[menu_name])
        return dict(ZERO_FEATURES)

    def get_feature_vector(self, menu_name: str) -> list:
        """メニュー名に対する特徴量をリスト（数値ベクトル）として返す"""
        features = self.get_features(menu_name)
        return [features[name] for name in FEATURE_NAMES]

    # --- バッチ解析 ---
    def analyze_menus(self, menus: list, force: bool = False):
        """
        メニューリストをバッチ解析し、キャッシュに保存する。

        Args:
            menus: [{"name": "...", "nutrition": {...}}, ...]
            force: Trueならキャッシュ済みメニューも再解析
        """
        # 未解析メニューを抽出
        if force:
            to_analyze = menus
        else:
            to_analyze = [m for m in menus if m["name"] not in self.cache]

        if not to_analyze:
            print(f"✅ 全メニューがキャッシュ済みです ({len(menus)} 件)")
            return

        print(f"🔍 Claude解析が必要なメニュー: {len(to_analyze)}/{len(menus)} 件")

        # バッチに分割してAPI呼び出し
        for i in range(0, len(to_analyze), BATCH_SIZE):
            batch = to_analyze[i : i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(to_analyze) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"  📡 バッチ {batch_num}/{total_batches} ({len(batch)} メニュー)...")

            try:
                results = self._call_claude(batch)
                for result in results:
                    name = result.get("name", "")
                    if name:
                        self.cache[name] = result
                        self._stats["menus_analyzed"] += 1
                self._stats["api_calls"] += 1
            except Exception as e:
                print(f"  ⚠️  バッチ {batch_num} 解析エラー: {e}")
                # エラー時もパイプラインを止めない（ゼロベクトルで代替）
                for menu in batch:
                    if menu["name"] not in self.cache:
                        self.cache[menu["name"]] = self._empty_result(menu["name"])

            # レート制限対策
            if i + BATCH_SIZE < len(to_analyze):
                time.sleep(0.5)

        self._save_cache()
        print(f"✅ Claude解析完了: {self._stats['menus_analyzed']} メニュー解析, "
              f"{self._stats['api_calls']} API呼び出し")

    def _call_claude(self, batch: list) -> list:
        """Claude Haiku にバッチ解析を依頼"""
        # ユーザープロンプトを構築
        menu_lines = []
        for menu in batch:
            nutrition = menu.get("nutrition", {})
            # 数値の栄養情報のみ抽出
            nutrition_str = ", ".join(
                f"{k}: {v}"
                for k, v in nutrition.items()
                if isinstance(v, (int, float)) and v > 0
            )
            menu_lines.append(f"- {menu['name']} ({nutrition_str})")

        user_prompt = "以下のメニューを分析してください:\n\n" + "\n".join(menu_lines)

        response = self.client.messages.create(
            model=MODEL_NAME,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        # レスポンスからJSONを抽出
        response_text = response.content[0].text.strip()

        # JSON部分を抽出（前後の余分なテキストを除去）
        if response_text.startswith("["):
            json_text = response_text
        else:
            # ```json ... ``` ブロックを探す
            import re
            match = re.search(r"\[.*\]", response_text, re.DOTALL)
            if match:
                json_text = match.group(0)
            else:
                raise ValueError(f"JSONが見つかりません: {response_text[:200]}")

        results = json.loads(json_text)

        # バリデーション
        validated = []
        for result in results:
            validated.append(self._validate_result(result))

        return validated

    def _validate_result(self, result: dict) -> dict:
        """解析結果をバリデーションし、正規化する"""
        name = result.get("name", "不明")
        cooking = result.get("cooking_method", "その他")
        protein = result.get("main_protein", "その他")
        cuisine = result.get("cuisine_style", "その他")

        # カテゴリが有効か確認
        if cooking not in COOKING_METHODS:
            cooking = "その他" if "その他" in COOKING_METHODS else COOKING_METHODS[-1]
        if protein not in MAIN_PROTEINS:
            protein = "その他"
        if cuisine not in CUISINE_STYLES:
            cuisine = "その他"

        # 数値を0-1にクランプ
        def clamp(v, low=0.0, high=1.0):
            try:
                return max(low, min(high, float(v)))
            except (ValueError, TypeError):
                return 0.5

        return {
            "name": name,
            "cooking_method": cooking,
            "main_protein": protein,
            "cuisine_style": cuisine,
            "light_heavy": clamp(result.get("light_heavy", 0.5)),
            "refreshing": clamp(result.get("refreshing", 0.5)),
            "spicy": clamp(result.get("spicy", 0.0)),
            "sweet": clamp(result.get("sweet", 0.0)),
            "health_impression": clamp(result.get("health_impression", 0.5)),
        }

    def _empty_result(self, name: str) -> dict:
        """エラー時のデフォルト結果（中立的な値）"""
        return {
            "name": name,
            "cooking_method": "その他",
            "main_protein": "その他",
            "cuisine_style": "その他",
            "light_heavy": 0.5,
            "refreshing": 0.5,
            "spicy": 0.0,
            "sweet": 0.0,
            "health_impression": 0.5,
        }

    # --- 特徴量変換 ---
    def _to_feature_dict(self, result: dict) -> dict:
        """Claude解析結果を特徴量辞書に変換"""
        features = dict(ZERO_FEATURES)

        # 調理法 one-hot
        cooking = result.get("cooking_method", "")
        for method in COOKING_METHODS:
            key = f"claude_cook_{method}"
            features[key] = 1.0 if cooking == method else 0.0

        # 主食材 one-hot
        protein = result.get("main_protein", "")
        for p in MAIN_PROTEINS:
            key = f"claude_prot_{p}"
            features[key] = 1.0 if protein == p else 0.0

        # ジャンル one-hot
        cuisine = result.get("cuisine_style", "")
        for c in CUISINE_STYLES:
            key = f"claude_cuisine_{c}"
            features[key] = 1.0 if cuisine == c else 0.0

        # スカラー値
        features["claude_light_heavy"] = result.get("light_heavy", 0.5)
        features["claude_refreshing"] = result.get("refreshing", 0.5)
        features["claude_spicy"] = result.get("spicy", 0.0)
        features["claude_sweet"] = result.get("sweet", 0.0)
        features["claude_health_impression"] = result.get("health_impression", 0.5)

        return features

    def print_stats(self):
        """統計情報を表示"""
        print(f"\n📊 Claude解析統計:")
        print(f"   キャッシュヒット: {self._stats['cache_hits']}")
        print(f"   API呼び出し回数: {self._stats['api_calls']}")
        print(f"   解析メニュー数: {self._stats['menus_analyzed']}")
        print(f"   キャッシュ総数: {len(self.cache)}")


# --- スタンドアロン実行 ---
def main():
    """全メニューファイルを読み込み、未解析メニューをClaude解析してキャッシュ保存"""
    print("=" * 60)
    print("🧠 Claude メニュー意味解析")
    print("=" * 60)

    # メニューファイル一覧取得
    project_root = Path(__file__).parent.parent
    menus_dir = project_root / "menus"
    menu_files = sorted(menus_dir.glob("menus_*.json"))

    if not menu_files:
        print("❌ メニューファイルが見つかりません")
        return

    print(f"\n📁 {len(menu_files)} 日分のメニューファイルを検出")

    # 全メニューを収集（重複排除）
    all_menus = {}
    for menu_file in menu_files:
        with open(menu_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for menu in data.get("menus", []):
            name = menu.get("name", "")
            if name and name not in all_menus:
                all_menus[name] = menu

    print(f"📋 ユニークメニュー数: {len(all_menus)}")

    # Claude 解析実行
    try:
        analyzer = ClaudeMenuAnalyzer()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    analyzer.analyze_menus(list(all_menus.values()))
    analyzer.print_stats()

    # サンプル出力
    print("\n📝 解析結果サンプル (先頭5件):")
    for i, (name, result) in enumerate(analyzer.cache.items()):
        if i >= 5:
            break
        print(f"\n  [{name}]")
        print(f"    調理法: {result.get('cooking_method')}")
        print(f"    主食材: {result.get('main_protein')}")
        print(f"    ジャンル: {result.get('cuisine_style')}")
        print(f"    重さ: {result.get('light_heavy')}, さっぱり: {result.get('refreshing')}")
        print(f"    健康印象: {result.get('health_impression')}")

    print(f"\n✅ キャッシュ保存先: {CACHE_FILE}")


if __name__ == "__main__":
    main()
