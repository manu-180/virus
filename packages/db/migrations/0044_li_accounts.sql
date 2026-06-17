-- ============================================================
-- 0044: LinkedIn accounts
-- ============================================================
--
-- Almacena cuentas de LinkedIn conectadas vía OAuth 2.0.
-- Patrón idéntico a ig_accounts (Graph API), sin legacy fallback.
--
-- La tabla vive en el proyecto de VHIRUS y el token se guarda
-- en Vault (mismo enfoque que graph_token_secret_id en ig_accounts).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.li_accounts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identidad de LinkedIn
  li_person_urn           text        NOT NULL,          -- urn:li:person:ABC123
  li_username             text        NOT NULL,          -- display name usado como identificador legible
  display_name            text,

  -- Tokens (vault-backed)
  access_token_secret_id  uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  refresh_token_secret_id uuid        REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,

  -- Estado operativo
  status                  text        NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active','challenge','disabled')),
  last_error              text,
  last_action_at          timestamptz,

  -- Timestamps
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

ALTER TABLE public.li_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON public.li_accounts
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS li_accounts_project_idx ON public.li_accounts (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS li_accounts_user_idx    ON public.li_accounts (user_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS li_accounts_token_exp_idx ON public.li_accounts (access_token_expires_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: Upsert LinkedIn account (llamada desde el callback OAuth)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.li_account_upsert(
  p_project_id             uuid,
  p_li_person_urn          text,
  p_li_username            text,
  p_display_name           text,
  p_access_token           text,
  p_access_token_expires   timestamptz,
  p_refresh_token          text DEFAULT NULL,
  p_refresh_token_expires  timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_caller_id       uuid := auth.uid();
  v_owner_id        uuid;
  v_account_id      uuid;
  v_access_secret   uuid;
  v_refresh_secret  uuid;
  v_existing_access uuid;
  v_existing_refresh uuid;
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

  -- Buscar cuenta existente por (project_id, person_urn)
  SELECT id, access_token_secret_id, refresh_token_secret_id
    INTO v_account_id, v_existing_access, v_existing_refresh
  FROM public.li_accounts
  WHERE project_id = p_project_id
    AND li_person_urn = p_li_person_urn
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
        'li_account.access_token.' || v_account_id::text,
        'LinkedIn access token for ' || p_li_username
      );
    END IF;

    IF p_refresh_token IS NOT NULL THEN
      IF v_existing_refresh IS NOT NULL THEN
        PERFORM vault.update_secret(v_existing_refresh, p_refresh_token);
        v_refresh_secret := v_existing_refresh;
      ELSE
        v_refresh_secret := vault.create_secret(
          p_refresh_token,
          'li_account.refresh_token.' || v_account_id::text,
          'LinkedIn refresh token for ' || p_li_username
        );
      END IF;
    END IF;

    UPDATE public.li_accounts
    SET display_name              = COALESCE(p_display_name, display_name),
        li_username               = p_li_username,
        access_token_secret_id    = v_access_secret,
        refresh_token_secret_id   = COALESCE(v_refresh_secret, refresh_token_secret_id),
        access_token_expires_at   = p_access_token_expires,
        refresh_token_expires_at  = COALESCE(p_refresh_token_expires, refresh_token_expires_at),
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
    'li_account.access_token.' || v_account_id::text,
    'LinkedIn access token for ' || p_li_username
  );

  IF p_refresh_token IS NOT NULL THEN
    v_refresh_secret := vault.create_secret(
      p_refresh_token,
      'li_account.refresh_token.' || v_account_id::text,
      'LinkedIn refresh token for ' || p_li_username
    );
  END IF;

  INSERT INTO public.li_accounts (
    id, project_id, user_id,
    li_person_urn, li_username, display_name,
    access_token_secret_id, refresh_token_secret_id,
    access_token_expires_at, refresh_token_expires_at,
    status, last_action_at
  ) VALUES (
    v_account_id, p_project_id, v_owner_id,
    p_li_person_urn, p_li_username, p_display_name,
    v_access_secret, v_refresh_secret,
    p_access_token_expires, p_refresh_token_expires,
    'active', NOW()
  );

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.li_account_upsert(uuid, text, text, text, text, timestamptz, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.li_account_upsert(uuid, text, text, text, text, timestamptz, text, timestamptz)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: Obtener access token desencriptado (solo service_role)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.li_account_get_token(p_account_id uuid)
RETURNS TABLE (
  access_token    text,
  li_person_urn   text,
  li_username     text,
  expires_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
  v_urn       text;
  v_username  text;
  v_expires   timestamptz;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required';
  END IF;

  SELECT a.access_token_secret_id, a.li_person_urn, a.li_username, a.access_token_expires_at
    INTO v_secret_id, v_urn, v_username, v_expires
  FROM public.li_accounts a
  WHERE a.id = p_account_id AND a.deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'li_account_not_found: %', p_account_id;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = v_secret_id)::text,
    v_urn,
    v_username,
    v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.li_account_get_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.li_account_get_token(uuid) TO service_role;

COMMENT ON TABLE public.li_accounts IS 'Cuentas de LinkedIn conectadas vía OAuth 2.0 para publicación automática de contenido.';
