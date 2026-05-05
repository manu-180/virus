import type { Page } from '@playwright/test';

// page.route() intercepts browser→server API calls.
// For Next.js server→Anthropic calls, set ANTHROPIC_BASE_URL in CI to a local mock server.

export async function mockGenerateRoute(
  page: Page,
  opts: { videoId?: string; error?: boolean } = {},
) {
  await page.route('**/api/generate', async route => {
    if (opts.error) {
      await route.fulfill({ status: 500, json: { error: 'internal_error' } });
      return;
    }
    await route.fulfill({
      status: 202,
      json: { ok: true, videoId: opts.videoId ?? 'mock-video-id' },
    });
  });
}

export async function mockSchedulerBatch(page: Page) {
  await page.route('**/api/scheduler/batch', async route => {
    const videoIds = Array.from({ length: 7 }, (_, i) => `batch-video-${i + 1}`);
    const scheduledDates = videoIds.map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      return d.toISOString().split('T')[0];
    });
    await route.fulfill({
      status: 200,
      json: { batchId: 'mock-batch-id', videoIds, scheduledDates },
    });
  });
}

export async function mockVoiceUpload(page: Page, storagePath = 'test/voice-sample.webm') {
  await page.route('**/api/voice/upload-sample', async route => {
    await route.fulfill({ status: 200, json: { storagePath } });
  });
}

export async function mockVoiceClone(page: Page, voiceId = 'mock-voice-id-abc123') {
  await page.route('**/api/voice/clone', async route => {
    await route.fulfill({
      status: 200,
      json: { voiceId, testAudio: null, testAudioMime: null },
    });
  });
}

// Mock video status polling endpoint
export async function mockVideoStatusReady(page: Page, videoId: string) {
  await page.route(`**/api/videos/${videoId}`, async route => {
    await route.fulfill({
      status: 200,
      json: { id: videoId, status: 'ready', video_url: `https://example.com/${videoId}.mp4` },
    });
  });
}
