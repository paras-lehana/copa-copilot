'use client';

// ui.tsx — the shared UI kit in the StadiumFlow glass aesthetic. One place for the
// glass card, buttons, stat tiles, density meters, skeletons and status pills so no
// scaffolding is copy-pasted. Every interactive element is a real, focusable control.

import { type ButtonHTMLAttributes, type ReactNode } from 'react';

/** A frosted glass surface. Use `as="section"` for primary landmark regions only. */
export function GlassCard({
  children,
  className = '',
  labelledBy,
  glow = false,
  hover = false,
  as = 'div',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  glow?: boolean;
  hover?: boolean;
  as?: 'div' | 'section';
  onClick?: () => void;
}): ReactNode {
  const Tag = as;
  const cls = ['glass-card', 'p-5', glow ? 'glass-glow' : '', hover ? 'glass-card-hover' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag
      className={cls}
      {...(as === 'section' && labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {})}
      {...(onClick !== undefined ? { onClick } : {})}
    >
      {children}
    </Tag>
  );
}

/** Primary/secondary button — always a real <button>, 44px min target. */
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'gradient' }): ReactNode {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-[18px] py-2.5 rounded-xl font-semibold cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-[var(--primary)] text-[var(--on-primary)] border-0 shadow-lg',
    gradient:
      'bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white border-0 shadow-lg',
    ghost: 'bg-transparent text-[var(--text)] border border-[var(--surface-edge)]',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** A labelled statistic tile with a big number. */
export function StatTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}): ReactNode {
  return (
    <div className="glass-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{label}</div>
      <div className={`text-2xl font-black mt-1 ${accent ? 'text-[var(--primary)]' : ''}`}>{value}</div>
      {hint !== undefined && <div className="text-xs text-[var(--text-dim)] mt-0.5">{hint}</div>}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  comfortable: 'var(--ok)',
  busy: 'var(--busy)',
  critical: 'var(--danger)',
  low: 'var(--ok)',
  elevated: 'var(--busy)',
  high: 'var(--danger)',
  safe: 'var(--ok)',
  caution: 'var(--busy)',
};

/** A status pill with an accessible text label (colour is never the only signal). */
export function StatusPill({ status, label }: { status: string; label?: string }): ReactNode {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold"
      style={{ color: 'var(--on-primary)', background: STATUS_COLOR[status] ?? 'var(--text-dim)' }}
    >
      {label ?? status}
    </span>
  );
}

/** A density meter: role="meter" with correct aria-valuenow. */
export function DensityMeter({ label, pct, status }: { label: string; pct: number; status: string }): ReactNode {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[13px] mb-1">
        <span className="font-medium">{label}</span>
        <span aria-hidden="true" className="font-bold" style={{ color: STATUS_COLOR[status] ?? 'var(--primary)' }}>
          {pct}%
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} occupancy ${pct} percent, ${status}`}
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'color-mix(in srgb, var(--text-dim) 22%, transparent)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: STATUS_COLOR[status] ?? 'var(--primary)' }}
        />
      </div>
    </div>
  );
}

/** A loading skeleton block. */
export function Skeleton({ height = 20 }: { height?: number }): ReactNode {
  return <div aria-hidden="true" className="glass-card mb-2 opacity-50" style={{ height, borderRadius: 10 }} />;
}

/** An error card with a retry button and a role=alert live region. */
export function RetryCard({ message, onRetry }: { message: string; onRetry: () => void }): ReactNode {
  return (
    <div className="glass-card p-4" role="alert">
      <p className="mt-0 mb-3">{message}</p>
      <Button variant="ghost" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Section heading used across pages (renders an h2 with an anchor id). */
export function SectionTitle({ id, icon, children }: { id: string; icon?: string; children: ReactNode }): ReactNode {
  return (
    <h2 id={id} className="mt-0 mb-3 text-base font-bold flex items-center gap-2">
      {icon !== undefined && <span aria-hidden="true">{icon}</span>}
      {children}
    </h2>
  );
}
