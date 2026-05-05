-- ============================================================
-- T1-P02 Seed: viral_hooks_seed (30 hooks) + pillar_templates
-- ============================================================
--
-- 30 hooks for niche='dev/software' from proyecto.md §3.
-- All INSERTs use ON CONFLICT DO NOTHING — idempotent on
-- repeated supabase db reset calls.
--
-- pillar_templates: 3 default pillars (60/30/10 split) used
-- by the wizard to pre-populate content_pillars on project
-- creation. NOT project-scoped — reference data only.
--
-- The full APEX-dev project seed (project row, patterns, brand)
-- is handled by T1-P08.
-- ============================================================

-- ─── viral_hooks_seed ────────────────────────────────────────
INSERT INTO public.viral_hooks_seed
  (niche, hook, hook_type, estimated_engagement, best_platforms, example_topics, language)
VALUES
  (
    'dev/software',
    'Estás escribiendo useEffect mal.',
    'vergüenza_alivio',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['useEffect cleanup', 'memory leaks', 'React patterns', 'dependency array'],
    'es-AR'
  ),
  (
    'dev/software',
    'Borrá node_modules. No lo necesitás más.',
    'shock_contrarian',
    'viral',
    ARRAY['tiktok', 'shorts'],
    ARRAY['pnpm', 'yarn berry', 'npm workspaces', 'Bun'],
    'es-AR'
  ),
  (
    'dev/software',
    'El 99% de los devs junior no sabe esto.',
    'curiosidad_insider',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['closures', 'prototypes', 'event loop', 'hoisting'],
    'es-AR'
  ),
  (
    'dev/software',
    'Este shortcut de VS Code te ahorra 2 horas al día.',
    'valor_inmediato',
    'alto',
    ARRAY['reels', 'shorts'],
    ARRAY['multi-cursor', 'keyboard shortcuts', 'snippets', 'command palette'],
    'es-AR'
  ),
  (
    'dev/software',
    'Cursor + Claude acaba de matar a Copilot. Te explico.',
    'news_hot_take',
    'viral',
    ARRAY['shorts', 'tiktok'],
    ARRAY['Cursor', 'Claude Code', 'GitHub Copilot', 'AI coding tools comparison'],
    'es-AR'
  ),
  (
    'dev/software',
    'Construí un SaaS en 60 segundos con vibe coding.',
    'speed_build',
    'viral',
    ARRAY['tiktok', 'reels'],
    ARRAY['vibe coding', 'Cursor Composer', 'full-stack app', 'MVP rápido'],
    'es-AR'
  ),
  (
    'dev/software',
    'React Server Components rompió todo lo que sabías.',
    'fomo_shock',
    'medio',
    ARRAY['shorts'],
    ARRAY['RSC', 'Next.js 15', 'data fetching', 'server actions'],
    'es-AR'
  ),
  (
    'dev/software',
    'Mirá este bug que costó 300 millones de dólares.',
    'storytelling_shock',
    'alto',
    ARRAY['tiktok', 'reels'],
    ARRAY['production bugs', 'outages', 'debugging', 'Knight Capital'],
    'es-AR'
  ),
  (
    'dev/software',
    'Si tu código tiene esto, te van a rechazar en la entrevista.',
    'vergüenza_identidad',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['code review', 'bad practices', 'technical interviews', 'anti-patterns'],
    'es-AR'
  ),
  (
    'dev/software',
    'POV: te toca refactorizar código de 2015.',
    'relatable_pov',
    'medio',
    ARRAY['tiktok', 'reels'],
    ARRAY['legacy code', 'refactoring', 'callbacks', 'jQuery'],
    'es-AR'
  ),
  (
    'dev/software',
    'Probé 5 IDEs con IA y solo 1 sirve.',
    'listicle_comparativa',
    'alto',
    ARRAY['shorts', 'reels'],
    ARRAY['Cursor', 'VS Code', 'Zed', 'Windsurf', 'AI tools comparison'],
    'es-AR'
  ),
  (
    'dev/software',
    'Dejá de usar console.log. Hacé esto en su lugar.',
    'pain_point_solution',
    'alto',
    ARRAY['tiktok', 'reels'],
    ARRAY['debugging', 'Chrome DevTools', 'logging', 'debugger statement'],
    'es-AR'
  ),
  (
    'dev/software',
    'TypeScript en 100 segundos.',
    'educational_format',
    'alto',
    ARRAY['shorts'],
    ARRAY['TypeScript basics', 'types', 'interfaces', 'generics'],
    'es-AR'
  ),
  (
    'dev/software',
    'Esta API está secretamente filtrando tu data.',
    'shock_curiosidad',
    'alto',
    ARRAY['tiktok', 'shorts'],
    ARRAY['API security', 'data leaks', 'CORS', 'sensitive data exposure'],
    'es-AR'
  ),
  (
    'dev/software',
    'Construí en 1 prompt lo que antes me llevaba 3 días.',
    'ai_productividad',
    'viral',
    ARRAY['reels', 'tiktok'],
    ARRAY['AI coding', 'Claude', 'Cursor', 'productivity', 'vibe coding'],
    'es-AR'
  ),
  (
    'dev/software',
    'Si todavía usás var, este video es para vos.',
    'identidad_burn',
    'medio',
    ARRAY['tiktok'],
    ARRAY['JavaScript basics', 'let const', 'hoisting', 'scope'],
    'es-AR'
  ),
  (
    'dev/software',
    'El framework que va a matar a Next.js.',
    'hot_take_prediccion',
    'viral',
    ARRAY['shorts', 'tiktok'],
    ARRAY['Remix', 'Astro', 'Svelte', 'framework wars', 'React alternatives'],
    'es-AR'
  ),
  (
    'dev/software',
    'Este snippet es ilegal y deberías saberlo.',
    'curiosidad_forbidden',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['regex evil', 'eval', 'prototype pollution', 'forbidden patterns'],
    'es-AR'
  ),
  (
    'dev/software',
    'Antes vs después de aprender Git correctamente.',
    'before_after',
    'medio',
    ARRAY['reels'],
    ARRAY['Git workflow', 'branching strategy', 'rebase vs merge', 'commit history'],
    'es-AR'
  ),
  (
    'dev/software',
    'Programadores senior odian este truco.',
    'clickbait_clasico',
    'medio',
    ARRAY['tiktok'],
    ARRAY['shortcuts', 'productivity hacks', 'one-liners', 'tricks'],
    'es-AR'
  ),
  (
    'dev/software',
    'Probé Claude Code por una semana. Esto pasó.',
    'personal_experiment',
    'alto',
    ARRAY['shorts', 'reels'],
    ARRAY['Claude Code', 'AI coding review', 'productivity experiment', 'Agentic AI'],
    'es-AR'
  ),
  (
    'dev/software',
    'Tu primer commit dice todo sobre vos como dev.',
    'identidad_vergüenza',
    'medio',
    ARRAY['tiktok'],
    ARRAY['Git', 'first commit', 'code quality', 'developer growth'],
    'es-AR'
  ),
  (
    'dev/software',
    'Esta extensión de VS Code va a cambiar tu vida.',
    'hiperbole_valor',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['VS Code extensions', 'productivity', 'Prettier', 'ESLint', 'GitHub Copilot'],
    'es-AR'
  ),
  (
    'dev/software',
    'Por qué dejé Vim después de 5 años.',
    'storytelling_reversal',
    'medio',
    ARRAY['shorts', 'x'],
    ARRAY['Vim vs VS Code', 'editor wars', 'Neovim', 'productivity'],
    'es-AR'
  ),
  (
    'dev/software',
    'Mi setup de dev freelance que factura $5K/mes.',
    'aspiracional_money',
    'viral',
    ARRAY['reels', 'tiktok'],
    ARRAY['freelance setup', 'income LATAM', 'remote work', 'dev tools stack'],
    'es-AR'
  ),
  (
    'dev/software',
    'Mirá lo que pasa si pegás esto en package.json.',
    'curiosidad_demo',
    'alto',
    ARRAY['tiktok', 'shorts'],
    ARRAY['npm scripts', 'package.json tricks', 'lifecycle scripts', 'dangerous packages'],
    'es-AR'
  ),
  (
    'dev/software',
    'Este error de un caracter rompió Linux durante 10 años.',
    'story_shock',
    'alto',
    ARRAY['shorts'],
    ARRAY['security vulnerabilities', 'CVE stories', 'one-char bugs', 'Linux kernel'],
    'es-AR'
  ),
  (
    'dev/software',
    'Los devs argentinos están comiéndose el mercado USA.',
    'identidad_local',
    'alto',
    ARRAY['reels', 'tiktok'],
    ARRAY['LATAM devs', 'freelance USD', 'Argentina tech', 'remote work'],
    'es-AR'
  ),
  (
    'dev/software',
    'MCP en 60 segundos: lo que cambia para siempre.',
    'trending_tech',
    'alto',
    ARRAY['shorts'],
    ARRAY['MCP', 'Model Context Protocol', 'AI agents', 'Claude', 'agentic AI'],
    'es-AR'
  ),
  (
    'dev/software',
    'No hace falta saber programar para construir esto.',
    'contrarian_vibe_coding',
    'viral',
    ARRAY['tiktok', 'reels'],
    ARRAY['vibe coding', 'no-code + AI', 'Cursor', 'Bolt', 'v0'],
    'es-AR'
  )
ON CONFLICT DO NOTHING;

-- ─── pillar_templates (reference for wizard) ─────────────────
INSERT INTO public.pillar_templates (name, weight, description, example_themes, sort_order)
VALUES
  (
    'Educacional',
    60,
    'Tips técnicos, tutoriales cortos y demostraciones de herramientas y workflows de AI.',
    ARRAY[
      'TypeScript tricks',
      'React patterns',
      'AI coding workflows',
      'Cursor / Claude Code tips',
      'Next.js features',
      'Debugging techniques'
    ],
    1
  ),
  (
    'Hot takes & Opinión',
    30,
    'Comparaciones, predicciones y controversia técnica. Genera engagement y debate.',
    ARRAY[
      'Framework wars',
      'AI tools comparison',
      'Por qué dejé X por Y',
      'Predicciones tech',
      'Ragebait técnico controlado'
    ],
    2
  ),
  (
    'Freelance & Lifestyle',
    10,
    'Day-in-the-life, setup tours e ingresos. Convierte audiencia en clientes potenciales.',
    ARRAY[
      'Day in the life dev freelance',
      'Setup tour',
      'Ingresos mensuales',
      'Cómo conseguí mi último cliente',
      'Trabajo remoto desde Argentina'
    ],
    3
  )
ON CONFLICT DO NOTHING;
