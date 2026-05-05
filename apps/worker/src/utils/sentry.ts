import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.2 : 1.0,
    environment: process.env["NODE_ENV"] ?? "development",

    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      return event;
    },
  });
}

export function captureWorkerException(
  error: unknown,
  context?: Record<string, unknown>,
) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}
