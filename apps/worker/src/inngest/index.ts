import { Inngest, EventSchemas } from 'inngest';
import type { ProjectEvents } from '../events/project-events.js';
import type { VideoEvents } from '../events/video-events.js';

/**
 * Single Inngest client used by every function in the worker.
 *
 * The id is the durable application id — must stay stable across deploys for
 * Inngest's run history and retries to be linked to the right function.
 *
 * Schemas merge ProjectEvents (file parsing lifecycle) with VideoEvents (video
 * generation pipeline) so every function in this worker has full type safety
 * when sending or waiting for any event in either domain.
 */
export const inngest = new Inngest({
  id: 'virus-worker',
  schemas: new EventSchemas().fromRecord<ProjectEvents & VideoEvents>(),
});
