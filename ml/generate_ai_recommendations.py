#!/usr/bin/env python3
"""
Seq2Set Transformer を使用して、学習したメニューセットを生成
日付ごとに JSON ファイルで出力
"""

import json
import torch
import numpy as np
from pathlib import Path
import sys
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer

def get_menu_nutrition(menu_name, menus_dir):
    """全メニューファイルからメニューの栄養情報を取得"""
    for menu_file in menus_dir.glob('menus_*.json'):
        with open(menu_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for menu in data.get('menus', []):
                if menu.get('name') == menu_name:
                    return menu.get('nutrition', {})
    return {}

def analyze_user_preferences():
    """
    ユーザーの選択履歴を分析して好みのプロファイルを作成
    1食あたりの総エネルギーも分析
    """
    history_dir = Path.home() / 'Apps' / 'kyowa-menu-history' / 'data' / 'history'
    menus_dir = Path(__file__).parent.parent / 'menus'
    
    if not history_dir.exists():
        print(f"⚠️ 履歴ディレクトリが見つかりません: {history_dir}")
        return None
    
    # 履歴データを収集
    selected_menus_nutrition = []
    meal_total_energies = []  # 1食あたりの総エネルギー
    history_files = sorted(history_dir.glob('*.json'))
    
    for history_file in history_files:
        with open(history_file, 'r', encoding='utf-8') as f:
            history_data = json.load(f)
            selected_menus = history_data.get('selectedMenus', [])
            
            meal_energy = 0  # この日の総エネルギー
            
            for menu_item in selected_menus:
                # 履歴ファイル内に栄養情報が含まれている場合はそれを使用
                if isinstance(menu_item, dict) and 'nutrition' in menu_item:
                    nutrition = menu_item.get('nutrition', {})
                    menu_name = menu_item.get('name', '')
                else:
                    # 文字列の場合はメニューファイルから検索
                    menu_name = menu_item if isinstance(menu_item, str) else menu_item.get('name', '')
                    nutrition = get_menu_nutrition(menu_name, menus_dir)
                
                if nutrition:
                    energy = float(nutrition.get('エネルギー', 0))
                    meal_energy += energy
                    
                    selected_menus_nutrition.append({
                        'name': menu_name,
                        'energy': energy,
                        'protein': float(nutrition.get('たんぱく質', 0)),
                        'fat': float(nutrition.get('脂質', 0)),
                        'carbs': float(nutrition.get('炭水化物', 0)),
                        'vegetables': float(nutrition.get('野菜重量', 0)),
                        'fiber': float(nutrition.get('食物繊維', 0))
                    })
            
            if meal_energy > 0:
                meal_total_energies.append(meal_energy)
    
    if not selected_menus_nutrition:
        print("⚠️ 選択履歴が見つかりません")
        return None
    
    # 統計を計算
    energies = [m['energy'] for m in selected_menus_nutrition]
    proteins = [m['protein'] for m in selected_menus_nutrition]
    fats = [m['fat'] for m in selected_menus_nutrition]
    carbs = [m['carbs'] for m in selected_menus_nutrition]
    vegetables = [m['vegetables'] for m in selected_menus_nutrition]
    fibers = [m['fiber'] for m in selected_menus_nutrition]
    
    preferences = {
        'total_selections': len(selected_menus_nutrition),
        'meal_total_energy': {
            'mean': np.mean(meal_total_energies) if meal_total_energies else 0,
            'median': np.median(meal_total_energies) if meal_total_energies else 0,
            'std': np.std(meal_total_energies) if meal_total_energies else 0,
            'min': np.min(meal_total_energies) if meal_total_energies else 0,
            'max': np.max(meal_total_energies) if meal_total_energies else 0
        },
        'energy': {
            'mean': np.mean(energies),
            'median': np.median(energies),
            'std': np.std(energies),
            'min': np.min(energies),
            'max': np.max(energies)
        },
        'protein': {
            'mean': np.mean(proteins),
            'median': np.median(proteins),
            'std': np.std(proteins),
            'min': np.min(proteins),
            'max': np.max(proteins)
        },
        'fat': {
            'mean': np.mean(fats),
            'median': np.median(fats),
            'std': np.std(fats),
            'min': np.min(fats),
            'max': np.max(fats)
        },
        'carbs': {
            'mean': np.mean(carbs),
            'median': np.median(carbs),
            'std': np.std(carbs),
            'min': np.min(carbs),
            'max': np.max(carbs)
        },
        'vegetables': {
            'mean': np.mean(vegetables),
            'median': np.median(vegetables),
            'std': np.std(vegetables),
            'min': np.min(vegetables),
            'max': np.max(vegetables)
        },
        'fiber': {
            'mean': np.mean(fibers),
            'median': np.median(fibers),
            'std': np.std(fibers),
            'min': np.min(fibers),
            'max': np.max(fibers)
        }
    }
    
    print("\n" + "="*70)
    print("👤 ユーザー選択傾向の分析結果")
    print("="*70)
    print(f"📊 総選択回数: {preferences['total_selections']}回 ({len(meal_total_energies)}食分)")
    print(f"\n【1食あたりの総エネルギー】 ⭐ 重要指標")
    print(f"  平均: {preferences['meal_total_energy']['mean']:.1f} kcal (中央値: {preferences['meal_total_energy']['median']:.1f})")
    print(f"  範囲: {preferences['meal_total_energy']['min']:.0f} ~ {preferences['meal_total_energy']['max']:.0f} kcal")
    print(f"  標準偏差: {preferences['meal_total_energy']['std']:.1f} kcal")
    print(f"\n【メニュー単位のエネルギー】")
    print(f"  平均: {preferences['energy']['mean']:.1f} kcal (中央値: {preferences['energy']['median']:.1f})")
    print(f"  範囲: {preferences['energy']['min']:.0f} ~ {preferences['energy']['max']:.0f} kcal")
    print(f"\n【タンパク質】")
    print(f"  平均: {preferences['protein']['mean']:.1f} g (中央値: {preferences['protein']['median']:.1f})")
    print(f"  範囲: {preferences['protein']['min']:.1f} ~ {preferences['protein']['max']:.1f} g")
    print(f"\n【脂質】")
    print(f"  平均: {preferences['fat']['mean']:.1f} g (中央値: {preferences['fat']['median']:.1f})")
    print(f"  範囲: {preferences['fat']['min']:.1f} ~ {preferences['fat']['max']:.1f} g")
    print(f"\n【野菜重量】")
    print(f"  平均: {preferences['vegetables']['mean']:.1f} g (中央値: {preferences['vegetables']['median']:.1f})")
    print(f"  範囲: {preferences['vegetables']['min']:.0f} ~ {preferences['vegetables']['max']:.0f} g")
    print("="*70 + "\n")
    
    return preferences

def calculate_preference_score(nutrition, user_preferences):
    """
    メニューの栄養値とユーザーの好みプロファイルから好みスコアを計算
    """
    if not user_preferences:
        return 0.0
    
    score = 0.0
    weights = {
        'protein': 1.5,      # タンパク質重視
        'vegetables': 2.0,   # 野菜重視
        'fat': 1.2,          # 脂質は控えめを好む
        'energy': 0.8        # エネルギーは中程度
    }
    
    try:
        # タンパク質: 平均より多いほど高スコア
        protein = float(nutrition.get('たんぱく質', 0))
        protein_mean = user_preferences['protein']['mean']
        if protein >= protein_mean:
            score += weights['protein'] * (protein / protein_mean)
        else:
            score += weights['protein'] * 0.5
        
        # 野菜: 平均より多いほど高スコア
        vegetables = float(nutrition.get('野菜重量', 0))
        veg_mean = user_preferences['vegetables']['mean']
        if vegetables >= veg_mean:
            score += weights['vegetables'] * (vegetables / (veg_mean + 1))
        else:
            score += weights['vegetables'] * 0.3
        
        # 脂質: 平均より少ないほど高スコア（逆転）
        fat = float(nutrition.get('脂質', 0))
        fat_mean = user_preferences['fat']['mean']
        if fat <= fat_mean:
            score += weights['fat'] * (1.0 - fat / (fat_mean + 1))
        else:
            score += weights['fat'] * 0.3
        
        # エネルギー: 中央値に近いほど高スコア
        energy = float(nutrition.get('エネルギー', 0))
        energy_median = user_preferences['energy']['median']
        energy_diff = abs(energy - energy_median) / (energy_median + 1)
        score += weights['energy'] * (1.0 - min(energy_diff, 1.0))
        
    except Exception as e:
        print(f"⚠️ スコア計算エラー: {e}")
        return 0.0
    
    return score

def calculate_meal_set_score(menu_set, user_preferences):
    """
    メニューセット全体のバランススコアを計算
    1食あたりの総エネルギーを重視
    """
    if not user_preferences:
        return 0.0
    
    # セット全体の栄養値を計算
    total_energy = sum(m.get('nutrition', {}).get('エネルギー', 0) for m in menu_set)
    total_protein = sum(m.get('nutrition', {}).get('たんぱく質', 0) for m in menu_set)
    total_vegetables = sum(m.get('nutrition', {}).get('野菜重量', 0) for m in menu_set)
    total_fat = sum(m.get('nutrition', {}).get('脂質', 0) for m in menu_set)
    
    score = 0.0
    
    # 1食あたりの総エネルギーが理想的な範囲に収まるかを重視（最重要）
    ideal_meal_energy = user_preferences['meal_total_energy']['median']
    energy_std = user_preferences['meal_total_energy']['std']
    
    if ideal_meal_energy > 0:
        # 中央値に近いほど高スコア（標準偏差を考慮）
        energy_diff = abs(total_energy - ideal_meal_energy)
        
        if energy_diff <= energy_std:
            # 標準偏差内なら高スコア
            score += 4.0 * (1.0 - energy_diff / (energy_std + 1))
        elif total_energy > ideal_meal_energy:
            # エネルギーが理想より高い場合は厳しくペナルティ
            excess_ratio = (total_energy - ideal_meal_energy) / ideal_meal_energy
            score += max(0, 2.0 * (1.0 - excess_ratio))  # オーバー分に応じて大幅減点
        else:
            # エネルギーが理想より低い場合は緩やかに評価
            shortage_ratio = energy_diff / ideal_meal_energy
            score += 2.5 * (1.0 - shortage_ratio)
    
    # タンパク質の合計も評価（重み中）
    ideal_protein = user_preferences['protein']['mean'] * len(menu_set)
    if ideal_protein > 0:
        protein_ratio = total_protein / ideal_protein
        score += 1.5 * min(protein_ratio, 1.5)  # 1.5倍まで評価
    
    # 野菜の合計も評価（重み中）
    ideal_vegetables = user_preferences['vegetables']['mean'] * len(menu_set)
    if ideal_vegetables > 0:
        veg_ratio = total_vegetables / (ideal_vegetables + 1)
        score += 1.5 * min(veg_ratio, 1.5)
    
    # 脂質は少ないほど良い（重み小）
    ideal_fat = user_preferences['fat']['mean'] * len(menu_set)
    if ideal_fat > 0:
        fat_ratio = total_fat / (ideal_fat + 1)
        score += 1.0 * max(0, 2.0 - fat_ratio)  # 脂質が少ないほど高スコア
    
    return score

def load_data():
    """訓練時と同じロジックでメニューデータを読み込み"""
    menus_dir = Path(__file__).parent.parent / 'menus'
    history_dir = Path(__file__).parent.parent.parent / 'kyowa-menu-history' / 'data' / 'history'
    
    # 利用可能な日付
    menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
    history_files = sorted([f.stem for f in history_dir.glob('*.json')])
    common_dates = sorted(set(menu_files) & set(history_files))
    
    print(f"📅 学習期間: {common_dates[0]} ~ {common_dates[-1]} ({len(common_dates)}日)")
    
    # メニューマッピング（訓練時と同じロジック）
    all_menus = {}
    menu_to_idx = {}
    idx_to_menu = {}
    idx = 0
    all_menu_dicts = []
    
    for date in common_dates:
        menu_path = menus_dir / f'menus_{date}.json'
        with open(menu_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for menu in data.get('menus', []):
                name = menu.get('name')
                if name and name not in menu_to_idx:
                    menu_to_idx[name] = idx
                    idx_to_menu[idx] = name
                    all_menus[name] = menu
                    all_menu_dicts.append(menu)
                    idx += 1
    
    print(f"🍽️  総メニュー数 (モデル訓練時): {len(all_menus)}")
    
    # 日付ごとのメニュー情報
    sequences = []
    for date in common_dates:
        menu_path = menus_dir / f'menus_{date}.json'
        with open(menu_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            menu_names = [m.get('name') for m in data.get('menus', []) if m.get('name')]
            menu_indices = [menu_to_idx[name] for name in menu_names if name in menu_to_idx]
            if menu_indices:
                sequences.append((date, menu_names, menu_indices))
    
    print(f"✅ {len(sequences)}個の日付データを読み込み\n")
    
    return all_menus, menu_to_idx, idx_to_menu, sequences, all_menu_dicts


def generate_recommendations(date=None, model_path='ml/seq2set_model_best.pth', top_k=4):
    """
    Seq2Set Transformer を使用して推奨メニューセットを生成
    各日付のメニューファイルから、その日に利用可能なメニューの中から最適なセットを選ぶ
    
    Args:
        date: 推奨対象日 (YYYY-MM-DD形式)
        model_path: モデルパス
        top_k: 推奨メニュー数
    """
    device = torch.device('cpu')
    menus_dir = Path(__file__).parent.parent / 'menus'
    
    print("🔄 データをロード中...\n")
    all_menus, menu_to_idx, idx_to_menu, sequences, all_menu_dicts = load_data()
    num_menus = len(all_menus)
    
    # ユーザーの好みプロファイルを分析
    user_preferences = analyze_user_preferences()
    
    print("📚 メニューエンコーダーを準備中...\n")
    encoder = MenuEncoder()
    encoder.prepare_encoder(all_menu_dicts)  # 全メニュー辞書リストを渡す
    
    print("🧠 モデルをロード中...\n")
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=num_menus)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    
    # 栄養値の統計を計算（閾値を動的に決定するため）
    print("📊 栄養統計を分析中...\n")
    all_proteins = []
    all_energies = []
    all_vegetables = []
    
    for menu_dict in all_menu_dicts:
        nutrition = menu_dict.get('nutrition', {})
        try:
            all_proteins.append(float(nutrition.get('たんぱく質', 0)))
            all_energies.append(float(nutrition.get('エネルギー', 0)))
            all_vegetables.append(float(nutrition.get('野菜重量', 0)))
        except:
            pass
    
    # パーセンタイルで動的閾値を計算
    import numpy as np
    protein_75p = np.percentile(all_proteins, 75) if all_proteins else 10
    protein_90p = np.percentile(all_proteins, 90) if all_proteins else 15
    energy_25p = np.percentile(all_energies, 25) if all_energies else 100
    energy_75p = np.percentile(all_energies, 75) if all_energies else 300
    veg_75p = np.percentile(all_vegetables, 75) if all_vegetables else 80
    
    print(f"📈 栄養値の分布:")
    print(f"   タンパク質: 75%値={protein_75p:.1f}g, 90%値={protein_90p:.1f}g")
    print(f"   エネルギー: 25%値={energy_25p:.0f}kcal, 75%値={energy_75p:.0f}kcal")
    print(f"   野菜: 75%値={veg_75p:.0f}g\n")
    
    # 推奨を生成
    recommendations_by_date = {}
    
    # 各日付のメニューファイルを処理
    for date_str, _, _ in sequences:
        try:
            # その日のメニューファイルを読み込む
            menu_file = menus_dir / f'menus_{date_str}.json'
            with open(menu_file, 'r', encoding='utf-8') as f:
                daily_data = json.load(f)
                daily_menus = daily_data.get('menus', [])
            
            if not daily_menus:
                print(f"⚠️ {date_str}: メニューが見つかりません")
                continue
            
            # その日のメニュー名とインデックスを取得
            daily_menu_names = []
            daily_menu_indices = []
            daily_menu_embeddings = []
            
            for menu in daily_menus:
                menu_name = menu.get('name')
                if menu_name and menu_name in menu_to_idx:
                    daily_menu_names.append(menu_name)
                    daily_menu_indices.append(menu_to_idx[menu_name])
                    
                    # メニューをエンコード
                    menu_dict = {
                        'name': menu_name,
                        'nutrition': menu.get('nutrition', {})
                    }
                    embedding = encoder.encode_menu(menu_dict)
                    daily_menu_embeddings.append(embedding)
            
            if not daily_menu_embeddings:
                print(f"⚠️ {date_str}: エンコード可能なメニューがありません")
                continue
            
            # テンソルに変換してモデルに入力
            X = torch.FloatTensor(daily_menu_embeddings).unsqueeze(0).to(device)  # (1, seq_len, 68)
            
            # モデルで推奨を生成
            with torch.no_grad():
                # Transformer エンコーダー出力
                output_logits, _ = model(X)  # (1, num_menus), attentions
                output_probs = torch.sigmoid(output_logits)  # (1, num_menus)
            
            # その日に利用可能なメニューのスコアのみを抽出
            daily_scores = []
            for i, menu_idx in enumerate(daily_menu_indices):
                model_score = output_probs[0, menu_idx].item()
                menu_name = daily_menu_names[i]
                
                # ユーザーの好みスコアを計算
                menu_nutrition = daily_menus[i].get('nutrition', {})
                preference_score = calculate_preference_score(menu_nutrition, user_preferences) if user_preferences else 0.0
                
                # 最終スコア = モデルスコア(60%) + 好みスコア(40%)
                combined_score = 0.6 * model_score + 0.4 * (preference_score / 5.5)  # 正規化
                
                daily_scores.append((menu_idx, menu_name, combined_score, model_score, preference_score))
            
            # 組み合わせ最適化：セット全体のバランスを考慮
            # まず個別スコアでソート
            daily_scores.sort(key=lambda x: x[2], reverse=True)
            
            # 候補プール：上位15個から選択（計算量削減のため）
            candidate_pool_size = min(15, len(daily_scores))
            candidate_pool = daily_scores[:candidate_pool_size]
            
            # 最適な組み合わせを探索（貪欲法）
            # 1. 最もスコアが高い1つを選択
            # 2. 残りから、セット全体のバランスが最も良くなるものを追加
            best_set = [candidate_pool[0]]  # 最高スコアのメニューからスタート
            
            for _ in range(top_k - 1):
                best_addition = None
                best_set_score = -1
                
                for candidate in candidate_pool:
                    if candidate in best_set:
                        continue
                    
                    # 試験的にセットに追加
                    test_set = best_set + [candidate]
                    
                    # セット全体のメニューオブジェクトを構築
                    test_menu_objects = []
                    for _, name, _, _, _ in test_set:
                        menu_obj = next((m for m in daily_menus if m.get('name') == name), None)
                        if menu_obj:
                            test_menu_objects.append(menu_obj)
                    
                    # セット全体のバランススコアを計算
                    if user_preferences and len(test_menu_objects) == len(test_set):
                        set_balance_score = calculate_meal_set_score(test_menu_objects, user_preferences)
                        
                        # 個別スコアの平均とセットバランスを組み合わせ
                        # セットバランス（特にエネルギー）をより重視
                        avg_individual_score = sum(x[2] for x in test_set) / len(test_set)
                        total_score = 0.35 * avg_individual_score + 0.65 * (set_balance_score / 7.0)  # セットバランスを重視
                        
                        if total_score > best_set_score:
                            best_set_score = total_score
                            best_addition = candidate
                    else:
                        # 好みデータがない場合は個別スコアのみで判断
                        if candidate[2] > best_set_score:
                            best_set_score = candidate[2]
                            best_addition = candidate
                
                if best_addition:
                    best_set.append(best_addition)
            
            top_recommendations = best_set
            
            # 最終選択されたセットの総エネルギーを計算
            selected_menu_objects = []
            for _, name, _, _, _ in top_recommendations:
                menu_obj = next((m for m in daily_menus if m.get('name') == name), None)
                if menu_obj:
                    selected_menu_objects.append(menu_obj)
            
            total_set_energy = sum(m.get('nutrition', {}).get('エネルギー', 0) for m in selected_menu_objects)
            
            print(f"📅 {date_str}: {len(daily_menus)}個のメニューから{len(top_recommendations)}個を選択 (総エネルギー: {total_set_energy:.0f}kcal)")

            
            # 推奨理由を生成する関数
            def generate_recommendation_reason(menu_name, score, rank):
                """推奨理由を生成（動的閾値を使用）"""
                nutrition = get_menu_nutrition(menu_name, menus_dir)
                reasons = []
                
                # スコアに基づく理由は一旦無視
                # if score > 0.9:
                #     reasons.append("高評価メニュー")
                # elif score > 0.75:
                #     reasons.append("推奨度高")
                
                # 栄養に基づく理由（動的閾値）
                try:
                    protein = float(nutrition.get('たんぱく質', 0))
                    if protein > protein_90p:
                        reasons.append("タンパク質豊富")
                    elif protein > protein_75p:
                        reasons.append("良好なタンパク質")
                except:
                    pass
                
                try:
                    energy = float(nutrition.get('エネルギー', 0))
                    if energy < energy_25p:
                        reasons.append("低カロリー")
                    elif energy > energy_75p:
                        reasons.append("ボリューム満点")
                except:
                    pass
                
                try:
                    vegetables = float(nutrition.get('野菜重量', 0))
                    if vegetables > veg_75p:
                        reasons.append("野菜たっぷり")
                except:
                    pass
                
                # ランクに基づく理由も一旦無視
                # if rank == 1:
                #     reasons.append("最優先推奨")
                
                # 理由がない場合はデフォルト
                if not reasons:
                    reasons.append("バランス良好")
                
                return reasons[:2]  # 最大2つまで
            
            # 推奨メニューの詳細を構築
            recommended_menus = []
            for rank, (menu_idx, menu_name, combined_score, model_score, pref_score) in enumerate(top_recommendations, start=1):
                nutrition = get_menu_nutrition(menu_name, menus_dir)
                reasons = generate_recommendation_reason(menu_name, combined_score, rank)
                
                # ユーザー好みスコアに基づく理由を追加
                if user_preferences and pref_score > 4.0:
                    reasons.append("好みに合致")
                
                # セット全体のエネルギーが適切範囲内かチェック
                if user_preferences and len(selected_menu_objects) == len(top_recommendations):
                    ideal_energy = user_preferences['meal_total_energy']['median']
                    energy_std = user_preferences['meal_total_energy']['std']
                    energy_diff = abs(total_set_energy - ideal_energy)
                    
                    if energy_diff <= energy_std:
                        if "総エネルギー適正" not in reasons:
                            reasons.append("総エネルギー適正")
                
                recommended_menus.append({
                    'rank': rank,
                    'name': menu_name,
                    'score': round(float(combined_score), 3),
                    'model_score': round(float(model_score), 3),
                    'preference_score': round(float(pref_score), 2),
                    'reasons': reasons,
                    'nutrition': {
                        'energy': nutrition.get('エネルギー', 0),
                        'protein': nutrition.get('たんぱく質', 0),
                        'fat': nutrition.get('脂質', 0),
                        'carbs': nutrition.get('炭水化物', 0),
                        'vegetable_weight': nutrition.get('野菜重量', 0),
                        'fiber': nutrition.get('食物繊維', 0)
                    }
                })

            
            # セット全体の理由を生成
            def generate_set_reason(menus_with_reasons):
                """メニューセット全体の選定理由を生成"""
                if not menus_with_reasons:
                    return "バランスの取れたセットです"
                
                reason_parts = []
                
                # 各メニューの主な理由を構築
                for menu in menus_with_reasons:
                    menu_name = menu['name']
                    reasons = menu['reasons']
                    
                    if reasons:
                        # 理由をアイコン化（簡潔版）
                        reason_str = f"{menu_name}は{' / '.join(reasons)}"
                    else:
                        reason_str = f"{menu_name}は栄養バランス良好"
                    
                    reason_parts.append(reason_str)
                
                # セット全体の栄養バランスをチェック
                avg_score = sum(m['score'] for m in menus_with_reasons) / len(menus_with_reasons)
                if avg_score > 0.9:
                    balance = "全体で高スコア維持"
                elif avg_score > 0.7:
                    balance = "全体で安定したスコア"
                else:
                    balance = "全体で多様性を重視"
                
                # セット理由を組み立て
                set_reason = " / ".join(reason_parts) + f" / 全体: {balance}"
                return set_reason
            
            set_reason = generate_set_reason(recommended_menus)
            
            # セット全体の栄養情報を計算
            total_energy = sum(m['nutrition']['energy'] for m in recommended_menus)
            total_protein = sum(m['nutrition']['protein'] for m in recommended_menus)
            total_fat = sum(m['nutrition']['fat'] for m in recommended_menus)
            total_carbs = sum(m['nutrition']['carbs'] for m in recommended_menus)
            
            avg_energy = total_energy / len(recommended_menus) if recommended_menus else 0
            avg_protein = total_protein / len(recommended_menus) if recommended_menus else 0
            
            # PFC バランスを計算
            total_cal = total_energy
            pfc_ratio = {
                'protein': round(total_protein * 4 / (total_cal + 1e-6) * 100, 1),
                'fat': round(total_fat * 9 / (total_cal + 1e-6) * 100, 1),
                'carbs': round(total_carbs * 4 / (total_cal + 1e-6) * 100, 1)
            }
            
            recommendations_by_date[date_str] = {
                'date': date_str,
                'generated_at': datetime.now().isoformat(),
                'model': 'Seq2Set Transformer v1',
                'set_reason': set_reason,
                'recommendations': recommended_menus,
                'nutrition_summary': {
                    'total_energy': round(total_energy, 1),
                    'total_protein': round(total_protein, 1),
                    'total_fat': round(total_fat, 1),
                    'total_carbs': round(total_carbs, 1),
                    'average_energy': round(avg_energy, 1),
                    'average_protein': round(avg_protein, 1)
                },
                'pfc_ratio': pfc_ratio,
                'recommendation_count': len(recommended_menus)
            }
            
            print(f"✅ {date_str}: {len(recommended_menus)}個のメニューを推奨")
            
        except Exception as e:
            print(f"⚠️  {date_str}: 推奨生成エラー - {str(e)}")
            continue
    
    return recommendations_by_date


def save_recommendations(recommendations_by_date):
    """推奨をファイルに保存"""
    output_dir = Path(__file__).parent.parent / 'docs' / 'ai-selections'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 日付ごとに保存
    for date, data in recommendations_by_date.items():
        output_file = output_dir / f'ai-selections_{date}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 保存: {output_file}")
    
    # 利用可能な日付リストも生成
    available_dates = {
        'generated_at': datetime.now().isoformat(),
        'total_dates': len(recommendations_by_date),
        'dates': sorted(recommendations_by_date.keys()),
        'model': 'Seq2Set Transformer v1'
    }
    
    available_file = output_dir / 'available-ai-dates.json'
    with open(available_file, 'w', encoding='utf-8') as f:
        json.dump(available_dates, f, ensure_ascii=False, indent=2)
    print(f"💾 利用可能日付リスト: {available_file}")
    
    return output_dir


if __name__ == '__main__':
    print("=" * 70)
    print("🤖 AI推奨メニューセット生成")
    print("=" * 70)
    print()
    
    try:
        # 推奨を生成
        recommendations_by_date = generate_recommendations(
            model_path='ml/seq2set_model_best.pth',
            top_k=4
        )
        
        print()
        print("=" * 70)
        print(f"✅ {len(recommendations_by_date)}個の日付について推奨を生成しました")
        print("=" * 70)
        print()
        
        # ファイルに保存
        output_dir = save_recommendations(recommendations_by_date)
        
        print()
        print("=" * 70)
        print(f"✅ JSON ファイルを {output_dir} に保存しました")
        print("=" * 70)
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {str(e)}")
        sys.exit(1)
