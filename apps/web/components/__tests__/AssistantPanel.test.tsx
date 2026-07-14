// AssistantPanel.test.tsx — the slide-over assistant: renders when open, sends a
// query, renders the grounded reply with its tool + engine provenance, and shows a
// clean error when the API fails. fetch is stubbed so no network is touched.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../../lib/session';
import { AssistantPanel } from '../AssistantPanel';

function stubReply(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })),
  );
}

function renderPanel(open = true) {
  return render(
    <SessionProvider>
      <AssistantPanel isOpen={open} onClose={() => {}} />
    </SessionProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('AssistantPanel', () => {
  it('is not in the DOM when closed', () => {
    renderPanel(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with an aria-live conversation log when open', () => {
    stubReply({});
    renderPanel(true);
    expect(screen.getByRole('dialog', { name: /copa copilot assistant/i })).toBeInTheDocument();
    expect(screen.getByRole('log', { name: /conversation/i })).toBeInTheDocument();
  });

  it('sends a query and renders the grounded reply with tool + engine provenance', async () => {
    stubReply({
      reply: {
        text: 'Take the lift to Section 111 — 200 m, 3 min.',
        language: 'en',
        engine: 'gemini',
        toolTraces: [{ tool: 'findSafeRoute', summary: 'route', data: {} }],
      },
    });
    renderPanel(true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ask about/i), 'route to my seat');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/Take the lift to Section 111/)).toBeInTheDocument());
    // Provenance line is shown honestly.
    expect(screen.getByText(/findSafeRoute · Gemini/)).toBeInTheDocument();
    // The user's own turn is echoed.
    expect(screen.getByText('route to my seat')).toBeInTheDocument();
  });

  it('labels a demo-engine reply as demo, not Gemini', async () => {
    stubReply({
      reply: { text: 'Gate D is calm.', language: 'en', engine: 'demo', toolTraces: [{ tool: 'getCrowdStatus', summary: 's', data: {} }] },
    });
    renderPanel(true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ask about/i), 'how busy?');
    await user.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText(/getCrowdStatus · demo engine/)).toBeInTheDocument());
  });

  it('shows a graceful message when the API errors', async () => {
    stubReply({ error: { code: 'UPSTREAM_FAILURE', message: 'A connected service failed.' } }, false);
    renderPanel(true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ask about/i), 'anything');
    await user.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText(/connected service failed/i)).toBeInTheDocument());
  });

  it('offers persona-appropriate suggestion chips before any turn', () => {
    stubReply({});
    renderPanel(true);
    // Default persona is fan.
    expect(screen.getByRole('button', { name: /safest route to my seat/i })).toBeInTheDocument();
  });
});
