import type { StoryInput } from './schema';

export const storyDefaults: StoryInput = {
  totalDurationSec: 60,
  themeColor: '#3ECF8E',
  language: 'es',
  audioUrl: 'https://example.com/sample.mp3',

  story: {
    timelineEvents: [
      { time: '13:42', label: 'Error en prod' },
      { time: '14:15', label: 'Escalado' },
      { time: '15:30', label: 'Bug hallado' },
      { time: '17:45', label: 'Fix deployado' },
    ],
    bugReveal: {
      beforeCode: `// auth/validator.js
if (user.role == "admin") {
  grantAccess(user);
}`,
      afterCode: `// auth/validator.js
if (user.role === "admin") {
  grantAccess(user);
}`,
      language: 'javascript',
      offendingLine: 2,
    },
    chatMessages: [
      { author: 'QA', text: 'Usuarios reportan 500 al hacer login 🚨', atSec: 9.0 },
      { author: 'Senior Dev', text: 'Quién hizo el último commit a auth?', atSec: 10.5 },
      { author: 'Yo', text: '...fui yo 😰', atSec: 12.0 },
      { author: 'CTO', text: 'Cuántos usuarios afectados?', atSec: 21.5 },
      { author: 'Senior Dev', text: 'Todos los que se registraron en 3 días', atSec: 23.0 },
      { author: 'Lead', text: 'Necesitamos un postmortem hoy', atSec: 24.5 },
    ],
  },

  segments: [
    {
      index: 0,
      role: 'hook',
      startSec: 0,
      endSec: 3,
      voiceover: 'Un caracter rompió producción durante 4 horas. Yo era el responsable.',
      onScreenText: 'Un caracter\nrompió producción',
      visualCue: 'hook-card-slide',
      soundEffect: 'whoosh',
    },
    {
      index: 1,
      role: 'setup',
      startSec: 3,
      endSec: 9,
      voiceover: 'Era un martes a las 2 de la tarde. El servicio de auth empezó a devolver 500.',
      visualCue: 'log-lines',
      codeSnippet: {
        language: 'log',
        code: `[13:41:58] POST /api/auth/login → 200 OK
[13:42:03] POST /api/auth/login → 500 INTERNAL ERROR
[13:42:04] ERROR: TypeError: Cannot read property 'id' of null
[13:42:04] CRITICAL: Auth service returning null user
[13:42:07] WARN: 47 failed login attempts in last 60s`,
      },
    },
    {
      index: 2,
      role: 'setup',
      startSec: 9,
      endSec: 15,
      voiceover: 'Llegaron los mensajes de Slack. Y supe que el commit era mío.',
      visualCue: 'chat-messages',
    },
    {
      index: 3,
      role: 'development',
      startSec: 15,
      endSec: 21,
      voiceover: 'Rollback inmediato. Pero igual teníamos que encontrar qué se había roto.',
      visualCue: 'log-lines',
      codeSnippet: {
        language: 'log',
        code: `[14:20:11] Rollback deployed → auth v2.3.1
[14:20:13] POST /api/auth/login → 200 OK
[14:20:15] Service restored
[14:30:00] git blame auth/validator.js
[14:32:44] Revisando validación de roles...`,
      },
    },
    {
      index: 4,
      role: 'development',
      startSec: 21,
      endSec: 27,
      voiceover: 'El CTO quería saber cuántos usuarios se habían visto afectados. No era un número lindo.',
      visualCue: 'chat-messages',
    },
    {
      index: 5,
      role: 'development',
      startSec: 27,
      endSec: 34,
      voiceover: 'Reproducí el bug localmente. Ahí entendí todo. JavaScript y sus tipos.',
      visualCue: 'log-lines',
      codeSnippet: {
        language: 'log',
        code: `[15:10:01] Reproduciendo localmente...
[15:10:08] user.role = "admin", == "admin" → TRUE ✓
[15:10:12] user.role = 0, == "admin" → FALSE ✓
[15:10:16] CRITICAL: JavaScript type coercion detectado
[15:10:18] "admin" == 0 edge case confirmado
[15:10:20] Bug: loose == en lugar de strict ===`,
      },
    },
    {
      index: 6,
      role: 'mini_payoff',
      startSec: 34,
      endSec: 40,
      voiceover: 'Tres días de bypass completo de auth. Por un solo caracter.',
      onScreenText: '3 días.\nBypass de auth.\nPor 1 caracter.',
      visualCue: 'hook-card-slide',
      soundEffect: 'glitch',
    },
    {
      index: 7,
      role: 'reveal',
      startSec: 40,
      endSec: 52,
      voiceover: 'Acá estaba el problema. Un == en lugar de ===. Dos caracteres que cuestan caro.',
      visualCue: 'bug-reveal',
      soundEffect: 'ding',
    },
    {
      index: 8,
      role: 'cta',
      startSec: 52,
      endSec: 60,
      voiceover: 'Desde ese día, strict equality en todos lados. ¿Te pasó algo así? Contame.',
      onScreenText: '== vs === puede romper producción|¿Te pasó algo así? Contame en comentarios.',
      visualCue: 'cta-lesson',
      soundEffect: 'pop',
    },
  ],

  captions: {
    words: [
      // hook (0-3s)
      { text: 'Un', startMs: 200, endMs: 380 },
      { text: 'caracter', startMs: 400, endMs: 820 },
      { text: 'rompió', startMs: 840, endMs: 1200 },
      { text: 'producción', startMs: 1220, endMs: 1780 },
      { text: 'durante', startMs: 1800, endMs: 2160 },
      { text: '4', startMs: 2180, endMs: 2360 },
      { text: 'horas', startMs: 2380, endMs: 2820 },
      // setup log-lines (3-9s)
      { text: 'Era', startMs: 3200, endMs: 3440 },
      { text: 'un', startMs: 3460, endMs: 3600 },
      { text: 'martes', startMs: 3620, endMs: 3980 },
      { text: 'El', startMs: 4200, endMs: 4380 },
      { text: 'servicio', startMs: 4400, endMs: 4840 },
      { text: 'de', startMs: 4860, endMs: 4980 },
      { text: 'auth', startMs: 5000, endMs: 5340 },
      { text: 'empezó', startMs: 5360, endMs: 5780 },
      { text: 'a', startMs: 5800, endMs: 5920 },
      { text: 'devolver', startMs: 5940, endMs: 6400 },
      { text: '500', startMs: 6420, endMs: 8800 },
      // chat messages (9-15s)
      { text: 'Llegaron', startMs: 9200, endMs: 9680 },
      { text: 'los', startMs: 9700, endMs: 9860 },
      { text: 'mensajes', startMs: 9880, endMs: 10340 },
      { text: 'de', startMs: 10360, endMs: 10480 },
      { text: 'Slack', startMs: 10500, endMs: 10980 },
      { text: 'Y', startMs: 11100, endMs: 11260 },
      { text: 'supe', startMs: 11280, endMs: 11560 },
      { text: 'que', startMs: 11580, endMs: 11720 },
      { text: 'el', startMs: 11740, endMs: 11860 },
      { text: 'commit', startMs: 11880, endMs: 12260 },
      { text: 'era', startMs: 12280, endMs: 12480 },
      { text: 'mío', startMs: 12500, endMs: 14800 },
      // development rollback (15-21s)
      { text: 'Rollback', startMs: 15200, endMs: 15720 },
      { text: 'inmediato', startMs: 15740, endMs: 16300 },
      { text: 'Pero', startMs: 16400, endMs: 16640 },
      { text: 'igual', startMs: 16660, endMs: 16980 },
      { text: 'teníamos', startMs: 17000, endMs: 17480 },
      { text: 'que', startMs: 17500, endMs: 17640 },
      { text: 'encontrar', startMs: 17660, endMs: 18160 },
      { text: 'qué', startMs: 18180, endMs: 18380 },
      { text: 'se', startMs: 18400, endMs: 18520 },
      { text: 'había', startMs: 18540, endMs: 18820 },
      { text: 'roto', startMs: 18840, endMs: 20800 },
      // CTO messages (21-27s)
      { text: 'El', startMs: 21200, endMs: 21360 },
      { text: 'CTO', startMs: 21380, endMs: 21700 },
      { text: 'quería', startMs: 21720, endMs: 22100 },
      { text: 'saber', startMs: 22120, endMs: 22480 },
      { text: 'cuántos', startMs: 22500, endMs: 22920 },
      { text: 'usuarios', startMs: 22940, endMs: 23380 },
      { text: 'afectados', startMs: 23400, endMs: 24000 },
      { text: 'No', startMs: 24200, endMs: 24380 },
      { text: 'era', startMs: 24400, endMs: 24640 },
      { text: 'un', startMs: 24660, endMs: 24800 },
      { text: 'número', startMs: 24820, endMs: 25280 },
      { text: 'lindo', startMs: 25300, endMs: 26800 },
      // development repro (27-34s)
      { text: 'Reproducí', startMs: 27200, endMs: 27780 },
      { text: 'el', startMs: 27800, endMs: 27940 },
      { text: 'bug', startMs: 27960, endMs: 28280 },
      { text: 'localmente', startMs: 28300, endMs: 28940 },
      { text: 'Ahí', startMs: 29100, endMs: 29320 },
      { text: 'entendí', startMs: 29340, endMs: 29820 },
      { text: 'todo', startMs: 29840, endMs: 30200 },
      { text: 'JavaScript', startMs: 30300, endMs: 30900 },
      { text: 'y', startMs: 30920, endMs: 31060 },
      { text: 'sus', startMs: 31080, endMs: 31280 },
      { text: 'tipos', startMs: 31300, endMs: 33800 },
      // mini_payoff (34-40s)
      { text: 'Tres', startMs: 34200, endMs: 34540 },
      { text: 'días', startMs: 34560, endMs: 34920 },
      { text: 'de', startMs: 34940, endMs: 35080 },
      { text: 'bypass', startMs: 35100, endMs: 35560 },
      { text: 'completo', startMs: 35580, endMs: 36080 },
      { text: 'de', startMs: 36100, endMs: 36240 },
      { text: 'auth', startMs: 36260, endMs: 36700 },
      { text: 'Por', startMs: 36800, endMs: 37020 },
      { text: 'un', startMs: 37040, endMs: 37200 },
      { text: 'solo', startMs: 37220, endMs: 37560 },
      { text: 'caracter', startMs: 37580, endMs: 39800 },
      // reveal (40-52s)
      { text: 'Acá', startMs: 40300, endMs: 40580 },
      { text: 'estaba', startMs: 40600, endMs: 40980 },
      { text: 'el', startMs: 41000, endMs: 41140 },
      { text: 'problema', startMs: 41160, endMs: 41700 },
      { text: 'Un', startMs: 41900, endMs: 42100 },
      { text: '==', startMs: 42120, endMs: 42560 },
      { text: 'en', startMs: 42580, endMs: 42720 },
      { text: 'lugar', startMs: 42740, endMs: 43120 },
      { text: 'de', startMs: 43140, endMs: 43260 },
      { text: '===', startMs: 43280, endMs: 43840 },
      { text: 'Dos', startMs: 44000, endMs: 44240 },
      { text: 'caracteres', startMs: 44260, endMs: 44820 },
      { text: 'que', startMs: 44840, endMs: 44980 },
      { text: 'cuestan', startMs: 45000, endMs: 45480 },
      { text: 'caro', startMs: 45500, endMs: 51800 },
      // cta (52-60s)
      { text: 'Desde', startMs: 52200, endMs: 52560 },
      { text: 'ese', startMs: 52580, endMs: 52760 },
      { text: 'día', startMs: 52780, endMs: 53100 },
      { text: 'strict', startMs: 53200, endMs: 53600 },
      { text: 'equality', startMs: 53620, endMs: 54100 },
      { text: 'en', startMs: 54120, endMs: 54260 },
      { text: 'todos', startMs: 54280, endMs: 54640 },
      { text: 'lados', startMs: 54660, endMs: 55200 },
      { text: '¿Te', startMs: 55400, endMs: 55640 },
      { text: 'pasó', startMs: 55660, endMs: 56000 },
      { text: 'algo', startMs: 56020, endMs: 56320 },
      { text: 'así?', startMs: 56340, endMs: 56780 },
      { text: 'Contame', startMs: 56900, endMs: 59800 },
    ],
  },

  brand: {
    handle: '@manunavarro',
  },
};
