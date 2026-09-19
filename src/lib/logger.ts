import { redact } from './json';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

/**
 * Structured single-line JSON logging. Values pass through the same redactor
 * used for audit rows, so a stray credential in a payload cannot be logged.
 * In production, point your log drain at stdout.
 */
function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const serialised = JSON.stringify(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else console.log(serialised);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
  child: (base: Record<string, unknown>) => ({
    debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, { ...base, ...c }),
    info: (m: string, c?: Record<string, unknown>) => emit('info', m, { ...base, ...c }),
    warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, { ...base, ...c }),
    error: (m: string, c?: Record<string, unknown>) => emit('error', m, { ...base, ...c }),
  }),
};

export function correlationId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
