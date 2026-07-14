// config.ts — the ONLY place process.env is read. Everything downstream receives a
// typed, validated AppConfig, which is what makes buildApp(config) fully testable.
// Security: DEMO_MODE defaults to the SAFE value for the environment (true locally,
// false in production) and is never exposed through any public endpoint.

import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(8080),
  demoMode: z.boolean(),
  geminiApiKey: z.string().default(''),
  geminiModel: z.string().default('gemini-2.5-flash'),
  allowedOrigins: z.array(z.string().url().or(z.string().startsWith('http://localhost'))),
  simSeed: z.coerce.number().int().default(26),
  /** Injectable clock for tests — production uses the real one. */
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
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    simSeed: env.SIM_SEED,
  });
  return { ...parsed, now };
}

/** True when a Gemini key is present — the live-assistant readiness signal. */
export function hasGeminiKey(config: AppConfig): boolean {
  return config.geminiApiKey.length > 0;
}
