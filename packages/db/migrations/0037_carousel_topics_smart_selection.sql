-- ============================================================
-- 0037: Smart selection en carousel_topics
-- ============================================================
--
-- Antes de esta migración el scheduler usaba un único `suggested_angle`
-- y un único `suggested_tone` por topic, lo que producía carruseles
-- monótonos: el 100% salía 'educational' + 'direct' aunque el tema
-- admitiera múltiples ángulos. Además la cantidad de slides era random
-- alrededor del default del schedule, ignorando temas donde la cantidad
-- está implícita en el título ("5 errores" → 7 slides obvios).
--
-- Esta migración agrega:
--   - additional_angles  text[]  — ángulos extra permitidos además del suggested_angle.
--   - additional_tones   text[]  — tonos extra permitidos además del suggested_tone.
--   - target_slide_count int     — cantidad fija de slides (NULL = libre).
--
-- El scheduler los consume así:
--   allowedAngles   = [suggested_angle] ∪ additional_angles
--   allowedTones    = [suggested_tone]  ∪ additional_tones
--   slideCount      = target_slide_count ?? pickSlideCount(default)
--
-- Después selecciona el ángulo/tono *menos usado en el proyecto*
-- (vía carousel_dimension_usage), respetando exactamente la misma
-- lógica que ya usa para topics (least-used, oldest-on-tie).
-- ============================================================

ALTER TABLE public.carousel_topics
  ADD COLUMN IF NOT EXISTS additional_angles  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS additional_tones   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_slide_count int;

-- Constraint: cada elemento de additional_angles debe estar en la lista válida.
-- Usamos <@ (is-contained-by) sobre arrays. Empty arrays satisfacen la condición.
ALTER TABLE public.carousel_topics
  DROP CONSTRAINT IF EXISTS carousel_topics_additional_angles_check;
ALTER TABLE public.carousel_topics
  ADD CONSTRAINT carousel_topics_additional_angles_check
    CHECK (additional_angles <@ ARRAY[
      'educational', 'contrarian', 'story-arc', 'before-after', 'listicle'
    ]::text[]);

ALTER TABLE public.carousel_topics
  DROP CONSTRAINT IF EXISTS carousel_topics_additional_tones_check;
ALTER TABLE public.carousel_topics
  ADD CONSTRAINT carousel_topics_additional_tones_check
    CHECK (additional_tones <@ ARRAY[
      'direct', 'authoritative', 'casual', 'contrarian'
    ]::text[]);

ALTER TABLE public.carousel_topics
  DROP CONSTRAINT IF EXISTS carousel_topics_target_slide_count_check;
ALTER TABLE public.carousel_topics
  ADD CONSTRAINT carousel_topics_target_slide_count_check
    CHECK (target_slide_count IS NULL OR (target_slide_count BETWEEN 3 AND 10));

-- ─────────────────────────────────────────────
-- Backfill para APEX
-- ─────────────────────────────────────────────
-- Match por (project_id, lower(trim(title))) → idempotente. Si el proyecto
-- o el topic no existen en este entorno, los UPDATEs no-opean.
DO $$
DECLARE
  v_apex_id uuid;
BEGIN
  SELECT id INTO v_apex_id
  FROM public.projects
  WHERE name ILIKE 'APEX' AND deleted_at IS NULL
  LIMIT 1;

  IF v_apex_id IS NULL THEN
    RAISE NOTICE '0037: proyecto APEX no encontrado — saltando backfill APEX.';
  ELSE
    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Por qué tu landing tarda 4 segundos en cargar (y cómo lo arreglo en 1 día)'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Cuándo te conviene una web interactiva y cuándo basta con una landing'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian', 'educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = 7
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('5 errores que hacen que tu sitio web no venda'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('WordPress te está saliendo más caro de lo que pensás'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Tener Instagram NO es tener presencia digital'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational', 'before-after']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Tu web tiene visitas pero nadie te consulta: qué está fallando'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc', 'contrarian']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('El desarrollador que desapareció y lo que debés hacer antes de contratar uno'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['direct']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Por qué tu competencia aparece en Google y vos no'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Qué incluye un panel de administración hecho a medida'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Cuánto pierde tu negocio por gestionar turnos y pedidos con WhatsApp'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = 5
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Las 3 cosas que tus clientes buscan en tu web antes de llamarte'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = 6
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Landing page vs Web Interactiva vs Tienda Online: cuál necesita tu negocio'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['direct']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('¿Tu web funciona bien en celular? Checkealo en 2 minutos'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = 6
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Antes y después: de web estática a sistema que consigue clientes solo'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = 7
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('5 funcionalidades que toda web profesional debería tener en 2026'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc', 'contrarian']::text[],
      additional_tones   = ARRAY['direct']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Qué le pasa a tu negocio cuando crece más rápido que tu web'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc', 'educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Por qué cobro $300.000 por una landing y vale cada peso'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Cuándo dejar de usar Linktree y tener tu propia web'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc', 'educational']::text[],
      additional_tones   = ARRAY['direct']::text[],
      target_slide_count = NULL
    WHERE project_id = v_apex_id
      AND lower(trim(title)) = lower(trim('Qué pasa cuando tu app no tiene panel de admin (spoiler: te volvés esclavo)'));

    RAISE NOTICE '0037: backfill APEX completado.';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Backfill para BotLode
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_botlode_id uuid;
BEGIN
  SELECT id INTO v_botlode_id
  FROM public.projects
  WHERE name ILIKE 'BotLode' AND deleted_at IS NULL
  LIMIT 1;

  IF v_botlode_id IS NULL THEN
    RAISE NOTICE '0037: proyecto BotLode no encontrado — saltando backfill BotLode.';
  ELSE
    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Cómo un chatbot detecta un lead caliente sin preguntar el presupuesto'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Por qué WhatsApp Business no reemplaza a un chatbot IA'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = 7
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('5 razones por las que tu sitio necesita un bot 24/7'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Los chatbots con botones son una pérdida de tiempo en 2026'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['direct']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Cómo el modo vendedor de BotLode aplica SPIN selling automático'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['casual']::text[],
      target_slide_count = 6
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Antes y después: un sitio sin bot vs con BotLode'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Qué información captura un bot bien configurado (email, teléfono, intención)'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Por qué los leads se pierden los fines de semana (y cómo recuperarlos)'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['direct']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Cómo embedés BotLode en tu sitio en 2 minutos'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = 9
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('7 preguntas que tu chatbot debería hacer antes de pedir el contacto'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['direct']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('El día que un bot me cerró una venta a las 3 AM'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Mito: "la gente odia hablar con bots"'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['listicle']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Cómo configurar alertas por email cuando un lead muestra intención de compra'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['direct']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Lead scoring: por qué el número 0-100 cambia tu día comercial'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['direct']::text[],
      target_slide_count = 6
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Antes y después: cómo BotLode levantó la conversión de Botrive'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['authoritative']::text[],
      target_slide_count = 7
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('5 errores configurando el system prompt de tu chatbot'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Por qué cobrar $20 USD por bot al mes es una ganga'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['educational']::text[],
      additional_tones   = ARRAY['casual']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Historia: cómo armé el ecosistema BotLode (Factory, Player, History)'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['contrarian']::text[],
      additional_tones   = ARRAY['authoritative']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Qué hacer cuando un visitante chatea pero no deja el contacto'));

    UPDATE public.carousel_topics SET
      additional_angles  = ARRAY['story-arc']::text[],
      additional_tones   = ARRAY['direct']::text[]
    WHERE project_id = v_botlode_id
      AND lower(trim(title)) = lower(trim('Cómo agendar reuniones desde el chat sin abrir la agenda'));

    RAISE NOTICE '0037: backfill BotLode completado.';
  END IF;
END $$;
