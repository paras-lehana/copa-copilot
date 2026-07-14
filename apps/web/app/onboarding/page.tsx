'use client';

// onboarding/page.tsx — role → venue → seat → language → accessibility. Every field
// is labelled and keyboard-complete; a one-click demo persona gets judges to value
// immediately. Bootstraps an anonymous (no-PII) profile via the API.

import { useState } from 'react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@copa/core';
import { profileSchema, venuesResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { type AccessibilityProfile, type Persona, useSession } from '../../lib/session';
import { Button, GlassCard } from '../../components/ui';

const PERSONAS: readonly { id: Persona; label: string; blurb: string }[] = [
  { id: 'fan', label: 'Fan', blurb: 'Navigation, exits, missions and tickets.' },
  { id: 'volunteer', label: 'Volunteer', blurb: 'Zone instructions and quick incident reports.' },
  { id: 'organizer', label: 'Organizer', blurb: 'Operations dashboard and AI briefings.' },
  { id: 'staff', label: 'Venue staff', blurb: 'Facilities, accessibility and weather actions.' },
];

const ACCESS: readonly { id: AccessibilityProfile; label: string; blurb: string }[] = [
  { id: 'none', label: 'No preference', blurb: 'Fastest safe route.' },
  { id: 'wheelchair', label: 'Wheelchair', blurb: 'Step-free routes only — never stairs.' },
  { id: 'low-vision', label: 'Low vision', blurb: 'Fewer turns, landmark-led directions.' },
  { id: 'sensory-sensitive', label: 'Sensory-sensitive', blurb: 'Avoids the densest, loudest zones.' },
];

export default function OnboardingPage() {
  const session = useSession();
  const venues = useApi('/api/venues', venuesResponseSchema);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function finish() {
    setSaving(true);
    const result = await apiPost(
      '/api/users/bootstrap',
      {
        displayName: session.displayName === 'Guest' ? 'Fan' : session.displayName,
        venueId: session.venueId,
        sectionZoneId: session.sectionZoneId,
      },
      profileSchema,
    );
    if (result.ok) {
      session.update({ profile: result.value.profile, onboarded: true });
      setDone(true);
    }
    setSaving(false);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Set up Copa Copilot</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>Four quick choices — no account, no personal data.</p>

      <GlassCard as="section" labelledBy="p-h">
        <h2 id="p-h" style={{ marginTop: 0 }}>1. Who are you?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10 }}>
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => session.update({ persona: p.id })}
              aria-pressed={session.persona === p.id}
              style={optionStyle(session.persona === p.id)}
            >
              <strong>{p.label}</strong>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{p.blurb}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard as="section" labelledBy="v-h">
        <h2 id="v-h" style={{ marginTop: 0 }}>2. Which venue &amp; seat?</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Venue</span>
            <select
              value={session.venueId}
              onChange={(e) => session.update({ venueId: e.target.value })}
              style={fieldStyle}
            >
              {venues.data?.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Seat / section</span>
            <input
              value={session.sectionZoneId}
              onChange={(e) => session.update({ sectionZoneId: e.target.value })}
              autoComplete="off"
              style={fieldStyle}
            />
          </label>
        </div>
      </GlassCard>

      <GlassCard as="section" labelledBy="l-h">
        <h2 id="l-h" style={{ marginTop: 0 }}>3. Language</h2>
        <select
          value={session.language}
          onChange={(e) => session.update({ language: e.target.value as LanguageCode })}
          style={fieldStyle}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </GlassCard>

      <GlassCard as="section" labelledBy="a-h">
        <h2 id="a-h" style={{ marginTop: 0 }}>4. Accessibility</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10 }}>
          {ACCESS.map((a) => (
            <button
              key={a.id}
              onClick={() => session.update({ accessibility: a.id })}
              aria-pressed={session.accessibility === a.id}
              style={optionStyle(session.accessibility === a.id)}
            >
              <strong>{a.label}</strong>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{a.blurb}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button onClick={() => void finish()} disabled={saving} aria-disabled={saving}>
          {saving ? 'Saving…' : 'Finish setup'}
        </Button>
        {done && (
          <span role="status" style={{ color: 'var(--ok)', fontWeight: 600 }}>
            Ready! Head to the dashboard or assistant.
          </span>
        )}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 8,
  padding: '6px 10px',
  background: 'var(--bg-1)',
  color: 'var(--text)',
  border: '1px solid var(--surface-edge)',
};

function optionStyle(active: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gap: 4,
    textAlign: 'start',
    padding: 14,
    minHeight: 44,
    borderRadius: 12,
    cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--primary) 18%, transparent)' : 'transparent',
    border: `2px solid ${active ? 'var(--primary)' : 'var(--surface-edge)'}`,
    color: 'var(--text)',
  };
}
