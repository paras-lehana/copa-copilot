// config.ts — the ONLY place process.env is read. Everything downstream receives a
// typed, validated AppConfig, which is what makes buildApp(config) fully testable.
// Security: DEMO_MODE defaults to the SAFE value for the environment (true locally,
// false in production) and is never exposed through any public endpoint.

import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(8080),
  demoMode: z.boolean(),
  // AI inference is routed through the Lehana llm-service proxy (OpenAI-compatible),
  // never a direct provider call — a platform rule and a cost/security control.
  llmServiceUrl: z.string().default('https://llm.lehana.in'),
  llmEndpoint: z.string().default('antigravity-manager'),
  llmModel: z.string().default('gemini-3-flash'),
  /** Service-to-service key sent as X-Internal-Key; empty ⇒ demo path. */
  llmInternalKey: z.string().default(''),
  allowedOrigins: z.array(z.string().url().or(z.string().startsWith('http://localhost'))),
  simSeed: z.coerce.number().int().default(26),
});

/** Typed runtime configuration. */
export interface AppConfig extends z.infer<typeof configSchema> {
  /** Returns "now" — injectable so API tests can freeze the clock. */
  readonly now: () => Date;
}

/**
 * Load config from an env-shaped record (defaults to process.env at the call site
 * in main.ts — tests pass plain objects).
 */
export function loadConfig(
  env: Record<string, string | undefined>,
  now: () => Date = () => new Date(),
): AppConfig {
  const isProduction = env.NODE_ENV === 'production' || env.K_SERVICE !== undefined;
  const parsed = configSchema.parse({
    port: env.PORT,
    // Demo mode: opt-out locally, opt-in in production (never accidentally live-demo).
    demoMode: env.DEMO_MODE === undefined ? !isProduction : env.DEMO_MODE === 'true',
    llmServiceUrl: env.LLM_SERVICE_URL ?? 'https://llm.lehana.in',
    llmEndpoint: env.LLM_ENDPOINT ?? 'antigravity-manager',
    llmModel: env.LLM_MODEL ?? 'gemini-3-flash',
    llmInternalKey: env.LLM_INTERNAL_KEY ?? '',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    simSeed: env.SIM_SEED,
  });
  return { ...parsed, now };
}

/** True when an llm-service key is present — the live-assistant readiness signal. */
export function hasLlmKey(config: AppConfig): boolean {
  return config.llmInternalKey.length > 0;
}
