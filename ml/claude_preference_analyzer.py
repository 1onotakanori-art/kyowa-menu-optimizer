#!/usr/bin/env python3
"""
Claude によるユーザー嗜好プロファイルの生成

meal_history の選択パターンを分析し、ユーザーの食事嗜好を
構造化プロファイルとして保存する。

学習データが更新されたタイミング（menu_recommender.py 実行時）で
再生成する。結果は ml/data/user_preference_profile.json に保存。

環境変数:
    ANTHROPIC_API_KEY: Anthropic API キー（必須）
"""

import json
import os
from pathlib import Path
from typing import Optional
from collections import Counter

# 嗜好プロファイルの保存先
PROFILE_FILE = Path(__file__).parent / "data" / "user_preference_profile.json"
MODEL_NAME = "claude-haiku-4-5-20251001"


class PreferenceAnalyzer:
    """ユーザー嗜好プロファイルを生成する"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY が設定されていません。\n"
                "  export ANTHROPIC_API_KEY='sk-ant-...'\n"
                "を実行してください。"
            )
        self._client = None
        self.profile = self._load_profile()

    @property
    def client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    def _load_profile(self) -> dict:
        """既存プロファイルを読み込み"""
        if PROFILE_FILE.exists():
            try:
                with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        return {}

    def _save_profile(self):
        PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.profile, f, ensure_ascii=False, indent=2)

    def generate_profile(self, training_data: list, claude_cache: dict = None):
        """
        学習データからユーザー嗜好プロファイルを生成する。

        Args:
            training_data: menu_recommender の load_data() で取得したデータ
            claude_cache: claude_analyzer のキャッシュ（あれば使用）
        """
        print("\n🧠 ユーザー嗜好プロファイル生成中...")

        # 選択メニューと非選択メニューを分類
        selected_menus = []
        not_selected_menus = []
        for day_data in training_data:
            for menu in day_data.get("allMenus", []):
                if menu.get("selected"):
                    selected_menus.append(menu)
                else:
                    not_selected_menus.append(menu)

        if not selected_menus:
            print("⚠️  選択メニューがないため、プロファイルを生成できません")
            return

        # --- ローカル統計プロファイル ---
        local_profile = self._compute_local_stats(selected_menus, not_selected_menus)

        # --- Claude による嗜好分析 ---
        claude_profile = self._analyze_with_claude(
            selected_menus, not_selected_menus, claude_cache
        )

        # プロファイルを統合
        self.profile = {
            "total_selections": len(selected_menus),
            "total_days": len(training_data),
            "avg_selections_per_day": round(
                len(selected_menus) / max(len(training_data), 1), 1
            ),
            "local_stats": local_profile,
            "claude_analysis": claude_profile,
        }

        self._save_profile()
        print(f"✅ 嗜好プロファイル保存: {PROFILE_FILE}")
        return self.profile

    def _compute_local_stats(self, selected: list, not_selected: list) -> dict:
        """ローカル統計によるプロファイル生成"""
        # 栄養素の平均
        def avg_nutrition(menus):
            keys = ["エネルギー", "たんぱく質", "脂質", "炭水化物", "食塩相当量", "野菜重量"]
            result = {}
            for key in keys:
                vals = [
                    m.get("nutrition", {}).get(key, 0) or 0
                    for m in menus
                    if isinstance(m.get("nutrition", {}).get(key, 0), (int, float))
                ]
                result[key] = round(sum(vals) / max(len(vals), 1), 1) if vals else 0
            return result

        # 頻出メニュー名ワード
        from menu_recommender import MenuFeatureExtractor
        extractor = MenuFeatureExtractor()
        word_counter = Counter()
        for menu in selected:
            word_counter.update(extractor.extract_words(menu["name"]))

        return {
            "selected_nutrition_avg": avg_nutrition(selected),
            "not_selected_nutrition_avg": avg_nutrition(not_selected),
            "top_words": word_counter.most_common(20),
        }

    def _analyze_with_claude(self, selected: list, not_selected: list,
                              claude_cache: dict = None) -> dict:
        """Claude でユーザー嗜好を分析"""
        # 選択メニューのサマリーを構築
        selected_summary = []
        for menu in selected:
            name = menu["name"]
            nutrition = menu.get("nutrition", {})
            energy = nutrition.get("エネルギー", "?")
            protein = nutrition.get("たんぱく質", "?")
            fat = nutrition.get("脂質", "?")

            detail = f"{name} (E:{energy}, P:{protein}, F:{fat})"

            # Claude解析キャッシュがあれば追加
            if claude_cache and name in claude_cache:
                cached = claude_cache[name]
                detail += (
                    f" [{cached.get('cooking_method','?')}/"
                    f"{cached.get('cuisine_style','?')}/"
                    f"{cached.get('main_protein','?')}]"
                )
            selected_summary.append(detail)

        # 非選択メニューのサンプル（上位20件）
        not_selected_sample = []
        for menu in not_selected[:20]:
            name = menu["name"]
            nutrition = menu.get("nutrition", {})
            energy = nutrition.get("エネルギー", "?")
            not_selected_sample.append(f"{name} (E:{energy})")

        prompt = f"""以下はある社員が社食で過去に選んだメニューと、選ばなかったメニューのサンプルです。

## 選んだメニュー ({len(selected)}品):
{chr(10).join(f"- {s}" for s in selected_summary)}

## 選ばなかったメニュー（一部, {len(not_selected)}品中のサンプル）:
{chr(10).join(f"- {s}" for s in not_selected_sample)}

この社員の食事嗜好を分析し、以下のJSON形式で返してください:
{{
  "taste_preference": "この人の味の好みの傾向（50字以内）",
  "nutrition_tendency": "栄養面での傾向（50字以内）",
  "preferred_cooking_methods": ["好む調理法を重要順に最大3つ"],
  "preferred_proteins": ["好む食材を重要順に最大3つ"],
  "preferred_cuisines": ["好むジャンルを重要順に最大3つ"],
  "avoidance_patterns": ["避ける傾向のある要素を最大3つ"],
  "set_combination_tendency": "メニューの組み合わせ方の傾向（50字以内）",
  "health_consciousness": 0.0~1.0の数値（健康意識の高さ）,
  "adventurousness": 0.0~1.0の数値（新しいメニューへの挑戦度）
}}

JSONのみを返してください。"""

        try:
            response = self.client.messages.create(
                model=MODEL_NAME,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()

            # JSON抽出
            import re
            if text.startswith("{"):
                json_text = text
            else:
                match = re.search(r"\{.*\}", text, re.DOTALL)
                json_text = match.group(0) if match else "{}"

            result = json.loads(json_text)
            print("  ✅ Claude嗜好分析完了")
            return result

        except Exception as e:
            print(f"  ⚠️  Claude嗜好分析エラー: {e}")
            return {
                "error": str(e),
                "taste_preference": "分析失敗",
                "health_consciousness": 0.5,
                "adventurousness": 0.5,
            }

    def get_preference_score(self, menu_name: str, claude_cache: dict = None) -> float:
        """
        メニュー名と嗜好プロファイルの一致度スコアを返す (0-1)。
        Claude解析キャッシュがあればセマンティック一致も考慮。
        """
        if not self.profile or "claude_analysis" not in self.profile:
            return 0.5  # プロファイルなし → 中立値

        analysis = self.profile["claude_analysis"]
        score = 0.5
        matches = 0

        # Claude キャッシュ由来の一致チェック
        if claude_cache and menu_name in claude_cache:
            cached = claude_cache[menu_name]

            # 調理法一致
            preferred_methods = analysis.get("preferred_cooking_methods", [])
            if cached.get("cooking_method") in preferred_methods:
                rank = preferred_methods.index(cached["cooking_method"])
                score += (0.15 - rank * 0.03)
                matches += 1

            # 食材一致
            preferred_proteins = analysis.get("preferred_proteins", [])
            if cached.get("main_protein") in preferred_proteins:
                rank = preferred_proteins.index(cached["main_protein"])
                score += (0.15 - rank * 0.03)
                matches += 1

            # ジャンル一致
            preferred_cuisines = analysis.get("preferred_cuisines", [])
            if cached.get("cuisine_style") in preferred_cuisines:
                rank = preferred_cuisines.index(cached["cuisine_style"])
                score += (0.1 - rank * 0.02)
                matches += 1

            # 回避パターン
            avoidance = analysis.get("avoidance_patterns", [])
            for pattern in avoidance:
                if pattern in menu_name:
                    score -= 0.1
                    break

            # 健康意識との一致
            health_consciousness = analysis.get("health_consciousness", 0.5)
            menu_health = cached.get("health_impression", 0.5)
            # 健康意識が高い人に健康的メニュー → ボーナス
            health_match = 1.0 - abs(health_consciousness - menu_health)
            score += health_match * 0.05

        return max(0.0, min(1.0, score))


def main():
    """スタンドアロン実行: 学習データから嗜好プロファイルを生成"""
    print("=" * 60)
    print("🧠 ユーザー嗜好プロファイル生成")
    print("=" * 60)

    # Claude解析キャッシュを読み込み（あれば）
    from claude_analyzer import ClaudeMenuAnalyzer, CACHE_FILE

    claude_cache = {}
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            claude_cache = json.load(f)
        print(f"📦 Claude解析キャッシュ: {len(claude_cache)} メニュー")

    # 学習データ読み込み
    from menu_recommender import MenuRecommender
    recommender = MenuRecommender()
    try:
        training_data = recommender.load_data()
    except Exception as e:
        print(f"❌ 学習データの読み込みに失敗: {e}")
        return

    # プロファイル生成
    try:
        analyzer = PreferenceAnalyzer()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    profile = analyzer.generate_profile(training_data, claude_cache)

    if profile:
        print("\n📋 生成されたプロファイル:")
        claude = profile.get("claude_analysis", {})
        print(f"  味の好み: {claude.get('taste_preference', 'N/A')}")
        print(f"  栄養傾向: {claude.get('nutrition_tendency', 'N/A')}")
        print(f"  好む調理法: {claude.get('preferred_cooking_methods', [])}")
        print(f"  好む食材: {claude.get('preferred_proteins', [])}")
        print(f"  健康意識: {claude.get('health_consciousness', 'N/A')}")
        print(f"  冒険度: {claude.get('adventurousness', 'N/A')}")


if __name__ == "__main__":
    main()
