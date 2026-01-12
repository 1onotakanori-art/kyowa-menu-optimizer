/**
 * 指定日付が平日かどうかを判定
 * @param {Date} date
 * @returns {boolean}
 */
function isWeekday(date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6; // 日曜(0)・土曜(6)を除外
}

/**
 * 直近の平日を取得
 * @param {Date} [startDate] - 基準日（デフォルト：今日）
 * @returns {Date} 直近の平日
 */
function getNearestWeekday(startDate = new Date()) {
  let date = new Date(startDate);
  
  // 既に平日なら返す
  if (isWeekday(date)) return date;
  
  // 次の平日を探す
  for (let i = 1; i <= 7; i++) {
    date.setDate(date.getDate() + 1);
    if (isWeekday(date)) return date;
  }
  
  throw new Error('直近の平日が見つかりません');
}

/**
 * 日付を "1/12(月)" 形式のラベルに変換
 * @param {Date} date
 * @returns {string} "1/12(月)" 形式
 */
function toDateLabel(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['(日)', '(月)', '(火)', '(水)', '(木)', '(金)', '(土)'];
  const weekday = weekdays[date.getDay()];
  return `${month}/${day}${weekday}`;
}

/**
 * "YYYY-MM-DD" 形式の文字列をDateに変換
 * 理由：UTC 解釈を避けるため、明示的に現地時刻で日付を作成
 * @param {string} dateString - "YYYY-MM-DD" 形式
 * @returns {Date}
 */
function parseDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  // new Date(year, month-1, day) はローカルタイムゾーンで Date を生成
  // ただし時刻は 00:00:00 なので、タイムゾーン計算は日付に影響しない
  const date = new Date(year, month - 1, day);
  // 念のため、タイムゾーンオフセットを考慮して正確な日付を取得
  // （元の実装が正しいが、明示的にコメント化）
  return date;
}

module.exports = {
  isWeekday,
  getNearestWeekday,
  toDateLabel,
  parseDate
};
