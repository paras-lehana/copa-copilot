// store.ts — the UserStore seam: in-memory today, Firestore drop-in later.
// The interface is async and pagination-shaped ON PURPOSE: swapping in a Firestore
// adapter changes this file only — zero route changes (documented in ARCHITECTURE.md).

import {
  type LeaderboardEntry,
  type MissionId,
  clampRestoredPoints,
  levelForPoints,
} from '@copa/core';

/** A stored anonymous user profile (no PII by design). */
export interface UserProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly venueId: string;
  readonly sectionZoneId: string;
  readonly points: number;
  readonly kgCo2eSaved: number;
  readonly completedMissions: readonly MissionId[];
}

/** The persistence contract. */
export interface UserStore {
  getUser(userId: string): Promise<UserProfile | undefined>;
  upsertUser(profile: UserProfile): Promise<void>;
  listLeaderboardEntries(limit: number): Promise<readonly LeaderboardEntry[]>;
}

/** In-memory implementation with deterministic iteration order (insertion order). */
export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserProfile>();

  async getUser(userId: string): Promise<UserProfile | undefined> {
    return this.users.get(userId);
  }

  async upsertUser(profile: UserProfile): Promise<void> {
    this.users.set(profile.userId, profile);
  }

  async listLeaderboardEntries(limit: number): Promise<readonly LeaderboardEntry[]> {
    // Efficiency: demo-scale full scan behind a pagination-shaped signature; a
    // Firestore adapter replaces this with an indexed ORDER BY + limit query.
    return [...this.users.values()].slice(0, limit).map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      points: u.points,
      venueId: u.venueId,
      sectionZoneId: u.sectionZoneId,
      kgCo2eSaved: u.kgCo2eSaved,
    }));
  }

  /** Count (tests only). */
  size(): number {
    return this.users.size;
  }
}

let counter = 0;

/**
 * Create a new anonymous profile. The client may claim restored points; the claim
 * is CLAMPED server-side (anti-minting) — points cannot be minted from localStorage.
 */
export function createProfile(
  displayName: string,
  venueId: string,
  sectionZoneId: string,
  claimedPoints: number,
): UserProfile {
  counter += 1;
  const points = clampRestoredPoints(claimedPoints);
  return {
    userId: `fan-${counter.toString(36)}-${displayName.length}${venueId.length}`,
    displayName,
    venueId,
    sectionZoneId,
    points,
    kgCo2eSaved: 0,
    completedMissions: [],
  };
}

/** Derived view used by profile responses. */
export function profileView(profile: UserProfile): UserProfile & { level: number } {
  return { ...profile, level: levelForPoints(profile.points) };
}
