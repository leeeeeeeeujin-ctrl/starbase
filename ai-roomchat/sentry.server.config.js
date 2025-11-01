// Server-side Sentry initialization for Next.js
const Sentry = require('@sentry/nextjs');

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
  environment: process.env.NODE_ENV || 'development',
  beforeSend(event, hint) {
    // Scrub common PII fields from exception/event payloads before sending.
    try {
      if (event.request && event.request.headers) {
        const headers = { ...event.request.headers };
        delete headers.authorization;
        delete headers['x-api-key'];
        delete headers.cookie;
        event.request.headers = headers;
      }
      if (event.user) {
        // Remove identifying user fields except an id if present
        const id = event.user.id;
        event.user = id ? { id } : undefined;
      }
      // Remove potentially large request body
      if (event.request && event.request.data) {
        event.request.data = '[removed]';
      }
    } catch (e) {
      // ignore
    }
    return event;
  }
});

module.exports = Sentry;
