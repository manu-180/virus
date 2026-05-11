// Web-only re-export of the Inngest client and event-name type map.
//
// The web app uses this to publish events (`inngest.send(...)`). It does NOT
// serve Inngest functions — that's the worker's job (apps/worker). The stub
// function exports that used to live here were removed because:
//   - They had the SAME ids as the real worker functions, so co-registration
//     would cause routing lottery in Inngest Cloud.
//   - The serve() handler was removed from apps/web in commit 4fcaac2.
//   - Keeping them around invited future regressions.
export { inngest } from './client.js';
export type { Events } from './client.js';
