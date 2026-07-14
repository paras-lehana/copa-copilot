// result.ts — the Result<T, E> error channel used across every core boundary.
// Boundary: core functions never throw across module boundaries; failures travel as
// values so the API layer can map them onto one safe HTTP envelope.

/** Successful outcome carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed outcome carrying an error value. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** A value-or-error union; the only way core reports failure. */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wrap a value as a successful Result.
 *
 * @example
 * const r = ok(42);
 * if (r.ok) console.assert(r.value === 42);
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wrap an error as a failed Result.
 *
 * @example
 * const r = err('NOT_FOUND');
 * if (!r.ok) console.assert(r.error === 'NOT_FOUND');
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Transform the value of a successful Result, passing errors through untouched.
 *
 * @example
 * map(ok(2), (n) => n * 2); // ok(4)
 * map(err('E'), (n: number) => n * 2); // err('E')
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Chain a Result-returning function onto a successful Result (flatMap).
 *
 * @example
 * andThen(ok(2), (n) => (n > 0 ? ok(n * 2) : err('NEG'))); // ok(4)
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Extract the value, falling back to a default when the Result is an error.
 *
 * @example
 * unwrapOr(err('E'), 7); // 7
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
