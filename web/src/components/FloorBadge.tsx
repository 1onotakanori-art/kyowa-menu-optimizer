import { isSecondFloorOnly, type Menu } from '../lib/nutrition.ts';
import { Badge } from './ui.tsx';

/** 2F でのみ販売するメニューに付けるバッジ。表記のないメニューには何も出さない（1F とは限らないため） */
export function FloorBadge({ menu }: { menu: Pick<Menu, 'floor'> | null | undefined }) {
  if (!isSecondFloorOnly(menu)) return null;
  return (
    <Badge tone="warning">
      <span aria-hidden="true">2F</span>
      <span className="sr-only">2F でのみ販売</span>
    </Badge>
  );
}
