// helpers.ts — shared API test harness: frozen clock, silent sink, real app.
import { type Express } from 'express';
import { type AppConfig, loadConfig } from '../config';
import { type LogLine } from '../middleware/logger';
import { InMemoryUserStore } from '../services/store';
import { buildApp } from '../server';

/** A clock frozen at a fixed instant — kills timezone/midnight flake by design. */
export function frozenClock(startMs = 1_750_000_000_000): { now: () => Date; advance: (ms: number) => void } {
  let currentMs = startMs;
  return {
    now: () => new Date(currentMs),
    advance: (ms: number) => {
      currentMs += ms;
    },
  };
}

/** Test app factory: demo mode, frozen clock, captured logs, fresh store. */
export function testApp(overrides?: Partial<Record<string, string>>): {
  app: Express;
  config: AppConfig;
  logs: LogLine[];
  store: InMemoryUserStore;
  clock: ReturnType<typeof frozenClock>;
} {
  const clock = frozenClock();
  const config = loadConfig(
    {
      DEMO_MODE: 'true',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      SIM_SEED: '26',
      ...overrides,
    },
    clock.now,
  );
  const logs: LogLine[] = [];
  const store = new InMemoryUserStore();
  const app = buildApp(config, { sink: (line) => logs.push(line), store });
  return { app, config, logs, store, clock };
}
