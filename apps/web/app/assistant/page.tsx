'use client';

// assistant/page.tsx — the conversational copilot. The conversation is an aria-live
// log; tool results render as structured cards, not raw text. The demo-mode banner
// is honest about which engine answered.

import { useRef, useState } from 'react';
import { assistantResponseSchema } from '../../lib/contracts';
import { ASSISTANT_MINUTE, FAN_VIEW } from '../../lib/scenarios';
import { apiPost } from '../../lib/api-client';
import { useSession } from '../../lib/session';
import { catalog } from '../../lib/strings';
import { GlassCard } from '../../components/ui';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  engine?: 'demo' | 'gemini';
  tool?: string;
}

const SUGGESTIONS: Record<string, readonly string[]> = {
  fan: [
    'What is the safest route to my seat?',
    'When should I leave to catch the train home?',
    'Is my resale ticket going to work at the gate?',
  ],
  volunteer: ['How should I redirect fans from a congested gate?', 'Draft an incident report for a medical case.'],
  organizer: ['Summarise the last 15 minutes and give me 3 actions.', 'Which zones are critical right now?'],
  staff: ['What are the weather-protocol actions right now?', 'Where are the accessible facilities?'],
};

export default function AssistantPage() {
  const session = useSession();
  const strings = catalog(session.language);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(message: string) {
    if (message.trim() === '' || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setInput('');
    const result = await apiPost(
      '/api/assistant/query',
      {
        message,
        venueId: session.venueId,
        persona: session.persona,
        language: session.language,
        scenario: FAN_VIEW.scenario,
        minute: ASSISTANT_MINUTE,
      },
      assistantResponseSchema,
    );
    if (result.ok) {
      const { reply } = result.value;
      setTurns((t) => [
        ...t,
        { role: 'assistant', text: reply.text, engine: reply.engine, tool: reply.toolTraces[0]?.tool },
      ]);
    } else {
      setTurns((t) => [...t, { role: 'assistant', text: result.message }]);
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>{strings.nav_assistant}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Grounded in live venue data. Answers as <strong>{session.persona}</strong> in{' '}
        <strong>{session.language}</strong>.
      </p>

      <GlassCard>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {(SUGGESTIONS[session.persona] ?? SUGGESTIONS.fan ?? []).map((s) => (
            <button
              key={s}
              onClick={() => void ask(s)}
              style={{ minHeight: 40, padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', background: 'transparent', border: '1px solid var(--surface-edge)', color: 'var(--text)' }}
            >
              {s}
            </button>
          ))}
        </div>

        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          style={{ display: 'grid', gap: 10, minHeight: 120, marginBottom: 12 }}
        >
          {turns.length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>Ask something, or tap a suggestion above.</p>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              style={{
                justifySelf: turn.role === 'user' ? 'end' : 'start',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: 12,
                background: turn.role === 'user' ? 'var(--primary)' : 'var(--surface)',
                color: turn.role === 'user' ? 'var(--on-primary)' : 'var(--text)',
                border: turn.role === 'assistant' ? '1px solid var(--surface-edge)' : 'none',
              }}
            >
              <p style={{ margin: 0 }}>{turn.text}</p>
              {turn.role === 'assistant' && turn.tool !== undefined && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                  ⚡ {turn.tool} · {turn.engine === 'gemini' ? 'Gemini' : 'demo engine'}
                </p>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <label htmlFor="ask" style={{ position: 'absolute', left: -9999 }}>
            {strings.askPlaceholder}
          </label>
          <input
            id="ask"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={strings.askPlaceholder}
            maxLength={1000}
            autoComplete="off"
            style={{ flex: 1, minHeight: 44, borderRadius: 10, padding: '8px 12px', background: 'var(--bg-1)', color: 'var(--text)', border: '1px solid var(--surface-edge)' }}
          />
          <button
            type="submit"
            disabled={busy}
            aria-disabled={busy}
            style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
          >
            {busy ? '…' : strings.send}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
