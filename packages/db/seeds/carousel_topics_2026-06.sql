-- ============================================================
-- Seed: Carousel topics FRESCOS — Junio 2026 (APEX, BotLode, Assistify)
-- ============================================================
--
-- QUÉ HACE:
--   Inserta un batch nuevo de 75 temas de carrusel (25 por proyecto)
--   pensados para romper la fatiga de listicle del banco anterior.
--   Empuja los formatos que más saves/shares generan: casos con
--   números, build-in-public, before/after, comparativas, frameworks
--   guardables y storytelling. Doc de referencia:
--   docs/carrusel_plan/ideas-2026-06-13.md
--
-- SEGURO DE RE-EJECUTAR:
--   Es idempotente. Usa ON CONFLICT (project_id, lower(trim(title)))
--   DO NOTHING contra el índice único funcional creado en la
--   migración 0025 (carousel_topics_project_title_uq). Correrlo
--   varias veces NO duplica filas. Tampoco pisa temas ya existentes.
--
-- REQUISITOS:
--   Migraciones 0025 y 0037 aplicadas (columnas additional_angles,
--   additional_tones, target_slide_count).
--
-- SI UN PROYECTO NO EXISTE:
--   El bloque correspondiente lanza un NOTICE y hace RETURN, sin
--   abortar la transacción de los otros proyectos.
--
-- COLUMNAS:
--   suggested_angle/tone : ángulo/tono ancla del tema.
--   additional_angles    : ángulos extra permitidos para diversificar.
--   additional_tones     : tonos extra permitidos.
--   target_slide_count   : cantidad fija de slides cuando el tema lo
--                          implica (ej "3 documentos" → 5). NULL = libre.
--   source = 'seed'.
--
-- Ángulos válidos: educational | contrarian | story-arc | before-after | listicle
-- Tonos válidos  : direct | authoritative | casual | contrarian
-- ============================================================

-- ─────────────────────────────────────────────
-- APEX (dev studio: dueños de negocio AR + founders early-stage)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_project_id uuid;
BEGIN
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
    -- Pilar A — Casos con números
    (v_project_id, 'El sistema de turnos que le bajó las cancelaciones de 30 por semana a 4: la cuenta exacta', 'before-after', 'direct',
     ARRAY['story-arc','educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cobré una landing en 6 días: el desglose hora por hora de a dónde fue cada peso', 'educational', 'direct',
     ARRAY['story-arc']::text[], ARRAY['casual']::text[], 7, 'seed'),
    (v_project_id, 'Migré un negocio de Excel a Supabase: las horas/mes que recuperó el dueño', 'before-after', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Le saqué 3 pasos al checkout de un cliente y la conversión cambió: el número real', 'before-after', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'MVP en 3 semanas vs. 3 meses de agencia tradicional: la timeline sprint por sprint', 'before-after', 'authoritative',
     ARRAY['story-arc','educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'La web "linda" que tenía 0 consultas: cambié solo la oferta y el copy, mirá el resultado a 30 días', 'before-after', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    -- Pilar B — Build-in-public
    (v_project_id, 'Así cotizo un proyecto de cero: la planilla real que mando, campo por campo', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct','casual']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué digo que NO a la mitad de los proyectos que me llegan', 'contrarian', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'El stack con el que laburo en 2026 y por qué elijo cada pieza', 'educational', 'authoritative',
     ARRAY['contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Los 3 documentos que pido antes de aceptar un proyecto (y qué me dice cada uno)', 'educational', 'authoritative',
     ARRAY['listicle']::text[], ARRAY['direct']::text[], 5, 'seed'),
    (v_project_id, 'El día que rompí producción de un cliente: qué hice en las 6 horas siguientes', 'story-arc', 'casual',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Mi pipeline de venta entero: de DM frío a cliente cerrado, paso por paso', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar C — Contrarian
    (v_project_id, 'Aparecer primero en Google ya no es la meta. Aparecer en ChatGPT lo es.', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Tu agencia te cobra mantenimiento y no toca tu web hace 8 meses. Hablemos de eso.', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Comprar plantilla y "ajustarla" termina más caro que hacerla de cero: el cálculo', 'contrarian', 'direct',
     ARRAY['educational','before-after']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Cobrar por hora en desarrollo es para juniors. Así cobro yo y por qué.', 'contrarian', 'authoritative',
     ARRAY['story-arc','educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Tu mejor inversión no es Google Ads: es el formulario que te rebota la mitad de los leads', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    -- Pilar D — IA × dev
    (v_project_id, 'Uso IA en cada proyecto. No para escribir el código. Para esto.', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Bolt, Lovable y v0 con el mismo brief: probé los tres y este es el veredicto', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'El cliente quería un chatbot. Le hicimos un agente que toma acción. La diferencia importa.', 'educational', 'authoritative',
     ARRAY['contrarian','story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo cotizo un proyecto que el cliente cree que "se hace con IA en un día"', 'educational', 'direct',
     ARRAY['contrarian','story-arc']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    -- Pilar E — Comparativas
    (v_project_id, 'Lo que cobra una agencia tradicional vs. lo que entrego yo: misma plata, otra cosa', 'before-after', 'direct',
     ARRAY['contrarian','educational']::text[], ARRAY['authoritative']::text[], 6, 'seed'),
    (v_project_id, 'Hosting por tipo de negocio: el mapa de qué elegir y qué evitar', 'educational', 'authoritative',
     ARRAY['listicle']::text[], ARRAY['direct']::text[], 6, 'seed'),
    -- Pilar F — Frameworks guardables
    (v_project_id, 'Checklist: lo que tu web tiene que tener listo ANTES de pagar Google Ads', 'educational', 'authoritative',
     ARRAY['listicle']::text[], ARRAY['direct']::text[], 8, 'seed'),
    (v_project_id, 'Cómo leer PageSpeed sin ser dev: los 3 números que de verdad importan', 'educational', 'casual',
     ARRAY['listicle']::text[], ARRAY['direct']::text[], 5, 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed APEX 2026-06 completado para project_id=%', v_project_id;
END $$;

-- ─────────────────────────────────────────────
-- BotLode (pivot a AGENCIAS de marketing/web: recurrente + reseller)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_project_id uuid;
BEGIN
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
    -- Pilar A — Economics de agencia
    (v_project_id, 'Tenés 8 clientes con web y cero recurrente: la plata que dejás sobre la mesa cada mes', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'El producto recurrente que ninguna agencia chica vende (y que es 100% margen)', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'De cobrar una web y nunca más, a cobrar la web + mensualidad con el mismo cliente', 'before-after', 'direct',
     ARRAY['story-arc','educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Armás el bot gratis, le cobrás el mantenimiento al cliente, te quedás con todo: el modelo', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Lo que las agencias top facturan en "add-ons" que el resto ni cobra', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar B — Frameworks de venta / cómo cobrar
    (v_project_id, 'El script para cerrar bot + mantenimiento en una llamada de 15 minutos', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo justificar la mensualidad de mantenimiento sin que el cliente la cuestione', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'La propuesta de bot en una sola página que te cierra 4 de cada 10 clientes', 'educational', 'authoritative',
     ARRAY['before-after']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Las 3 objeciones que siempre te tira el cliente con el bot, y cómo refutarlas', 'educational', 'direct',
     ARRAY['listicle','contrarian']::text[], ARRAY['authoritative']::text[], 5, 'seed'),
    (v_project_id, 'Cómo cobrar setup + mensualidad sin que parezca que cobrás dos veces', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'El framework para subir el precio del mantenimiento sin perder clientes', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar C — Casos de agencia con números
    (v_project_id, 'Agencia de Córdoba: 6 clientes con bot, el extra mensual que factura ahora', 'before-after', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Freelance que solo vendía webs cerró 9 retainers en 60 días: la timeline', 'story-arc', 'direct',
     ARRAY['before-after']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Estudio de diseño que cobraba $0 recurrente: cómo llegó a su primer recurrente en 3 meses', 'before-after', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'El bot que detectó 12 leads calientes en 30 días para una inmobiliaria: el reporte real', 'educational', 'authoritative',
     ARRAY['before-after']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar D — Comparativas / contrarian para agencias
    (v_project_id, 'Por qué arrancar con BotLode te conviene más que con Robofy o BotPenguin', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Vender SEO de retainer es la trampa. Vender bot + mantenimiento es la salida.', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Si tu agencia no vende algo recurrente en 2026, estás haciendo trabajo de freelance', 'contrarian', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Tu cliente no quiere "IA". Quiere dormir tranquilo. El bot vende lo segundo.', 'contrarian', 'authoritative',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Cobrar "hora de soporte" es la peor forma de monetizar a un cliente recurrente', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    -- Pilar E — Features traducidas a beneficio-para-la-agencia
    (v_project_id, 'El historial de conversaciones es tu mejor argumento para defender la renovación cada mes', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Una sola cuenta, 12 bots de 12 clientes: cómo gestionás todo sin volverte loco', 'educational', 'direct',
     ARRAY['before-after']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'El reporte mensual de un click: el PDF que mandás y que justifica el cobro solo', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar F — Reseller / partner program
    (v_project_id, 'Cómo funciona el programa de reseller de BotLode: el 100% del recurrente es tuyo', 'educational', 'authoritative',
     ARRAY['contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'El kit del reseller: deck de venta, contrato, script de onboarding y mail mensual', 'educational', 'direct',
     ARRAY['listicle']::text[], ARRAY['authoritative']::text[], 5, 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed BotLode 2026-06 completado para project_id=%', v_project_id;
END $$;

-- ─────────────────────────────────────────────
-- Assistify (gestión para docentes/academias: segmentado por vertical)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE 'Assistify' AND deleted_at IS NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Proyecto Assistify no encontrado — saltando seed de Assistify.';
    RETURN;
  END IF;

  INSERT INTO public.carousel_topics
    (project_id, title, suggested_angle, suggested_tone,
     additional_angles, additional_tones, target_slide_count, source)
  VALUES
    -- Pilar A — Vertical-specific
    (v_project_id, 'Profe de yoga con 35 alumnos: cómo cobra sin pedir comprobantes de Mercadopago', 'story-arc', 'casual',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Academia de idiomas con 6 horarios y 4 profes: el calendario que se arma solo', 'educational', 'authoritative',
     ARRAY['before-after']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Profe de música particular: cobrá por clase tomada, no por clase prometida', 'educational', 'direct',
     ARRAY['contrarian']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Personal trainer con 3 sedes: la misma cuenta para todas, sin planillas sueltas', 'educational', 'direct',
     ARRAY['before-after']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Escuela de danza: matrículas, mensualidades y descuento por hermano sin tocar Excel', 'educational', 'authoritative',
     ARRAY['before-after']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Taller con turnos rotativos: lista de espera automática y cobro por presencia', 'educational', 'direct',
     ARRAY['before-after']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Profe de natación: piletas, niveles y horarios sin volverte loco', 'educational', 'casual',
     ARRAY['before-after']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Soporte escolar: tarea, asistencia y aviso al padre en un solo lugar', 'educational', 'authoritative',
     ARRAY['before-after']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    -- Pilar B — Voz del alumno / padre
    (v_project_id, 'Lo que más les gusta a los padres: ver el saldo del hijo sin pedirlo por WhatsApp', 'educational', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Por qué los alumnos pagan más rápido cuando el cobro lo hace la app y no vos', 'contrarian', 'direct',
     ARRAY['educational']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, '"No me llegó el aviso": la frase que más escuchan los profes y cómo desaparece', 'before-after', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Si tu profe todavía te manda los recordatorios a mano, mostrale este posteo', 'contrarian', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar C — Anti-objeciones
    (v_project_id, '"Soy de la vieja escuela, prefiero el cuaderno": te muestro lo que el cuaderno te cuesta', 'contrarian', 'casual',
     ARRAY['before-after','educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, '"Mis alumnos son grandes, no la van a entender": caso de un profe de tango con alumnos de 60+', 'story-arc', 'casual',
     ARRAY['contrarian']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, '"Cuesta una mensualidad": hagamos las cuentas reales de lo que ganás vs. lo que pagás', 'educational', 'direct',
     ARRAY['contrarian','before-after']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, '"Tengo 8 alumnos, no necesito sistema": 4 motivos por los que sí', 'contrarian', 'direct',
     ARRAY['listicle','educational']::text[], ARRAY['casual']::text[], 5, 'seed'),
    (v_project_id, '"Probé otra app y no la usaba nadie": la diferencia está en cómo onboardeás al alumno', 'contrarian', 'direct',
     ARRAY['educational','story-arc']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, '"No tengo tiempo de aprender otra herramienta": el onboarding real son 30 minutos', 'contrarian', 'casual',
     ARRAY['educational']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    -- Pilar D — Casos con números
    (v_project_id, 'Profe de yoga: de 18 a 47 alumnos en 6 meses sin contratar un admin. Cómo lo hizo.', 'before-after', 'direct',
     ARRAY['story-arc']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'Una academia de idiomas recuperó 14 horas por semana solo migrando de Excel', 'before-after', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Subió la tarifa 35% y NO perdió alumnos: lo que le dio coraje fue mostrar el historial', 'story-arc', 'direct',
     ARRAY['before-after','contrarian']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    (v_project_id, 'De 30% de cancelaciones tardías a casi cero en 60 días: solo cambió el flujo', 'before-after', 'direct',
     ARRAY['story-arc','educational']::text[], ARRAY['authoritative']::text[], NULL, 'seed'),
    -- Pilar E — Onboarding / migración + contrarian guardable
    (v_project_id, 'Migrá tu taller a Assistify en un fin de semana: el plan paso a paso', 'educational', 'authoritative',
     ARRAY['story-arc']::text[], ARRAY['casual']::text[], NULL, 'seed'),
    (v_project_id, 'Cómo importar tu lista de alumnos de Excel sin perder un solo dato', 'educational', 'casual',
     ARRAY['before-after']::text[], ARRAY['direct']::text[], NULL, 'seed'),
    (v_project_id, 'Tu app de gestión no es para vos de hoy. Es para tu yo del futuro con el doble de alumnos.', 'contrarian', 'casual',
     ARRAY['story-arc']::text[], ARRAY['direct']::text[], NULL, 'seed')
  ON CONFLICT (project_id, lower(trim(title))) DO NOTHING;

  RAISE NOTICE 'Seed Assistify 2026-06 completado para project_id=%', v_project_id;
END $$;
