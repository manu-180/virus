-- ============================================================
-- 0033: Instagram Graph API support
-- ============================================================
--
-- Adds Graph-API-based authentication to ig_accounts. Existing
-- instagrapi-based accounts keep working unchanged.
--
-- New columns:
--   auth_type            : 'instagrapi' (legacy) | 'graph_api' (new)
--   graph_user_id        : Instagram Business Account ID (numeric, from Graph)
--   graph_page_id        : Facebook Page ID this IG is linked to
--   graph_token_secret_id: Vault ref for the long-lived page access token
--   graph_token_expires_at: when the token expires (FB rotates every 60d)
-- ============================================================

ALTER TABLE public.ig_accounts
  ADD COLUMN IF NOT EXISTS auth_type             text        NOT NULL DEFAULT 'instagrapi'
                                                  CHECK (auth_type IN ('instagrapi','graph_api')),
  ADD COLUMN IF NOT EXISTS graph_user_id         text,
  ADD COLUMN IF NOT EXISTS graph_page_id         text,
  ADD COLUMN IF NOT EXISTS graph_token_secret_id uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS graph_token_expires_at timestamptz;

-- For Graph-API accounts, password_secret_id is NULL. We can't drop the
-- existing NOT NULL constraint without breaking existing rows, so we keep
-- the column nullable conditionally via a CHECK that ties it to auth_type.
-- The original migration already required password_secret_id NOT NULL, so
-- we need to relax that:

ALTER TABLE public.ig_accounts
  ALTER COLUMN password_secret_id DROP NOT NULL;

-- Constraint: instagrapi accounts must have a password_secret_id;
-- graph_api accounts must have graph_user_id + graph_token_secret_id.
ALTER TABLE public.ig_accounts
  DROP CONSTRAINT IF EXISTS ig_accounts_auth_consistency_chk;
ALTER TABLE public.ig_accounts
  ADD CONSTRAINT ig_accounts_auth_consistency_chk
  CHECK (
    (auth_type = 'instagrapi' AND password_secret_id IS NOT NULL)
    OR
    (auth_type = 'graph_api'
       AND graph_user_id IS NOT NULL
       AND graph_token_secret_id IS NOT NULL
       AND graph_page_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS ig_accounts_graph_user_idx
  ON public.ig_accounts (graph_user_id)
  WHERE auth_type = 'graph_api' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ig_accounts_token_expiry_idx
  ON public.ig_accounts (graph_token_expires_at)
  WHERE auth_type = 'graph_api' AND deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- RPC: Upsert Graph API account
--
-- Used by the OAuth callback handler. If an account with the same
-- (project_id, ig_username) exists, refresh its token + metadata.
-- Otherwise create a new row.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_upsert_graph(
  p_project_id      uuid,
  p_ig_username     text,
  p_display_name    text,
  p_graph_user_id   text,
  p_graph_page_id   text,
  p_access_token    text,
  p_expires_at      timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_owner_id    uuid;
  v_account_id  uuid;
  v_secret_id   uuid;
  v_existing_secret uuid;
BEGIN
  IF v_caller_id IS NULL AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'project_not_found: %', p_project_id;
  END IF;

  IF v_caller_id IS NOT NULL AND v_owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(coalesce(p_access_token, '')) < 10 THEN
    RAISE EXCEPTION 'access_token_required';
  END IF;
  IF length(coalesce(p_graph_user_id, '')) < 1 THEN
    RAISE EXCEPTION 'graph_user_id_required';
  END IF;

  -- Look for an existing (project, username) row
  SELECT id, graph_token_secret_id
    INTO v_account_id, v_existing_secret
  FROM public.ig_accounts
  WHERE project_id = p_project_id
    AND ig_username = p_ig_username
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    -- Update existing token in vault (or create if it was instagrapi-only)
    IF v_existing_secret IS NOT NULL THEN
      PERFORM vault.update_secret(v_existing_secret, p_access_token);
      v_secret_id := v_existing_secret;
    ELSE
      v_secret_id := vault.create_secret(
        p_access_token,
        'ig_account.graph_token.' || v_account_id::text,
        'Graph API long-lived token for ' || p_ig_username
      );
    END IF;

    UPDATE public.ig_accounts
    SET auth_type = 'graph_api',
        display_name = COALESCE(p_display_name, display_name),
        graph_user_id = p_graph_user_id,
        graph_page_id = p_graph_page_id,
        graph_token_secret_id = v_secret_id,
        graph_token_expires_at = p_expires_at,
        status = 'active',
        last_error = NULL,
        last_action_at = NOW()
    WHERE id = v_account_id;

    RETURN v_account_id;
  END IF;

  -- New account
  v_account_id := gen_random_uuid();
  v_secret_id := vault.create_secret(
    p_access_token,
    'ig_account.graph_token.' || v_account_id::text,
    'Graph API long-lived token for ' || p_ig_username
  );

  INSERT INTO public.ig_accounts (
    id, project_id, user_id, ig_username, display_name,
    auth_type, graph_user_id, graph_page_id,
    graph_token_secret_id, graph_token_expires_at,
    status, last_action_at
  ) VALUES (
    v_account_id, p_project_id, v_owner_id, p_ig_username, p_display_name,
    'graph_api', p_graph_user_id, p_graph_page_id,
    v_secret_id, p_expires_at,
    'active', NOW()
  );

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_upsert_graph(uuid, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_upsert_graph(uuid, text, text, text, text, text, timestamptz)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- RPC: Get decrypted Graph API token (publisher only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_get_graph_token(p_account_id uuid)
RETURNS TABLE (
  access_token   text,
  graph_user_id  text,
  graph_page_id  text,
  ig_username    text,
  expires_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
  v_user_id   text;
  v_page_id   text;
  v_username  text;
  v_expires   timestamptz;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT a.graph_token_secret_id, a.graph_user_id, a.graph_page_id,
         a.ig_username, a.graph_token_expires_at
    INTO v_secret_id, v_user_id, v_page_id, v_username, v_expires
  FROM public.ig_accounts a
  WHERE a.id = p_account_id
    AND a.auth_type = 'graph_api'
    AND a.deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'graph_account_not_found_or_no_token: %', p_account_id;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_secret_id)::text,
    v_user_id,
    v_page_id,
    v_username,
    v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_get_graph_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_get_graph_token(uuid) TO service_role;

-- ─────────────────────────────────────────────
-- RPC: Refresh Graph API token (called by the cron refresh job)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ig_account_refresh_graph_token(
  p_account_id  uuid,
  p_new_token   text,
  p_expires_at  timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT graph_token_secret_id INTO v_secret_id
  FROM public.ig_accounts
  WHERE id = p_account_id AND auth_type = 'graph_api';

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'graph_account_not_found: %', p_account_id;
  END IF;

  PERFORM vault.update_secret(v_secret_id, p_new_token);

  UPDATE public.ig_accounts
  SET graph_token_expires_at = p_expires_at,
      last_action_at = NOW(),
      status = 'active',
      last_error = NULL
  WHERE id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_account_refresh_graph_token(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ig_account_refresh_graph_token(uuid, text, timestamptz) TO service_role;

COMMENT ON COLUMN public.ig_accounts.auth_type IS
  'Auth method: instagrapi (legacy, password+session) or graph_api (official Meta API).';
