-- ============================================================
-- 0045: YouTube accounts
-- ============================================================
--
-- Almacena canales de YouTube conectados vía Google OAuth 2.0.
-- Los access tokens de Google expiran en 1 hora → se guarda el
-- refresh_token para renovarlos automáticamente en el worker.
--
-- Patrón idéntico a li_accounts (vault-backed tokens).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.yt_accounts (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identidad del canal de YouTube
  yt_channel_id             text        NOT NULL,  -- UCxxxxxxxxxxxx
  yt_channel_title          text        NOT NULL,  -- nombre visible del canal
  display_name              text,

  -- Tokens (vault-backed)
  -- access_token: expira en ~1h → se renueva con refresh_token antes de cada upload
  access_token_secret_id    uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  refresh_token_secret_id   uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  access_token_expires_at   timestamptz,

  -- Estado operativo
  status                    text        NOT NULL DEFAULT 'active'
                                          CHECK (status IN ('active','challenge','disabled')),
  last_error                text,
  last_action_at            timestamptz,

  -- Timestamps
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

ALTER TABLE public.yt_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON public.yt_accounts
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS yt_accounts_project_idx ON public.yt_accounts (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS yt_accounts_user_idx    ON public.yt_accounts (user_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS yt_accounts_channel_idx ON public.yt_accounts (yt_channel_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: Upsert YouTube account (llamada desde el callback OAuth)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.yt_account_upsert(
  p_project_id              uuid,
  p_yt_channel_id           text,
  p_yt_channel_title        text,
  p_display_name            text,
  p_access_token            text,
  p_access_token_expires    timestamptz,
  p_refresh_token           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_caller_id         uuid := auth.uid();
  v_owner_id          uuid;
  v_account_id        uuid;
  v_access_secret     uuid;
  v_refresh_secret    uuid;
  v_existing_access   uuid;
  v_existing_refresh  uuid;
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

  -- Buscar cuenta existente por (project_id, channel_id)
  SELECT id, access_token_secret_id, refresh_token_secret_id
    INTO v_account_id, v_existing_access, v_existing_refresh
  FROM public.yt_accounts
  WHERE project_id = p_project_id
    AND yt_channel_id = p_yt_channel_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    -- Actualizar tokens en vault
    IF v_existing_access IS NOT NULL THEN
      PERFORM vault.update_secret(v_existing_access, p_access_token);
      v_access_secret := v_existing_access;
    ELSE
      v_access_secret := vault.create_secret(
        p_access_token,
        'yt_account.access_token.' || v_account_id::text,
        'YouTube access token for ' || p_yt_channel_title
      );
    END IF;

    IF v_existing_refresh IS NOT NULL THEN
      PERFORM vault.update_secret(v_existing_refresh, p_refresh_token);
      v_refresh_secret := v_existing_refresh;
    ELSE
      v_refresh_secret := vault.create_secret(
        p_refresh_token,
        'yt_account.refresh_token.' || v_account_id::text,
        'YouTube refresh token for ' || p_yt_channel_title
      );
    END IF;

    UPDATE public.yt_accounts
    SET yt_channel_title          = p_yt_channel_title,
        display_name              = COALESCE(p_display_name, display_name),
        access_token_secret_id    = v_access_secret,
        refresh_token_secret_id   = v_refresh_secret,
        access_token_expires_at   = p_access_token_expires,
        status                    = 'active',
        last_error                = NULL,
        last_action_at            = NOW(),
        updated_at                = NOW()
    WHERE id = v_account_id;

    RETURN v_account_id;
  END IF;

  -- Nueva cuenta
  v_account_id := gen_random_uuid();
  v_access_secret := vault.create_secret(
    p_access_token,
    'yt_account.access_token.' || v_account_id::text,
    'YouTube access token for ' || p_yt_channel_title
  );
  v_refresh_secret := vault.create_secret(
    p_refresh_token,
    'yt_account.refresh_token.' || v_account_id::text,
    'YouTube refresh token for ' || p_yt_channel_title
  );

  INSERT INTO public.yt_accounts (
    id, project_id, user_id,
    yt_channel_id, yt_channel_title, display_name,
    access_token_secret_id, refresh_token_secret_id,
    access_token_expires_at,
    status, last_action_at
  ) VALUES (
    v_account_id, p_project_id, v_owner_id,
    p_yt_channel_id, p_yt_channel_title, p_display_name,
    v_access_secret, v_refresh_secret,
    p_access_token_expires,
    'active', NOW()
  );

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.yt_account_upsert(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yt_account_upsert(uuid, text, text, text, text, timestamptz, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: Obtener tokens desencriptados (solo service_role — worker)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.yt_account_get_token(p_account_id uuid)
RETURNS TABLE (
  access_token      text,
  refresh_token     text,
  yt_channel_id     text,
  yt_channel_title  text,
  expires_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_access_id   uuid;
  v_refresh_id  uuid;
  v_channel_id  text;
  v_title       text;
  v_expires     timestamptz;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT a.access_token_secret_id, a.refresh_token_secret_id,
         a.yt_channel_id, a.yt_channel_title, a.access_token_expires_at
    INTO v_access_id, v_refresh_id, v_channel_id, v_title, v_expires
  FROM public.yt_accounts a
  WHERE a.id = p_account_id AND a.deleted_at IS NULL;

  IF v_access_id IS NULL THEN
    RAISE EXCEPTION 'yt_account_not_found: %', p_account_id;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_access_id)::text,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_refresh_id)::text,
    v_channel_id,
    v_title,
    v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.yt_account_get_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yt_account_get_token(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: Actualizar access_token tras renovación (solo service_role)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.yt_account_update_token(
  p_account_id        uuid,
  p_new_access_token  text,
  p_new_expires_at    timestamptz
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

  SELECT access_token_secret_id INTO v_secret_id
  FROM public.yt_accounts
  WHERE id = p_account_id AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'yt_account_not_found: %', p_account_id;
  END IF;

  PERFORM vault.update_secret(v_secret_id, p_new_access_token);

  UPDATE public.yt_accounts
  SET access_token_expires_at = p_new_expires_at,
      last_action_at          = NOW(),
      status                  = 'active',
      last_error              = NULL,
      updated_at              = NOW()
  WHERE id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.yt_account_update_token(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yt_account_update_token(uuid, text, timestamptz) TO service_role;

COMMENT ON TABLE public.yt_accounts IS 'Canales de YouTube conectados vía Google OAuth 2.0 para publicación automática de Shorts.';
