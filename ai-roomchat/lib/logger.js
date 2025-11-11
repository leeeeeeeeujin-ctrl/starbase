// Minimal logger wrapper. Replace with structured logger (pino/winston) later.
let logger;
try {
  // Use pino when available for structured, high-performance logging.
  const pino = require('pino');
  logger = pino({ level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'debug' : 'info'),
    transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  });
} catch (e) {
  // Fallback: small console wrapper
  function formatArg(v) {
    if (v instanceof Error) return `${v.message}\n${v.stack}`;
    try {
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch (err) {
      return String(v);
    }
  }
  logger = {
    info: (...args) => console.info('[app]', ...args.map(formatArg).join(' ')),
    warn: (...args) => console.warn('[app]', ...args.map(formatArg).join(' ')),
    error: (...args) => console.error('[app]', ...args.map(formatArg).join(' ')),
    debug: (...args) => console.debug('[app]', ...args.map(formatArg).join(' ')),
  };
}

module.exports = logger;
