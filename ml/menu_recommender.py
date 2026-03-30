#!/usr/bin/env python3
"""
Kyowa Menu Recommender - 機械学習ベースのメニュー推薦システム

学習対象：
1. 栄養素ベース: PFC絶対値、PFCバランス、エネルギー、野菜重量、飽和脂肪酸
2. テキストベース: メニュー名に含まれる単語
3. メニュー間関係: 共起パターン、カテゴリ間の関係
4. 負例学習: 選ばれなかったメニューの特徴
"""

import json
import re
import numpy as np
import pandas as pd
from collections import Counter, defaultdict
from sklearn.model_selection import cross_val_score, LeaveOneGroupOut
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score
import warnings
warnings.filterwarnings('ignore')

# Supabaseデータローダーをインポート
try:
    from supabase_data_loader import SupabaseDataLoader
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("⚠️  Supabaseデータローダーが利用できません（ローカルファイルモードで動作）")


class MenuFeatureExtractor:
    """メニューから特徴量を抽出するクラス"""
    
    def __init__(self):
        self.word_counter = Counter()
        self.word_to_idx = {}
        self.scaler = StandardScaler()
        
    def extract_words(self, menu_name):
        """メニュー名から単語を抽出"""
        # カタカナ、ひらがな、漢字、英数字で分割
        words = re.findall(r'[ァ-ンー]+|[ぁ-んー]+|[一-龯]+|[a-zA-Z]+|\d+', menu_name)
        # 短すぎる単語を除外（1文字のカタカナ・ひらがなは除外）
        words = [w for w in words if len(w) > 1 or re.match(r'[一-龯]', w)]
        return words
    
    def build_vocabulary(self, all_menus):
        """全メニューから語彙を構築"""
        for menu in all_menus:
            words = self.extract_words(menu['name'])
            self.word_counter.update(words)
        
        # 出現回数2回以上の単語のみ採用
        frequent_words = [w for w, c in self.word_counter.most_common() if c >= 2]
        self.word_to_idx = {w: i for i, w in enumerate(frequent_words)}
        print(f"📚 語彙サイズ: {len(self.word_to_idx)} 単語")
        return frequent_words
    
    def extract_nutrition_features(self, nutrition):
        """栄養素から特徴量を抽出"""
        # 基本栄養素
        energy = nutrition.get('エネルギー', 0) or 0
        protein = nutrition.get('たんぱく質', 0) or 0  # P
        fat = nutrition.get('脂質', 0) or 0  # F
        carb = nutrition.get('炭水化物', 0) or 0  # C
        saturated_fat = nutrition.get('飽和脂肪酸', 0) or 0
        salt = nutrition.get('食塩相当量', 0) or 0
        vegetable = nutrition.get('野菜重量', 0) or 0
        
        # PFCバランス（カロリーベースの比率）
        pfc_total = protein * 4 + fat * 9 + carb * 4
        if pfc_total > 0:
            p_ratio = (protein * 4) / pfc_total
            f_ratio = (fat * 9) / pfc_total
            c_ratio = (carb * 4) / pfc_total
        else:
            p_ratio = f_ratio = c_ratio = 0
        
        # エネルギー密度（野菜重量あたり）
        energy_density = energy / (vegetable + 1)  # 0除算防止
        
        # たんぱく質効率（エネルギーあたり）
        protein_efficiency = protein / (energy + 1) * 100
        
        return {
            'energy': energy,
            'protein': protein,
            'fat': fat,
            'carb': carb,
            'saturated_fat': saturated_fat,
            'salt': salt,
            'vegetable': vegetable,
            'p_ratio': p_ratio,
            'f_ratio': f_ratio,
            'c_ratio': c_ratio,
            'energy_density': energy_density,
            'protein_efficiency': protein_efficiency,
            'pfc_total': pfc_total,
        }
    
    def extract_text_features(self, menu_name):
        """メニュー名からテキスト特徴量を抽出"""
        words = self.extract_words(menu_name)
        features = np.zeros(len(self.word_to_idx))
        for word in words:
            if word in self.word_to_idx:
                features[self.word_to_idx[word]] = 1
        return features
    
    def extract_category_features(self, menu_name):
        """メニュー名からカテゴリ特徴量を抽出"""
        categories = {
            'is_rice': bool(re.search(r'ライス|ご飯|ごはん|丼|炒飯|チャーハン', menu_name)),
            'is_noodle': bool(re.search(r'麺|ラーメン|そば|蕎麦|うどん|パスタ', menu_name)),
            'is_meat': bool(re.search(r'肉|チキン|ポーク|ビーフ|鶏|豚|牛|ハンバーグ|カツ', menu_name)),
            'is_fish': bool(re.search(r'魚|サーモン|鯖|鮭|エビ|海老|イカ|白身', menu_name)),
            'is_vegetable': bool(re.search(r'サラダ|野菜|キャベツ|レタス|ブロッコリー', menu_name)),
            'is_soup': bool(re.search(r'汁|スープ|味噌|みそ', menu_name)),
            'is_fried': bool(re.search(r'揚げ|フライ|カツ|天ぷら|唐揚げ', menu_name)),
            'is_healthy': bool(re.search(r'健康|ヘルシー|たんぱく質|食物繊維|野菜たっぷり', menu_name)),
            'is_mini': bool(re.search(r'ミニ|小|ハーフ', menu_name)),
            'is_curry': bool(re.search(r'カレー', menu_name)),
            'is_egg': bool(re.search(r'卵|玉子|たまご|オムレツ', menu_name)),
            'is_tofu': bool(re.search(r'豆腐|冷奴|納豆|大豆', menu_name)),
            'is_dessert': bool(re.search(r'プリン|ケーキ|ヨーグルト|デザート|フルーツ|バナナ', menu_name)),
        }
        return categories


class CooccurrenceAnalyzer:
    """メニュー間の共起関係を分析するクラス"""
    
    def __init__(self):
        self.cooccurrence_matrix = {}
        self.menu_selection_count = Counter()
        self.category_cooccurrence = {}
        
    def analyze(self, training_data, feature_extractor):
        """共起関係を分析"""
        for day_data in training_data:
            selected_menus = [m for m in day_data['allMenus'] if m['selected']]
            
            # メニュー選択回数をカウント
            for menu in selected_menus:
                self.menu_selection_count[menu['name']] += 1
            
            # メニュー間の共起
            for i, menu1 in enumerate(selected_menus):
                for menu2 in selected_menus[i+1:]:
                    # 共起行列を更新
                    if menu1['name'] not in self.cooccurrence_matrix:
                        self.cooccurrence_matrix[menu1['name']] = {}
                    if menu2['name'] not in self.cooccurrence_matrix:
                        self.cooccurrence_matrix[menu2['name']] = {}
                    
                    self.cooccurrence_matrix[menu1['name']][menu2['name']] = \
                        self.cooccurrence_matrix[menu1['name']].get(menu2['name'], 0) + 1
                    self.cooccurrence_matrix[menu2['name']][menu1['name']] = \
                        self.cooccurrence_matrix[menu2['name']].get(menu1['name'], 0) + 1
                    
                    # カテゴリ間の共起
                    cat1 = feature_extractor.extract_category_features(menu1['name'])
                    cat2 = feature_extractor.extract_category_features(menu2['name'])
                    for c1, v1 in cat1.items():
                        if v1:
                            if c1 not in self.category_cooccurrence:
                                self.category_cooccurrence[c1] = {}
                            for c2, v2 in cat2.items():
                                if v2:
                                    self.category_cooccurrence[c1][c2] = \
                                        self.category_cooccurrence[c1].get(c2, 0) + 1
        
        print(f"📊 よく選ばれるメニュー TOP 10:")
        for name, count in self.menu_selection_count.most_common(10):
            print(f"   {count}回: {name}")
        
        print(f"\n📊 よく一緒に選ばれるカテゴリ組み合わせ:")
        category_pairs = []
        for c1, c2_dict in self.category_cooccurrence.items():
            for c2, count in c2_dict.items():
                if c1 < c2:  # 重複排除
                    category_pairs.append((c1, c2, count))
        category_pairs.sort(key=lambda x: -x[2])
        for c1, c2, count in category_pairs[:5]:
            print(f"   {count}回: {c1} + {c2}")
    
    def get_cooccurrence_score(self, menu_name, selected_menus):
        """選択済みメニューとの共起スコアを計算"""
        score = 0
        if menu_name in self.cooccurrence_matrix:
            for selected in selected_menus:
                score += self.cooccurrence_matrix[menu_name].get(selected, 0)
        return score


class MenuRecommender:
    """メニュー推薦モデル"""
    
    def __init__(self):
        self.feature_extractor = MenuFeatureExtractor()
        self.cooccurrence_analyzer = CooccurrenceAnalyzer()
        self.models = {}
        self.best_model = None
        self.best_model_name = None
        
    def load_data(self, data_path='data/training_data.json', use_supabase=True):
        """
        データを読み込み
        
        Args:
            data_path: ローカルファイルパス（use_supabase=Falseの場合に使用）
            use_supabase: Supabaseから直接データを取得する場合はTrue
        
        Returns:
            学習データ
        """
        if use_supabase and SUPABASE_AVAILABLE:
            print("📡 Supabaseから学習データを取得中...")
            try:
                loader = SupabaseDataLoader()
                self.training_data = loader.get_training_data()
                
                if not self.training_data:
                    print("⚠️  Supabaseにデータがありません。ローカルファイルを試します...")
                    raise ValueError("No data in Supabase")
                
                print(f"✅ Supabaseからデータ読み込み完了: {len(self.training_data)}日分")
                return self.training_data
            except Exception as e:
                print(f"⚠️  Supabase読み込みエラー: {e}")
                print("   ローカルファイルにフォールバック...")
        
        # ローカルファイルから読み込み
        print(f"📁 ローカルファイルからデータを読み込み中: {data_path}")
        try:
            with open(data_path, 'r', encoding='utf-8') as f:
                self.training_data = json.load(f)
            print(f"✅ データ読み込み完了: {len(self.training_data)}日分")
            return self.training_data
        except FileNotFoundError:
            print(f"❌ ファイルが見つかりません: {data_path}")
            print("   Supabaseにデータを登録するか、ローカルファイルを配置してください")
            raise
    
    def prepare_features(self):
        """特徴量を準備"""
        print("\n🔧 特徴量準備中...")
        
        # 全メニューを収集
        all_menus = []
        for day_data in self.training_data:
            all_menus.extend(day_data['allMenus'])
        
        # 語彙構築
        self.feature_extractor.build_vocabulary(all_menus)
        
        # 共起分析
        print("\n📈 共起分析中...")
        self.cooccurrence_analyzer.analyze(self.training_data, self.feature_extractor)
        
        # 特徴量行列とラベルを構築
        X_list = []
        y_list = []
        groups = []  # 日付グループ（Leave-One-Day-Out用）
        menu_names = []
        
        for day_idx, day_data in enumerate(self.training_data):
            selected_names = [m['name'] for m in day_data['allMenus'] if m['selected']]
            
            for menu in day_data['allMenus']:
                # 栄養素特徴量
                nutrition_features = self.feature_extractor.extract_nutrition_features(
                    menu.get('nutrition', {})
                )
                
                # テキスト特徴量
                text_features = self.feature_extractor.extract_text_features(menu['name'])
                
                # カテゴリ特徴量
                category_features = self.feature_extractor.extract_category_features(menu['name'])
                
                # 共起スコア（現在の日の他の選択メニューとの）
                other_selected = [n for n in selected_names if n != menu['name']]
                cooccurrence_score = self.cooccurrence_analyzer.get_cooccurrence_score(
                    menu['name'], other_selected
                )
                
                # 過去の選択頻度
                selection_frequency = self.cooccurrence_analyzer.menu_selection_count.get(
                    menu['name'], 0
                ) / max(len(self.training_data), 1)
                
                # 特徴量を結合
                features = list(nutrition_features.values())
                features.extend(text_features)
                features.extend([int(v) for v in category_features.values()])
                features.append(cooccurrence_score)
                features.append(selection_frequency)
                
                X_list.append(features)
                y_list.append(1 if menu['selected'] else 0)
                groups.append(day_idx)
                menu_names.append(menu['name'])
        
        self.X = np.array(X_list)
        self.y = np.array(y_list)
        self.groups = np.array(groups)
        self.menu_names = menu_names
        
        # 特徴量名を保存
        nutrition_feature_names = list(self.feature_extractor.extract_nutrition_features({}).keys())
        text_feature_names = [f'word_{w}' for w in self.feature_extractor.word_to_idx.keys()]
        category_feature_names = list(self.feature_extractor.extract_category_features('').keys())
        
        self.feature_names = (
            nutrition_feature_names + 
            text_feature_names + 
            category_feature_names + 
            ['cooccurrence_score', 'selection_frequency']
        )
        
        print(f"\n✅ 特徴量準備完了:")
        print(f"   サンプル数: {len(self.X)}")
        print(f"   特徴量数: {len(self.feature_names)}")
        print(f"   正例（選択）: {sum(self.y)} ({sum(self.y)/len(self.y)*100:.1f}%)")
        print(f"   負例（非選択）: {len(self.y)-sum(self.y)} ({(len(self.y)-sum(self.y))/len(self.y)*100:.1f}%)")
        
        return self.X, self.y
    
    def train_models(self):
        """複数のモデルを学習し比較"""
        print("\n🤖 モデル学習中...")
        
        # データの正規化
        X_scaled = self.scaler.fit_transform(self.X) if hasattr(self, 'scaler') else StandardScaler().fit_transform(self.X)
        self.scaler = StandardScaler().fit(self.X)
        X_scaled = self.scaler.transform(self.X)
        
        # モデル定義
        models = {
            'LogisticRegression': LogisticRegression(
                class_weight='balanced', 
                max_iter=1000,
                random_state=42
            ),
            'RandomForest': RandomForestClassifier(
                n_estimators=100, 
                class_weight='balanced',
                max_depth=10,
                random_state=42
            ),
            'GradientBoosting': GradientBoostingClassifier(
                n_estimators=100,
                max_depth=5,
                random_state=42
            ),
        }
        
        # Leave-One-Day-Out Cross Validation
        logo = LeaveOneGroupOut()
        results = {}
        
        print("\n📊 Leave-One-Day-Out クロスバリデーション結果:")
        print("-" * 60)
        
        best_score = 0
        for name, model in models.items():
            try:
                # AUC-ROCスコアで評価
                scores = cross_val_score(
                    model, X_scaled, self.y, 
                    cv=logo, groups=self.groups,
                    scoring='roc_auc'
                )
                mean_score = scores.mean()
                std_score = scores.std()
                results[name] = {'mean': mean_score, 'std': std_score, 'scores': scores}
                
                print(f"{name:20s}: AUC-ROC = {mean_score:.4f} (+/- {std_score:.4f})")
                
                if mean_score > best_score:
                    best_score = mean_score
                    self.best_model_name = name
                    
            except Exception as e:
                print(f"{name:20s}: エラー - {e}")
        
        print("-" * 60)
        print(f"✅ 最良モデル: {self.best_model_name} (AUC-ROC = {best_score:.4f})")
        
        # 最良モデルを全データで再学習
        self.best_model = models[self.best_model_name]
        self.best_model.fit(X_scaled, self.y)
        self.models = {name: model.fit(X_scaled, self.y) for name, model in models.items()}
        
        return results
    
    def analyze_feature_importance(self):
        """特徴量の重要度を分析"""
        print("\n📊 特徴量重要度分析:")
        print("-" * 60)
        
        if hasattr(self.best_model, 'feature_importances_'):
            importances = self.best_model.feature_importances_
        elif hasattr(self.best_model, 'coef_'):
            importances = np.abs(self.best_model.coef_[0])
        else:
            print("特徴量重要度を取得できません")
            return
        
        # 重要度でソート
        indices = np.argsort(importances)[::-1]
        
        print("TOP 20 重要な特徴量:")
        for i in range(min(20, len(indices))):
            idx = indices[i]
            if idx < len(self.feature_names):
                print(f"  {i+1:2d}. {self.feature_names[idx]:30s}: {importances[idx]:.4f}")
        
        # カテゴリ別の重要度集計
        print("\n📊 カテゴリ別重要度:")
        nutrition_end = 13  # 栄養素特徴量の数
        text_end = nutrition_end + len(self.feature_extractor.word_to_idx)
        
        nutrition_importance = np.sum(importances[:nutrition_end])
        text_importance = np.sum(importances[nutrition_end:text_end])
        category_importance = np.sum(importances[text_end:-2])
        other_importance = np.sum(importances[-2:])
        total = nutrition_importance + text_importance + category_importance + other_importance
        
        print(f"  栄養素特徴量: {nutrition_importance/total*100:.1f}%")
        print(f"  テキスト特徴量: {text_importance/total*100:.1f}%")
        print(f"  カテゴリ特徴量: {category_importance/total*100:.1f}%")
        print(f"  その他（共起・頻度）: {other_importance/total*100:.1f}%")
    
    def predict(self, menus, already_selected=None):
        """メニューリストに対して推薦スコアを予測"""
        if already_selected is None:
            already_selected = []
        
        X_pred = []
        for menu in menus:
            # 栄養素特徴量
            nutrition_features = self.feature_extractor.extract_nutrition_features(
                menu.get('nutrition', {})
            )
            
            # テキスト特徴量
            text_features = self.feature_extractor.extract_text_features(menu['name'])
            
            # カテゴリ特徴量
            category_features = self.feature_extractor.extract_category_features(menu['name'])
            
            # 共起スコア
            cooccurrence_score = self.cooccurrence_analyzer.get_cooccurrence_score(
                menu['name'], already_selected
            )
            
            # 選択頻度
            selection_frequency = self.cooccurrence_analyzer.menu_selection_count.get(
                menu['name'], 0
            ) / max(len(self.training_data), 1)
            
            # 特徴量を結合
            features = list(nutrition_features.values())
            features.extend(text_features)
            features.extend([int(v) for v in category_features.values()])
            features.append(cooccurrence_score)
            features.append(selection_frequency)
            
            X_pred.append(features)
        
        X_pred = np.array(X_pred)
        X_pred_scaled = self.scaler.transform(X_pred)
        
        # 確率を予測
        probabilities = self.best_model.predict_proba(X_pred_scaled)[:, 1]
        
        # 結果を整理
        results = []
        for i, menu in enumerate(menus):
            results.append({
                'name': menu['name'],
                'score': float(probabilities[i]),
                'nutrition': menu.get('nutrition', {})
            })
        
        # スコアでソート
        results.sort(key=lambda x: -x['score'])
        return results
    
    def save_model(self, path='model'):
        """モデルを保存"""
        import pickle
        import os
        
        os.makedirs(path, exist_ok=True)
        
        model_data = {
            'best_model': self.best_model,
            'best_model_name': self.best_model_name,
            'scaler': self.scaler,
            'feature_extractor': self.feature_extractor,
            'cooccurrence_analyzer': self.cooccurrence_analyzer,
            'feature_names': self.feature_names
        }
        
        with open(f'{path}/menu_recommender.pkl', 'wb') as f:
            pickle.dump(model_data, f)
        
        print(f"\n✅ モデルを保存しました: {path}/menu_recommender.pkl")
    
    @classmethod
    def load_model(cls, path='model/menu_recommender.pkl'):
        """モデルを読み込み"""
        import pickle
        
        with open(path, 'rb') as f:
            model_data = pickle.load(f)
        
        recommender = cls()
        recommender.best_model = model_data['best_model']
        recommender.best_model_name = model_data['best_model_name']
        recommender.scaler = model_data['scaler']
        recommender.feature_extractor = model_data['feature_extractor']
        recommender.cooccurrence_analyzer = model_data['cooccurrence_analyzer']
        recommender.feature_names = model_data['feature_names']
        recommender.training_data = []  # 予測時は不要
        
        print(f"✅ モデルを読み込みました: {path}")
        return recommender


def main():
    """メイン処理"""
    print("=" * 60)
    print("🍽️  Kyowa Menu Recommender - 学習スクリプト")
    print("=" * 60)
    
    # 推薦モデルを初期化
    recommender = MenuRecommender()
    
    # データ読み込み
    recommender.load_data()
    
    # 特徴量準備
    recommender.prepare_features()
    
    # モデル学習
    recommender.train_models()
    
    # 特徴量重要度分析
    recommender.analyze_feature_importance()
    
    # モデル保存
    recommender.save_model()
    
    # テスト予測
    print("\n" + "=" * 60)
    print("🧪 テスト予測（最新日のメニュー）")
    print("=" * 60)
    
    if recommender.training_data:
        test_day = recommender.training_data[-1]
        test_menus = test_day['allMenus']
        
        # 実際に選ばれたメニュー
        actual_selected = [m['name'] for m in test_menus if m['selected']]
        print(f"\n実際に選ばれたメニュー: {actual_selected}")
        
        # 予測
        predictions = recommender.predict(test_menus)
        
        print(f"\n予測スコア TOP 10:")
        for i, pred in enumerate(predictions[:10]):
            selected_mark = "✅" if pred['name'] in actual_selected else "  "
            print(f"  {i+1:2d}. {selected_mark} {pred['name'][:25]:25s} (スコア: {pred['score']:.3f})")
    
    print("\n✅ 学習完了！")


if __name__ == '__main__':
    main()
