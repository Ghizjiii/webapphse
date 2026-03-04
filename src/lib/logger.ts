type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const IS_DEV = import.meta.env.DEV;

function shouldLog(level: LogLevel): boolean {
  if (IS_DEV) return true;
  return level === 'error' || level === 'warn';
}

function format(scope: string, message: string) {
  return `[${scope}] ${message}`;
}

export const logger = {
  error(scope: string, message: string, details?: unknown) {
    if (!shouldLog('error')) return;
    if (details !== undefined) {
      console.error(format(scope, message), details);
      return;
    }
    console.error(format(scope, message));
  },
  warn(scope: string, message: string, details?: unknown) {
    if (!shouldLog('warn')) return;
    if (details !== undefined) {
      console.warn(format(scope, message), details);
      return;
    }
    console.warn(format(scope, message));
  },
  info(scope: string, message: string, details?: unknown) {
    if (!shouldLog('info')) return;
    if (details !== undefined) {
      console.info(format(scope, message), details);
      return;
    }
    console.info(format(scope, message));
  },
  debug(scope: string, message: string, details?: unknown) {
    if (!shouldLog('debug')) return;
    if (details !== undefined) {
      console.debug(format(scope, message), details);
      return;
    }
    console.debug(format(scope, message));
  },
};
