/**
 * generate-script — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/idea.approved`
 * Payload: { videoId: string; userId: string }
 *
 * Flow:
 *  1. Load the videos row
 *  2. Load the video_ideas row (hook, angle, format, estimated_duration)
 *  3. Load project_patterns (is_current=true)
 *  4. Load project_brand (is_current=true)
 *  5. Load the profiles row (default_voice_clone_id, default_language)
 *  6. Call writeScript() via the @virus/shared/ai package
 *  7. Validate: segments ordered + timing coherent (within 0.5 s)
 *  8. Update videos: { script, status:'audio', template, theme_color, language }
 *  9. Update video_ideas: { status:'scripted' }
 * 10. Insert job_events audit row
 * 11. Send virus/script.generated event
 *
 * On any failure: set video status to 'failed', persist error message, and
 * send virus/render.failed so downstream can clean up.
 *
 * Idempotency: all DB writes are safe on retry — the video update is a SET of
 * the same derived values; the job_events insert is append-only (audit log).
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { getVideoOrFail, setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { writeScript } from '@virus/shared/ai';
import type { ScriptOutput } from '@virus/shared/ai';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// Types for DB rows not covered by the shared DB package
// ---------------------------------------------------------------------------

interface VideoIdeaRow {
  id: string;
  project_id: string;
  hook: string;
  angle: string;
  format: string;
  estimated_duration: number;
}

interface ProjectPatternsRow {
  hooks: unknown;
  formats: unknown;
  pacing: unknown;
  visual_elements: unknown;
  cta_templates: unknown;
  hashtags: unknown;
}

interface ProjectBrandRow {
  brand_name: unknown;
  one_liner: unknown;
  voice_tone: unknown;
  ctas: unknown;
  do_not_say: unknown;
  audience: unknown;
}

interface ProfileRow {
  default_voice_clone_id: string | null;
  default_language: string | null;
}

// ---------------------------------------------------------------------------
// Helper: reconstruct domain objects from flat DB columns
// ---------------------------------------------------------------------------

function buildPatterns(projectId: string, row: ProjectPatternsRow): ProjectPatterns {
  return {
    projectId,
    hooks: (row.hooks as ProjectPatterns['hooks']) ?? [],
    formats: (row.formats as ProjectPatterns['formats']) ?? [],
    topics: [],
    pacing: (row.pacing as ProjectPatterns['pacing']) ?? {
      audioSpeedMultiplier: { min: 1.1, max: 1.3 },
      cutEverySec: { min: 2, max: 4 },
      ideaDensitySec: 2,
      musicBpm: { min: 80, max: 140 },
      voiceLufs: -16,
      musicLufs: -30,
      duckingDb: -12,
    },
    visualElements: (row.visual_elements as ProjectPatterns['visualElements']) ?? [],
    ctaTemplates: (row.cta_templates as string[]) ?? [],
    hashtags: (row.hashtags as ProjectPatterns['hashtags']) ?? {
      reels: [],
      tiktok: [],
      shorts: [],
    },
    captionTemplates: {} as ProjectPatterns['captionTemplates'],
    language: 'es',
    parsedAt: new Date().toISOString(),
  };
}

function buildBrand(projectId: string, row: ProjectBrandRow): ProjectBrand {
  return {
    projectId,
    brandName: (row.brand_name as string) ?? '',
    oneLiner: (row.one_liner as string) ?? '',
    voiceTone: (row.voice_tone as string) ?? 'conversacional',
    ctas: (row.ctas as ProjectBrand['ctas']) ?? [],
    doNotSay: (row.do_not_say as string[]) ?? [],
    audience: (row.audience as ProjectBrand['audience']) ?? {
      who: '',
      where: '',
      pains: [],
    },
    valueProps: [],
    features: [],
    caseStudies: [],
    parsedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate segment ordering and timing coherence.
 *
 * Note: writeScript() already performs the endSec vs totalDurationSec check
 * internally and throws on mismatch. We repeat it here as an explicit pipeline
 * guard step so Inngest traces show the validation as a distinct, named step.
 */
function validateScript(script: ScriptOutput): void {
  const { segments, totalDurationSec } = script;

  // Segments must be ordered by index
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    if (prev === undefined || curr === undefined) continue;
    if (curr.index <= prev.index) {
      throw new Error(
        `validate_script: segment ${curr.index} is out of order after segment ${prev.index}`,
      );
    }
    if (curr.startSec < prev.endSec) {
      throw new Error(
        `validate_script: segment ${curr.index} startSec (${curr.startSec}) overlaps previous endSec (${prev.endSec})`,
      );
    }
  }

  // Last segment endSec must match totalDurationSec within 0.5 s
  const last = segments[segments.length - 1];
  if (last !== undefined && Math.abs(last.endSec - totalDurationSec) > 0.5) {
    throw new Error(
      `validate_script: segments end at ${last.endSec}s but totalDurationSec=${totalDurationSec} (drift > 0.5s)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateScript = inngest.createFunction(
  {
    id: 'generate-script',
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as parse-project-file.ts.
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string; userId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;
      const userId = original?.data?.userId;

      console.log({
        fn: 'generate-script',
        step: 'onFailure',
        videoId,
        userId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[generate-script] onFailure setVideoStatus failed', setErr);
      }

      try {
        await inngest.send({
          name: 'virus/render.failed',
          data: { videoId, error: error?.message ?? 'unknown_error' },
        });
      } catch (sendErr) {
        console.error('[generate-script] onFailure send render.failed failed', sendErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'generate-script',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[generate-script] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/idea.approved' },
  async ({ event, step }) => {
    const { videoId, userId } = event.data;

    console.log({ fn: 'generate-script', step: 'start', videoId, userId });

    // ------------------------------------------------------------------
    // 1. Load video row
    // ------------------------------------------------------------------
    const video: VideoRow = await step.run('load-video', () =>
      getVideoOrFail(videoId, userId),
    );

    console.log({ fn: 'generate-script', step: 'load-video', videoId, status: video.status });

    // ------------------------------------------------------------------
    // 2. Load video_ideas row
    // ------------------------------------------------------------------
    const idea: VideoIdeaRow = await step.run('load-idea', async () => {
      if (!video.idea_id) {
        throw new Error(`idea_missing:${videoId} — video has no idea_id`);
      }
      const db = getAdminClient();
      const { data, error } = await db
        .from('video_ideas')
        .select('id, project_id, hook, angle, format, estimated_duration')
        .eq('id', video.idea_id)
        .single();

      if (error || !data) {
        throw new Error(
          `idea_not_found:${videoId} — ${error?.message ?? 'no data'}`,
        );
      }

      console.log({ fn: 'generate-script', step: 'load-idea', videoId, format: data.format });
      return data as VideoIdeaRow;
    });

    // ------------------------------------------------------------------
    // 3. Load project_patterns
    // ------------------------------------------------------------------
    const patterns: ProjectPatterns = await step.run('load-patterns', async () => {
      const db = getAdminClient();
      const { data, error } = await db
        .from('project_patterns')
        .select('hooks, formats, pacing, visual_elements, cta_templates, hashtags, raw')
        .eq('project_id', video.project_id)
        .eq('is_current', true)
        .single();

      if (error || !data) {
        throw new Error(
          `patterns_not_found:${video.project_id} — ${error?.message ?? 'no data'}`,
        );
      }

      console.log({ fn: 'generate-script', step: 'load-patterns', videoId, projectId: video.project_id });
      return buildPatterns(video.project_id, data as ProjectPatternsRow);
    });

    // ------------------------------------------------------------------
    // 4. Load project_brand
    // ------------------------------------------------------------------
    const brand: ProjectBrand = await step.run('load-brand', async () => {
      const db = getAdminClient();
      const { data, error } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', video.project_id)
        .eq('is_current', true)
        .single();

      if (error || !data) {
        throw new Error(
          `brand_not_found:${video.project_id} — ${error?.message ?? 'no data'}`,
        );
      }

      console.log({ fn: 'generate-script', step: 'load-brand', videoId, projectId: video.project_id });
      return buildBrand(video.project_id, data as ProjectBrandRow);
    });

    // ------------------------------------------------------------------
    // 5. Load profiles row
    // ------------------------------------------------------------------
    const profile: ProfileRow = await step.run('load-profile', async () => {
      const db = getAdminClient();
      const { data, error } = await db
        .from('profiles')
        .select('default_voice_clone_id, default_language')
        .eq('id', userId)
        .single();

      if (error || !data) {
        throw new Error(
          `profile_not_found:${userId} — ${error?.message ?? 'no data'}`,
        );
      }

      console.log({ fn: 'generate-script', step: 'load-profile', videoId, userId });
      return data as ProfileRow;
    });

    // ------------------------------------------------------------------
    // 6. Call writeScript() (Claude) — guarded by Anthropic quota
    // ------------------------------------------------------------------
    const script: ScriptOutput = await step.run('generate-script', () => {
      console.log({ fn: 'generate-script', step: 'generate-script', videoId });
      // Conservative per-call estimate for Sonnet (~3k in + 800 out tokens ≈ $0.02; use $0.05)
      const ESTIMATED_COST_USD = 0.05;
      return withQuota('anthropic', userId, ESTIMATED_COST_USD, async () => {
        const result = await writeScript({
          hook: idea.hook,
          angle: idea.angle,
          format: idea.format as Parameters<typeof writeScript>[0]['format'],
          estimatedDurationSec: idea.estimated_duration,
          patterns,
          brand,
        });
        return { result, actualCost: ESTIMATED_COST_USD, actualUnits: 3800 };
      });
    });

    // ------------------------------------------------------------------
    // 7. Validate script
    // ------------------------------------------------------------------
    await step.run('validate-script', () => {
      console.log({
        fn: 'generate-script',
        step: 'validate-script',
        videoId,
        segments: script.segments.length,
        totalDurationSec: script.totalDurationSec,
      });
      validateScript(script);
    });

    // ------------------------------------------------------------------
    // 8. Update videos row
    // ------------------------------------------------------------------
    await step.run('update-video', () => {
      console.log({ fn: 'generate-script', step: 'update-video', videoId, status: 'audio' });
      return setVideoStatus(videoId, 'audio', {
        script,
        template: script.recommendedTemplate,
        theme_color: script.themeColor,
        language: profile.default_language,
      });
    });

    // ------------------------------------------------------------------
    // 9. Update video_ideas row
    // ------------------------------------------------------------------
    await step.run('update-idea', async () => {
      const db = getAdminClient();
      const { error } = await db
        .from('video_ideas')
        .update({ status: 'scripted' })
        .eq('id', idea.id);

      if (error) {
        throw new Error(`update_idea_failed:${videoId} — ${error.message}`);
      }

      console.log({ fn: 'generate-script', step: 'update-idea', videoId, status: 'scripted' });
    });

    // ------------------------------------------------------------------
    // 10. Insert job_events audit row
    // ------------------------------------------------------------------
    await step.run('log-job-event', () => {
      console.log({ fn: 'generate-script', step: 'log-job-event', videoId });
      return logJobEvent(videoId, 'generate-script', 'completed', {
        segments: script.segments.length,
        totalDurationSec: script.totalDurationSec,
        recommendedTemplate: script.recommendedTemplate,
        themeColor: script.themeColor,
        musicMood: script.musicMood,
      });
    });

    // ------------------------------------------------------------------
    // 11. Emit virus/script.generated
    // ------------------------------------------------------------------
    await step.sendEvent('emit-script-generated', {
      name: 'virus/script.generated',
      data: { videoId },
    });

    console.log({ fn: 'generate-script', step: 'done', videoId });

    return { ok: true, videoId, totalDurationSec: script.totalDurationSec };
  },
);
