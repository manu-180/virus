-- ============================================================
-- 0028: Instagram accounts (multi-account, vault-encrypted)
-- ============================================================
--
-- One row per IG account, scoped to a project. Credentials
-- (password, totp_seed, session_b64) are stored in Supabase
-- Vault and referenced by uuid. The Python publisher service
-- (apps/ig-publisher) reads decrypted secrets via service role.
--
-- Decisions:
-- 1. user_id denormalized for O(1) RLS (same pattern as carousels)
-- 2. status uses TEXT + CHECK (no enum)
-- 3. UNIQUE (project_id, ig_username) WHERE deleted_at IS NULL
--    so a soft-deleted account can be re-onboarded
-- 4. post_count_24h is approximate — reset by publisher on first
--    post of a new 24h window (no scheduled job needed)
-- 5. SECURITY DEFINER RPC `ig_account_create_with_secrets()` lets
--    the onboarding CLI insert + create vault secrets atomically
--    while validating project ownership.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ig_accounts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id                  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_username              text        NOT NULL,
  display_name             text,
  password_secret_id       uuid        NOT NULL REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  totp_seed_secret_id      uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  session_secret_id        uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  session_updated_at       timestamptz,
  status                   text        NOT NULL DEFAULT 'pending_session'
                                       CHECK (status IN (
                                         'pending_session',
                                         'active',
                                         'challenge',
                                         'disabled'
                                       )),
  last_action_at           timestamptz,
  last_post_at             timestamptz,
  post_count_24h           int         NOT NULL DEFAULT 0,
  post_count_24h_reset_at  timestamptz NOT NULL DEFAULT NOW(),
  daily_post_limit         int         NOT NULL DEFAULT 5
                                       CHECK (daily_post_limit BETWEEN 1 AND 25),
  last_error               text,
  deleted_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ig_accounts_project_username_uidx
  ON public.ig_accounts (project_id, ig_username)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ig_accounts_user_idx    ON public.ig_accounts (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ig_accounts_project_idx ON public.ig_accounts (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ig_accounts_status_idx  ON public.ig_accounts (status) WHERE deleted_at IS NULL;

-- denormalize user_id from projects (reuses existing trigger function)
CREATE OR REPLACE TRIGGER copy_user_id_ig_accounts
  BEFORE INSERT ON public.ig_accounts
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE OR REPLACE TRIGGER set_ig_accounts_updated_at
  BEFORE UPDATE ON public.ig_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.ig_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ig_accounts_owner_select
  ON public.ig_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY ig_accounts_owner_insert
  ON public.ig_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY ig_accounts_owner_update
  ON public.ig_accounts FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY ig_accounts_owner_delete
  ON public.ig_accounts FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- service_role bypasses RLS by default — no explicit policy needed

-- ─────────────────────────────────────────────
-- RPC: Create account + secrets in one tx (called by onboarding CLI)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_create_with_secrets(
  p_project_id    uuid,
  p_ig_username   text,
  p_display_name  text,
  p_password      text,
  p_totp_seed     text DEFAULT NULL,
  p_session_b64   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_owner_id    uuid;
  v_account_id  uuid := gen_random_uuid();
  v_pwd_id      uuid;
  v_totp_id     uuid;
  v_session_id  uuid;
  v_status      text := 'pending_session';
BEGIN
  -- Validate caller (must be authenticated OR service_role)
  IF v_caller_id IS NULL AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: must be authenticated or service_role';
  END IF;

  -- Validate project ownership
  SELECT user_id INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'project_not_found: %', p_project_id;
  END IF;

  IF v_caller_id IS NOT NULL AND v_owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'forbidden: caller % does not own project %', v_caller_id, p_project_id;
  END IF;

  -- Validate inputs
  IF length(coalesce(p_password, '')) < 1 THEN
    RAISE EXCEPTION 'password_required';
  END IF;
  IF length(coalesce(p_ig_username, '')) < 1 THEN
    RAISE EXCEPTION 'ig_username_required';
  END IF;

  -- Create vault secrets
  v_pwd_id := vault.create_secret(
    p_password,
    'ig_account.password.' || v_account_id::text,
    'IG password for ' || p_ig_username
  );

  IF p_totp_seed IS NOT NULL AND length(p_totp_seed) > 0 THEN
    v_totp_id := vault.create_secret(
      p_totp_seed,
      'ig_account.totp.' || v_account_id::text,
      'IG TOTP seed for ' || p_ig_username
    );
  END IF;

  IF p_session_b64 IS NOT NULL AND length(p_session_b64) > 0 THEN
    v_session_id := vault.create_secret(
      p_session_b64,
      'ig_account.session.' || v_account_id::text,
      'IG session blob for ' || p_ig_username
    );
    v_status := 'active';
  END IF;

  -- Insert account row
  INSERT INTO public.ig_accounts (
    id, project_id, user_id, ig_username, display_name,
    password_secret_id, totp_seed_secret_id, session_secret_id,
    session_updated_at, status
  ) VALUES (
    v_account_id, p_project_id, v_owner_id, p_ig_username, p_display_name,
    v_pwd_id, v_totp_id, v_session_id,
    CASE WHEN v_session_id IS NOT NULL THEN NOW() ELSE NULL END,
    v_status
  );

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_create_with_secrets(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_create_with_secrets(uuid, text, text, text, text, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- RPC: Update session secret (called by publisher after each post)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_update_session(
  p_account_id   uuid,
  p_session_b64  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_username   text;
BEGIN
  -- Service-role only
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT session_secret_id, ig_username INTO v_session_id, v_username
  FROM public.ig_accounts WHERE id = p_account_id;

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'account_not_found: %', p_account_id;
  END IF;

  IF v_session_id IS NULL THEN
    -- First time: create the secret and link it
    v_session_id := vault.create_secret(
      p_session_b64,
      'ig_account.session.' || p_account_id::text,
      'IG session blob for ' || v_username
    );
    UPDATE public.ig_accounts
    SET session_secret_id = v_session_id,
        session_updated_at = NOW(),
        status = CASE WHEN status = 'pending_session' THEN 'active' ELSE status END
    WHERE id = p_account_id;
  ELSE
    PERFORM vault.update_secret(v_session_id, p_session_b64);
    UPDATE public.ig_accounts
    SET session_updated_at = NOW()
    WHERE id = p_account_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_update_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_update_session(uuid, text) TO service_role;

-- ─────────────────────────────────────────────
-- RPC: Get decrypted secrets for an account (publisher only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_get_secrets(p_account_id uuid)
RETURNS TABLE (
  ig_username  text,
  password     text,
  totp_seed    text,
  session_b64  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_pwd_id     uuid;
  v_totp_id    uuid;
  v_session_id uuid;
  v_username   text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT a.ig_username, a.password_secret_id, a.totp_seed_secret_id, a.session_secret_id
    INTO v_username, v_pwd_id, v_totp_id, v_session_id
  FROM public.ig_accounts a
  WHERE a.id = p_account_id AND a.deleted_at IS NULL;

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'account_not_found_or_deleted: %', p_account_id;
  END IF;

  RETURN QUERY
  SELECT
    v_username,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_pwd_id),
    CASE WHEN v_totp_id IS NULL THEN NULL
         ELSE (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_totp_id)
    END,
    CASE WHEN v_session_id IS NULL THEN NULL
         ELSE (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_session_id)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_get_secrets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_get_secrets(uuid) TO service_role;

-- ─────────────────────────────────────────────
-- RPC: Atomic increment of post counter with 24h window reset
--      Returns true if increment OK (under daily_post_limit),
--      false if rate limit hit. Used by the publisher.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_try_increment_post_count(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count       int;
  v_reset_at    timestamptz;
  v_limit       int;
  v_should_reset boolean;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT post_count_24h, post_count_24h_reset_at, daily_post_limit
    INTO v_count, v_reset_at, v_limit
  FROM public.ig_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'account_not_found: %', p_account_id;
  END IF;

  v_should_reset := (NOW() - v_reset_at) > interval '24 hours';

  IF v_should_reset THEN
    v_count := 0;
    v_reset_at := NOW();
  END IF;

  IF v_count >= v_limit THEN
    -- still update the reset_at if window rolled
    UPDATE public.ig_accounts
    SET post_count_24h = v_count,
        post_count_24h_reset_at = v_reset_at
    WHERE id = p_account_id;
    RETURN false;
  END IF;

  UPDATE public.ig_accounts
  SET post_count_24h = v_count + 1,
      post_count_24h_reset_at = v_reset_at,
      last_post_at = NOW(),
      last_action_at = NOW()
  WHERE id = p_account_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_try_increment_post_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_try_increment_post_count(uuid) TO service_role;

COMMENT ON TABLE public.ig_accounts IS
  'Instagram accounts (one per project). Credentials encrypted in Supabase Vault.';
