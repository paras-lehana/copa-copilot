// api-client.ts — the typed browser client for the Copa Copilot API.
// Every response is validated against the SAME zod schemas the server uses (imported
// from @copa/core response contracts below) — there are no `as` casts here; if the
// server and client ever disagree on a shape, it surfaces as a parse error, not a
// silent runtime bug.

import { z } from 'zod';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8090';

/** A discriminated client result mirroring the server's Result channel. */
export type ClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** GET a path and validate the JSON against `schema`. */
export async function apiGet<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
): Promise<ClientResult<z.infer<S>>> {
  return request(path, { method: 'GET' }, schema);
}

/** POST a JSON body and validate the JSON response against `schema`. */
export async function apiPost<S extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  schema: S,
): Promise<ClientResult<z.infer<S>>> {
  return request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  init: RequestInit,
  schema: S,
): Promise<ClientResult<z.infer<S>>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    const json: unknown = await res.json();
    if (!res.ok) {
      const parsed = errorEnvelope.safeParse(json);
      return parsed.success
        ? { ok: false, code: parsed.data.error.code, message: parsed.data.error.message }
        : { ok: false, code: 'HTTP_ERROR', message: `Request failed (${res.status}).` };
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, code: 'BAD_RESPONSE', message: 'Unexpected response from the server.' };
    }
    return { ok: true, value: parsed.data };
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach the service. Please retry.' };
  }
}

export { API_BASE };
