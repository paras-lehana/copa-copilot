'use client';

// leaderboard/page.tsx — section/venue/tournament boards + greenest sections.
// Scope tabs use a real tablist; the board is an accessible table.

import { useState } from 'react';
import { leaderboardResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { RetryCard, Skeleton } from '../../components/ui';

type Scope = 'section' | 'venue' | 'tournament';
const SCOPES: readonly Scope[] = ['section', 'venue', 'tournament'];

export default function LeaderboardPage() {
  const session = useSession();
  const [scope, setScope] = useState<Scope>('venue');
  const query = new URLSearchParams({ scope, venueId: session.venueId, sectionZoneId: session.sectionZoneId });
  if (session.profile !== undefined) query.set('userId', session.profile.userId);
  const board = useApi(`/api/leaderboard?${query.toString()}`, leaderboardResponseSchema, [scope, session.venueId]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Leaderboards</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Fans and stands ranked by operational impact and sustainability.
      </p>

      <div role="tablist" aria-label="Leaderboard scope" style={{ display: 'flex', gap: 8 }}>
        {SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            style={{
              minHeight: 44,
              padding: '8px 16px',
              borderRadius: 999,
              cursor: 'pointer',
              fontWeight: 600,
              textTransform: 'capitalize',
              background: scope === s ? 'var(--primary)' : 'transparent',
              color: scope === s ? 'var(--on-primary)' : 'var(--text)',
              border: '1px solid var(--surface-edge)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <section aria-labelledby="board-h" className="glass" style={{ padding: 20 }}>
        <h2 id="board-h" style={{ marginTop: 0 }}>
          Top fans — {scope}
        </h2>
        {board.loading && <Skeleton height={120} />}
        {board.error !== undefined && <RetryCard message={board.error} onRetry={board.reload} />}
        {board.data !== undefined && board.data.page.top.length === 0 && (
          <p>No entries yet — complete a mission to appear here.</p>
        )}
        {board.data !== undefined && board.data.page.top.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ textAlign: 'start', color: 'var(--text-dim)', marginBottom: 8 }}>
              {board.data.page.totalEntries} fans ranked
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'start' }}>Rank</th>
                <th scope="col" style={{ textAlign: 'start' }}>Fan</th>
                <th scope="col" style={{ textAlign: 'end' }}>Points</th>
                <th scope="col" style={{ textAlign: 'end' }}>kg CO₂e</th>
              </tr>
            </thead>
            <tbody>
              {board.data.page.top.map((row) => (
                <tr key={row.userId}>
                  <td>{row.rank}</td>
                  <td>{row.displayName}</td>
                  <td style={{ textAlign: 'end' }}>{row.points}</td>
                  <td style={{ textAlign: 'end' }}>{row.kgCo2eSaved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {board.data !== undefined && board.data.greenestSections.length > 0 && (
        <section aria-labelledby="green-h" className="glass" style={{ padding: 20 }}>
          <h2 id="green-h" style={{ marginTop: 0 }}>
            Greenest sections
          </h2>
          <ul role="list" style={{ paddingInlineStart: 20 }}>
            {board.data.greenestSections.map((s) => (
              <li key={s.sectionZoneId}>
                {s.sectionZoneId}: {s.totalKgCo2eSaved} kg CO₂e saved
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
