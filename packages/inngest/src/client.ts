import { Inngest } from 'inngest';

// eventKey is read automatically from INNGEST_EVENT_KEY env var
export const inngest = new Inngest({ id: 'virus' });

export type Events = {
  'virus/idea.approved':     { data: { videoId: string; userId: string } };
  'virus/script.generated':  { data: { videoId: string } };
  'virus/audio.synthesized': { data: { videoId: string; audioPath: string } };
  'virus/captions.ready':    { data: { videoId: string } };
  'virus/render.requested':  { data: { videoId: string } };
  'virus/render.completed':  { data: { videoId: string; videoUrl: string } };
  'virus/render.failed':     { data: { videoId: string; error: string } };
  'virus/caption.generated':    { data: { videoId: string } };
  'virus/generate.requested':  { data: { videoId: string; projectId: string; userId: string } };
};
