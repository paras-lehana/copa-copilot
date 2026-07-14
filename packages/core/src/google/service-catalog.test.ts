// service-catalog.test.ts — M29: honesty invariants for the Google services catalog.
// An `implemented` claim must be backed by code paths and a fallback; the scorecard
// must be computed, not asserted; and no env var VALUE can ever appear here.
import { describe, expect, it } from 'vitest';
import { GOOGLE_SERVICES, buildScorecard } from './service-catalog';

describe('catalog shape', () => {
  it('catalogs 15 services across 8+ product families', () => {
    expect(GOOGLE_SERVICES).toHaveLength(15);
    expect(new Set(GOOGLE_SERVICES.map((s) => s.family)).size).toBeGreaterThanOrEqual(8);
  });

  it('ids are unique and kebab-case', () => {
    const ids = GOOGLE_SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('honesty invariants (M29)', () => {
  it.each(GOOGLE_SERVICES.map((s) => [s.id, s] as const))(
    '%s: every service has purpose, evidence and judge proof',
    (_id, service) => {
      expect(service.purpose.length).toBeGreaterThan(15);
      expect(service.evidenceSignals.length).toBeGreaterThan(0);
      expect(service.judgeProofPoints.length).toBeGreaterThan(0);
      expect(service.fallbackMode.length).toBeGreaterThan(10);
    },
  );

  it.each(
    GOOGLE_SERVICES.filter((s) => s.status === 'implemented').map((s) => [s.id, s] as const),
  )('%s (implemented) is backed by concrete code paths', (_id, service) => {
    expect(service.codePaths.length).toBeGreaterThan(0);
    for (const p of service.codePaths) {
      // Paths must be repo-relative files, not vague hand-waves.
      expect(p).toMatch(/^([\w-]+\/)*([\w.-]+\.(ts|tsx|md|yaml|ps1)|Dockerfile)$/);
    }
  });

  it('no entry ever carries anything that looks like a secret VALUE', () => {
    const serialized = JSON.stringify(GOOGLE_SERVICES);
    // Env names are fine; long token-like strings are not.
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // Google API key shape
    expect(serialized).not.toMatch(/-----BEGIN/);
    for (const s of GOOGLE_SERVICES) {
      for (const name of s.envVarNames) expect(name).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('statuses use only the honest three-tier vocabulary', () => {
    for (const s of GOOGLE_SERVICES) {
      expect(['implemented', 'ready-with-key', 'planned']).toContain(s.status);
    }
  });
});

describe('scorecard (M29)', () => {
  it('is computed from the catalog — tiers sum to the total', () => {
    const card = buildScorecard();
    expect(card.totalServices).toBe(GOOGLE_SERVICES.length);
    expect(card.implemented + card.readyWithKey + card.planned).toBe(card.totalServices);
  });

  it('claims 6 implemented services (the tier the README quotes)', () => {
    expect(buildScorecard().implemented).toBe(6);
  });

  it('self-attests the no-secrets contract', () => {
    const card = buildScorecard();
    expect(card.exposesSecretValues).toBe(false);
    expect(card.exposesEnvVarNamesOnly).toBe(true);
  });
});
