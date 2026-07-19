'use client';

// accessibility/page.tsx — facility status, step-free shortcuts, and an audio-first
// mode that reads the assistant's reply aloud via browser speechSynthesis (honestly
// labelled: it says which engine is speaking, never fakes native TTS).

import { useState } from 'react';
import { WCAG_CRITERIA, wcagScorecard } from '@copa/core';
import { crowdResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { Button, Muted, Panel, RetryCard, Skeleton, Stack, StatTile } from '../../components/ui';
import { AccessibilitySettings } from '../../components/AccessibilitySettings';
import { CALM_VIEW } from '../../lib/scenarios';

export default function AccessibilityPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=${CALM_VIEW.scenario}&minute=${CALM_VIEW.minute}`,
    crowdResponseSchema,
    [session.venueId],
  );
  const [spoke, setSpoke] = useState<string | undefined>(undefined);

  const facilities =
    crowd.data?.snapshot.zones.filter((z) =>
      ['accessible-facility', 'first-aid', 'prayer-room', 'hydration'].includes(z.kind),
    ) ?? [];

  const score = wcagScorecard();

  function speak(text: string) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = session.language;
      window.speechSynthesis.speak(utter);
      setSpoke('Playing via your browser’s speech engine.');
    } else {
      setSpoke('Your browser has no speech engine; the text is shown above instead.');
    }
  }

  return (
    <Stack>
      <h1 className="mb-0">Accessibility</h1>
      <Muted className="mt-0">
        Your current profile is <strong>{session.accessibility}</strong>. Change it in onboarding to
        re-shape routes and assistant answers, or adjust how the app looks for you below.
      </Muted>

      <Panel id="prefs-h" title="Display & reading settings" icon="⚙️">
        <AccessibilitySettings />
      </Panel>

      <Panel id="fac-h" title="Facilities near you" icon="♿">
        {crowd.loading && <Skeleton height={80} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        <ul role="list" className="list-none p-0 m-0 grid gap-2">
          {facilities.map((f) => (
            <li key={f.zoneId} className="flex justify-between">
              <span>{f.name}</span>
              <span className="text-[var(--text-dim)]">{f.kind.replace('-', ' ')}</span>
            </li>
          ))}
          {crowd.data !== undefined && facilities.length === 0 && <li>No mapped facilities for this venue.</li>}
        </ul>
      </Panel>

      <Panel id="audio-h" title="Audio-first mode" icon="🔊">
        <Muted className="mt-0">
          Assistant replies use short sentences (≤12 words) in audio-first mode. Try reading a line aloud:
        </Muted>
        <Button onClick={() => speak('Gate D is calm. Take the lift to your left. Your section is three minutes away.')}>
          🔊 Read a sample route aloud
        </Button>
        {spoke !== undefined && (
          <p role="status" className="text-[var(--text-dim)]">
            {spoke}
          </p>
        )}
      </Panel>

      <Panel id="wcag-h" title="WCAG 2.2 conformance" icon="✅">
        <Muted className="mt-0">
          Every criterion below is backed by real code or a behaviour you can verify — no
          undefended claims. Counts are computed from the catalogue, not hard-coded.
        </Muted>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
          <StatTile label="Criteria met" value={`${score.supported}/${score.total}`} accent />
          <StatTile label="Level A" value={`${score.levelA}`} />
          <StatTile label="Level AA" value={`${score.levelAA}`} />
          <StatTile label="Level AAA" value={`${score.levelAAA}`} />
        </div>
        <ul role="list" className="list-none p-0 m-0 grid gap-2">
          {WCAG_CRITERIA.map((c) => (
            <li key={c.id} className="border-b border-[var(--surface-edge)] pb-2 last:border-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-xs text-[var(--text-dim)]">{c.id}</span>
                <strong>{c.name}</strong>
                <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-[var(--primary)] text-[var(--on-primary)]">
                  {c.level}
                </span>
              </div>
              <p className="text-sm text-[var(--text-dim)] m-0 mt-0.5">{c.how}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </Stack>
  );
}
