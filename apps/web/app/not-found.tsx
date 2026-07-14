import Link from 'next/link';
import { type ReactNode } from 'react';

export default function NotFound(): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 12, padding: 24 }}>
      <h1>Page not found</h1>
      <p style={{ color: 'var(--text-dim)' }}>That route is not part of Copa Copilot.</p>
      <Link href="/" style={{ color: 'var(--primary)', fontWeight: 600 }}>
        Return to the dashboard →
      </Link>
    </div>
  );
}
