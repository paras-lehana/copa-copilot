// result.test.ts — the Result channel behaves like a lawful either-type.
import { describe, expect, it } from 'vitest';
import { andThen, err, map, ok, unwrapOr } from './result';

describe('ok / err', () => {
  it('ok carries the value with ok=true', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(42);
  });

  it('err carries the error with ok=false', () => {
    const r = err('NOT_FOUND');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NOT_FOUND');
  });
});

describe('map', () => {
  it('transforms ok values', () => {
    const r = map(ok(2), (n) => n * 2);
    expect(r.ok && r.value).toBe(4);
  });

  it('passes errors through untouched', () => {
    const r = map(err('E'), (n: number) => n * 2);
    expect(!r.ok && r.error).toBe('E');
  });
});

describe('andThen', () => {
  it('chains ok results', () => {
    const r = andThen(ok(2), (n) => ok(n * 3));
    expect(r.ok && r.value).toBe(6);
  });

  it('short-circuits on the first error', () => {
    const r = andThen(err('FIRST'), () => ok(1));
    expect(!r.ok && r.error).toBe('FIRST');
  });

  it('propagates errors from the chained function', () => {
    const r = andThen(ok(2), () => err('SECOND'));
    expect(!r.ok && r.error).toBe('SECOND');
  });
});

describe('unwrapOr', () => {
  it('returns the value for ok', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
  });

  it('returns the fallback for err', () => {
    expect(unwrapOr(err('E'), 7)).toBe(7);
  });
});
