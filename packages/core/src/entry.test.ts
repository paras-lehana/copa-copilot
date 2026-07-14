// entry.test.ts — M12: readiness across sources × transfer states × facts.
import { describe, expect, it } from 'vitest';
import { TICKET_SOURCES, assessEntryReadiness, isWithinArrivalWindow } from './entry';

const SEED = 26;

describe('entry readiness across sources × transfer states (M12)', () => {
  const cases = TICKET_SOURCES.flatMap((ticketSource) =>
    [true, false].flatMap((transferConfirmed) =>
      [true, false].map((idPacked) => ({ ticketSource, transferConfirmed, idPacked })),
    ),
  );

  it.each(cases)(
    '$ticketSource / transfer=$transferConfirmed / id=$idPacked yields coherent readiness',
    ({ ticketSource, transferConfirmed, idPacked }) => {
      const r = assessEntryReadiness(
        'metlife',
        { ticketSource, transferConfirmed, idPacked, bagCompliant: true },
        SEED,
      );
      expect(r).toBeDefined();
      if (r === undefined) return;
      expect(r.readinessScore).toBeGreaterThanOrEqual(0);
      expect(r.readinessScore).toBeLessThanOrEqual(100);
      expect(r.checklist.length).toBeGreaterThanOrEqual(4);
      // The ghost-ticket rule: no confirmed transfer = high risk, whatever the source.
      if (!transferConfirmed) expect(r.riskLevel).toBe('high');
      expect(r.guidance.length).toBeGreaterThan(0);
    },
  );

  it('third-party WITH confirmed transfer de-escalates to elevated', () => {
    const r = assessEntryReadiness(
      'metlife',
      { ticketSource: 'third-party', transferConfirmed: true, idPacked: true, bagCompliant: true },
      SEED,
    );
    expect(r?.riskLevel).toBe('elevated');
  });

  it('official source with everything confirmed is low risk', () => {
    const r = assessEntryReadiness(
      'metlife',
      { ticketSource: 'official', transferConfirmed: true, idPacked: true, bagCompliant: true },
      SEED,
    );
    expect(r?.riskLevel).toBe('low');
  });

  it('third-party guidance names the ghost-ticket failure mode', () => {
    const r = assessEntryReadiness(
      'metlife',
      { ticketSource: 'third-party', transferConfirmed: false, idPacked: false, bagCompliant: false },
      SEED,
    );
    expect(r?.guidance.join(' ')).toMatch(/ghost ticket/i);
    expect(r?.guidance.join(' ')).toMatch(/BLOCKING/);
  });

  it('unconfirmed transfer marks the blocking checklist item undone', () => {
    const r = assessEntryReadiness(
      'metlife',
      { ticketSource: 'official', transferConfirmed: false, idPacked: true, bagCompliant: true },
      SEED,
    );
    const transfer = r?.checklist.find((c) => c.id === 'transfer');
    expect(transfer?.done).toBe(false);
    expect(transfer?.blocking).toBe(true);
  });

  it('arrival window is during ingress and deterministic', () => {
    const a = assessEntryReadiness(
      'metlife',
      { ticketSource: 'official', transferConfirmed: true, idPacked: true, bagCompliant: true },
      SEED,
    );
    const b = assessEntryReadiness(
      'metlife',
      { ticketSource: 'official', transferConfirmed: true, idPacked: true, bagCompliant: true },
      SEED,
    );
    expect(a?.arrivalWindow).toEqual(b?.arrivalWindow);
    expect(a?.arrivalWindow.fromMinute).toBeLessThan(0);
    expect(a?.arrivalWindow.toMinute).toBeGreaterThan(a?.arrivalWindow.fromMinute ?? 0);
  });

  it('unknown venue returns undefined', () => {
    const r = assessEntryReadiness(
      'narnia-dome',
      { ticketSource: 'official', transferConfirmed: true, idPacked: true, bagCompliant: true },
      SEED,
    );
    expect(r).toBeUndefined();
  });
});

describe('isWithinArrivalWindow', () => {
  const window = { fromMinute: -120, toMinute: -75 };

  it.each([
    [-120, true],
    [-100, true],
    [-75, true],
    [-74, false],
    [-121, false],
    [30, false], // inside the match, not ingress
  ] as const)('minute %d → %s', (minute, expected) => {
    expect(isWithinArrivalWindow(window, minute)).toBe(expected);
  });
});
