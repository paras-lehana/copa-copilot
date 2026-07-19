'use client';

// map/page.tsx — venue map driven by the stadium graph + live density, with a
// screen-reader text list twin (the map is never the only channel). A route can be
// computed and its legs listed. Zones are coloured by density tier.

import { useState } from 'react';
import { crowdResponseSchema, routeResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { Button, DensityMeter, RetryCard, Skeleton, StatusPill } from '../../components/ui';
import { CALM_VIEW } from '../../lib/scenarios';

const STATUS_FILL: Record<string, string> = {
  comfortable: 'var(--ok)',
  busy: 'var(--busy)',
  critical: 'var(--danger)',
};

export default function MapPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=${CALM_VIEW.scenario}&minute=${CALM_VIEW.minute}`,
    crowdResponseSchema,
    [session.venueId],
  );
  const [route, setRoute] = useState<
    { legs: { toZoneName: string; meters: number; stepFree: boolean; zoneStatus: string; instruction: string }[]; explanation: string; risk: string } | undefined
  >(undefined);
  const [routeError, setRouteError] = useState<string | undefined>(undefined);

  async function computeRoute() {
    setRouteError(undefined);
    const profile = session.accessibility;
    const result = await apiPost(
      '/api/routing/recommend',
      {
        venueId: session.venueId,
        fromZoneId: 'gate-a',
        toZoneId: session.sectionZoneId.startsWith('sec-') ? session.sectionZoneId : 'sec-124',
        profile,
      },
      routeResponseSchema,
    );
    if (result.ok) setRoute(result.value.route);
    else setRouteError(result.message);
  }

  const zones = crowd.data?.snapshot.zones ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Stadium map — {session.venueId}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Zones are shaded by live density. Use the list below with a screen reader, or compute a route
        that respects your accessibility profile ({session.accessibility}).
      </p>

      <section aria-labelledby="map-h" className="glass" style={{ padding: 20 }}>
        <h2 id="map-h" style={{ marginTop: 0 }}>
          Live density map
        </h2>
        {crowd.loading && <Skeleton height={180} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {crowd.data !== undefined && (
          <svg
            viewBox="0 0 320 200"
            role="img"
            aria-label={`Schematic of ${session.venueId} with ${zones.length} zones coloured by crowd density.`}
            style={{ width: '100%', maxWidth: 520, height: 'auto' }}
          >
            <ellipse cx="160" cy="100" rx="150" ry="90" fill="none" stroke="var(--surface-edge)" strokeWidth="2" />
            <rect x="120" y="70" width="80" height="60" rx="6" fill="var(--surface-edge)" opacity="0.4" />
            {zones.slice(0, 10).map((z, i) => {
              const angle = (i / Math.min(10, zones.length)) * Math.PI * 2;
              const cx = 160 + Math.cos(angle) * 120;
              const cy = 100 + Math.sin(angle) * 70;
              return (
                <circle
                  key={z.zoneId}
                  cx={cx}
                  cy={cy}
                  r={9}
                  fill={STATUS_FILL[z.status] ?? 'var(--primary)'}
                >
                  <title>{`${z.name}: ${z.densityPct}% (${z.status})`}</title>
                </circle>
              );
            })}
          </svg>
        )}
      </section>

      <section aria-labelledby="list-h" className="glass" style={{ padding: 20 }}>
        <h2 id="list-h" style={{ marginTop: 0 }}>
          Zones (text list)
        </h2>
        {zones.length === 0 ? (
          <Skeleton />
        ) : (
          <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {zones.map((z) => (
              <li key={z.zoneId}>
                <DensityMeter label={`${z.name} (${z.kind})`} pct={z.densityPct} status={z.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="route-h" className="glass" style={{ padding: 20 }}>
        <h2 id="route-h" style={{ marginTop: 0 }}>
          Route to my seat
        </h2>
        <Button onClick={() => void computeRoute()}>Compute {session.accessibility} route</Button>
        {routeError !== undefined && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {routeError}
          </p>
        )}
        {route !== undefined && (
          <div style={{ marginTop: 12 }}>
            <p role="status" style={{ fontWeight: 600 }}>
              {route.explanation} <StatusPill status={route.risk === 'safe' ? 'comfortable' : route.risk === 'caution' ? 'busy' : 'critical'} />
            </p>
            <ol style={{ paddingInlineStart: 20 }}>
              {route.legs.map((leg, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {leg.instruction} {leg.stepFree ? '♿ step-free' : '↑ stairs'}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
