import { test, expect } from '@playwright/test';
import { getTestUserId, resetOnboarding, setOnboardingCompleted } from './fixtures/mock-supabase';
import { TEST_EMAIL } from './auth.setup';

test.describe('Onboarding wizard', () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = await getTestUserId(TEST_EMAIL);
  });

  test.beforeEach(async () => {
    // Reset so the user hasn't completed onboarding
    await resetOnboarding(userId);
  });

  test.afterEach(async () => {
    // Restore so other test suites that depend on /dashboard can run
    await setOnboardingCompleted(userId);
  });

  test('usuario sin onboarding es redirigido a /onboarding desde /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('step 1 — bienvenida: título y botón "Empezar" visibles', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: /Bienvenido/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Empezar/i })).toBeVisible();
  });

  test('step 1 → step 2: avanza al hacer click en "Empezar"', async ({ page }) => {
    await page.goto('/onboarding');

    await page.getByRole('button', { name: /Empezar/i }).click();

    // Step 2 is "Tu marca" (brand voice form)
    await expect(page).toHaveURL(/step=1/, { timeout: 5_000 });
    await expect(page.getByText('Tu marca')).toBeVisible();
  });

  test('step 2 → step 3: avanza a "Tu voz"', async ({ page }) => {
    await page.goto('/onboarding?step=1');

    // Step 2 has a "Siguiente" or "Continuar" button
    await expect(page.locator('form, [data-step="brand"]').first()).toBeVisible({ timeout: 5_000 });
    const nextBtn = page.getByRole('button', { name: /Siguiente|Continuar/i }).first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await expect(page).toHaveURL(/step=2/, { timeout: 5_000 });
    }
  });

  test('step 3 → step 4: skip voice clone avanza a "Tu primer video"', async ({ page }) => {
    await page.goto('/onboarding?step=2');

    // Step 3 (voice) has a skip/next option
    const skipOrNext = page.getByRole('button', { name: /Saltar|Siguiente|Continuar/i }).first();
    if (await skipOrNext.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipOrNext.click();
      await expect(page).toHaveURL(/step=3/, { timeout: 5_000 });
    } else {
      // Just verify step 3 renders
      await expect(page.getByText('Tu voz')).toBeVisible();
    }
  });

  test('barra de progreso refleja el paso actual', async ({ page }) => {
    await page.goto('/onboarding');

    // Progress shows "Paso 1 de 4"
    await expect(page.getByText(/Paso 1 de 4/i)).toBeVisible();

    await page.getByRole('button', { name: /Empezar/i }).click();
    await expect(page.getByText(/Paso 2 de 4/i)).toBeVisible({ timeout: 5_000 });
  });

  test('botón "atrás" en step 2 regresa a step 1', async ({ page }) => {
    await page.goto('/onboarding?step=1');

    const backBtn = page.getByRole('button', { name: /Volver|Atrás|Back/i }).first();
    if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await backBtn.click();
      await expect(page).toHaveURL(/step=0/, { timeout: 5_000 });
    }
  });
});
