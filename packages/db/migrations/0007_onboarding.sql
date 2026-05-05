-- T4-P07 Migration 0007: Onboarding tracking columns on profiles
--
-- onboarding_completed_at  — null = wizard incomplete (used by OnboardingGate)
-- onboarding_voice_skipped — true = user chose default voice instead of cloning
--
-- Both columns use ADD COLUMN IF NOT EXISTS for idempotency.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_voice_skipped boolean NOT NULL DEFAULT false;
