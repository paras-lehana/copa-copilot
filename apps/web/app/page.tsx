'use client';

// app/page.tsx — the fan dashboard as a Bento grid (StadiumFlow aesthetic).
// Single <h1>; primary regions are <section> with their own <h2>; minor cards are
// <div>. Every number comes from the API (the engine), never hard-coded here.

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { crowdResponseSchema, egressResponseSchema, weatherResponseSchema } from '../lib/contracts';
import { apiPost } from '../lib/api-client';
import { useApi } from '../lib/use-api';
import { useSession } from '../lib/session';
import { catalog } from '../lib/strings';
import { Button, DensityMeter, RetryCard, SectionTitle, Skeleton, StatusPill } from '../components/ui';
import { FAN_VIEW, WEATHER_PRESET } from '../lib/scenarios';

/** Staggered entrance — but a no-op under prefers-reduced-motion, so those users
 *  (and assistive-tech snapshots) get the final, static, full-contrast layout. */
function makeFade(reduce: boolean) {
  return (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: i * 0.05, duration: 0.4, ease: 'easeOut' as const },
        };
}

export default function DashboardPage() {
  const session = useSession();
  const strings = catalog(session.language);
  const fade = makeFade(useReducedMotion() ?? false);
  const [minute, setMinute] = useState(FAN_VIEW.minute);

  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=${FAN_VIEW.scenario}&minute=${minute}`,
    crowdResponseSchema,
    [session.venueId, minute],
  );
  const weather = useApi(
    `/api/weather/${session.venueId}?preset=${WEATHER_PRESET}&minute=${minute}`,
    weatherResponseSchema,
    [session.venueId, minute],
  );

  const [exit, setExit] = useState<{ text: string; saved: number } | undefined>(undefined);
  const [exitBusy, setExitBusy] = useState(false);

  async function loadExit() {
    setExitBusy(true);
    const r = await apiPost('/api/egress/advice', { venueId: session.venueId, mode: 'rail' }, egressResponseSchema);
    setExit(
      r.ok
        ? { text: r.value.advice.explanation, saved: r.value.advice.minutesSavedVsFullTime }
        : { text: r.message, saved: 0 },
    );
    setExitBusy(false);
  }

  const zones = crowd.data?.snapshot.zones ?? [];
  const busiest = zones.length > 0 ? [...zones].sort((a, b) => b.densityPct - a.densityPct)[0] : undefined;
  const criticalCount = zones.filter((z) => z.status === 'critical').length;

  return (
    <div className="grid gap-4">
      {/* Header + live banner */}
      <motion.div {...fade(0)}>
        <div className="flex items-center gap-2 text-xs text-[var(--text-dim)] mb-1">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: 'var(--danger)' }}
            aria-hidden="true"
          />
          <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--danger)' }}>
            Live
          </span>
          <span>· {session.venueId} · match minute {minute}&apos;</span>
        </div>
        <h1 className="m-0 text-3xl font-black">
          Copa <span className="text-gradient">Copilot</span>
        </h1>
        <p className="text-[var(--text-dim)] mt-1 mb-0">{strings.tagline}</p>
      </motion.div>

      {/* Match-minute scrubber */}
      <motion.div {...fade(1)} className="flex items-center gap-3 flex-wrap">
        <label htmlFor="minute" className="text-[13px] text-[var(--text-dim)] font-medium">
          Match minute
        </label>
        <input
          id="minute"
          type="range"
          min={-60}
          max={135}
          value={minute}
          onChange={(e) => setMinute(Number(e.target.value))}
          aria-valuetext={`${minute} minutes`}
          className="flex-1 min-w-[160px] accent-[var(--primary)]"
        />
        <span aria-hidden="true" className="font-bold tabular-nums">
          {minute}&apos;
        </span>
      </motion.div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Crowd — spans wide */}
        <motion.section {...fade(2)} aria-labelledby="crowd-h" className="glass-card glass-card-hover p-5 col-span-2 md:col-span-2 row-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle id="crowd-h" icon="👥">
              {strings.crowdNow}
            </SectionTitle>
            {criticalCount > 0 && <StatusPill status="critical" label={`${criticalCount} critical`} />}
          </div>
          {crowd.loading && <Skeleton height={140} />}
          {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
          {crowd.data !== undefined && (
            <>
              <p className="mt-0 mb-3 text-[var(--text-dim)] text-sm">
                Phase <strong className="text-[var(--text)]">{crowd.data.snapshot.phase}</strong>
                {busiest !== undefined && (
                  <>
                    {' '}
                    · busiest <strong className="text-[var(--text)]">{busiest.name}</strong>
                  </>
                )}
              </p>
              {zones.slice(0, 6).map((z) => (
                <DensityMeter key={z.zoneId} label={z.name} pct={z.densityPct} status={z.status} />
              ))}
            </>
          )}
        </motion.section>

        {/* Assistant promo */}
        <motion.div {...fade(3)} className="glass-card glass-glow glass-card-hover p-5 col-span-2 md:col-span-2 row-span-2 flex flex-col">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center text-base">
              ✨
            </span>
            <div>
              <h2 className="text-base font-bold m-0">FlowSphere Assistant</h2>
              <p className="text-[10px] text-[var(--text-dim)] m-0">Gemini via llm-service · grounded</p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-dim)] mb-3">
            Ask about routes, queues, exits, weather or tickets — answered from live venue data in your language.
          </p>
          <div className="space-y-2 flex-1">
            {["What's the safest route to my seat?", 'When should I leave for the train?', 'Will my resale ticket work?'].map(
              (q) => (
                <Link
                  key={q}
                  href="/assistant"
                  className="block text-xs px-3 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text-dim)_10%,transparent)] text-[var(--text-dim)] border border-[var(--surface-edge)] hover:border-[var(--primary)] hover:text-[var(--text)] transition-all no-underline"
                >
                  &ldquo;{q}&rdquo;
                </Link>
              ),
            )}
          </div>
          <Link
            href="/assistant"
            className="mt-3 w-full text-center py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white font-semibold no-underline shadow-lg"
          >
            Open the assistant ✨
          </Link>
        </motion.div>

        {/* Exit advisor — the anti-MetLife hero */}
        <motion.section {...fade(4)} aria-labelledby="exit-h" className="glass-card glass-card-hover p-5 col-span-2 md:col-span-2">
          <SectionTitle id="exit-h" icon="🚉">
            {strings.bestExit}
          </SectionTitle>
          <p className="text-xs text-[var(--text-dim)] mt-0 mb-3">
            Beat the post-match rush — leave at the smartest minute, not with the whole crowd.
          </p>
          {exit === undefined ? (
            <Button onClick={() => void loadExit()} disabled={exitBusy} aria-disabled={exitBusy}>
              {exitBusy ? 'Checking…' : 'Get my exit advice'}
            </Button>
          ) : (
            <div role="status">
              <p className="font-semibold m-0">{exit.text}</p>
              {exit.saved > 0 && (
                <p className="mt-2 mb-0 text-[var(--ok)] font-bold text-lg">You save ~{exit.saved} min ⚡</p>
              )}
            </div>
          )}
        </motion.section>

        {/* Weather tile */}
        <motion.div {...fade(5)} className="glass-card p-4 col-span-1">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] m-0 mb-1">🌦️ Weather</h3>
          <p className="text-lg font-black m-0 capitalize">{weather.data?.protocol.state ?? '—'}</p>
          {weather.data !== undefined && (
            <p className="text-[11px] text-[var(--text-dim)] m-0 mt-0.5">
              {weather.data.protocol.heatTier} · {weather.data.protocol.reading.heatIndexF}°F
            </p>
          )}
        </motion.div>

        {/* Venue tile */}
        <motion.div {...fade(6)} className="glass-card p-4 col-span-1">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] m-0 mb-1">🎟️ You</h3>
          <p className="text-sm font-bold m-0 capitalize">{session.persona}</p>
          <p className="text-[11px] text-[var(--text-dim)] m-0 mt-0.5">
            {session.sectionZoneId} · {session.accessibility}
          </p>
        </motion.div>

        {/* Setup nudge */}
        <motion.div {...fade(7)} className="glass-card glass-card-hover p-5 col-span-2 md:col-span-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold m-0">Make it yours</h2>
              <p className="text-xs text-[var(--text-dim)] m-0">
                Pick your venue, seat, language and accessibility needs so every answer fits you.
              </p>
            </div>
            <Link href="/onboarding" className="text-[var(--primary)] font-semibold no-underline">
              Go to onboarding →
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
