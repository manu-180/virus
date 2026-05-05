"use client";

import posthog from "posthog-js";

type AnalyticsEvent =
  | { name: "idea_generated"; properties: { project_id: string; idea_id: string } }
  | { name: "idea_approved"; properties: { project_id: string; idea_id: string } }
  | { name: "video_render_started"; properties: { video_id: string; project_id: string; template?: string } }
  | { name: "video_render_completed"; properties: { video_id: string; duration_seconds?: number } }
  | { name: "video_published_marked"; properties: { video_id: string; platform?: string } }
  | { name: "caption_copied"; properties: { video_id: string; platform: "instagram" | "tiktok" | "shorts" } }
  | { name: "voice_clone_completed"; properties: { voice_id: string } }
  | { name: "insight_actioned"; properties: { insight_type: string; action: string } };

export function track(event: AnalyticsEvent) {
  posthog.capture(event.name, event.properties);
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  posthog.identify(userId, properties);
}

export function resetUser() {
  posthog.reset();
}
