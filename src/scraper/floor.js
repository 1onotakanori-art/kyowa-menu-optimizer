/**
 * 販売フロアの判定
 *
 * 共和食堂のサイトでは、2F でだけ売るメニューのカードに「2Fにて販売いたします」と書かれる
 * （カードの .menu-overview と詳細パネルの .menu-detail-overview）。
 * 表記がないメニューが必ず 1F とは限らないため、判定できるのは「2F のみ」だけ。
 * 2F 表記があれば '2F'、なければ null（フロアの表記なし）を返す。
 */

const SECOND_FLOOR = '2F';

/**
 * @param {...(string|null|undefined)} texts - 概要欄のテキスト（複数可）
 * @returns {'2F'|null}
 */
function detectFloor(...texts) {
  // NFKC で全角の「２Ｆ」も半角にそろえる。「12F」などの誤検出を避けるため直前が数字でないことを見る
  const text = texts.map(t => String(t ?? '')).join('\n').normalize('NFKC').toUpperCase();
  return /(^|[^0-9])2F/.test(text) ? SECOND_FLOOR : null;
}

module.exports = { detectFloor, SECOND_FLOOR };
