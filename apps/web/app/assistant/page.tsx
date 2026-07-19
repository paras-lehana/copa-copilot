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
import { GlassCard, Stack, Muted } from '../../components/ui';

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
    <Stack>
      <h1 className="mb-0">{strings.nav_assistant}</h1>
      <Muted className="mt-0">
        Grounded in live venue data. Answers as <strong>{session.persona}</strong> in{' '}
        <strong>{session.language}</strong>.
      </Muted>

      <GlassCard>
        <div className="flex flex-wrap gap-2 mb-3">
          {(SUGGESTIONS[session.persona] ?? SUGGESTIONS.fan ?? []).map((s) => (
            <button
              key={s}
              onClick={() => void ask(s)}
              className="min-h-[40px] px-3 py-1.5 rounded-full text-[13px] cursor-pointer bg-transparent border border-[var(--surface-edge)] text-[var(--text)]"
            >
              {s}
            </button>
          ))}
        </div>

        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="grid gap-2.5 min-h-[120px] mb-3"
        >
          {turns.length === 0 && (
            <p className="text-[var(--text-dim)]">Ask something, or tap a suggestion above.</p>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={`max-w-[85%] py-2.5 px-3.5 rounded-xl ${
                turn.role === 'user'
                  ? 'justify-self-end bg-[var(--primary)] text-[var(--on-primary)]'
                  : 'justify-self-start bg-[var(--surface)] text-[var(--text)] border border-[var(--surface-edge)]'
              }`}
            >
              <p className="m-0">{turn.text}</p>
              {turn.role === 'assistant' && turn.tool !== undefined && (
                <p className="mt-1.5 mx-0 mb-0 text-xs text-[var(--text-dim)]">
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
          className="flex gap-2"
        >
          <label htmlFor="ask" className="sr-only">
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
            className="flex-1 min-h-[44px] rounded-[10px] py-2 px-3 bg-[var(--bg-1)] text-[var(--text)] border border-[var(--surface-edge)]"
          />
          <button
            type="submit"
            disabled={busy}
            aria-disabled={busy}
            className="min-h-[44px] px-[18px] py-0 rounded-[10px] bg-[var(--primary)] text-[var(--on-primary)] border-0 font-semibold cursor-pointer"
          >
            {busy ? '…' : strings.send}
          </button>
        </form>
      </GlassCard>
    </Stack>
  );
}
