-- ============================================================
-- Seed: Carousel topics para APEX y BotLode
-- ============================================================
--
-- USO:
--   1. Asegurate que las migraciones 0025 y 0026 están aplicadas.
--   2. Editá las dos líneas marcadas con ⚠️ EDITAR si tus proyectos
--      tienen nombres distintos a 'APEX' / 'BotLode' en la tabla
--      public.projects.
--   3. Ejecutá este archivo completo. Es idempotente (ON CONFLICT
--      DO NOTHING) — podés correrlo varias veces sin duplicar.
--
-- Si un proyecto no existe, el bloque correspondiente lanza un
-- NOTICE y sigue (no aborta la transacción del otro proyecto).
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
    (project_id, title, suggested_angle, suggested_tone, source)
  VALUES
    (v_project_id, 'Por qué tu landing tarda 4 segundos en cargar (y cómo lo arreglo en 1 día)', 'educational', 'direct', 'seed'),
    (v_project_id, 'Cuándo te conviene una web interactiva y cuándo basta con una landing', 'educational', 'authoritative', 'seed'),
    (v_project_id, '5 errores que hacen que tu sitio web no venda', 'listicle', 'direct', 'seed'),
    (v_project_id, 'WordPress te está saliendo más caro de lo que pensás', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Tener Instagram NO es tener presencia digital', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Tu web tiene visitas pero nadie te consulta: qué está fallando', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'El desarrollador que desapareció y lo que debés hacer antes de contratar uno', 'educational', 'direct', 'seed'),
    (v_project_id, 'Por qué tu competencia aparece en Google y vos no', 'contrarian', 'authoritative', 'seed'),
    (v_project_id, 'Qué incluye un panel de administración hecho a medida', 'educational', 'direct', 'seed'),
    (v_project_id, 'Cuánto pierde tu negocio por gestionar turnos y pedidos con WhatsApp', 'educational', 'direct', 'seed'),
    (v_project_id, 'Las 3 cosas que tus clientes buscan en tu web antes de llamarte', 'educational', 'direct', 'seed'),
    (v_project_id, 'Landing page vs Web Interactiva vs Tienda Online: cuál necesita tu negocio', 'educational', 'authoritative', 'seed'),
    (v_project_id, 'Por qué el "lo hago yo con IA" te va a salir más caro a largo plazo', 'contrarian', 'direct', 'seed'),
    (v_project_id, '¿Tu web funciona bien en celular? Checkealo en 2 minutos', 'educational', 'casual', 'seed'),
    (v_project_id, 'Antes y después: de web estática a sistema que consigue clientes solo', 'before-after', 'direct', 'seed'),
    (v_project_id, '5 funcionalidades que toda web profesional debería tener en 2026', 'listicle', 'direct', 'seed'),
    (v_project_id, 'Qué le pasa a tu negocio cuando crece más rápido que tu web', 'educational', 'authoritative', 'seed'),
    (v_project_id, 'Por qué cobro $300.000 por una landing y vale cada peso', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Cuándo dejar de usar Linktree y tener tu propia web', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Qué pasa cuando tu app no tiene panel de admin (spoiler: te volvés esclavo)', 'contrarian', 'casual', 'seed')
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
    (project_id, title, suggested_angle, suggested_tone, source)
  VALUES
    (v_project_id, 'Cómo un chatbot detecta un lead caliente sin preguntar el presupuesto', 'educational', 'direct', 'seed'),
    (v_project_id, 'Por qué WhatsApp Business no reemplaza a un chatbot IA', 'contrarian', 'direct', 'seed'),
    (v_project_id, '5 razones por las que tu sitio necesita un bot 24/7', 'listicle', 'direct', 'seed'),
    (v_project_id, 'Los chatbots con botones son una pérdida de tiempo en 2026', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Cómo el modo vendedor de BotLode aplica SPIN selling automático', 'educational', 'authoritative', 'seed'),
    (v_project_id, 'Antes y después: un sitio sin bot vs con BotLode', 'before-after', 'direct', 'seed'),
    (v_project_id, 'Qué información captura un bot bien configurado (email, teléfono, intención)', 'educational', 'direct', 'seed'),
    (v_project_id, 'Por qué los leads se pierden los fines de semana (y cómo recuperarlos)', 'educational', 'direct', 'seed'),
    (v_project_id, 'Cómo embedés BotLode en tu sitio en 2 minutos', 'educational', 'casual', 'seed'),
    (v_project_id, '7 preguntas que tu chatbot debería hacer antes de pedir el contacto', 'listicle', 'direct', 'seed'),
    (v_project_id, 'El día que un bot me cerró una venta a las 3 AM', 'story-arc', 'casual', 'seed'),
    (v_project_id, 'Mito: "la gente odia hablar con bots"', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Cómo configurar alertas por email cuando un lead muestra intención de compra', 'educational', 'direct', 'seed'),
    (v_project_id, 'Lead scoring: por qué el número 0-100 cambia tu día comercial', 'educational', 'authoritative', 'seed'),
    (v_project_id, 'Antes y después: cómo BotLode levantó la conversión de Botrive', 'before-after', 'casual', 'seed'),
    (v_project_id, '5 errores configurando el system prompt de tu chatbot', 'listicle', 'direct', 'seed'),
    (v_project_id, 'Por qué cobrar $20 USD por bot al mes es una ganga', 'contrarian', 'direct', 'seed'),
    (v_project_id, 'Historia: cómo armé el ecosistema BotLode (Factory, Player, History)', 'story-arc', 'authoritative', 'seed'),
    (v_project_id, 'Qué hacer cuando un visitante chatea pero no deja el contacto', 'educational', 'direct', 'seed'),
    (v_project_id, 'Cómo agendar reuniones desde el chat sin abrir la agenda', 'educational', 'casual', 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed BotLode completado para project_id=%', v_project_id;
END $$;
