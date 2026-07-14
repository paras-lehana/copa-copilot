'use client';

// ui.tsx — the shared UI kit. One place for the glass card, buttons, stat tiles,
// density meters, skeletons and status pills so no scaffolding is copy-pasted.
// Every interactive element is a real control with a visible focus ring.

import { type ButtonHTMLAttributes, type ReactNode } from 'react';

/** A frosted surface card. Use `as="section"` for primary landmark regions only. */
export function GlassCard({
  children,
  className = '',
  labelledBy,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  as?: 'div' | 'section';
}): ReactNode {
  const Tag = as;
  return (
    <Tag
      className={`glass ${className}`}
      style={{ padding: 20 }}
      {...(as === 'section' && labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {})}
    >
      {children}
    </Tag>
  );
}

/** Primary/secondary button — always a real <button>, 44px min target. */
export function Button({
  children,
  variant = 'primary',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }): ReactNode {
  const base: React.CSSProperties = {
    minHeight: 44,
    minWidth: 44,
    padding: '10px 18px',
    borderRadius: 10,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--surface-edge)',
  };
  const styles: React.CSSProperties =
    variant === 'primary'
      ? { ...base, background: 'var(--primary)', color: 'var(--on-primary)', borderColor: 'transparent' }
      : { ...base, background: 'transparent', color: 'var(--text)' };
  return (
    <button style={styles} {...rest}>
      {children}
    </button>
  );
}

/** A labelled statistic tile. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): ReactNode {
  return (
    <div className="glass" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{hint}</div>
      )}
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
};

/** A status pill with an accessible text label (colour is never the only signal). */
export function StatusPill({ status }: { status: string }): ReactNode {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--on-primary)',
        background: STATUS_COLOR[status] ?? 'var(--text-dim)',
      }}
    >
      {status}
    </span>
  );
}

/**
 * A density meter with role="meter" and correct aria-valuenow (documented off-by-one
 * fix: valuenow is the exact percent, valuemin 0, valuemax 100).
 */
export function DensityMeter({ label, pct, status }: { label: string; pct: number; status: string }): ReactNode {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span aria-hidden="true">{pct}%</span>
      </div>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} occupancy ${pct} percent, ${status}`}
        style={{ height: 10, borderRadius: 999, background: 'var(--surface-edge)', overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: STATUS_COLOR[status] ?? 'var(--primary)',
          }}
        />
      </div>
    </div>
  );
}

/** A loading skeleton block. */
export function Skeleton({ height = 20 }: { height?: number }): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="glass"
      style={{ height, borderRadius: 8, opacity: 0.5, marginBottom: 8 }}
    />
  );
}

/** An error card with a retry button and a role=alert live region. */
export function RetryCard({ message, onRetry }: { message: string; onRetry: () => void }): ReactNode {
  return (
    <div className="glass" role="alert" style={{ padding: 18 }}>
      <p style={{ margin: '0 0 12px' }}>{message}</p>
      <Button variant="ghost" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
