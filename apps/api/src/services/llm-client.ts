// llm-client.ts — the server-side client for the Lehana llm-service proxy.
// Platform rule: ALL AI inference goes through https://llm.lehana.in (never a
// direct provider call). Auth is a service-to-service key sent as X-Internal-Key;
// the key lives only in the environment (Secret Manager in prod), never in a URL,
// a log, an error message or the repo. Upstream failures are sanitized to
// UPSTREAM_FAILURE so response bodies can't leak into ours.

import { type AppError, appError, err, ok, type Result } from '@copa/core';

/** OpenAI-style chat message. */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** Injectable fetch — tests exercise this seam with canned upstream behaviour. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface LlmClientOptions {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly internalKey: string;
  readonly model: string;
  readonly fetchFn?: FetchFn;
  readonly timeoutMs?: number;
}

/**
 * SSRF guard: the llm-service base URL comes from the environment, so before we ever
 * attach the internal key and POST, we confirm the target is HTTPS on an allow-listed
 * host (or localhost for tests). This stops an injected LLM_SERVICE_URL from redirecting
 * a key-bearing request at an internal metadata endpoint.
 */
const ALLOWED_LLM_HOSTS = new Set(['llm.lehana.in', 'localhost', '127.0.0.1', 'llm.example']);

export function isAllowedLlmUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const httpsOrLocal = url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return httpsOrLocal && ALLOWED_LLM_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Call the llm-service SMK endpoint with a system + user turn.
 * Returns Result — callers degrade to the deterministic demo path, never crash.
 */
export async function llmComplete(
  options: LlmClientOptions,
  systemPrompt: string,
  userContent: string,
): Promise<Result<string, AppError>> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 25_000;
  // SSRF guard — refuse to send the key anywhere but an allow-listed HTTPS host.
  if (!isAllowedLlmUrl(options.baseUrl)) {
    return err(appError('UPSTREAM_FAILURE', 'llm-service URL is not an allowed host'));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${options.baseUrl}/smk/${options.endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Security: the key travels in a header, never the URL.
        'x-internal-key': options.internalKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        model: options.model,
        temperature: 0.3,
        max_tokens: 500,
        ref: 'copa-copilot',
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Status only — upstream bodies may echo request contents or auth material.
      return err(appError('UPSTREAM_FAILURE', `llm-service HTTP ${response.status}`));
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (text === undefined || text.length === 0) {
      return err(appError('UPSTREAM_FAILURE', 'llm-service returned an empty reply'));
    }
    return ok(stripFences(text));
  } catch {
    return err(appError('UPSTREAM_FAILURE', 'llm-service request failed or timed out'));
  } finally {
    clearTimeout(timer);
  }
}

/** AntiGravity/Claude may wrap replies in markdown fences; strip them defensively. */
function stripFences(text: string): string {
  if (!text.startsWith('```')) return text;
  const match = /```(?:\w+)?\s*\n?([\s\S]*?)\n?```/.exec(text);
  return match?.[1]?.trim() ?? text;
}
