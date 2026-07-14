'use client';

// missions/page.tsx — operational missions with engine-computed impact. Completing
// a mission calls the API, which validates the claim and returns the real award; the
// points shown come back from the engine, never invented on the client.

import { useState } from 'react';
import { missionsResponseSchema, profileSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { z } from 'zod';
import { RetryCard, Skeleton, StatTile } from '../../components/ui';
import { catalog } from '../../lib/strings';

const awardSchema = z.object({
  award: z.object({ missionId: z.string(), points: z.number(), reason: z.string() }),
  profile: profileSchema.shape.profile,
});

/** Valid demo claim per mission so judges can complete each in one click. */
const DEMO_CLAIM: Record<string, Record<string, unknown>> = {
  'beat-the-rush': { minute: -100 },
  'green-footprint': { minute: -60, commuteMode: 'rail', commuteDistanceKm: 15 },
  'smart-exit': { minute: 82, advisedLeaveMinute: 82 },
  'refill-run': { minute: 50, heatProtocolActive: true },
  'route-follow': { minute: 30 },
};

export default function MissionsPage() {
  const session = useSession();
  const strings = catalog(session.language);
  const missions = useApi('/api/missions', missionsResponseSchema);
  const [points, setPoints] = useState(session.profile?.points ?? 0);
  const [level, setLevel] = useState(session.profile?.level ?? 1);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<Set<string>>(new Set(session.profile?.completedMissions ?? []));

  async function complete(missionId: string) {
    if (session.profile === undefined) {
      setFeedback('Finish onboarding first so we can track your points.');
      return;
    }
    const result = await apiPost(
      '/api/missions/complete',
      { userId: session.profile.userId, missionId, ...DEMO_CLAIM[missionId] },
      awardSchema,
    );
    if (result.ok) {
      setPoints(result.value.profile.points);
      setLevel(result.value.profile.level);
      setDone((d) => new Set(d).add(missionId));
      setFeedback(`+${result.value.award.points}: ${result.value.award.reason}`);
      session.update({ profile: result.value.profile });
    } else {
      setFeedback(result.message);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>{strings.yourMissions}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Every mission changes a real operational metric — points are computed by the engine.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
        <StatTile label="Points" value={String(points)} />
        <StatTile label="Level" value={String(level)} />
        <StatTile label="Completed" value={`${done.size}/5`} />
      </div>

      {feedback !== undefined && (
        <p role="status" className="glass" style={{ padding: 12, fontWeight: 600 }}>
          {feedback}
        </p>
      )}

      <section aria-labelledby="m-h" className="glass" style={{ padding: 20 }}>
        <h2 id="m-h" style={{ marginTop: 0 }}>
          Missions
        </h2>
        {missions.loading && <Skeleton height={80} />}
        {missions.error !== undefined && <RetryCard message={missions.error} onRetry={missions.reload} />}
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {missions.data?.missions.map((m) => (
            <li key={m.id} className="glass" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <strong>{m.title}</strong>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>+{m.basePoints} base</span>
                {done.has(m.id) && <span style={{ marginInlineStart: 'auto', color: 'var(--ok)' }}>✓ done</span>}
              </div>
              <p style={{ margin: '6px 0 10px', color: 'var(--text-dim)' }}>{m.description}</p>
              <button
                onClick={() => void complete(m.id)}
                disabled={done.has(m.id)}
                aria-disabled={done.has(m.id)}
                style={{ minHeight: 44, padding: '8px 16px', borderRadius: 10, background: done.has(m.id) ? 'var(--surface-edge)' : 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: done.has(m.id) ? 'default' : 'pointer' }}
              >
                {done.has(m.id) ? 'Completed' : 'Complete mission'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
