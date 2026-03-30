#!/usr/bin/env python3
"""
Supabaseデータローダー - 学習データを直接Supabaseから取得

機能:
- Supabaseの meal_history テーブルから食事履歴を取得
- 機械学習モデルの学習に必要な形式に変換
- ローカルファイルなしで直接DBから読み取り

使用例:
    from supabase_data_loader import SupabaseDataLoader
    
    loader = SupabaseDataLoader()
    training_data = loader.get_training_data()
"""

import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
try:
    from supabase import create_client, Client
except ImportError:
    print("❌ supabase-py パッケージがインストールされていません")
    print("   インストール: pip install supabase")
    raise


class SupabaseDataLoader:
    """Supabaseから学習データを取得するクラス"""
    
    # Supabase接続情報（GitHub Pages と同じ設定）
    SUPABASE_URL = "https://zzleqjendqkoizbdvblw.supabase.co"
    SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bGVxamVuZHFrb2l6YmR2Ymx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjA0ODYsImV4cCI6MjA5MDAzNjQ4Nn0.OwuE6oJYLuA9nzEm-lAKq6BNc-J9RWv1ylZ9cH34vY8"
    
    def __init__(self):
        """Supabaseクライアントを初期化"""
        try:
            self.client: Client = create_client(self.SUPABASE_URL, self.SUPABASE_KEY)
            print("✅ Supabaseクライアント初期化完了")
        except Exception as e:
            print(f"❌ Supabase接続エラー: {e}")
            raise
    
    def get_meal_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Supabaseから食事履歴を取得
        
        Args:
            limit: 取得する最大件数（None の場合は全件取得）
        
        Returns:
            食事履歴のリスト
        """
        try:
            query = self.client.table('meal_history').select('*').order('date', desc=True)
            
            if limit:
                query = query.limit(limit)
            
            response = query.execute()
            
            if response.data:
                print(f"✅ {len(response.data)}件の食事履歴を取得しました")
                return response.data
            else:
                print("⚠️  食事履歴が見つかりません")
                return []
                
        except Exception as e:
            print(f"❌ 食事履歴取得エラー: {e}")
            return []
    
    def get_training_data(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        機械学習の学習データ形式で食事履歴を取得
        
        menurecommender.pyで期待される形式:
        [
            {
                "date": "2026-01-13",
                "dateLabel": "1/13(月)",
                "allMenus": [
                    {
                        "name": "メニュー名",
                        "selected": True/False,
                        "nutrition": {
                            "エネルギー": 500,
                            "たんぱく質": 20,
                            ...
                        }
                    }
                ]
            }
        ]
        
        Args:
            limit: 取得する最大件数（None の場合は全件取得）
        
        Returns:
            学習データのリスト
        """
        meal_histories = self.get_meal_history(limit)
        
        if not meal_histories:
            print("⚠️  学習データがありません")
            return []
        
        training_data = []
        
        for history in meal_histories:
            try:
                date = history.get('date')
                day_of_week = history.get('day_of_week', '')
                selected_menus = history.get('selected_menus', [])
                
                # 日付ラベルを生成 (例: "1/13(月)")
                if isinstance(date, str):
                    date_obj = datetime.fromisoformat(date.replace('Z', '+00:00'))
                    month = date_obj.month
                    day = date_obj.day
                    date_label = f"{month}/{day}({day_of_week})"
                else:
                    date_label = f"{date}({day_of_week})"
                
                # その日のメニューデータを取得（menusディレクトリから）
                all_menus = self._get_menus_for_date(date)
                
                if not all_menus:
                    print(f"⚠️  {date} のメニューデータが見つかりません（スキップ）")
                    continue
                
                # 選択されたメニュー名のセット
                selected_menu_names = set(menu.get('name') for menu in selected_menus)
                
                # allMenus形式に変換
                formatted_menus = []
                for menu in all_menus:
                    menu_name = menu.get('name', '')
                    formatted_menus.append({
                        'name': menu_name,
                        'selected': menu_name in selected_menu_names,
                        'nutrition': menu.get('nutrition', {})
                    })
                
                training_data.append({
                    'date': date,
                    'dateLabel': date_label,
                    'allMenus': formatted_menus
                })
                
            except Exception as e:
                print(f"⚠️  データ変換エラー（{history.get('date')}）: {e}")
                continue
        
        print(f"✅ {len(training_data)}日分の学習データを準備しました")
        return training_data
    
    def _get_menus_for_date(self, date: str) -> List[Dict[str, Any]]:
        """
        指定日付のメニューデータを取得
        
        Args:
            date: 日付（YYYY-MM-DD形式）
        
        Returns:
            メニューリスト
        """
        # menusディレクトリからメニューデータを読み込む
        try:
            # dateがISO形式の場合、YYYY-MM-DD部分のみ抽出
            if 'T' in str(date):
                date = str(date).split('T')[0]
            
            # プロジェクトルートからの相対パス
            script_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(script_dir)
            menu_file = os.path.join(project_root, 'menus', f'menus_{date}.json')
            
            if not os.path.exists(menu_file):
                return []
            
            with open(menu_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('menus', [])
                
        except Exception as e:
            print(f"⚠️  メニューファイル読み込みエラー（{date}）: {e}")
            return []
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        学習データの統計情報を取得
        
        Returns:
            統計情報の辞書
        """
        training_data = self.get_training_data()
        
        if not training_data:
            return {
                'total_days': 0,
                'total_menus': 0,
                'total_selections': 0
            }
        
        total_days = len(training_data)
        total_menus = sum(len(day['allMenus']) for day in training_data)
        total_selections = sum(
            sum(1 for menu in day['allMenus'] if menu['selected'])
            for day in training_data
        )
        
        return {
            'total_days': total_days,
            'total_menus': total_menus,
            'total_selections': total_selections,
            'avg_selections_per_day': total_selections / total_days if total_days > 0 else 0,
            'date_range': {
                'oldest': training_data[-1]['date'] if training_data else None,
                'newest': training_data[0]['date'] if training_data else None
            }
        }


def main():
    """テスト実行"""
    print("=" * 60)
    print("Supabaseデータローダー テスト")
    print("=" * 60)
    
    loader = SupabaseDataLoader()
    
    # 統計情報を表示
    print("\n📊 学習データ統計:")
    stats = loader.get_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # サンプルデータを表示
    print("\n📋 最新の学習データ（3件）:")
    training_data = loader.get_training_data(limit=3)
    
    for i, day_data in enumerate(training_data, 1):
        selected_count = sum(1 for menu in day_data['allMenus'] if menu['selected'])
        print(f"\n  {i}. {day_data['date']} ({day_data['dateLabel']})")
        print(f"     全メニュー: {len(day_data['allMenus'])}件")
        print(f"     選択: {selected_count}件")
        
        if day_data['allMenus']:
            selected_menus = [m['name'] for m in day_data['allMenus'] if m['selected']]
            if selected_menus:
                print(f"     選択メニュー: {', '.join(selected_menus[:3])}" + 
                      ("..." if len(selected_menus) > 3 else ""))


if __name__ == '__main__':
    main()
