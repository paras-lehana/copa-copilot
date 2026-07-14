// ui.test.tsx — M30: the shared UI primitives render with correct a11y semantics.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, DensityMeter, RetryCard, StatTile, StatusPill } from '../ui';

describe('Button', () => {
  it('renders a real button meeting the 44px target', () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toBeInTheDocument();
    // The 44px min touch target is enforced via utility classes.
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('forwards click handlers', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('DensityMeter', () => {
  it('exposes an ARIA meter with the exact value (no off-by-one)', () => {
    render(<DensityMeter label="Gate A" pct={73} status="busy" />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '73');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-label', expect.stringContaining('busy'));
  });
});

describe('StatusPill', () => {
  it('shows the status as text, not colour alone', () => {
    render(<StatusPill status="critical" />);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it('renders label, value and optional hint', () => {
    render(<StatTile label="Points" value="120" hint="Level 2" />);
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
  });
});

describe('RetryCard', () => {
  it('is an alert with a working retry button', () => {
    const onRetry = vi.fn();
    render(<RetryCard message="Network down" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    screen.getByRole('button', { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
