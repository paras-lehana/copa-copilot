// leaderboard.test.ts — M16: ordering, pagination, ties across scopes × datasets.
import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_SCOPES,
  type LeaderboardEntry,
  buildLeaderboard,
  greenestSections,
} from './leaderboard';

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    userId: 'u1',
    displayName: 'Fan One',
    points: 100,
    venueId: 'metlife',
    sectionZoneId: 'sec-111',
    kgCo2eSaved: 1,
    ...overrides,
  };
}

const DATASET: LeaderboardEntry[] = [
  entry({ userId: 'u1', points: 300, sectionZoneId: 'sec-111', kgCo2eSaved: 3 }),
  entry({ userId: 'u2', points: 500, sectionZoneId: 'sec-124', kgCo2eSaved: 1 }),
  entry({ userId: 'u3', points: 300, sectionZoneId: 'sec-111', kgCo2eSaved: 5 }),
  entry({ userId: 'u4', points: 50, sectionZoneId: 'sec-124', kgCo2eSaved: 0.5 }),
  entry({ userId: 'u5', points: 300, sectionZoneId: 'sec-138', kgCo2eSaved: 5 }),
  entry({ userId: 'u6', points: 700, venueId: 'arrowhead', sectionZoneId: 'sec-n', kgCo2eSaved: 2 }),
];

describe('ordering and ranks (M16)', () => {
  it('sorts points desc with deterministic tiebreaks (co2 desc, then userId asc)', () => {
    const page = buildLeaderboard(DATASET, 'tournament', {}, undefined, 10);
    expect(page.top.map((e) => e.userId)).toEqual(['u6', 'u2', 'u3', 'u5', 'u1', 'u4']);
    expect(page.top.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is stable across repeated builds', () => {
    const a = buildLeaderboard(DATASET, 'tournament', {}, 'u1');
    const b = buildLeaderboard(DATASET, 'tournament', {}, 'u1');
    expect(a).toEqual(b);
  });
});

describe('scopes (M16)', () => {
  it.each(LEADERBOARD_SCOPES)('%s scope filters correctly', (scope) => {
    const page = buildLeaderboard(
      DATASET,
      scope,
      { venueId: 'metlife', sectionZoneId: 'sec-111' },
      undefined,
    );
    if (scope === 'tournament') expect(page.totalEntries).toBe(6);
    if (scope === 'venue') expect(page.totalEntries).toBe(5);
    if (scope === 'section') expect(page.totalEntries).toBe(2);
  });
});

describe('pagination shape (M16)', () => {
  it('top-N truncates and around-me windows the requester', () => {
    const page = buildLeaderboard(DATASET, 'tournament', {}, 'u1', 3, 1);
    expect(page.top).toHaveLength(3);
    // u1 is rank 5; around window of 1 = ranks 4..6.
    expect(page.aroundMe.map((e) => e.rank)).toEqual([4, 5, 6]);
    expect(page.aroundMe.some((e) => e.userId === 'u1')).toBe(true);
  });

  it('unknown requester yields an empty around-me, not an error', () => {
    const page = buildLeaderboard(DATASET, 'tournament', {}, 'ghost', 3, 1);
    expect(page.aroundMe).toEqual([]);
  });

  it('empty dataset yields an empty page', () => {
    const page = buildLeaderboard([], 'tournament', {}, 'u1');
    expect(page.top).toEqual([]);
    expect(page.totalEntries).toBe(0);
  });

  it('around-me clamps at the top of the board', () => {
    const page = buildLeaderboard(DATASET, 'tournament', {}, 'u6', 3, 1);
    expect(page.aroundMe.map((e) => e.rank)).toEqual([1, 2]);
  });
});

describe('greenestSections', () => {
  it('aggregates per section, ranked by saved kg with deterministic ties', () => {
    const ranked = greenestSections(DATASET, 'metlife');
    expect(ranked[0]).toEqual({ sectionZoneId: 'sec-111', totalKgCo2eSaved: 8 });
    expect(ranked.map((r) => r.sectionZoneId)).toEqual(['sec-111', 'sec-138', 'sec-124']);
  });

  it('ignores other venues', () => {
    const ranked = greenestSections(DATASET, 'arrowhead');
    expect(ranked).toEqual([{ sectionZoneId: 'sec-n', totalKgCo2eSaved: 2 }]);
  });
});
