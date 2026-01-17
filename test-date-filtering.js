#!/usr/bin/env node

/**
 * GitHub Pages フロントエンドの日付フィルタリングロジック テスト
 * Node.js で app.js の loadAvailableDates() ロジックをシミュレート
 */

// 本日の日付を取得（テスト用に固定值でも可）
const today = new Date();
const todayMonthDay = `${today.getMonth() + 1}/${today.getDate()}`;

console.log(`\n${'='.repeat(70)}`);
console.log('📅 GitHub Pages 日付フィルタリング テスト');
console.log(`${'='.repeat(70)}`);
console.log(`本日: ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 (${todayMonthDay})`);
console.log();

// available-dates.json から取得した日付リスト（実際のデータ）
const availableDates = [
  "1/19(月)",
  "1/20(火)",
  "1/21(水)",
  "1/22(木)",
  "1/23(金)"
];

console.log('📋 利用可能な日付（取得データ）:');
availableDates.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
console.log();

// フィルタリングロジック
const filteredDates = availableDates.filter(dateLabel => {
  const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return false;

  const [, month, day] = match;
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  // 本日以降か判定
  const isAfterOrToday = 
    monthNum > today.getMonth() + 1 ||
    (monthNum === today.getMonth() + 1 && dayNum >= today.getDate());

  console.log(`  検査: "${dateLabel}" → ${isAfterOrToday ? '✅ 本日以降' : '❌ 過去日付'}`);
  return isAfterOrToday;
});

console.log();
console.log('✅ フィルタリング後の日付（選択可能な日付）:');
if (filteredDates.length === 0) {
  console.log('  ❌ データなし');
} else {
  filteredDates.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
}
console.log();

// デフォルト日付の判定
const todayOption = filteredDates.find(d => d.startsWith(todayMonthDay));
const defaultDate = todayOption || filteredDates[0];

console.log('📌 デフォルト日付の選択:');
if (todayOption) {
  console.log(`  ✅ 本日の日付が見つかった: ${todayOption}`);
} else {
  console.log(`  ⚠️  本日のデータなし → 最初の利用可能日付: ${defaultDate}`);
}

console.log();
console.log('🎯 最終結果:');
console.log(`  ドロップダウン選択肢: ${filteredDates.length}個`);
console.log(`  デフォルト選択: ${defaultDate}`);
console.log();
console.log(`${'='.repeat(70)}`);
console.log('✨ テスト完了');
console.log(`${'='.repeat(70)}\n`);
