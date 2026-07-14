// gemini-client.ts — the server-side Gemini API client.
// Security: the key lives server-side only (Secret Manager in production) and goes
// in the x-goog-api-key HEADER, never a URL (URLs land in access logs). Upstream
// failures are sanitized to UPSTREAM_FAILURE — response bodies and auth material
// are never echoed into logs or client responses.

import { type AppError, type Result, appError, err, ok } from '@copa/core';

/** The subset of the generateContent response we consume. */
export interface GeminiReply {
  readonly text: string;
}

/** Injectable fetch — tests exercise this seam with canned upstream behaviour. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Client configuration. */
export interface GeminiClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchFn?: FetchFn;
  readonly timeoutMs?: number;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Call Gemini generateContent with a system prompt and a single user turn.
 * Returns Result — callers decide how to degrade (DEMO fallback), never crash.
 */
export async function generateContent(
  options: GeminiClientOptions,
  systemPrompt: string,
  userContent: string,
): Promise<Result<GeminiReply, AppError>> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${API_BASE}/${options.model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Sanitized: status code only — the body may contain auth/config echoes.
      return err(appError('UPSTREAM_FAILURE', `gemini status ${response.status}`));
    }
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    if (text === undefined || text.length === 0) {
      return err(appError('UPSTREAM_FAILURE', 'gemini returned an empty candidate'));
    }
    return ok({ text });
  } catch {
    return err(appError('UPSTREAM_FAILURE', 'gemini fetch failed or timed out'));
  } finally {
    clearTimeout(timer);
  }
}
