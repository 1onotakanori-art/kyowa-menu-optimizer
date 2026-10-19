import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}

/** データがない・準備中などを伝える表示 */
export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-surface-muted text-fg-muted">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-muted">{children}</div>}
    </div>
  );
}
