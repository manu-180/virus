---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/performance/
  - apps/web/src/app/api/videos/[id]/performance/route.ts
duracion-estimada: 45 min
---

# T4-P05 — Performance / Analytics dashboard

## Contexto

Pantalla para ver qué videos performan y entrar la data manualmente (al inicio Manuel mide "a ojo" → pegar números de Instagram Insights). Después se automatiza con scraping (T6) o conexión oficial.

Lee:
- `proyecto.md` §8 (las 3 métricas a medir las primeras 12 semanas: hook retention, avg view duration, saves+shares per view)

## Tarea

### 1. `/dashboard/performance` overview

- **Top 10 videos** ordenados por engagement (saves+shares / views).
- **Stats agregadas** últimos 30 días por pilar (educational vs hot_take vs personal): muestra qué pilar performa mejor.
- **Stats por formato**: tip vs hot-take vs speed-build... cuál genera más views.
- **Stats por hook type**: curiosity vs shame vs shock... cuál convierte mejor.
- **Heatmap de horarios**: qué hora del día tuvo mejor reach (cuando haya data suficiente).

### 2. Input manual de métricas

En cada video card aparece un botón "Cargar métricas". Modal con form:
```
Plataforma: [Instagram | TikTok | Shorts]
Vistas: [    ]
Likes: [    ]
Comentarios: [    ]
Saves: [    ]
Shares: [    ]
Avg watch time (s): [    ]
% que llegó a 3s (hook retention): [    ]
Medido el: [date picker]
```

Submit → POST /api/videos/[id]/performance.

### 3. Tabla de detalle

Lista paginada con columnas:
| Video | Hook | Pilar | Formato | Plataforma | Views | ER | Saves/Views | Hook ret. | Fecha |

Click en row → /videos/[id].

### 4. Insight cards (output del feedback engine de T6 cuando exista)

Cards con conclusiones automáticas:
- "Tus tips funcionan 2× mejor que tus hot takes."
- "Hooks tipo `curiosity` tienen 35% más saves."
- "Postear a las 19hs vs 9hs te dio 1.4× más views."

(Si no hay data suficiente, mostrar empty state "Cargá al menos 10 videos con métricas para ver insights".)

### 5. Export

Botón "Exportar CSV" que descarga la data raw para análisis en Excel/Sheets.

## Reglas

- Cero data fake. Si no hay performance cargada, vacío con CTA "Cargá tu primer video y sus métricas".
- Charts: usar `recharts` (mismo libro de juego que shadcn).
- Cálculos en SQL cuando sea posible (queries con `GROUP BY pillar, format`).

## Output esperado

Dashboard de performance funcional con input manual + visualizaciones + export.
