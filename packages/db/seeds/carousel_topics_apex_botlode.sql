-- ============================================================
-- Seed: Carousel topics para APEX y BotLode
-- ============================================================
--
-- USO:
--   1. Asegurate que las migraciones 0025, 0026 y 0037 están aplicadas.
--   2. Editá las dos líneas marcadas con ⚠️ EDITAR si tus proyectos
--      tienen nombres distintos a 'APEX' / 'BotLode' en la tabla
--      public.projects.
--   3. Ejecutá este archivo completo. Es idempotente (ON CONFLICT
--      DO NOTHING) — podés correrlo varias veces sin duplicar.
--
-- Si un proyecto no existe, el bloque correspondiente lanza un
-- NOTICE y sigue (no aborta la transacción del otro proyecto).
--
-- Columnas:
--   suggested_angle/tone : el ángulo/tono "ancla" del topic.
--   additional_angles    : ángulos extra permitidos para diversificar.
--   additional_tones     : tonos extra permitidos.
--   target_slide_count   : cantidad fija de slides cuando el tema lo exige
--                          (ej: "5 errores" → 7). NULL = libre/random.
-- ============================================================

-- ─────────────────────────────────────────────
-- APEX (dev full-stack para profesionales y pymes)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_project_id uuid;
BEGIN
  -- ⚠️ EDITAR si tu proyecto se llama distinto:
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE 'APEX' AND deleted_at IS NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Proyecto APEX no encontrado — saltando seed de APEX.';
    RETURN;
  END IF;

  INSERT INTO public.carousel_topics
    (project_id, title, suggested_angle, suggested_tone,
     additional_angles, additional_tones, target_slide_count, source)
  VALUES
    (v_project_id, 'Por qué tu landing tarda 4 segundos en cargar (y cómo lo arreglo en 1 día)', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cuándo te conviene una web interactiva y cuándo basta con una landing', 'educational', 'authoritative',
     ARRAY['contrarian']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, '5 errores que hacen que tu sitio web no venda', 'listicle', 'direct',
     ARRAY['contrarian', 'educational']::text[], ARRAY['authoritative']::text[], 7, 'seed'),
    (v_project_id, 'WordPress te está saliendo más caro de lo que pensás', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Tener Instagram NO es tener presencia digital', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Tu web tiene visitas pero nadie te consulta: qué está fallando', 'contrarian', 'direct',
     ARRAY['educational', 'before-after']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'El desarrollador que desapareció y lo que debés hacer antes de contratar uno', 'educational', 'direct',
     ARRAY['story-arc', 'contrarian']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué tu competencia aparece en Google y vos no', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Qué incluye un panel de administración hecho a medida', 'educational', 'direct',
     ARRAY['listicle']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cuánto pierde tu negocio por gestionar turnos y pedidos con WhatsApp', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Las 3 cosas que tus clientes buscan en tu web antes de llamarte', 'educational', 'direct',
     ARRAY['listicle']::text[], ARRAY['casual']::text[], 5, 'seed'),
    (v_project_id, 'Landing page vs Web Interactiva vs Tienda Online: cuál necesita tu negocio', 'educational', 'authoritative',
     ARRAY['listicle']::text[], ARRAY['casual']::text[], 6, 'seed'),
    (v_project_id, '¿Tu web funciona bien en celular? Checkealo en 2 minutos', 'educational', 'casual',
     ARRAY['listicle']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Antes y después: de web estática a sistema que consigue clientes solo', 'before-after', 'direct',
     ARRAY['story-arc']::text[], ARRAY['casual']::text[], 6, 'seed'),
    (v_project_id, '5 funcionalidades que toda web profesional debería tener en 2026', 'listicle', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], 7, 'seed'),
    (v_project_id, 'Qué le pasa a tu negocio cuando crece más rápido que tu web', 'educational', 'authoritative',
     ARRAY['story-arc', 'contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué cobro $300.000 por una landing y vale cada peso', 'contrarian', 'direct',
     ARRAY['story-arc', 'educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cuándo dejar de usar Linktree y tener tu propia web', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Qué pasa cuando tu app no tiene panel de admin (spoiler: te volvés esclavo)', 'contrarian', 'casual',
     ARRAY['story-arc', 'educational']::text[], ARRAY['direct']::text[], NULL, 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed APEX completado para project_id=%', v_project_id;
END $$;

-- ─────────────────────────────────────────────
-- BotLode (chatbots IA embebibles + lead scoring)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_project_id uuid;
BEGIN
  -- ⚠️ EDITAR si tu proyecto se llama distinto:
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE 'BotLode' AND deleted_at IS NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Proyecto BotLode no encontrado — saltando seed de BotLode.';
    RETURN;
  END IF;

  INSERT INTO public.carousel_topics
    (project_id, title, suggested_angle, suggested_tone,
     additional_angles, additional_tones, target_slide_count, source)
  VALUES
    (v_project_id, 'Cómo un chatbot detecta un lead caliente sin preguntar el presupuesto', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué WhatsApp Business no reemplaza a un chatbot IA', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, '5 razones por las que tu sitio necesita un bot 24/7', 'listicle', 'direct',
     ARRAY['contrarian']::text[], ARRAY['casual']::text[], 7, 'seed'),
    (v_project_id, 'Los chatbots con botones son una pérdida de tiempo en 2026', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo el modo vendedor de BotLode aplica SPIN selling automático', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Antes y después: un sitio sin bot vs con BotLode', 'before-after', 'direct',
     ARRAY['contrarian']::text[], ARRAY['casual']::text[], 6, 'seed'),
    (v_project_id, 'Qué información captura un bot bien configurado (email, teléfono, intención)', 'educational', 'direct',
     ARRAY['listicle']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué los leads se pierden los fines de semana (y cómo recuperarlos)', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo embedés BotLode en tu sitio en 2 minutos', 'educational', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, '7 preguntas que tu chatbot debería hacer antes de pedir el contacto', 'listicle', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], 9, 'seed'),
    (v_project_id, 'El día que un bot me cerró una venta a las 3 AM', 'story-arc', 'casual',
     ARRAY['contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Mito: "la gente odia hablar con bots"', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo configurar alertas por email cuando un lead muestra intención de compra', 'educational', 'direct',
     ARRAY['listicle']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Lead scoring: por qué el número 0-100 cambia tu día comercial', 'educational', 'authoritative',
     ARRAY['contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Antes y después: cómo BotLode levantó la conversión de Botrive', 'before-after', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], 6, 'seed'),
    (v_project_id, '5 errores configurando el system prompt de tu chatbot', 'listicle', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], 7, 'seed'),
    (v_project_id, 'Por qué cobrar $20 USD por bot al mes es una ganga', 'contrarian', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Historia: cómo armé el ecosistema BotLode (Factory, Player, History)', 'story-arc', 'authoritative',
     ARRAY['educational']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Qué hacer cuando un visitante chatea pero no deja el contacto', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo agendar reuniones desde el chat sin abrir la agenda', 'educational', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed BotLode completado para project_id=%', v_project_id;
END $$;
