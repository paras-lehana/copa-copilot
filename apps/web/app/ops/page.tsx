'use client';

// ops/page.tsx — the organizer operations dashboard: density tiles, transit load,
// incident queue and the one-click AI Operations Briefing (with an honest cached flag).

import { useState } from 'react';
import { type BriefingResponse, briefingResponseSchema, crowdResponseSchema, incidentsResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { Button, DensityMeter, Muted, Panel, RetryCard, Skeleton, Stack, StatusPill } from '../../components/ui';
import { OPS_VIEW } from '../../lib/scenarios';

export default function OpsPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=${OPS_VIEW.scenario}&minute=${OPS_VIEW.minute}`,
    crowdResponseSchema,
    [session.venueId],
  );
  const incidents = useApi(`/api/incidents/${session.venueId}`, incidentsResponseSchema, [session.venueId]);

  const [briefing, setBriefing] = useState<BriefingResponse['briefing'] | undefined>(undefined);
  const [briefingBusy, setBriefingBusy] = useState(false);

  async function runBriefing() {
    setBriefingBusy(true);
    const result = await apiPost(
      '/api/ops/briefing',
      { venueId: session.venueId, scenario: OPS_VIEW.scenario, minute: OPS_VIEW.minute, windowMinutes: 15 },
      briefingResponseSchema,
    );
    if (result.ok) setBriefing(result.value.briefing);
    setBriefingBusy(false);
  }

  const transit = crowd.data?.snapshot.transit ?? [];
  const gates = crowd.data?.snapshot.zones.filter((z) => z.kind === 'gate') ?? [];

  return (
    <Stack>
      <div>
        <h1 className="mb-1">Operations — {session.venueId}</h1>
        <Muted className="mt-0">
          Scenario: <strong>gate bottleneck</strong> (the Arrowhead replay — 2 of 7 gates open).
        </Muted>
      </div>

      <Panel id="gates-h" title="Gate load" icon="🚧">
        {crowd.loading && <Skeleton height={80} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {gates.map((g) => (
          <DensityMeter key={g.zoneId} label={`${g.name} · queue ${g.queueMinutes} min`} pct={g.densityPct} status={g.status} />
        ))}
      </Panel>

      <Panel id="transit-h" title="Transit load" icon="🚉">
        {transit.map((t) => (
          <DensityMeter key={t.name} label={`${t.name} · wait ${t.waitMinutes} min`} pct={t.utilizationPct} status={t.status} />
        ))}
      </Panel>

      <Panel id="brief-h" title="AI Operations Briefing" icon="🧠">
        <Button onClick={() => void runBriefing()} disabled={briefingBusy} aria-disabled={briefingBusy}>
          {briefingBusy ? 'Generating…' : 'Generate briefing'}
        </Button>
        {briefing !== undefined && (
          <div role="status" className="mt-3">
            <p className="font-bold mb-2">
              {briefing.headline}{' '}
              <span className="text-xs font-normal text-[var(--text-dim)]">
                ({briefing.engine === 'gemini' ? 'Gemini' : 'demo engine'}
                {briefing.cached ? ', cached' : ''})
              </span>
            </p>
            {briefing.bullets.length > 0 && (
              <ul role="list" className="ps-5 list-disc">
                {briefing.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <p className="font-semibold mb-1">Top actions:</p>
            <ol className="ps-5 list-decimal">
              {briefing.topActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
        )}
      </Panel>

      <Panel id="inc-h" title="Incident queue (triage order)" icon="🚑">
        {incidents.loading && <Skeleton height={60} />}
        {incidents.data !== undefined && (
          <ul role="list" className="list-none p-0 m-0 grid gap-2">
            {incidents.data.incidents.map((inc) => (
              <li key={inc.id} className="glass-card p-3">
                <div className="flex items-center gap-2">
                  <StatusPill status={inc.severity === 'critical' || inc.severity === 'high' ? 'critical' : inc.severity === 'medium' ? 'busy' : 'comfortable'} />
                  <strong>{inc.category}</strong>
                  <span className="ms-auto text-xs text-[var(--text-dim)]">{inc.status}</span>
                </div>
                <p className="mt-1.5 mb-0">{inc.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Stack>
  );
}
