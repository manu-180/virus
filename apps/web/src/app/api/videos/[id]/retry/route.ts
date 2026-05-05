import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * POST /api/videos/:id/retry
 *
 * Resets a failed video back to `pending` and re-emits the appropriate
 * pipeline event. Picks the right event based on how far the video got:
 *  - If no script yet  → re-fire `virus/idea.approved` (full pipeline)
 *  - If script exists  → re-fire `virus/script.generated`
 *  - If audio exists   → re-fire `virus/audio.synthesized`
 *  - If captions exist → re-fire `virus/captions.ready`
 *
 * This avoids redoing expensive steps (audio, captions) when only render
 * needs to be retried.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id: videoId } = await params;
    const admin = createAdminClient();

    const { data: video, error: videoErr } = await admin
      .from('videos')
      .select('id, user_id, status, idea_id, script, audio_url, captions')
      .eq('id', videoId)
      .is('deleted_at', null)
      .single();

    if (videoErr || !video) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (video.user_id !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (video.status !== 'failed') {
      return NextResponse.json({ error: 'not_failed', status: video.status }, { status: 409 });
    }

    let nextStatus: 'pending' | 'scripting' | 'audio' | 'captions' | 'rendering' = 'pending';
    let resumeEvent: { name: string; data: Record<string, unknown> };

    if (video.captions) {
      nextStatus = 'rendering';
      resumeEvent = { name: 'virus/captions.ready', data: { videoId } };
    } else if (video.audio_url) {
      nextStatus = 'captions';
      resumeEvent = {
        name: 'virus/audio.synthesized',
        data: { videoId, audioPath: video.audio_url },
      };
    } else if (video.script) {
      nextStatus = 'audio';
      resumeEvent = { name: 'virus/script.generated', data: { videoId } };
    } else if (video.idea_id) {
      nextStatus = 'pending';
      resumeEvent = {
        name: 'virus/idea.approved',
        data: { videoId, userId: user.id },
      };
    } else {
      return NextResponse.json({ error: 'no_idea_linked' }, { status: 412 });
    }

    await admin
      .from('videos')
      .update({ status: nextStatus, error: null })
      .eq('id', videoId);

    await inngest.send(resumeEvent as Parameters<typeof inngest.send>[0]);

    return NextResponse.json(
      { ok: true, resumedAt: resumeEvent.name, status: nextStatus },
      { status: 202 },
    );
  } catch (err: unknown) {
    console.error('[POST /api/videos/[id]/retry]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
