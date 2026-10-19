/**
 * メイン画面の設定（栄養目標と、追加するメニューの上限）
 *
 * 端末の localStorage に保存する。壊れた値や古い形の値は、項目ごとに初期値で補う。
 */

import { TARGET_FIELDS, type TargetKey, type Targets } from './nutrition.ts';

export const SETTINGS_STORAGE_KEY = 'kyowa-optimizer-settings';

export interface TargetSetting {
  enabled: boolean;
  value: number;
}

export interface Settings {
  targets: Record<TargetKey, TargetSetting>;
  /** 追加で選ぶメニューの上限（固定メニューは数えない） */
  maxAdditional: number;
}

export const MAX_ADDITIONAL_RANGE = { min: 1, max: 20 } as const;

export function defaultSettings(): Settings {
  return {
    targets: Object.fromEntries(
      TARGET_FIELDS.map((field) => [field.key, { enabled: true, value: field.defaultValue }]),
    ) as Record<TargetKey, TargetSetting>,
    maxAdditional: 5,
  };
}

function clampMaxAdditional(value: number): number {
  return Math.min(MAX_ADDITIONAL_RANGE.max, Math.max(MAX_ADDITIONAL_RANGE.min, Math.round(value)));
}

/** 保存されていた JSON 文字列を読む。読めない項目は初期値にする */
export function parseSettings(raw: string | null): Settings {
  const settings = defaultSettings();
  if (!raw) return settings;

  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return settings;
  }
  if (typeof saved !== 'object' || saved === null) return settings;
  const { targets, maxAdditional } = saved as { targets?: unknown; maxAdditional?: unknown };

  if (typeof maxAdditional === 'number' && Number.isFinite(maxAdditional)) {
    settings.maxAdditional = clampMaxAdditional(maxAdditional);
  }
  if (typeof targets === 'object' && targets !== null) {
    for (const field of TARGET_FIELDS) {
      const item = (targets as Record<string, unknown>)[field.key];
      if (typeof item !== 'object' || item === null) continue;
      const { enabled, value } = item as { enabled?: unknown; value?: unknown };
      if (typeof enabled === 'boolean') settings.targets[field.key].enabled = enabled;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) settings.targets[field.key].value = value;
    }
  }
  return settings;
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/** 有効にした目標だけを取り出す（最適化に渡す形） */
export function activeTargets(settings: Settings): Targets {
  const targets: Targets = {};
  for (const field of TARGET_FIELDS) {
    const { enabled, value } = settings.targets[field.key];
    if (enabled && value > 0) targets[field.key] = value;
  }
  return targets;
}

export { clampMaxAdditional };
