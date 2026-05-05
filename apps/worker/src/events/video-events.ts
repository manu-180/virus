/**
 * Inngest event payloads for the video generation pipeline.
 *
 * These event names mirror the shared `packages/inngest` Events type so that
 * the worker client can type-safely send and listen for every stage of the
 * pipeline: idea approval → scripting → audio → captions → rendering → done.
 */

export interface IdeaApprovedEvent {
  name: 'virus/idea.approved';
  data: {
    videoId: string;
    userId: string;
  };
}

export interface ScriptGeneratedEvent {
  name: 'virus/script.generated';
  data: {
    videoId: string;
  };
}

export interface AudioSynthesizedEvent {
  name: 'virus/audio.synthesized';
  data: {
    videoId: string;
    audioPath: string;
  };
}

export interface CaptionsReadyEvent {
  name: 'virus/captions.ready';
  data: {
    videoId: string;
  };
}

export interface RenderRequestedEvent {
  name: 'virus/render.requested';
  data: {
    videoId: string;
  };
}

export interface RenderCompletedEvent {
  name: 'virus/render.completed';
  data: {
    videoId: string;
    videoUrl: string;
  };
}

export interface RenderFailedEvent {
  name: 'virus/render.failed';
  data: {
    videoId: string;
    error: string;
  };
}

export interface CaptionGeneratedEvent {
  name: 'virus/caption.generated';
  data: {
    videoId: string;
  };
}

export interface GenerateRequestedEvent {
  name: 'virus/generate.requested';
  data: {
    videoId: string;
    projectId: string;
    userId: string;
  };
}

export type VideoEvents = {
  'virus/idea.approved': IdeaApprovedEvent;
  'virus/script.generated': ScriptGeneratedEvent;
  'virus/audio.synthesized': AudioSynthesizedEvent;
  'virus/captions.ready': CaptionsReadyEvent;
  'virus/render.requested': RenderRequestedEvent;
  'virus/render.completed': RenderCompletedEvent;
  'virus/render.failed': RenderFailedEvent;
  'virus/caption.generated': CaptionGeneratedEvent;
  'virus/generate.requested': GenerateRequestedEvent;
};
