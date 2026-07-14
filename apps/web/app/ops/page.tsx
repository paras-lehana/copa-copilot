'use client';

// ops/page.tsx — the organizer operations dashboard: density tiles, transit load,
// incident queue and the one-click AI Operations Briefing (with an honest cached flag).

import { useState } from 'react';
import { briefingResponseSchema, crowdResponseSchema, incidentsResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { DensityMeter, RetryCard, Skeleton, StatusPill } from '../../components/ui';

export default function OpsPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=gate-bottleneck&minute=-30`,
    crowdResponseSchema,
    [session.venueId],
  );
  const incidents = useApi(`/api/incidents/${session.venueId}`, incidentsResponseSchema, [session.venueId]);

  const [briefing, setBriefing] = useState<
    { headline: string; bullets: string[]; topActions: string[]; cached: boolean; engine: string } | undefined
  >(undefined);
  const [briefingBusy, setBriefingBusy] = useState(false);

  async function runBriefing() {
    setBriefingBusy(true);
    const result = await apiPost(
      '/api/ops/briefing',
      { venueId: session.venueId, scenario: 'gate-bottleneck', minute: -30, windowMinutes: 15 },
      briefingResponseSchema,
    );
    if (result.ok) setBriefing(result.value.briefing);
    setBriefingBusy(false);
  }

  const transit = crowd.data?.snapshot.transit ?? [];
  const gates = crowd.data?.snapshot.zones.filter((z) => z.kind === 'gate') ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Operations — {session.venueId}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Scenario: <strong>gate bottleneck</strong> (the Arrowhead replay — 2 of 7 gates open).
      </p>

      <section aria-labelledby="gates-h" className="glass" style={{ padding: 20 }}>
        <h2 id="gates-h" style={{ marginTop: 0 }}>
          Gate load
        </h2>
        {crowd.loading && <Skeleton height={80} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {gates.map((g) => (
          <DensityMeter key={g.zoneId} label={`${g.name} · queue ${g.queueMinutes} min`} pct={g.densityPct} status={g.status} />
        ))}
      </section>

      <section aria-labelledby="transit-h" className="glass" style={{ padding: 20 }}>
        <h2 id="transit-h" style={{ marginTop: 0 }}>
          Transit load
        </h2>
        {transit.map((t) => (
          <DensityMeter key={t.name} label={`${t.name} · wait ${t.waitMinutes} min`} pct={t.utilizationPct} status={t.status} />
        ))}
      </section>

      <section aria-labelledby="brief-h" className="glass" style={{ padding: 20 }}>
        <h2 id="brief-h" style={{ marginTop: 0 }}>
          AI Operations Briefing
        </h2>
        <button
          onClick={() => void runBriefing()}
          disabled={briefingBusy}
          aria-disabled={briefingBusy}
          style={{ minHeight: 44, padding: '10px 18px', borderRadius: 10, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          {briefingBusy ? 'Generating…' : 'Generate briefing'}
        </button>
        {briefing !== undefined && (
          <div role="status" style={{ marginTop: 12 }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>
              {briefing.headline}{' '}
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>
                ({briefing.engine === 'gemini' ? 'Gemini' : 'demo engine'}
                {briefing.cached ? ', cached' : ''})
              </span>
            </p>
            {briefing.bullets.length > 0 && (
              <ul role="list" style={{ paddingInlineStart: 20 }}>
                {briefing.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Top actions:</p>
            <ol style={{ paddingInlineStart: 20 }}>
              {briefing.topActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section aria-labelledby="inc-h" className="glass" style={{ padding: 20 }}>
        <h2 id="inc-h" style={{ marginTop: 0 }}>
          Incident queue (triage order)
        </h2>
        {incidents.loading && <Skeleton height={60} />}
        {incidents.data !== undefined && (
          <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {incidents.data.incidents.map((inc) => (
              <li key={inc.id} className="glass" style={{ padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusPill status={inc.severity === 'critical' || inc.severity === 'high' ? 'critical' : inc.severity === 'medium' ? 'busy' : 'comfortable'} />
                  <strong>{inc.category}</strong>
                  <span style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{inc.status}</span>
                </div>
                <p style={{ margin: '6px 0 0' }}>{inc.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
