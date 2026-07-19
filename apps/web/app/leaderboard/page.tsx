'use client';

// leaderboard/page.tsx — section/venue/tournament boards + greenest sections.
// Scope tabs use a real tablist; the board is an accessible table.

import { useState } from 'react';
import { leaderboardResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { Panel, RetryCard, Skeleton, Stack } from '../../components/ui';

type Scope = 'section' | 'venue' | 'tournament';
const SCOPES: readonly Scope[] = ['section', 'venue', 'tournament'];

export default function LeaderboardPage() {
  const session = useSession();
  const [scope, setScope] = useState<Scope>('venue');
  const query = new URLSearchParams({ scope, venueId: session.venueId, sectionZoneId: session.sectionZoneId });
  if (session.profile !== undefined) query.set('userId', session.profile.userId);
  const board = useApi(`/api/leaderboard?${query.toString()}`, leaderboardResponseSchema, [scope, session.venueId]);

  return (
    <Stack>
      <h1 className="mb-0">Leaderboards</h1>
      <p className="text-[var(--text-dim)] mt-0">
        Fans and stands ranked by operational impact and sustainability.
      </p>

      <div role="tablist" aria-label="Leaderboard scope" className="flex gap-2">
        {SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={`min-h-[44px] px-4 py-2 rounded-full cursor-pointer font-semibold capitalize border border-[var(--surface-edge)] ${
              scope === s ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'bg-transparent text-[var(--text)]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Panel id="board-h" title={`Top fans — ${scope}`} icon="🏆">
        {board.loading && <Skeleton height={120} />}
        {board.error !== undefined && <RetryCard message={board.error} onRetry={board.reload} />}
        {board.data !== undefined && board.data.page.top.length === 0 && (
          <p>No entries yet — complete a mission to appear here.</p>
        )}
        {board.data !== undefined && board.data.page.top.length > 0 && (
          <table className="w-full border-collapse">
            <caption className="text-start text-[var(--text-dim)] mb-2">
              {board.data.page.totalEntries} fans ranked
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-start">Rank</th>
                <th scope="col" className="text-start">Fan</th>
                <th scope="col" className="text-end">Points</th>
                <th scope="col" className="text-end">kg CO₂e</th>
              </tr>
            </thead>
            <tbody>
              {board.data.page.top.map((row) => (
                <tr key={row.userId}>
                  <td>{row.rank}</td>
                  <td>{row.displayName}</td>
                  <td className="text-end">{row.points}</td>
                  <td className="text-end">{row.kgCo2eSaved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {board.data !== undefined && board.data.greenestSections.length > 0 && (
        <Panel id="green-h" title="Greenest sections" icon="🌱">
          <ul role="list" className="ps-5">
            {board.data.greenestSections.map((s) => (
              <li key={s.sectionZoneId}>
                {s.sectionZoneId}: {s.totalKgCo2eSaved} kg CO₂e saved
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Stack>
  );
}
