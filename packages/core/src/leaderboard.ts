// leaderboard.ts — section / venue / tournament boards with deterministic ordering.
// Boundary: pure functions over entry lists; pagination-shaped so the in-memory
// store can be swapped for Firestore without touching call sites.

/** Board scopes. */
export type LeaderboardScope = 'section' | 'venue' | 'tournament';

/** All scopes, for pickers and matrix tests. */
export const LEADERBOARD_SCOPES: readonly LeaderboardScope[] = [
  'section',
  'venue',
  'tournament',
];

/** One leaderboard entry. */
export interface LeaderboardEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly points: number;
  readonly venueId: string;
  readonly sectionZoneId: string;
  /** kg CO2e saved — powers the sustainability board variant. */
  readonly kgCo2eSaved: number;
}

/** A ranked row. */
export interface RankedEntry extends LeaderboardEntry {
  readonly rank: number;
}

/** A page of ranked results plus the caller's own position. */
export interface LeaderboardPage {
  readonly scope: LeaderboardScope;
  readonly top: readonly RankedEntry[];
  readonly aroundMe: readonly RankedEntry[];
  readonly totalEntries: number;
}

/**
 * Deterministic ordering: points desc, then kgCo2eSaved desc, then userId asc.
 * The final tiebreak makes rank stable across runs — no insertion-order luck.
 */
function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.kgCo2eSaved !== a.kgCo2eSaved) return b.kgCo2eSaved - a.kgCo2eSaved;
  return a.userId.localeCompare(b.userId);
}

function scopeFilter(
  scope: LeaderboardScope,
  reference: { venueId?: string; sectionZoneId?: string },
): (entry: LeaderboardEntry) => boolean {
  switch (scope) {
    case 'tournament':
      return () => true;
    case 'venue':
      return (e) => e.venueId === reference.venueId;
    case 'section':
      return (e) => e.venueId === reference.venueId && e.sectionZoneId === reference.sectionZoneId;
  }
}

/**
 * Build a leaderboard page: top-N plus a window around the requesting user.
 *
 * @example
 * const page = buildLeaderboard(entries, 'venue', { venueId: 'metlife' }, 'user-7', 10, 1);
 * page.top[0]?.rank; // 1
 */
export function buildLeaderboard(
  entries: readonly LeaderboardEntry[],
  scope: LeaderboardScope,
  reference: { venueId?: string; sectionZoneId?: string },
  requestingUserId: string | undefined,
  topN = 10,
  aroundWindow = 1,
): LeaderboardPage {
  // Efficiency: full sort at demo scale (< 10k entries) beats maintaining an index;
  // the pagination-shaped interface means a store-side ORDER BY replaces this later.
  const ranked: RankedEntry[] = [...entries]
    .filter(scopeFilter(scope, reference))
    .sort(compareEntries)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  const top = ranked.slice(0, topN);
  let aroundMe: readonly RankedEntry[] = [];
  if (requestingUserId !== undefined) {
    const idx = ranked.findIndex((e) => e.userId === requestingUserId);
    if (idx >= 0) {
      aroundMe = ranked.slice(Math.max(0, idx - aroundWindow), idx + aroundWindow + 1);
    }
  }
  return { scope, top, aroundMe, totalEntries: ranked.length };
}

/**
 * Sustainability variant: ranked by kg CO2e saved instead of points.
 *
 * @example
 * greenestSections(entries, 'metlife')[0]; // { sectionZoneId, totalKgCo2eSaved }
 */
export function greenestSections(
  entries: readonly LeaderboardEntry[],
  venueId: string,
): readonly { sectionZoneId: string; totalKgCo2eSaved: number }[] {
  const bySection = new Map<string, number>();
  for (const e of entries) {
    if (e.venueId !== venueId) continue;
    bySection.set(e.sectionZoneId, (bySection.get(e.sectionZoneId) ?? 0) + e.kgCo2eSaved);
  }
  return [...bySection.entries()]
    .map(([sectionZoneId, total]) => ({
      sectionZoneId,
      totalKgCo2eSaved: Math.round(total * 100) / 100,
    }))
    .sort(
      (a, b) =>
        b.totalKgCo2eSaved - a.totalKgCo2eSaved ||
        a.sectionZoneId.localeCompare(b.sectionZoneId),
    );
}
