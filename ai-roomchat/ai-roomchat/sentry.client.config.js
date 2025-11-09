// Client-side Sentry initialization for Next.js
// This file will be loaded by @sentry/nextjs when present.
const Sentry = require('@sentry/nextjs');

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
  environment: process.env.NODE_ENV || 'development',
  beforeSend(event, hint) {
    // Basic PII scrubbing: remove request headers that may contain sensitive tokens
    try {
      if (event.request && event.request.headers) {
        const headers = { ...event.request.headers };
        delete headers.authorization;
        delete headers['x-api-key'];
        delete headers.cookie;
        event.request.headers = headers;
      }
    } catch (e) {
      // ignore
    }
    return event;
  }
});

module.exports = Sentry;
