'use client';

// accessibility/page.tsx — facility status, step-free shortcuts, and an audio-first
// mode that reads the assistant's reply aloud via browser speechSynthesis (honestly
// labelled: it says which engine is speaking, never fakes native TTS).

import { useState } from 'react';
import { crowdResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { RetryCard, Skeleton } from '../../components/ui';

export default function AccessibilityPage() {
  const session = useSession();
  const crowd = useApi(`/api/crowd/${session.venueId}?scenario=normal&minute=30`, crowdResponseSchema, [session.venueId]);
  const [spoke, setSpoke] = useState<string | undefined>(undefined);

  const facilities =
    crowd.data?.snapshot.zones.filter((z) =>
      ['accessible-facility', 'first-aid', 'prayer-room', 'hydration'].includes(z.kind),
    ) ?? [];

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
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Accessibility</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Your current profile is <strong>{session.accessibility}</strong>. Change it in onboarding to
        re-shape routes and assistant answers.
      </p>

      <section aria-labelledby="fac-h" className="glass" style={{ padding: 20 }}>
        <h2 id="fac-h" style={{ marginTop: 0 }}>
          Facilities near you
        </h2>
        {crowd.loading && <Skeleton height={80} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {facilities.map((f) => (
            <li key={f.zoneId} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{f.name}</span>
              <span style={{ color: 'var(--text-dim)' }}>{f.kind.replace('-', ' ')}</span>
            </li>
          ))}
          {crowd.data !== undefined && facilities.length === 0 && <li>No mapped facilities for this venue.</li>}
        </ul>
      </section>

      <section aria-labelledby="audio-h" className="glass" style={{ padding: 20 }}>
        <h2 id="audio-h" style={{ marginTop: 0 }}>
          Audio-first mode
        </h2>
        <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
          Assistant replies use short sentences (≤12 words) in audio-first mode. Try reading a line aloud:
        </p>
        <button
          onClick={() => speak('Gate D is calm. Take the lift to your left. Your section is three minutes away.')}
          style={{ minHeight: 44, padding: '10px 18px', borderRadius: 10, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          🔊 Read a sample route aloud
        </button>
        {spoke !== undefined && (
          <p role="status" style={{ color: 'var(--text-dim)' }}>
            {spoke}
          </p>
        )}
      </section>

      <section aria-labelledby="std-h" className="glass" style={{ padding: 20 }}>
        <h2 id="std-h" style={{ marginTop: 0 }}>
          How we build for access
        </h2>
        <ul role="list" style={{ paddingInlineStart: 20 }}>
          <li>Every route is offered as a text list, not only a map.</li>
          <li>Wheelchair routing uses step-free edges only — never stairs.</li>
          <li>Density bars are ARIA meters with exact values, not colour alone.</li>
          <li>Full keyboard operation with a visible focus ring; a skip link to the content.</li>
          <li>Light and dark themes both pass contrast (the primary has a theme-aware on-colour).</li>
          <li>Six languages including right-to-left Arabic.</li>
        </ul>
      </section>
    </div>
  );
}
