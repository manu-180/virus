# Setup Anthropic — Proyecto Virus

## 1. Crear API Key

1. Ir a [https://console.anthropic.com](https://console.anthropic.com) → Sign in.
2. **Settings → API Keys → Create Key** → nombre: `virus-prod`.
3. Copiar la key (solo se muestra una vez).
4. Agregar a `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## 2. Configurar billing y límites

1. **Settings → Plans & Billing** → cargar tarjeta de crédito.
2. Setear límites de gasto:
   - **Soft limit:** $50/mes → manda email de alerta.
   - **Hard limit:** $100/mes → corta las requests.

> Free tier ($5 de créditos) alcanza para desarrollo inicial, pero el hard limit es crítico para no sorprenderte en prod.

---

## 3. Modelos disponibles en este proyecto

Los IDs ya están codeados en `packages/shared/src/ai/models.ts` (lo crea T2-P03):

| Modelo | ID | Cuándo usarlo |
|--------|-----|---------------|
| Opus 4.7 | `claude-opus-4-7` | Scripting complejo, guiones largos |
| Opus 4.7 (1M ctx) | `claude-opus-4-7` + `betas: ["interleaved-thinking-2025-05-14"]` | Solo cuando necesitás >200K contexto |
| Sonnet 4.6 | `claude-sonnet-4-6` | Default para la mayoría de tasks |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | No usado en este proyecto |

---

## 4. Features opcionales

- **Prompt Caching:** recomendado habilitarlo — T2-P03 lo usa para reducir costo en prompts repetidos.
- **Batch API:** para procesar múltiples videos en background sin bloquear — T2-P04 lo implementa.

Ambos se activan en el código, no en la consola.

---

## 5. Verificar

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'
```

Respuesta esperada: JSON con `"content":[{"text":"pong"...}]` (o similar). Si da `401` → key incorrecta.
