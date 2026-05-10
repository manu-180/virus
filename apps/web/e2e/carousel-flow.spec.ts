import { test, expect } from '@playwright/test';
import { getAdminClient, getTestUserId } from './fixtures/mock-supabase';
import { TEST_EMAIL } from './auth.setup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLIDE_COUNT = 3;
const CAROUSEL_POLL_TIMEOUT = process.env.CI ? 30_000 : 180_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestProject(userId: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('projects')
    .insert({ user_id: userId, name: 'E2E Carousel Project — auto cleanup', status: 'active' })
    .select('id')
    .single();
  if (error) return null;
  return data.id as string;
}

async function createReadyCarousel(
  userId: string,
  projectId: string,
): Promise<string | null> {
  const admin = getAdminClient();

  const brief = JSON.stringify({
    topic: 'Test E2E carousel',
    angle: 'educational',
    tone: 'direct',
    audience: 'Desarrolladores',
    slideCount: SLIDE_COUNT,
    language: 'es',
    cta: 'Seguinos',
  });

  const { data: carousel, error } = await admin
    .from('carousel_projects')
    .insert({
      project_id: projectId,
      user_id: userId,
      status: 'pending',
      brief,
      style_preset: 'minimal',
      slide_count: SLIDE_COUNT,
    })
    .select('id')
    .single();

  if (error || !carousel) return null;
  const id = carousel.id as string;

  // Insert mock slides (no real images — OK for smoke test)
  const roles = ['hook', 'insight', 'cta'];
  await admin.from('carousel_slides').insert(
    Array.from({ length: SLIDE_COUNT }, (_, idx) => ({
      carousel_id: id,
      idx,
      prompt: `E2E test slide ${idx}`,
      image_path: null,
      composed_path: null,
      overlay_text: JSON.stringify({
        idx,
        role: roles[idx] ?? 'insight',
        headline: `Slide ${idx + 1} headline`,
        visualPrompt: 'abstract test',
      }),
      status: 'ready',
    })),
  );

  // Insert mock captions (3 variants)
  await admin.from('carousel_captions').insert([
    {
      carousel_id: id,
      variant_idx: 0,
      framework: 'pas',
      text: 'Caption PAS de test.\n\n#marketing #test #argentina',
      selected: false,
    },
    {
      carousel_id: id,
      variant_idx: 1,
      framework: 'aida',
      text: 'Caption AIDA de test.\n\n#marketing #test #digital',
      selected: false,
    },
    {
      carousel_id: id,
      variant_idx: 2,
      framework: 'hook_story_cta',
      text: 'Caption contrarian de test.\n\n#marketing #test #contenido',
      selected: false,
    },
  ]);

  // Promote to ready
  await admin
    .from('carousel_projects')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', id);

  return id;
}

async function deleteCarousel(id: string) {
  const admin = getAdminClient();
  await admin.from('carousel_captions').delete().eq('carousel_id', id);
  await admin.from('carousel_slides').delete().eq('carousel_id', id);
  await admin.from('carousel_projects').delete().eq('id', id);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Carousel — happy path E2E', () => {
  let userId: string;
  let testProjectId: string | null = null;
  let carouselId: string | null = null;

  test.beforeAll(async () => {
    userId = await getTestUserId(TEST_EMAIL);
    testProjectId = await createTestProject(userId);
  });

  test.afterAll(async () => {
    if (carouselId) await deleteCarousel(carouselId);
    if (testProjectId) {
      await getAdminClient()
        .from('projects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', testProjectId);
    }
  });

  // ── 1. Form UI ────────────────────────────────────────────────────────────

  test('form en /new tiene campos esenciales visibles', async ({ page }) => {
    await page.goto('/dashboard/carousels/new');
    await expect(page.locator('#topic')).toBeVisible();
    await expect(page.locator('#angle')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generar carrusel/ })).toBeVisible();
    // Estimación de costo visible
    await expect(page.getByText('Estimación de costo')).toBeVisible();
  });

  // ── 2. Pipeline smoke test (DB injection — no real AI, no Inngest) ────────

  test('carousel completo: muestra "Listo" con 3 slides y captions', async ({ page }) => {
    if (!testProjectId) {
      test.skip(true, 'No se pudo crear el proyecto de test');
      return;
    }

    carouselId = await createReadyCarousel(userId, testProjectId);
    if (!carouselId) {
      test.skip(true, 'No se pudo crear el carrusel de test');
      return;
    }

    await page.goto(`/dashboard/carousels/${carouselId}`);

    // Status badge = "Listo"
    await expect(page.getByText('Listo', { exact: true })).toBeVisible({
      timeout: CAROUSEL_POLL_TIMEOUT,
    });

    // 3 slide buttons in gallery
    await expect(
      page.getByRole('button', { name: /Ver slide \d+/ }),
    ).toHaveCount(SLIDE_COUNT, { timeout: 10_000 });

    // Caption section header present
    await expect(page.getByText('Caption', { exact: true }).first()).toBeVisible();

    // "Descargar ZIP" button is enabled when ready
    await expect(
      page.getByRole('button', { name: 'Descargar ZIP' }),
    ).toBeEnabled();
  });

  // ── 3. Download ────────────────────────────────────────────────────────────

  test('Descargar ZIP inicia una descarga con nombre correcto', async ({ page }) => {
    if (!carouselId) {
      test.skip(true, 'No hay carrusel de test — ejecutar test anterior primero');
      return;
    }

    await page.goto(`/dashboard/carousels/${carouselId}`);
    await expect(page.getByText('Listo', { exact: true })).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar ZIP' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/carrusel-.*\.zip$/);

    // Size check: in CI there are no real images so ZIP is small;
    // in full pipeline mode with real images it should exceed 100KB.
    if (!process.env.CI) {
      const path = await download.path();
      if (path) {
        const { statSync } = await import('fs');
        const { size } = statSync(path);
        expect(size).toBeGreaterThan(100_000);
      }
    }
  });

  // ── 4. API validation ──────────────────────────────────────────────────────

  test('POST /api/carousels rechaza request sin auth', async ({ request }) => {
    const res = await request.post('/api/carousels', {
      data: {
        projectId: '00000000-0000-0000-0000-000000000000',
        stylePreset: 'minimal',
        brief: { topic: 'test', angle: 'educational', tone: 'direct', slideCount: 3, language: 'es' },
      },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/carousels rechaza projectId inexistente', async ({ page }) => {
    await page.goto('/dashboard');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/carousels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: '00000000-0000-0000-0000-000000000000',
          stylePreset: 'minimal',
          brief: {
            topic: 'test',
            angle: 'educational',
            tone: 'direct',
            audience: '',
            slideCount: 3,
            language: 'es',
            cta: '',
          },
        }),
      });
      return { status: res.status };
    });

    expect(response.status).toBe(404);
  });

  test('GET /api/carousels/[id]/export rechaza carrusel no-listo', async ({ page }) => {
    if (!testProjectId) {
      test.skip(true, 'No test project');
      return;
    }

    // Create a pending carousel
    const admin = getAdminClient();
    const { data: pending } = await admin
      .from('carousel_projects')
      .insert({
        project_id: testProjectId,
        user_id: userId,
        status: 'pending',
        brief: JSON.stringify({ topic: 'test', angle: 'educational', tone: 'direct', audience: '', slideCount: 3, language: 'es', cta: '' }),
        style_preset: 'minimal',
        slide_count: 3,
      })
      .select('id')
      .single();

    if (!pending) {
      test.skip(true, 'Could not create pending carousel');
      return;
    }

    await page.goto('/dashboard');

    const response = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/carousels/${id}/export`);
      return { status: res.status };
    }, pending.id as string);

    expect(response.status).toBe(409);

    // Cleanup
    await admin.from('carousel_projects').delete().eq('id', pending.id as string);
  });
});
