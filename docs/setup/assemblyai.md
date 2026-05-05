# Setup AssemblyAI — Proyecto Virus

> Usado para transcripción + generación de captions para los videos.

## 1. Crear cuenta

1. Ir a [https://www.assemblyai.com/dashboard/signup](https://www.assemblyai.com/dashboard/signup).
2. Registrarse (email o GitHub).

---

## 2. Plan y créditos

- **Free tier:** $50 de créditos incluidos al registrarse.
- **Precio:** ~$0.37/hora de audio.
- **¿Alcanza?** Para 30 videos/mes × ~3 min c/u = 90 min = **$0.56/mes**. Los $50 iniciales dan para meses.
- Cuando se agoten: Plan de pago a demanda, sin subscripción fija.

---

## 3. Obtener API Key

1. **Dashboard → API Keys** → copiar la key.
2. Agregar a `.env.local`:

```env
ASSEMBLYAI_API_KEY=your_key_here
```

---

## 4. Verificar

```bash
curl -X POST https://api.assemblyai.com/v2/transcript \
  -H "Authorization: $ASSEMBLYAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"audio_url":"https://storage.googleapis.com/aai-web-samples/5_common_sports_injuries_and_how_to_avoid_them.mp3"}'
```

Respuesta esperada: JSON con `"id":"..."` y `"status":"queued"`. Si da `401` → key incorrecta.
