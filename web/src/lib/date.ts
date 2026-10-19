/**
 * 日付の扱い
 *
 * 日付は "YYYY-MM-DD"（ISO 形式の文字列）で持ち、表示するときだけ "10/30(金)" の形にする。
 * 「今日」は日本時間で決める。Date の toISOString() は UTC になり、日本時間の 0〜9 時に前日を指してしまうため使わない。
 * 曜日や日数の計算はタイムゾーンの影響を受けないよう UTC の暦で行う。
 */

export type ISODate = string;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const tokyoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 日本時間での「今日」 */
export function todayInTokyo(now: Date = new Date()): ISODate {
  return tokyoDateFormat.format(now);
}

function toUTCDate(date: ISODate): Date {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`日付の形式が正しくありません: ${date}`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** 曜日（0 = 日曜 … 6 = 土曜） */
export function weekdayOf(date: ISODate): number {
  return toUTCDate(date).getUTCDay();
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTCDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-30" → "10/30(金)" */
export function formatDateLabel(date: ISODate): string {
  const d = toUTCDate(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

/**
 * 初期表示する日付を選ぶ: 今日以降でメニューがある最初の日。
 * 土日や祝日はメニューがないので、自然に次の営業日が選ばれる。今日以降の日がなければ null。
 */
export function pickDefaultDate(availableDates: readonly ISODate[], today: ISODate): ISODate | null {
  return [...availableDates].filter((d) => d >= today).sort()[0] ?? null;
}
