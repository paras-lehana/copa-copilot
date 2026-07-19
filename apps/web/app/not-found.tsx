import Link from 'next/link';
import { type ReactNode } from 'react';

export default function NotFound(): ReactNode {
  return (
    <div className="grid gap-3 p-6">
      <h1>Page not found</h1>
      <p className="text-[var(--text-dim)]">That route is not part of Copa Copilot.</p>
      <Link href="/" className="text-[var(--primary)] font-semibold">
        Return to the dashboard →
      </Link>
    </div>
  );
}
