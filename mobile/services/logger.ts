/**
 * Privacy-safe logging + a pluggable error reporter.
 *
 * Rules enforced here for the whole app:
 *  - JWTs, passwords, OAuth/refresh tokens, emails and resume/email text are
 *    never written to the console or sent to the crash reporter.
 *  - In production builds nothing is printed to the console at all.
 *
 * Prefer `logger.*` over `console.*`. Values are redacted by KEY NAME (anything
 * that looks like a secret or user content) and by VALUE PATTERN (JWTs, bearer
 * tokens, emails, long opaque tokens).
 */
import { IS_DEV } from '@/services/config';

const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|jwt|refresh|credential|resume|cover|email|body|content|text|description|notes|snippet|subject|dsn|otp|code|state/i;

const PATTERNS: [RegExp, string][] = [
  [/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, '[jwt]'],
  [/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]'],
];

export function scrubString(value: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), value);
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value).slice(0, 500);
  if (typeof value !== 'object') return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

type Reporter = (error: unknown, context?: Record<string, unknown>) => void;
let reporter: Reporter | null = null;
export const setErrorReporter = (r: Reporter | null) => {
  reporter = r;
};

/** Report a handled/unexpected error. Context is redacted before it leaves the device. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    reporter?.(error, context ? (redact(context) as Record<string, unknown>) : undefined);
  } catch {
    // Reporting must never throw into app code.
  }
}

const emit = (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: unknown) => {
  if (!IS_DEV) return; // silent in release builds
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](`[${level}] ${scrubString(message)}`, context === undefined ? '' : redact(context));
};

export const logger = {
  debug: (m: string, c?: unknown) => emit('debug', m, c),
  info: (m: string, c?: unknown) => emit('info', m, c),
  warn: (m: string, c?: unknown) => emit('warn', m, c),
  error: (m: string, c?: unknown) => {
    emit('error', m, c);
    reportError(c instanceof Error ? c : new Error(scrubString(m)), c instanceof Error ? undefined : { detail: c });
  },
};
