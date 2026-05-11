-- ============================================================
-- 0025: Carousel topics + dimension usage
-- ============================================================
--
-- Banco curado de temas por proyecto + contadores de uso para
-- temas, ángulos y tonos. Permite al usuario:
--   1. Ver temas pre-cargados al elegir un proyecto.
--   2. Ver contador "ya lo usé N veces" al lado de cada tema.
--   3. Editar un tema y que se guarde como variante (parent_topic_id).
--   4. Ver contadores de uso de ángulo/tono *por proyecto*.
--
-- Decisiones:
-- - user_id denormalizado en ambas tablas para RLS O(1).
-- - UNIQUE funcional sobre (project_id, lower(title)) para
--   deduplicar variantes idénticas sin importar mayúsculas.
-- - bump_topic_usage() es un RPC explícito (no trigger sobre
--   carousel_projects) porque necesita selectedTopicId opcional
--   para linkear variantes editadas con su seed original.
-- - dimension_usage en tabla aparte (no columnas en topics)
--   porque el contador es por proyecto, no por tema — un usuario
--   puede usar 'educational' con muchos temas distintos.
-- ============================================================

-- ─────────────────────────────────────────────
-- carousel_topics
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carousel_topics (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text        NOT NULL CHECK (char_length(trim(title)) >= 3),
  suggested_angle  text        CHECK (suggested_angle IS NULL OR suggested_angle IN (
                                 'educational', 'contrarian', 'story-arc',
                                 'before-after', 'listicle'
                               )),
  suggested_tone   text        CHECK (suggested_tone IS NULL OR suggested_tone IN (
                                 'direct', 'authoritative', 'casual', 'contrarian'
                               )),
  source           text        NOT NULL DEFAULT 'seed'
                                 CHECK (source IN ('seed', 'user_added', 'user_edited')),
  parent_topic_id  uuid        REFERENCES public.carousel_topics(id) ON DELETE SET NULL,
  usage_count      int         NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at     timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

-- UNIQUE funcional: evita duplicados case-insensitive por proyecto
CREATE UNIQUE INDEX IF NOT EXISTS carousel_topics_project_title_uq
  ON public.carousel_topics (project_id, lower(trim(title)));

CREATE INDEX IF NOT EXISTS carousel_topics_user_idx        ON public.carousel_topics (user_id);
CREATE INDEX IF NOT EXISTS carousel_topics_project_idx     ON public.carousel_topics (project_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS carousel_topics_lastused_idx    ON public.carousel_topics (project_id, last_used_at NULLS FIRST) WHERE archived_at IS NULL;

-- Trigger: copia user_id desde projects via project_id
-- (set_project_user_id ya existe en migraciones previas y hace exactamente eso)
CREATE OR REPLACE TRIGGER copy_user_id_carousel_topics
  BEFORE INSERT ON public.carousel_topics
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE OR REPLACE TRIGGER set_carousel_topics_updated_at
  BEFORE UPDATE ON public.carousel_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- carousel_dimension_usage
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carousel_dimension_usage (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dimension    text        NOT NULL CHECK (dimension IN ('angle', 'tone')),
  value        text        NOT NULL,
  usage_count  int         NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, dimension, value)
);

CREATE INDEX IF NOT EXISTS carousel_dimension_usage_user_idx    ON public.carousel_dimension_usage (user_id);
CREATE INDEX IF NOT EXISTS carousel_dimension_usage_project_idx ON public.carousel_dimension_usage (project_id, dimension);

CREATE OR REPLACE TRIGGER copy_user_id_carousel_dimension_usage
  BEFORE INSERT ON public.carousel_dimension_usage
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE OR REPLACE TRIGGER set_carousel_dimension_usage_updated_at
  BEFORE UPDATE ON public.carousel_dimension_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- bump_topic_usage RPC
-- ─────────────────────────────────────────────
--
-- Llamado desde la API route después de crear un carousel_project.
-- Maneja 4 escenarios:
--
-- 1. selectedTopicId provisto + raw_title coincide (case-insensitive,
--    trim) con el title del topic seleccionado:
--      → bump usage_count del topic seleccionado.
--
-- 2. selectedTopicId provisto + raw_title difiere:
--    → busca o crea variante con (project_id, lower(trim(raw_title))).
--    → setea source='user_edited', parent_topic_id=selectedTopicId
--      (solo en INSERT — si ya existía respeta lo previo).
--
-- 3. selectedTopicId NULL + raw_title matchea topic existente:
--    → bump ese topic.
--
-- 4. selectedTopicId NULL + raw_title nuevo:
--    → crea topic con source='user_added', parent NULL.
--
-- En todos los casos: upsert (angle, tone) en dimension_usage.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bump_topic_usage(
  p_carousel_id      uuid,
  p_raw_title        text,
  p_angle            text,
  p_tone             text,
  p_selected_topic_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_user_id    uuid;
  v_topic_id   uuid;
  v_normalized text := lower(trim(p_raw_title));
  v_selected_normalized text;
BEGIN
  -- Sanity check + leer contexto del carousel
  SELECT project_id, user_id INTO v_project_id, v_user_id
  FROM public.carousel_projects
  WHERE id = p_carousel_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'carousel % not found', p_carousel_id;
  END IF;

  -- Verificar permiso: solo el dueño del carousel puede bumpear
  IF v_user_id <> (SELECT auth.uid()) AND NOT (
    -- service_role para llamadas server-side desde la API
    current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- ────────────── decidir target topic ──────────────
  IF p_selected_topic_id IS NOT NULL THEN
    SELECT lower(trim(title)) INTO v_selected_normalized
    FROM public.carousel_topics
    WHERE id = p_selected_topic_id AND project_id = v_project_id;

    IF v_selected_normalized IS NULL THEN
      -- selected_topic_id inválido: tratamos como si no se hubiera enviado
      p_selected_topic_id := NULL;
    ELSIF v_selected_normalized = v_normalized THEN
      -- Match exacto con el seleccionado: bump ese topic
      v_topic_id := p_selected_topic_id;
    END IF;
  END IF;

  -- Si no hay topic_id resuelto aún → buscar/crear por (project, lower(title))
  IF v_topic_id IS NULL THEN
    INSERT INTO public.carousel_topics (
      project_id, title, source, parent_topic_id,
      suggested_angle, suggested_tone,
      usage_count, last_used_at
    )
    VALUES (
      v_project_id,
      trim(p_raw_title),
      CASE WHEN p_selected_topic_id IS NOT NULL THEN 'user_edited' ELSE 'user_added' END,
      p_selected_topic_id,
      p_angle,
      p_tone,
      1,
      NOW()
    )
    ON CONFLICT (project_id, lower(trim(title))) DO UPDATE
      SET usage_count  = public.carousel_topics.usage_count + 1,
          last_used_at = NOW()
    RETURNING id INTO v_topic_id;
  ELSE
    -- Match exacto con seleccionado: bump
    UPDATE public.carousel_topics
       SET usage_count  = usage_count + 1,
           last_used_at = NOW()
     WHERE id = v_topic_id;
  END IF;

  -- ────────────── upsert dimension usage ──────────────
  IF p_angle IS NOT NULL THEN
    INSERT INTO public.carousel_dimension_usage (project_id, dimension, value, usage_count, last_used_at)
    VALUES (v_project_id, 'angle', p_angle, 1, NOW())
    ON CONFLICT (project_id, dimension, value) DO UPDATE
      SET usage_count  = public.carousel_dimension_usage.usage_count + 1,
          last_used_at = NOW();
  END IF;

  IF p_tone IS NOT NULL THEN
    INSERT INTO public.carousel_dimension_usage (project_id, dimension, value, usage_count, last_used_at)
    VALUES (v_project_id, 'tone', p_tone, 1, NOW())
    ON CONFLICT (project_id, dimension, value) DO UPDATE
      SET usage_count  = public.carousel_dimension_usage.usage_count + 1,
          last_used_at = NOW();
  END IF;

  RETURN v_topic_id;
END;
$$;

-- Permitir invocar desde authenticated (RLS del SELECT de carousel_projects
-- + check explícito en la función protegen el resto)
GRANT EXECUTE ON FUNCTION public.bump_topic_usage(uuid, text, text, text, uuid) TO authenticated, service_role;
