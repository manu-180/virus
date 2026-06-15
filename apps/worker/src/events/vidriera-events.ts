/**
 * Inngest events for the Vidriera-Video weekly factory (FASE HORNO).
 *
 * The orchestrator runs on a Saturday cron, but also listens for a manual
 * `vidriera/run.requested` event so a run can be triggered on demand (from the
 * Inngest dashboard or a script) — with an optional dryRun that produces the
 * video and runs the fail-safes but skips the actual publish + DB mark.
 */
export interface VidrieraRunRequestedEvent {
  name: 'vidriera/run.requested';
  data: {
    /** When true: build + run fail-safes but DON'T publish or mark the demo. */
    dryRun?: boolean;
  };
}

export type VidrieraEvents = {
  'vidriera/run.requested': VidrieraRunRequestedEvent;
};
