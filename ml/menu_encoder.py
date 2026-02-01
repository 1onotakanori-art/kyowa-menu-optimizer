#!/usr/bin/env python3
"""
メニューエンコーダー
栄養特性、テキスト埋め込み、カテゴリ特性を統合
"""

import numpy as np
from pathlib import Path
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler

class MenuEncoder:
    """メニュー情報を固定次元ベクトルに変換"""
    
    def __init__(self, menu_dir=None, vocab_size=50):
        self.menu_dir = Path(menu_dir or '/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
        self.vocab_size = vocab_size
        self.scaler = StandardScaler()
        self.tfidf = TfidfVectorizer(max_features=vocab_size, ngram_range=(1, 2))
        self.menu_cache = {}
        self.nutrition_keys = ['エネルギー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)', 'ビタミンC(mg)']
        self.categories = {
            'meat': ['肉', '鶏', '豚', '牛', '唐揚', 'ステーキ'],
            'fish': ['魚', 'さば', 'まぐろ', 'ぶり', 'サーモン', 'エビ'],
            'vegetable': ['野菜', 'サラダ', 'ブロッコリー', '大根', 'キャベツ', 'ほうれん草'],
            'soup': ['汁', 'スープ', 'みそ汁'],
            'rice': ['ご飯', 'ライス', 'チャーハン', 'ピラフ'],
            'noodle': ['麺', 'うどん', 'そば', 'ラーメン', 'パスタ'],
            'tofu': ['豆腐', '厚揚げ'],
            'egg': ['卵', '玉子'],
            'fruit': ['果実', 'フルーツ', 'みかん', 'イチゴ'],
            'dessert': ['デザート', 'アイス', 'ケーキ', 'プディング'],
            'mini': ['ミニ', '小'],
            'hot': ['温', 'あつあつ'],
            'cold': ['冷', 'ひやひや'],
        }
        
    def load_all_menus(self, date=None):
        """全メニュー（または特定日付）をロード"""
        if date:
            menu_file = self.menu_dir / f'menus_{date}.json'
            with open(menu_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('menus', [])
        
        all_menus = []
        for menu_file in sorted(self.menu_dir.glob('menus_*.json')):
            with open(menu_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                all_menus.extend(data.get('menus', []))
        
        return all_menus
    
    def extract_nutrition_features(self, menu_dict):
        """栄養特性を抽出 (5次元)"""
        features = []
        for key in self.nutrition_keys:
            value = menu_dict.get('nutrition', {}).get(key, 0)
            if isinstance(value, str):
                try:
                    value = float(value)
                except:
                    value = 0
            features.append(float(value))
        return np.array(features)
    
    def extract_category_features(self, menu_name):
        """カテゴリ特性を抽出 (13次元)"""
        features = []
        for cat_name, keywords in self.categories.items():
            score = any(kw in menu_name for kw in keywords)
            features.append(1.0 if score else 0.0)
        return np.array(features)
    
    def fit_text_encoder(self, menus):
        """テキストエンコーダーを学習"""
        menu_names = [m['name'] for m in menus]
        self.tfidf.fit(menu_names)
    
    def extract_text_features(self, menu_name):
        """テキスト特性を抽出 (50次元, TF-IDF)"""
        if not hasattr(self.tfidf, 'vocabulary_'):
            return np.zeros(self.vocab_size)
        vec = self.tfidf.transform([menu_name]).toarray()[0]
        return vec
    
    def encode_menu(self, menu_dict):
        """メニュー全体を符号化 (68次元: 5 nutrition + 50 text + 13 category)"""
        name = menu_dict.get('name', '')
        
        # 各特性を抽出
        nutrition = self.extract_nutrition_features(menu_dict)  # 5
        text = self.extract_text_features(name)                 # 50
        category = self.extract_category_features(name)         # 13
        
        # 統合
        return np.concatenate([nutrition, text, category])
    
    def encode_menu_by_name(self, menu_name):
        """メニュー名から符号化 (nutrition は0埋め)"""
        dummy_dict = {'name': menu_name, 'nutrition': {}}
        return self.encode_menu(dummy_dict)
    
    def encode_menus_batch(self, menu_dicts):
        """バッチ符号化"""
        return np.array([self.encode_menu(m) for m in menu_dicts])
    
    def prepare_encoder(self, train_menus):
        """エンコーダーを初期化・学習"""
        print(f"📚 メニューエンコーダーを準備中...")
        
        # テキストエンコーダーを学習
        self.fit_text_encoder(train_menus)
        
        # 栄養特性の正規化用スケーラーを学習
        nutrition_features = np.array([self.extract_nutrition_features(m) for m in train_menus])
        if nutrition_features.shape[0] > 1:
            self.scaler.fit(nutrition_features)
        
        print(f"✅ エンコーダー準備完了 ({len(train_menus)}メニュー学習)")
        print(f"   - テキスト語彙: {len(self.tfidf.vocabulary_)}単語")
        print(f"   - 出力次元: 68次元 (栄養5 + テキスト50 + カテゴリ13)\n")

if __name__ == '__main__':
    encoder = MenuEncoder()
    menus = encoder.load_all_menus()
    encoder.prepare_encoder(menus)
    
    # テスト
    test_menu = {
        'name': '蒸し鶏&ブロッコリー',
        'nutrition': {
            'エネルギー(kcal)': '280',
            'たんぱく質(g)': '28',
            '脂質(g)': '12',
            '炭水化物(g)': '15',
            'ビタミンC(mg)': '45'
        }
    }
    
    encoded = encoder.encode_menu(test_menu)
    print(f"テストエンコーディング: {encoded.shape} 次元")
    print(f"先頭10値: {encoded[:10]}")
