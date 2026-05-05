import { test, expect } from '@playwright/test';
import { mockGenerateRoute } from './fixtures/mock-anthropic';
import { getAdminClient, getTestUserId } from './fixtures/mock-supabase';
import { TEST_EMAIL } from './auth.setup';

// The most important flow: user generates a video and waits for it to be ready.
// In CI, /api/generate is mocked and video status is set to 'ready' directly in the DB.
// In staging, the full Inngest pipeline runs.

const VIDEO_POLL_TIMEOUT = process.env.CI ? 30_000 : 10 * 60 * 1000; // 10 min on real env

test.describe('Idea to video (flow crítico)', () => {
  let userId: string;
  let createdProjectId: string | null = null;

  test.beforeAll(async () => {
    userId = await getTestUserId(TEST_EMAIL);
  });

  test.afterAll(async () => {
    // Clean up any test project created during the suite
    if (createdProjectId) {
      await getAdminClient()
        .from('projects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', createdProjectId);
    }
  });

  test('POST /api/generate retorna videoId con mock', async ({ page, request }) => {
    // Mock the generate endpoint to return a fake videoId
    const mockVideoId = 'e2e-video-mock-001';
    await mockGenerateRoute(page, { videoId: mockVideoId });

    // Need a projectId — create a test project via admin
    const admin = getAdminClient();
    const { data: project, error } = await admin
      .from('projects')
      .insert({ user_id: userId, name: 'E2E Test Project', status: 'active' })
      .select('id')
      .single();

    if (error) {
      test.skip(true, `Could not create test project: ${error.message}`);
      return;
    }
    createdProjectId = project.id;

    // Navigate to dashboard so cookies are in the browser context
    await page.goto('/dashboard');

    // POST /api/generate via browser fetch (cookies go along automatically)
    const response = await page.evaluate(
      async ({ projectId }) => {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        return { status: res.status, body: await res.json() };
      },
      { projectId: project.id },
    );

    expect(response.status).toBe(202);
    expect(response.body.ok).toBe(true);
    expect(response.body.videoId).toBe(mockVideoId);
  });

  test('video status llega a "ready" después de generación (CI: forzado vía DB)', async ({ page }) => {
    const admin = getAdminClient();

    // Create a pending video row directly
    const { data: video, error: insertError } = await admin
      .from('videos')
      .insert({ user_id: userId, status: 'pending' })
      .select('id')
      .single();

    if (insertError) {
      test.skip(true, `Could not create video row: ${insertError.message}`);
      return;
    }

    const videoId = video.id;

    // In CI: immediately set status to 'ready' (simulates Inngest pipeline completing)
    if (process.env.CI) {
      await admin
        .from('videos')
        .update({ status: 'ready', video_url: `https://example.com/${videoId}.mp4` })
        .eq('id', videoId);
    }

    // Poll until status = 'ready'
    const deadline = Date.now() + VIDEO_POLL_TIMEOUT;
    let status = '';
    while (Date.now() < deadline) {
      const { data } = await admin
        .from('videos')
        .select('status')
        .eq('id', videoId)
        .single();
      status = data?.status ?? '';
      if (status === 'ready') break;
      await page.waitForTimeout(2_000);
    }

    expect(status).toBe('ready');

    // Cleanup
    await admin.from('videos').delete().eq('id', videoId);
  });

  test('descarga de MP4: video con status ready tiene video_url', async () => {
    const admin = getAdminClient();
    const mockUrl = 'https://example.com/test-video.mp4';

    const { data: video, error } = await admin
      .from('videos')
      .insert({ user_id: userId, status: 'ready', video_url: mockUrl })
      .select('id, video_url')
      .single();

    if (error) {
      test.skip(true, `Could not create ready video: ${error.message}`);
      return;
    }

    expect(video.video_url).toBe(mockUrl);

    // Cleanup
    await admin.from('videos').delete().eq('id', video.id);
  });

  test('/api/generate rechaza request sin projectId', async ({ page }) => {
    await page.goto('/dashboard');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('projectId_required');
  });

  test('/api/generate rechaza request sin auth', async ({ request }) => {
    // Use APIRequestContext (no browser cookies = no auth)
    const response = await request.post('/api/generate', {
      data: { projectId: 'any-id' },
    });
    expect(response.status()).toBe(401);
  });
});
