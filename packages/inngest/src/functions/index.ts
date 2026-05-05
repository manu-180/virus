import { inngest } from '../client.js';

export const generateScript = inngest.createFunction(
  { id: 'generate-script', concurrency: 5, retries: 2 },
  { event: 'virus/idea.approved' },
  async ({ event }) => {
    // T5-P02 implementa
    return { videoId: event.data.videoId };
  },
);

export const synthesizeAudio = inngest.createFunction(
  { id: 'synthesize-audio', concurrency: 3, retries: 3 },
  { event: 'virus/script.generated' },
  async ({ event }) => {
    return { videoId: event.data.videoId };
  },
);

export const transcribeAudio = inngest.createFunction(
  { id: 'transcribe-audio', concurrency: 5, retries: 3 },
  { event: 'virus/audio.synthesized' },
  async ({ event }) => {
    return { videoId: event.data.videoId };
  },
);

export const renderVideo = inngest.createFunction(
  {
    id: 'render-video',
    concurrency: 5,
    retries: 2,
    throttle: { limit: 10, period: '1m' },
  },
  { event: 'virus/render.requested' },
  async ({ event }) => {
    return { videoId: event.data.videoId };
  },
);

export const generateCaption = inngest.createFunction(
  { id: 'generate-caption', concurrency: 5, retries: 2 },
  { event: 'virus/render.completed' },
  async ({ event }) => {
    return { videoId: event.data.videoId };
  },
);

export const handleFailure = inngest.createFunction(
  { id: 'handle-failure', retries: 0 },
  { event: 'virus/render.failed' },
  async ({ event }) => {
    return { videoId: event.data.videoId };
  },
);

export const generateVideoProjectAware = inngest.createFunction(
  { id: 'generate-video-project-aware', retries: 2, concurrency: { limit: 3, key: 'event.data.userId' } },
  { event: 'virus/generate.requested' },
  async ({ event }) => {
    // Full implementation in apps/worker/src/functions/generate-video-project-aware.ts
    // This stub is registered via packages/inngest for the serve() handler.
    return { videoId: event.data.videoId, projectId: event.data.projectId };
  },
);

export const functions = [
  generateScript,
  synthesizeAudio,
  transcribeAudio,
  renderVideo,
  generateCaption,
  handleFailure,
  generateVideoProjectAware,
];
