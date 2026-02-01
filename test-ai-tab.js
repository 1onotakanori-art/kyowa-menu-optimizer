/**
 * AIタブの表示テスト
 */

// AI推奨データの取得テスト
async function testAITab() {
  console.log('🧪 AIタブ表示テスト開始');
  
  // 1. AIデータファイルが存在するか確認
  const testDate = '2026-01-13';
  const aiJsonPath = `docs/ai-selections/ai-selections_${testDate}.json`;
  
  try {
    const response = await fetch(aiJsonPath, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ AIデータ取得成功: ${testDate}`);
      console.log('📊 データ構造:', {
        date: data.date,
        model: data.model,
        recommendationsCount: data.recommendations ? data.recommendations.length : 0,
        hasNutritionSummary: !!data.nutrition_summary,
        hasImprovementStats: !!data.improvement_stats,
        hasPFCRatio: !!data.pfc_ratio
      });
      
      // 2. データが正しい構造を持っているか確認
      if (data.recommendations && data.recommendations.length > 0) {
        console.log('✅ recommendations フィールドが存在');
        console.log('📋 最初のレコメンデーション:',  {
          rank: data.recommendations[0].rank,
          name: data.recommendations[0].name,
          score: data.recommendations[0].score,
          hasNutrition: !!data.recommendations[0].nutrition
        });
      } else {
        console.warn('⚠️ recommendationsが見つからないか、空です');
      }
      
      // 3. displayAIRecommendations メソッドが存在するか確認
      if (typeof displayAIRecommendations === 'function') {
        console.log('✅ displayAIRecommendations メソッドが存在');
      } else if (typeof app !== 'undefined' && typeof app.displayAIRecommendations === 'function') {
        console.log('✅ app.displayAIRecommendations メソッドが存在');
      } else {
        console.error('❌ displayAIRecommendations メソッドが見つかりません');
      }
      
      // 4. DOM 要素が存在するか確認
      const grid = document.getElementById('ai-menus-grid');
      if (grid) {
        console.log('✅ ai-menus-grid DOM要素が存在');
      } else {
        console.error('❌ ai-menus-grid DOM要素が見つかりません');
      }
      
    } else {
      console.error(`❌ AIデータ取得失敗 (${response.status})`);
    }
  } catch (error) {
    console.error('❌ AIデータ取得エラー:', error);
  }
}

// ページロード後にテスト実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', testAITab);
} else {
  testAITab();
}
