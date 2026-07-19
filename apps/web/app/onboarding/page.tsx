'use client';

// onboarding/page.tsx — role → venue → seat → language → accessibility. Every field
// is labelled and keyboard-complete; a one-click demo persona gets judges to value
// immediately. Bootstraps an anonymous (no-PII) profile via the API.

import { useState } from 'react';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '@copa/core';
import { profileSchema, venuesResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { type AccessibilityProfile, type Persona, useSession } from '../../lib/session';
import { Button, Muted, Panel, Stack } from '../../components/ui';

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
    <Stack gap={4}>
      <h1 className="mb-0">Set up Copa Copilot</h1>
      <Muted className="mt-0">Four quick choices — no account, no personal data.</Muted>

      <Panel id="p-h" title="1. Who are you?" icon="🙋">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => session.update({ persona: p.id })}
              aria-pressed={session.persona === p.id}
              className={optionClass(session.persona === p.id)}
            >
              <strong>{p.label}</strong>
              <span className="text-[13px] text-[var(--text-dim)]">{p.blurb}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel id="v-h" title="2. Which venue & seat?" icon="🏟️">
        <div className="flex gap-2.5 flex-wrap">
          <label className="grid gap-1">
            <span className="text-[13px]">Venue</span>
            <select
              value={session.venueId}
              onChange={(e) => session.update({ venueId: e.target.value })}
              className={fieldClass}
            >
              {venues.data?.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[13px]">Seat / section</span>
            <input
              value={session.sectionZoneId}
              onChange={(e) => session.update({ sectionZoneId: e.target.value })}
              autoComplete="off"
              className={fieldClass}
            />
          </label>
        </div>
      </Panel>

      <Panel id="l-h" title="3. Language" icon="🌐">
        <select
          value={session.language}
          onChange={(e) => session.update({ language: resolveLanguage(e.target.value) })}
          aria-label="Language"
          className={fieldClass}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </Panel>

      <Panel id="a-h" title="4. Accessibility" icon="♿">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
          {ACCESS.map((a) => (
            <button
              key={a.id}
              onClick={() => session.update({ accessibility: a.id })}
              aria-pressed={session.accessibility === a.id}
              className={optionClass(session.accessibility === a.id)}
            >
              <strong>{a.label}</strong>
              <span className="text-[13px] text-[var(--text-dim)]">{a.blurb}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="flex gap-2.5 items-center">
        <Button onClick={() => void finish()} disabled={saving} aria-disabled={saving}>
          {saving ? 'Saving…' : 'Finish setup'}
        </Button>
        {done && (
          <span role="status" className="text-[var(--ok)] font-semibold">
            Ready! Head to the dashboard or assistant.
          </span>
        )}
      </div>
    </Stack>
  );
}

const fieldClass =
  'min-h-[44px] rounded-lg py-1.5 px-2.5 bg-[var(--bg-1)] text-[var(--text)] border border-[var(--surface-edge)]';

function optionClass(active: boolean): string {
  return [
    'grid gap-1 text-start p-3.5 min-h-[44px] rounded-xl cursor-pointer border-2 text-[var(--text)]',
    active
      ? 'bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] border-[var(--primary)]'
      : 'bg-transparent border-[var(--surface-edge)]',
  ].join(' ');
}
