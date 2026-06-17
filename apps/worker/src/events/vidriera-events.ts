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

export interface VidreiraLinkedinPublishRequestedEvent {
  name: 'vidriera/linkedin.publish.requested';
  data: {
    demoId:         string;
    demoSlug:       string;
    /** Path en el bucket `videos` de VHIRUS. El publisher lo borra tras subir a LinkedIn. */
    storagePath:    string;
    caption:        string;
    title:          string;
    liAccountId:    string;
    reelPermalink:  string | null;
  };
}

export interface VidrieraFacebookPublishRequestedEvent {
  name: 'vidriera/facebook.publish.requested';
  data: {
    demoId:        string;
    demoSlug:      string;
    /** Path en el bucket `videos` de VHIRUS. El publisher lo borra tras subir a Facebook. */
    storagePath:   string;
    caption:       string;
    title:         string;
    igAccountId:   string;
    reelPermalink: string | null;
  };
}

export interface VidrieraYoutubePublishRequestedEvent {
  name: 'vidriera/youtube.publish.requested';
  data: {
    demoId:       string;
    demoSlug:     string;
    /** Path en el bucket `videos` de VHIRUS. El publisher lo borra tras subir a YouTube. */
    storagePath:  string;
    caption:      string;
    title:        string;
    ytAccountId:  string;
    reelPermalink: string | null;
  };
}

export type VidrieraEvents = {
  'vidriera/run.requested':               VidrieraRunRequestedEvent;
  'vidriera/linkedin.publish.requested':  VidreiraLinkedinPublishRequestedEvent;
  'vidriera/facebook.publish.requested':  VidrieraFacebookPublishRequestedEvent;
  'vidriera/youtube.publish.requested':   VidrieraYoutubePublishRequestedEvent;
};
