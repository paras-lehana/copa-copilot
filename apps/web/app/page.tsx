'use client';

// app/page.tsx — the fan dashboard. Single <h1>; section cards are <section> with
// their own <h2>; minor cards are plain <div> (the heading-hierarchy fix). Numbers
// come only from the API (the engine), never hard-coded here.

import { useState } from 'react';
import { crowdResponseSchema, egressResponseSchema, weatherResponseSchema } from '../lib/contracts';
import { apiPost } from '../lib/api-client';
import { useApi } from '../lib/use-api';
import { useSession } from '../lib/session';
import { catalog } from '../lib/strings';
import { DensityMeter, GlassCard, RetryCard, Skeleton, StatTile, StatusPill } from '../components/ui';

export default function DashboardPage() {
  const session = useSession();
  const strings = catalog(session.language);
  const [matchMinute, setMatchMinute] = useState(80);

  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=egress-surge&minute=${matchMinute}`,
    crowdResponseSchema,
    [session.venueId, matchMinute],
  );
  const weather = useApi(
    `/api/weather/${session.venueId}?preset=heat-dome&minute=${matchMinute}`,
    weatherResponseSchema,
    [session.venueId, matchMinute],
  );

  const [exitText, setExitText] = useState<string | undefined>(undefined);
  const [exitLoading, setExitLoading] = useState(false);

  async function loadExitAdvice() {
    setExitLoading(true);
    const result = await apiPost(
      '/api/egress/advice',
      { venueId: session.venueId, mode: 'rail' },
      egressResponseSchema,
    );
    setExitText(result.ok ? result.value.advice.explanation : result.message);
    setExitLoading(false);
  }

  const busiest = crowd.data?.snapshot.zones
    ? [...crowd.data.snapshot.zones].sort((a, b) => b.densityPct - a.densityPct)[0]
    : undefined;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: '4px 0' }}>{strings.appName}</h1>
        <p style={{ color: 'var(--text-dim)', margin: 0 }}>{strings.tagline}</p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="minute" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Match minute
        </label>
        <input
          id="minute"
          type="range"
          min={-60}
          max={135}
          value={matchMinute}
          onChange={(e) => setMatchMinute(Number(e.target.value))}
          aria-valuetext={`${matchMinute} minutes`}
          style={{ flex: 1, minWidth: 160 }}
        />
        <span aria-hidden="true">{matchMinute}&apos;</span>
      </div>

      <section aria-labelledby="crowd-h" className="glass" style={{ padding: 20 }}>
        <h2 id="crowd-h" style={{ marginTop: 0 }}>
          {strings.crowdNow}
        </h2>
        {crowd.loading && <Skeleton height={40} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {crowd.data !== undefined && (
          <>
            <p style={{ marginTop: 0, color: 'var(--text-dim)' }}>
              Phase: <strong>{crowd.data.snapshot.phase}</strong>
              {busiest !== undefined && (
                <>
                  {' '}
                  · busiest: <strong>{busiest.name}</strong> <StatusPill status={busiest.status} />
                </>
              )}
            </p>
            {crowd.data.snapshot.zones.slice(0, 5).map((z) => (
              <DensityMeter key={z.zoneId} label={z.name} pct={z.densityPct} status={z.status} />
            ))}
          </>
        )}
      </section>

      <section aria-labelledby="exit-h" className="glass" style={{ padding: 20 }}>
        <h2 id="exit-h" style={{ marginTop: 0 }}>
          {strings.bestExit} — beat the post-match rush
        </h2>
        <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
          The anti-MetLife feature: leave at the smartest minute instead of with the whole crowd.
        </p>
        {exitText === undefined ? (
          <button
            onClick={() => void loadExitAdvice()}
            disabled={exitLoading}
            aria-disabled={exitLoading}
            style={{ minHeight: 44, padding: '10px 18px', borderRadius: 10, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
          >
            {exitLoading ? 'Checking…' : 'Get my exit advice'}
          </button>
        ) : (
          <p role="status" style={{ fontWeight: 600 }}>
            {exitText}
          </p>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile
          label="Weather protocol"
          value={weather.data?.protocol.state ?? '—'}
          hint={
            weather.data !== undefined
              ? `Heat tier ${weather.data.protocol.heatTier} · ${weather.data.protocol.reading.heatIndexF}°F`
              : undefined
          }
        />
        <StatTile label="Your venue" value={session.venueId} hint={`Seat area ${session.sectionZoneId}`} />
        <StatTile label="Persona" value={session.persona} hint={`Access: ${session.accessibility}`} />
      </div>

      <GlassCard>
        <h2 style={{ marginTop: 0 }}>Not set up yet?</h2>
        <p style={{ color: 'var(--text-dim)' }}>
          Pick your venue, seat, language and accessibility needs so every answer fits you.
        </p>
        <a href="/onboarding" style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Go to onboarding →
        </a>
      </GlassCard>
    </div>
  );
}
