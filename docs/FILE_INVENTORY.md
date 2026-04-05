# 📁 リポジトリ ファイル棚卸し（2026-04-05 時点）

このドキュメントは、リポジトリ内の全ファイルを **カテゴリ別** に分類し、  
各ファイルの **必要度**（🟢 必須 / 🟡 保留 / 🔴 削除候補）を整理したものです。  
整理作業はこのリストに沿って段階的に進めます。

---

## 目次

1. [カテゴリ A: GitHub Pages フロントエンド](#カテゴリ-a-github-pages-フロントエンド)
2. [カテゴリ B: スクレイピング（メニュー取得）](#カテゴリ-b-スクレイピングメニュー取得)
3. [カテゴリ C: ML/AI 推薦パイプライン（本番）](#カテゴリ-c-mlai-推薦パイプライン本番)
4. [カテゴリ D: メニューデータ・AI推薦データ](#カテゴリ-d-メニューデータai推薦データ)
5. [カテゴリ E: 設定・環境ファイル](#カテゴリ-e-設定環境ファイル)
6. [カテゴリ F: レガシー（Seq2Set モデル系）](#カテゴリ-f-レガシーseq2set-モデル系)
7. [カテゴリ G: レガシー（旧バックエンド・旧ユーティリティ）](#カテゴリ-g-レガシー旧バックエンド旧ユーティリティ)
8. [カテゴリ H: テストスクリプト](#カテゴリ-h-テストスクリプト)
9. [カテゴリ I: 一回限りのユーティリティ](#カテゴリ-i-一回限りのユーティリティ)
10. [カテゴリ J: ドキュメント（ルート直下）](#カテゴリ-j-ドキュメントルート直下)
11. [カテゴリ K: ドキュメント（docs/）](#カテゴリ-k-ドキュメントdocs)
12. [カテゴリ L: ドキュメント（ml/）](#カテゴリ-l-ドキュメントml)
13. [カテゴリ M: ログ・一時ファイル](#カテゴリ-m-ログ一時ファイル)
14. [カテゴリ N: ML 検証・分析スクリプト（一回実行済み）](#カテゴリ-n-ml-検証分析スクリプト一回実行済み)
15. [削除の優先順位まとめ](#削除の優先順位まとめ)

---

## カテゴリ A: GitHub Pages フロントエンド

ユーザーが実際にアクセスする Web UI。GitHub Pages で配信される静的ファイル。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `index.html` | メインページ（メニュー最適化・AI推薦タブ） | 🟢 必須 |
| `app.js` | フロントエンドのコアJS（2863行） | 🟢 必須 |
| `style.css` | メインCSS（2154行） | 🟢 必須 |
| `ai-styles.css` | AI推薦タブ専用CSS（466行） | 🟢 必須 |
| `admin.html` | 管理者ページ（食事記録入力） | 🟢 必須 |
| `admin.js` | 管理者ページ用JS（564行） | 🟢 必須 |
| `src/optimizer/optimizeMenus.js` | 栄養最適化ロジック（貪欲法+ローカルサーチ） | 🟢 必須 |

---

## カテゴリ B: スクレイピング（メニュー取得）

協和食堂のWebサイトからメニューを自動取得する仕組み。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `src/scraper/fetchMenus.js` | Playwrightスクレイピングのコアロジック | 🟢 必須 |
| `src/utils/date.js` | 日付ユーティリティ（曜日判定・ラベル生成） | 🟢 必須 |
| `prescrap.js` | メインのスクレイピング実行スクリプト（`npm run scrape`） | 🟢 必須 |
| `scrape-and-upload.js` | スクレイプ → Git連携アップロード | 🟢 必須 |
| `scheduler.js` | node-cron による週次自動スクレイピング | 🟢 必須 |
| `.github/workflows/scrape.yml` | GitHub Actions による週次自動スクレイピング | 🟢 必須 |

---

## カテゴリ C: ML/AI 推薦パイプライン（本番）

現在稼働中の RandomForest + Claude Haiku による推薦システム。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `ml/menu_recommender.py` | メイン推薦モデル（RandomForest+GBT+LR, 701行） | 🟢 必須 |
| `ml/claude_analyzer.py` | Claude Haikuでメニューのセマンティック特徴量を抽出 | 🟢 必須 |
| `ml/claude_preference_analyzer.py` | Claude Haikuでユーザー嗜好プロファイルを生成 | 🟢 必須 |
| `ml/generate_ai_selections.py` | 全日付のAI推薦を生成 → Supabaseに保存 | 🟢 必須 |
| `ml/update_weekly.py` | 週次更新スクリプト（Claude解析→再学習→再推薦） | 🟢 必須 |
| `ml/supabase_data_loader.py` | Supabaseから学習データを取得 | 🟢 必須 |

---

## カテゴリ D: メニューデータ・AI推薦データ

スクレイピング結果とAI推薦結果のデータファイル。

| ファイル/フォルダ | 説明 | 必要度 |
|-----------------|------|--------|
| `menus/*.json` | 日別メニューデータ（45ファイル） | 🟢 必須 |
| `menus/available-dates.json` | 利用可能日付一覧 | 🟢 必須 |
| `docs/ai-selections/*.json` | 日別AI推薦データ（45ファイル） | 🟢 必須 |
| `docs/ai-selections/available-ai-dates.json` | AI推薦利用可能日付 | 🟢 必須 |
| `ml/data/claude_menu_cache.json` | Claude解析キャッシュ（API呼び出し節約） | 🟢 必須 |
| `ml/data/training_data.json` | ML学習用データ | 🟡 保留※ |
| `ml/data/data_summary.json` | データ統計サマリー | 🟡 保留※ |
| `ml/data/user_preference_profile.json` | ユーザー嗜好プロファイル | 🟢 必須 |
| `ml/user_preferences/default_user.json` | デフォルトユーザー設定 | 🟢 必須 |
| `model/menu_recommender.pkl` | 学習済みモデル（ルート） | 🟢 必須 |
| `ml/model/menu_recommender.pkl` | 学習済みモデル（ml/内） | 🟡 重複確認※ |

> ※ `training_data.json` と `data_summary.json` は Supabase から再生成可能。  
> ※ `model/` と `ml/model/` に同名のpklファイルが存在。どちらが本番で使用されているか確認が必要。

---

## カテゴリ E: 設定・環境ファイル

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `package.json` | Node.js依存関係・スクリプト定義 | 🟢 必須 |
| `package-lock.json` | 依存関係ロックファイル | 🟢 必須 |
| `.nvmrc` | Node.jsバージョン指定（24.12.0） | 🟢 必須 |
| `.gitignore` | Git除外設定 | 🟢 必須 |
| `requirements.txt` | Python依存関係 | 🟢 必須 |
| `.github/copilot-instructions.md` | GitHub Copilot向けプロジェクト説明 | 🟢 必須 |
| `README.md` | プロジェクト説明 | 🟢 必須 |
| `.vscode/` | VSCode設定（ローカル） | 🟡 保留 |

---

## カテゴリ F: レガシー（Seq2Set モデル系）

データ不足により実戦投入されなかった Seq2Set Transformer モデル関連。  
**現在は RandomForest（menu_recommender.py）に完全移行済み。**

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `ml/seq2set_transformer.py` | Seq2Set Transformerモデル定義（PyTorch） | 🔴 削除候補 |
| `ml/train_seq2set.py` | Seq2Setの学習スクリプト | 🔴 削除候補 |
| `ml/predict_with_nutrition.py` | Seq2Set栄養制約付き推論 | 🔴 削除候補 |
| `ml/predict_with_seq2set.py` | Seq2Set推論スクリプト | 🔴 削除候補 |
| `ml/analyze_attention.py` | Seq2Set Attention可視化 | 🔴 削除候補 |
| `ml/apply_improvements.py` | Seq2Set推薦改善処理 | 🔴 削除候補 |
| `ml/improve_recommendations.py` | 多様性/栄養マッチ改善エンジン | 🔴 削除候補 |
| `ml/menu_encoder.py` | Seq2Set用メニューエンコーダ | 🔴 削除候補 |
| `ml/generate_ai_recommendations.py` | Seq2Set用の推薦生成（旧版） | 🔴 削除候補 |
| `ml/user_preference_learning.py` | ユーザー嗜好学習（ML API用） | 🔴 削除候補 |
| `ml/ab_test_manager.py` | A/Bテスト管理（未使用） | 🔴 削除候補 |
| `ml/seq2set_model_best.pth` | Seq2Set学習済みモデル（1.8MB） | 🔴 削除候補 |
| `ml/validation_results.json` | Seq2Set検証結果 | 🔴 削除候補 |
| `ml/validation_results.png` | Seq2Set検証結果グラフ（90KB） | 🔴 削除候補 |
| `ml/validation.log` | Seq2Set検証ログ | 🔴 削除候補 |

> 💡 Seq2Setモデルは将来データが増えれば再チャレンジの可能性あり。  
> アーカイブブランチ（`archive/seq2set`）を作成してから削除するのが安全。

---

## カテゴリ G: レガシー（旧バックエンド・旧ユーティリティ）

Express サーバーは廃止済み（GitHub Pages の静的配信に移行）。  
GitHub API 直接操作も Git CLI ベースの連携に置き換え済み。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `src/server.js` | 旧Expressサーバー（廃止済み） | 🔴 削除候補 |
| `src/ml-api.js` | 旧ML推論API（Seq2Set用, 廃止済み） | 🔴 削除候補 |
| `lib/github-utils.js` | 旧GitHub APIユーティリティ（Supabase移行後不要） | 🔴 削除候補 |
| `sync-training-data.js` | 旧データ同期スクリプト（Supabase移行後不要） | 🔴 削除候補 |
| `ml/data_collector.js` | 旧学習データ収集（Supabase移行後不要） | 🔴 削除候補 |

---

## カテゴリ H: テストスクリプト

開発時の検証用スクリプト。正式なテストフレームワーク（Jest等）は未導入。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `e2e-test.js` | E2Eテスト（admin操作シミュレーション） | 🟡 保留 |
| `test-ai-tab.js` | AIタブのブラウザ手動テスト | 🔴 削除候補 |
| `test-browser-simulation.js` | メニュー読み込みのNodeシミュレーション | 🔴 削除候補 |
| `test-date-filtering.js` | 日付フィルタリングの単体テスト | 🔴 削除候補 |
| `test-frontend-integration.js` | フロントエンド統合テスト | 🔴 削除候補 |
| `test-scripts.sh` | スクリプト構文チェック | 🔴 削除候補 |

> 💡 テスト自体は大切だが、アドホックなスクリプトが散在している状態。  
> 将来的に `tests/` ディレクトリへの統合 or 正式なテストフレームワーク導入を推奨。

---

## カテゴリ I: 一回限りのユーティリティ

移行・セットアップ時に使用し、役割を終えたスクリプト。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `migrate-to-supabase.js` | menus/ → Supabase一括移行 | 🔴 削除候補 |

---

## カテゴリ J: ドキュメント（ルート直下）

ルートに散在する Markdown ファイル。多くは実装完了後の報告書。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `README.md` | プロジェクト説明（メイン） | 🟢 必須 |
| `SCHEDULER_SETUP.md` | scheduler.js 運用ガイド（PM2/launchd設定） | 🟡 保留（docs/へ移動推奨） |
| `PROJECT_STATUS.md` | プロジェクト現状報告（2026/1/15時点, やや古い） | 🔴 削除候補 |
| `ADMIN_CHOICE_ROADMAP.md` | 管理者チョイス機能ロードマップ（実装済み） | 🔴 削除候補 |
| `AI_SUPABASE_IMPLEMENTATION_SUMMARY.md` | AIタブ Supabase 対応完了報告 | 🔴 削除候補 |
| `GITHUB_API_SETUP_COMPLETE.md` | GitHub API セットアップ完了報告 | 🔴 削除候補 |
| `GITHUB_PAGES_COMPLETION.md` | GitHub Pages 修正完了報告 | 🔴 削除候補 |
| `GITHUB_PAGES_UPDATE.md` | GitHub Pages 更新レポート | 🔴 削除候補 |
| `IMPLEMENTATION_GUIDE_PHASE1.md` | Phase 1 実装ガイド（実装済み） | 🔴 削除候補 |
| `LOCAL_TEST_COMPLETE.md` | ローカルテスト完了報告 | 🔴 削除候補 |
| `LOCAL_TEST_RESULTS.md` | テスト結果詳細 | 🔴 削除候補 |
| `ONO_MENUS_FEATURE_PLAN.md` | ONO Menus 機能計画書（実装済み） | 🔴 削除候補 |
| `SCRAPER_REBUILD_PLAN.md` | スクレイパー再構築計画（実装済み） | 🔴 削除候補 |
| `UI_IMPROVEMENTS.md` | UI改善履歴・TODO | 🟡 保留（更新が必要なら残す） |

> 💡 ルート直下のMDファイルは **11件が削除候補**。README.md以外はルートに置く必要なし。  
> 残す場合も `docs/archive/` にまとめて移動するのが妥当。

---

## カテゴリ K: ドキュメント（docs/）

`docs/` 配下のドキュメント類。セットアップガイド系は有用だが、完了報告系は不要。

### 残すべきドキュメント

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `docs/SUPABASE_SETUP.md` | Supabase セットアップ手順 | 🟢 必須 |
| `docs/ADMIN_SETUP.md` | 管理画面セットアップ手順 | 🟢 必須 |
| `docs/AI_QUICK_START.md` | AI推薦クイックスタート | 🟢 必須 |
| `docs/QUICK_START.md` | 全体のクイックスタート | 🟢 必須 |
| `docs/DATA_SYNC_GUIDE.md` | データ同期ガイド | 🟡 保留 |
| `docs/GITHUB_TOKEN_SETUP.md` | GitHubトークン設定手順 | 🟡 保留 |
| `docs/AI_SELECTIONS_TABLE.sql` | ai_selections テーブル SQL | 🟢 必須 |
| `docs/MEAL_HISTORY_TABLE.sql` | meal_history テーブル SQL | 🟢 必須 |

### 完了報告・フェーズレポート（アーカイブまたは削除候補）

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `docs/PHASE2_REPORT.md` | Phase 2 完了報告 | 🔴 削除候補 |
| `docs/PHASE3_REPORT.md` | Phase 3 完了報告 | 🔴 削除候補 |
| `docs/PHASE4_REPORT.md` | Phase 4 完了報告 | 🔴 削除候補 |
| `docs/PHASE5_REPORT.md` | Phase 5 完了報告 | 🔴 削除候補 |
| `docs/PHASE6_REPORT.md` | Phase 6 完了報告 | 🔴 削除候補 |
| `docs/STEP2_REPORT.md` | Step 2 完了報告 | 🔴 削除候補 |
| `docs/STEP3_REPORT.md` | Step 3 完了報告 | 🔴 削除候補 |
| `docs/STEP4_REPORT.md` | Step 4 完了報告 | 🔴 削除候補 |
| `docs/STEP4B_COMPLETION.md` | Step 4B 完了報告 | 🔴 削除候補 |
| `docs/STEP4D_AI_RECOMMENDATIONS_COMPLETION.md` | Step 4D 完了報告 | 🔴 削除候補 |
| `docs/STEP4E_DASHBOARD_COMPLETION.md` | Step 4E 完了報告 | 🔴 削除候補 |
| `docs/STEP4F_COMPLETION_REPORT.md` | Step 4F 完了報告 | 🔴 削除候補 |
| `docs/STEP4F_EXECUTIVE_SUMMARY.md` | Step 4F サマリー（英語） | 🔴 削除候補 |
| `docs/STEP4F_RECOMMENDATION_IMPROVEMENT.md` | Step 4F 推薦改善（英語） | 🔴 削除候補 |
| `docs/STEP4F_UI統合ノート.md` | Step 4F UI統合ノート | 🔴 削除候補 |
| `docs/STEP4F_エグゼクティブサマリー.md` | Step 4F サマリー（日本語） | 🔴 削除候補 |
| `docs/STEP4F_完了レポート.md` | Step 4F 完了レポート（日本語） | 🔴 削除候補 |
| `docs/STEP4F_推奨改善.md` | Step 4F 推奨改善（日本語） | 🔴 削除候補 |
| `docs/STEP5_1_RATING_FEATURE.md` | Step 5-1 評価機能レポート | 🔴 削除候補 |
| `docs/STEP5_2_E2E_TEST_PLAN.md` | Step 5-2 E2Eテスト計画 | 🔴 削除候補 |
| `docs/STEP5_2_E2E_TEST_RESULTS.md` | Step 5-2 E2Eテスト結果 | 🔴 削除候補 |
| `docs/ADMIN_SUPABASE_MIGRATION.md` | Admin Supabase移行レポート | 🔴 削除候補 |
| `docs/AI_SUPABASE_MIGRATION.md` | AI Supabase移行レポート | 🔴 削除候補 |
| `docs/MENU_LOADING_FIX_REPORT.md` | メニュー読込修正レポート | 🔴 削除候補 |
| `docs/RECOMMENDED_MENUS_EXAMPLES.md` | 推薦メニュー例 | 🔴 削除候補 |

> 💡 `docs/` 内の完了報告系は **25件が削除候補**。
> Gitの履歴に残っているため、ファイルとして保持する必要はない。

---

## カテゴリ L: ドキュメント（ml/）

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `ml/README.md` | ML環境概要・セットアップ手順 | 🟢 必須 |
| `ml/IMPROVEMENT_PROPOSAL.md` | ML改善提案書 | 🔴 削除候補 |
| `ml/ML_INTEGRATION_ROADMAP.md` | ML統合ロードマップ | 🔴 削除候補 |
| `ml/VALIDATION_REPORT_STEP1.md` | Step1検証レポート | 🔴 削除候補 |
| `ml/PROJECT_COMPLETION_REPORT.py` | Step1-3進捗レポート（printするだけ） | 🔴 削除候補 |
| `ml/step3_demo.py` | Step3デモ（printするだけ） | 🔴 削除候補 |

---

## カテゴリ M: ログ・一時ファイル

ログや一時的に生成されたファイル。すべて削除して問題なし。

| ファイル/フォルダ | 説明 | 必要度 |
|-----------------|------|--------|
| `scrape_test.log` | スクレイパーテストログ（2026/1/15） | 🔴 削除候補 |
| `server.log` | 旧サーバーログ（2026/1/12） | 🔴 削除候補 |
| `logs/General.pdf` | GitHub Actionログ（PDF） | 🔴 削除候補 |
| `logs/Pages.pdf` | GitHub Actionログ（PDF） | 🔴 削除候補 |
| `logs/logs_*/` | GitHub Action実行ログ（4フォルダ） | 🔴 削除候補 |
| `.test-storage/` | テスト用一時ストレージ | 🔴 削除候補 |
| `.backup/` | 空のバックアップフォルダ | 🔴 削除候補 |
| `.tmp/` | 空の一時フォルダ | 🔴 削除候補 |

---

## カテゴリ N: ML 検証・分析スクリプト（一回実行済み）

開発フェーズで一度だけ実行した分析・検証スクリプト。

| ファイル | 説明 | 必要度 |
|---------|------|--------|
| `ml/validate_model.py` | モデル検証（時系列分割+交差検証） | 🟡 保留 |
| `ml/quick_validation.py` | 簡易性能評価 | 🔴 削除候補 |
| `ml/ultra_quick_validation.py` | 最小限データパターン分析 | 🔴 削除候補 |
| `ml/quick_analysis.py` | データ基本統計確認 | 🔴 削除候補 |

> 💡 `validate_model.py` はモデル更新後の性能確認に再利用できる可能性あり。

---

## 削除の優先順位まとめ

以下の順序で段階的に整理を進めることを推奨します。

### 🔥 Phase 1: リスクゼロで即削除（ログ・一時ファイル）

```
scrape_test.log
server.log
logs/General.pdf
logs/Pages.pdf
logs/logs_*/ （全4フォルダ）
.test-storage/
.backup/
.tmp/
```

**削除数: 10件**  
**理由**: 一時ファイル/ログのため、機能に一切影響なし。

---

### 🧹 Phase 2: レガシーコード削除（旧バックエンド・旧ユーティリティ）

```
src/server.js
src/ml-api.js
lib/github-utils.js      → lib/ フォルダごと削除
sync-training-data.js
ml/data_collector.js
migrate-to-supabase.js
```

**削除数: 6件**  
**理由**: Supabase + GitHub Pages 移行により完全に不要。  
**事前確認**: `package.json` の scripts から参照がないか確認。

---

### 🧪 Phase 3: Seq2Set モデル系の一括削除

```
ml/seq2set_transformer.py
ml/train_seq2set.py
ml/predict_with_nutrition.py
ml/predict_with_seq2set.py
ml/analyze_attention.py
ml/apply_improvements.py
ml/improve_recommendations.py
ml/menu_encoder.py
ml/generate_ai_recommendations.py
ml/user_preference_learning.py
ml/ab_test_manager.py
ml/seq2set_model_best.pth
ml/validation_results.json
ml/validation_results.png
ml/validation.log
```

**削除数: 15件**  
**理由**: Seq2Setはデータ不足で断念済み。RandomForestが本番稼働中。  
**推奨**: 削除前に `git branch archive/seq2set` でアーカイブブランチを作成。

---

### 🧪 Phase 4: テストスクリプト整理

```
test-ai-tab.js
test-browser-simulation.js
test-date-filtering.js
test-frontend-integration.js
test-scripts.sh
e2e-test.js                → 保留 or tests/ へ移動
```

**削除数: 5〜6件**  
**理由**: アドホックなテスト。正式なテスト体制構築時に整理。

---

### 📝 Phase 5: ドキュメント整理

#### ルート直下のMD（11件削除）
```
PROJECT_STATUS.md
ADMIN_CHOICE_ROADMAP.md
AI_SUPABASE_IMPLEMENTATION_SUMMARY.md
GITHUB_API_SETUP_COMPLETE.md
GITHUB_PAGES_COMPLETION.md
GITHUB_PAGES_UPDATE.md
IMPLEMENTATION_GUIDE_PHASE1.md
LOCAL_TEST_COMPLETE.md
LOCAL_TEST_RESULTS.md
ONO_MENUS_FEATURE_PLAN.md
SCRAPER_REBUILD_PLAN.md
```

#### SCHEDULER_SETUP.md と UI_IMPROVEMENTS.md
→ 内容を確認して `docs/` に移動 or 削除

#### docs/ 内の完了報告（25件削除）
```
docs/PHASE2_REPORT.md 〜 docs/PHASE6_REPORT.md
docs/STEP2_REPORT.md 〜 docs/STEP5_2_E2E_TEST_RESULTS.md
docs/ADMIN_SUPABASE_MIGRATION.md
docs/AI_SUPABASE_MIGRATION.md
docs/MENU_LOADING_FIX_REPORT.md
docs/RECOMMENDED_MENUS_EXAMPLES.md
```

#### ml/ 内のドキュメント（5件削除）
```
ml/IMPROVEMENT_PROPOSAL.md
ml/ML_INTEGRATION_ROADMAP.md
ml/VALIDATION_REPORT_STEP1.md
ml/PROJECT_COMPLETION_REPORT.py
ml/step3_demo.py
```

#### ML検証スクリプト（3件削除）
```
ml/quick_validation.py
ml/ultra_quick_validation.py
ml/quick_analysis.py
```

**削除数: 合計 44件**  
**理由**: 完了報告はGit履歴で参照可能。ルート直下のMDは散乱を招く。

---

### 📊 全体サマリー

| カテゴリ | ファイル数 | 🟢 必須 | 🟡 保留 | 🔴 削除候補 |
|---------|----------|--------|--------|------------|
| A: フロントエンド | 7 | 7 | 0 | 0 |
| B: スクレイピング | 6 | 6 | 0 | 0 |
| C: ML/AI パイプライン | 6 | 6 | 0 | 0 |
| D: データファイル | 11 | 8 | 3 | 0 |
| E: 設定・環境 | 8 | 7 | 1 | 0 |
| F: Seq2Set系 | 15 | 0 | 0 | 15 |
| G: 旧バックエンド | 5 | 0 | 0 | 5 |
| H: テスト | 6 | 0 | 1 | 5 |
| I: 一回限り | 1 | 0 | 0 | 1 |
| J: MD（ルート） | 14 | 1 | 2 | 11 |
| K: docs/ 内 | 33 | 6 | 2 | 25 |
| L: ML ドキュメント | 6 | 1 | 0 | 5 |
| M: ログ・一時 | 8+ | 0 | 0 | 8+ |
| N: ML検証 | 4 | 0 | 1 | 3 |
| **合計** | **130+** | **42** | **10** | **78+** |

> 🎯 **リポジトリの約60%が削除候補**。  
> Phase 1〜5の順に進めることで、安全かつ段階的にスリム化できます。
