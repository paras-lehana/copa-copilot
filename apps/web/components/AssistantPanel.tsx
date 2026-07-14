'use client';

// AssistantPanel.tsx — the slide-over Copa Copilot chat (ported from StadiumFlow's
// AIChatPanel, rewired to /api/assistant/query). The conversation is an aria-live
// log; tool + engine provenance is shown honestly ("Gemini" vs "demo engine").

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { assistantResponseSchema } from '../lib/contracts';
import { apiPost } from '../lib/api-client';
import { useSession } from '../lib/session';
import { catalog } from '../lib/strings';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  engine?: 'demo' | 'gemini';
  tool?: string;
}

const SUGGESTIONS: Record<string, readonly string[]> = {
  fan: ["What's the safest route to my seat?", 'When should I leave for the train?', 'Will my resale ticket work?'],
  volunteer: ['How do I redirect fans from a jammed gate?', 'Draft an incident report'],
  organizer: ['Summarise the last 15 minutes', 'Which zones are critical?'],
  staff: ['Current weather-protocol actions?', 'Where are the accessible facilities?'],
};

let counter = 0;
const nextId = () => `t${(counter += 1)}`;

export function AssistantPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }): ReactNode {
  const session = useSession();
  const strings = catalog(session.language);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, busy]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const ask = useCallback(
    async (message: string) => {
      if (message.trim() === '' || busy) return;
      setBusy(true);
      setTurns((t) => [...t, { id: nextId(), role: 'user', text: message }]);
      setInput('');
      const result = await apiPost(
        '/api/assistant/query',
        {
          message,
          venueId: session.venueId,
          persona: session.persona,
          language: session.language,
          scenario: 'egress-surge',
          minute: 100,
        },
        assistantResponseSchema,
      );
      if (result.ok) {
        const { reply } = result.value;
        setTurns((t) => [
          ...t,
          { id: nextId(), role: 'assistant', text: reply.text, engine: reply.engine, tool: reply.toolTraces[0]?.tool },
        ]);
      } else {
        setTurns((t) => [...t, { id: nextId(), role: 'assistant', text: result.message }]);
      }
      setBusy(false);
      inputRef.current?.focus();
    },
    [busy, session.venueId, session.persona, session.language],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-label="Copa Copilot assistant"
            className="fixed end-0 top-0 h-full w-full max-w-md z-[101] flex flex-col border-s border-[var(--surface-edge)] bg-[var(--bg-1)]"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--surface-edge)]">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center text-lg">
                  ✨
                </span>
                <div>
                  <h2 className="font-bold m-0">Copa Copilot</h2>
                  <p className="text-xs text-[var(--text-dim)] m-0">Grounded in live venue data</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close assistant"
                className="w-9 h-9 rounded-full bg-[var(--surface-solid)] border border-[var(--surface-edge)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversation" className="flex-1 overflow-y-auto p-4 space-y-3">
              {turns.length === 0 && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[var(--primary)]/25 to-[var(--primary-2)]/25 grid place-items-center text-3xl">
                    🏟️
                  </div>
                  <p className="text-sm text-[var(--text-dim)] mb-4">
                    Ask about routes, queues, exits, weather, tickets or sustainability — as{' '}
                    <strong>{session.persona}</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {(SUGGESTIONS[session.persona] ?? SUGGESTIONS.fan ?? []).map((s) => (
                      <button
                        key={s}
                        onClick={() => void ask(s)}
                        className="text-xs px-3 py-2 rounded-full border border-[var(--surface-edge)] text-[var(--text-dim)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((turn) => (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      turn.role === 'user'
                        ? 'bg-[var(--primary)] text-[var(--on-primary)] rounded-br-md'
                        : 'bg-[var(--surface-solid)] text-[var(--text)] border border-[var(--surface-edge)] rounded-bl-md'
                    }`}
                  >
                    <p className="m-0">{turn.text}</p>
                    {turn.role === 'assistant' && turn.tool !== undefined && (
                      <p className="mt-2 pt-2 border-t border-white/10 text-xs opacity-70 m-0">
                        ⚡ {turn.tool} · {turn.engine === 'gemini' ? 'Gemini' : 'demo engine'}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}

              {busy && (
                <div className="flex justify-start" aria-hidden="true">
                  <div className="bg-[var(--surface-solid)] border border-[var(--surface-edge)] rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
              className="p-4 border-t border-[var(--surface-edge)] flex gap-2"
            >
              <label htmlFor="assistant-input" className="sr-only">
                {strings.askPlaceholder}
              </label>
              <input
                id="assistant-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={strings.askPlaceholder}
                maxLength={1000}
                autoComplete="off"
                className="flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm bg-[var(--surface-solid)] text-[var(--text)] border border-[var(--surface-edge)]"
              />
              <button
                type="submit"
                disabled={busy}
                aria-disabled={busy}
                className="min-h-[44px] px-4 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-semibold cursor-pointer disabled:opacity-50"
              >
                {strings.send}
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
