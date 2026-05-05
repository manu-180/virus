import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  environment: process.env.NODE_ENV,

  // Strip PII: no emails, no voiceover content
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    // Scrub voiceover-related breadcrumbs
    if (event.breadcrumbs?.values) {
      event.breadcrumbs.values = event.breadcrumbs.values.map((crumb) => {
        if (crumb.data?.voiceover_text) {
          crumb.data.voiceover_text = "[REDACTED]";
        }
        return crumb;
      });
    }
    return event;
  },
});
