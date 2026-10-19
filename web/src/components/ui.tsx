/**
 * 小さな共通部品（ボタン、スイッチ、カード、バッジ、読み込み中・エラーの表示）
 */

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, type LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-muted disabled:opacity-50',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50',
  danger: 'text-danger hover:bg-danger-subtle disabled:opacity-50',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}

export function Button({ variant = 'secondary', icon: Icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** ラベルを画面に出さず、読み上げ用だけにする */
  hideLabel?: boolean;
}

/** オン / オフのスイッチ。押せる範囲は 44px 以上 */
export function Switch({ checked, onChange, label, hideLabel = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-fg-muted"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-6 w-10 rounded-full border transition-colors ${
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-[18px] rounded-full shadow-sm transition-transform ${
            checked ? 'translate-x-4 bg-accent-fg' : 'bg-fg-muted'
          }`}
        />
      </span>
      {!hideLabel && label}
    </button>
  );
}

interface CardProps {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, icon: Icon, action, children, className = '' }: CardProps) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center gap-2">
          {title && (
            <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold">
              {Icon && <Icon className="size-4 text-fg-muted" aria-hidden="true" />}
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'info' | 'danger' | 'warning';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  info: 'bg-info-subtle text-info',
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
};

export function Badge({ tone = 'neutral', icon: Icon, children }: { tone?: BadgeTone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {children}
    </div>
  );
}

export function ErrorMessage({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-sm text-danger sm:flex-row sm:items-center">
      <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
      <p className="mr-auto">{children}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          もう一度読み込む
        </Button>
      )}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  value: number;
  /** 正しい数値が入力されたときだけ呼ぶ */
  onCommit: (value: number) => void;
  isValid?: (value: number) => boolean;
  inputMode?: 'decimal' | 'numeric';
  className?: string;
}

/**
 * 数値の入力欄。入力途中（空欄など）の文字列はこの中で持ち、正しい数値になったときだけ反映する。
 * フォーカスが外れたら、反映済みの値の表示に戻す。
 */
export function NumberField({ id, value, onCommit, isValid = (v) => v > 0, inputMode = 'decimal', className = '' }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const parsed = Number(text);
        if (text.trim() !== '' && Number.isFinite(parsed) && isValid(parsed)) onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
      className={`h-11 rounded-lg border border-border-strong bg-surface px-3 tabular-nums ${className}`}
    />
  );
}
