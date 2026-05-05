# Setup Inngest — Proyecto Virus

## 1. Crear cuenta y app

1. Ir a [https://app.inngest.com](https://app.inngest.com) → Sign up (con GitHub o email).
2. Crear app → nombre: `virus` → Environment: **production**.

---

## 2. Obtener keys

### Event Key
1. **Settings → Event Keys → Create Event Key** → nombre: `virus-prod`.
2. Copiar → `.env.local`:

```env
INNGEST_EVENT_KEY=evt_...
```

### Signing Key
1. **Settings → Signing Keys** → copiar la key existente (o crear una).
2. Agregar a `.env.local`:

```env
INNGEST_SIGNING_KEY=signkey-prod-...
```

---

## 3. Dev local (sin credenciales)

Para desarrollo local Inngest usa su propio dev server que **no requiere las keys de prod**:

```bash
pnpm dlx inngest-cli@latest dev
```

Levanta el Inngest Dev Server en [http://localhost:8288](http://localhost:8288). Podés ver, triggear y debuggear funciones desde ahí.

> En dev, las funciones apuntan a `http://localhost:3000/api/inngest` automáticamente.

---

## 4. Verificar en prod

Una vez deployado en Vercel, Inngest se auto-registra en el primer request a `/api/inngest`. Para confirmar:

1. **Inngest Dashboard → Apps** → debería aparecer `virus` con tus funciones listadas.
2. Si no aparece → hacer un POST manual a `https://tu-url.vercel.app/api/inngest` con el body `{"type":"inngest/sdk.connect"}`.
