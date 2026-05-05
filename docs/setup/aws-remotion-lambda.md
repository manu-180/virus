# Setup: AWS + Remotion Lambda para Virus

Guia paso a paso para configurar la infraestructura de renderizado de videos en AWS usando Remotion Lambda 4.x.

---

## Prerequisitos

- Node.js 18+ instalado
- pnpm instalado (`npm install -g pnpm`)
- Acceso a la terminal en la raiz del proyecto
- Archivo `.env.local` creado en la raiz (puedes copiar `.env.example` si existe)

---

## 1. Cuenta AWS

### Si ya tenes una cuenta AWS personal

Usala directamente. No hace falta crear una nueva. Asegurate de tener acceso a la consola en [https://console.aws.amazon.com](https://console.aws.amazon.com).

### Si no tenes cuenta AWS

1. Ir a [https://aws.amazon.com/free/](https://aws.amazon.com/free/)
2. Hacer clic en "Create a Free Account"
3. Completar el formulario con email, contrasena y nombre de cuenta
4. Ingresar datos de tarjeta de credito/debito — es requerida pero **no se cobra** si te mantenes dentro del free tier
5. Verificar identidad por SMS o llamada
6. Elegir plan "Basic Support" (gratuito)
7. Ingresar a la consola en [https://console.aws.amazon.com](https://console.aws.amazon.com)

> El free tier de AWS incluye 12 meses de servicios gratuitos. Para el uso tipico de Remotion Lambda en un proyecto en etapa inicial, los costos seran minimos (ver estimacion al final de esta guia).

---

## 2. Crear IAM User con permisos minimos

**Nunca uses el usuario root para operaciones del dia a dia.** Vas a crear un usuario IAM dedicado para Remotion con permisos especificos y limitados.

### Paso 1 — Crear la politica de permisos

1. Ir a [https://console.aws.amazon.com/iam/](https://console.aws.amazon.com/iam/)
2. En el menu izquierdo, hacer clic en **"Policies"**
3. Hacer clic en **"Create policy"**
4. Seleccionar la pestana **"JSON"**
5. Borrar el contenido por defecto y pegar el contenido completo de `infra/remotion-lambda/policy.json`
6. Hacer clic en **"Next"**
7. En "Policy name", escribir: `RemotionLambdaPolicy`
8. Descripcion opcional: `Permisos minimos para Remotion Lambda 4.x`
9. Hacer clic en **"Create policy"**

### Paso 2 — Crear el usuario IAM

1. En el menu izquierdo de IAM, hacer clic en **"Users"**
2. Hacer clic en **"Create user"**
3. En "User name", escribir: `virus-remotion`
4. **NO marcar** "Provide user access to the AWS Management Console" — este usuario solo necesita acceso programatico
5. Hacer clic en **"Next"**
6. En "Permissions options", seleccionar **"Attach policies directly"**
7. Buscar `RemotionLambdaPolicy` en el buscador y marcar el checkbox
8. Hacer clic en **"Next"**
9. Revisar y hacer clic en **"Create user"**

### Paso 3 — Generar Access Key

1. Hacer clic en el usuario `virus-remotion` recien creado
2. Ir a la pestana **"Security credentials"**
3. Bajar hasta la seccion "Access keys" y hacer clic en **"Create access key"**
4. En "Use case", seleccionar **"Application running outside AWS"**
5. Hacer clic en "Next" (el tag description es opcional)
6. Hacer clic en **"Create access key"**
7. **IMPORTANTE:** Copiar inmediatamente el "Access Key ID" y el "Secret access key"

> AWS solo muestra el Secret Access Key UNA vez. Si lo perdes, tenes que eliminar la key y crear una nueva.

---

## 3. Configurar variables de entorno

Abrir el archivo `.env.local` en la raiz del proyecto y agregar las siguientes variables:

```env
# AWS — Remotion Lambda
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Remotion — se completan despues del deploy (Paso 4)
REMOTION_LAMBDA_FUNCTION_NAME=
REMOTION_S3_BUCKET=
REMOTION_SERVE_URL=
```

Reemplazar `AKIA...` y `...` con los valores copiados en el Paso 3.

> Confirmar que `.env.local` esta en el `.gitignore` del proyecto antes de continuar. **Nunca commitear credenciales AWS.**

---

## 4. Deploy de Remotion Lambda

Con las variables de entorno configuradas, ejecutar el script de deploy:

```bash
cd infra/remotion-lambda
pnpm install
pnpm deploy
```

El script realiza 3 operaciones en orden:

1. **Crea (o reutiliza) el bucket S3** con prefijo `remotionlambda-` en `us-east-1`
2. **Despliega la Lambda function** con 2048 MB de memoria, 2048 MB de disco y timeout de 300 segundos
3. **Despliega el site** (el bundle de Remotion) al bucket S3 con el nombre `virus-prod`

Al finalizar, el script imprime algo similar a esto:

```
Deployment complete:
  Function name:  remotion-render-mem2048mb-disk2048mb-300sec
  Bucket:         remotionlambda-useast1-abc123def456
  Serve URL:      https://remotionlambda-useast1-abc123def456.s3.us-east-1.amazonaws.com/sites/virus-prod/index.html

Add these to .env.local:
REMOTION_LAMBDA_FUNCTION_NAME=remotion-render-mem2048mb-disk2048mb-300sec
REMOTION_S3_BUCKET=remotionlambda-useast1-abc123def456
REMOTION_SERVE_URL=https://remotionlambda-useast1-abc123def456.s3.us-east-1.amazonaws.com/sites/virus-prod/index.html
```

Copiar esos tres valores al `.env.local` en los campos que quedaron vacios en el Paso 3.

---

## 5. Validacion — Render de prueba

Para confirmar que todo funciono correctamente, hacer un render de prueba desde la terminal (en la raiz del proyecto):

```bash
npx remotion lambda render \
  --function-name=$REMOTION_LAMBDA_FUNCTION_NAME \
  --serve-url=$REMOTION_SERVE_URL \
  --region=us-east-1 \
  MyComposition \
  out/test-render.mp4
```

Reemplazar `MyComposition` con el nombre de la composicion definida en `packages/remotion/src/index.ts`.

Si el render termina y genera el archivo `out/test-render.mp4`, la infraestructura esta funcionando correctamente.

---

## 6. Configurar Billing Alert (recomendado)

Para evitar sorpresas en la factura:

1. Ir a [https://console.aws.amazon.com/billing/home#/budgets](https://console.aws.amazon.com/billing/home#/budgets)
2. Hacer clic en **"Create budget"**
3. Seleccionar **"Cost budget"** → "Use a template" → "Monthly cost budget"
4. Establecer el monto en `$5` USD
5. Ingresar el email para recibir alertas
6. Hacer clic en **"Create budget"**

Esto envia un email automatico si el gasto mensual supera los $5 (muy por encima del uso normal de este proyecto).

---

## 7. Troubleshooting

### Error: "Operation not permitted" o "AccessDenied"

Causa: La politica IAM no tiene todos los permisos necesarios o fue aplicada incorrectamente.

Solucion:
1. Ir a IAM → Policies → `RemotionLambdaPolicy`
2. Verificar que el JSON coincide exactamente con `infra/remotion-lambda/policy.json`
3. Confirmar que la policy esta adjunta al usuario `virus-remotion` (no a otro usuario)
4. Verificar que las variables `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `.env.local` corresponden al usuario `virus-remotion`

Para diagnosticar permisos faltantes, ejecutar:

```bash
npx remotion lambda policies validate --region=us-east-1
```

### Error: "Region mismatch"

Causa: Las variables de entorno o el script usan regiones diferentes.

Solucion: Confirmar que `AWS_REGION=us-east-1` en `.env.local` y que todos los recursos (bucket, function) fueron creados en `us-east-1`. Si cambiaste de region, correr el deploy nuevamente con la region correcta.

### Error: "Function timeout" durante el render

Causa: El video es demasiado largo o la composicion es muy pesada para el timeout de 300 segundos.

Solucion: Para videos muy largos, usar el modo concurrente de Remotion Lambda que divide el render en chunks paralelos. Esto ya esta habilitado por defecto en `renderMediaOnLambda()`.

### Error: "No such file or directory" al hacer deploy del site

Causa: El `entryPoint` en `deploy.ts` no encuentra `packages/remotion/src/index.ts`.

Solucion: Confirmar que el archivo existe y que el script se ejecuta desde `infra/remotion-lambda/` (no desde la raiz). El path relativo `../../packages/remotion/src/index.ts` es relativo al directorio del script.

### La Lambda no aparece en la consola AWS

Causa: Puede haber un delay de hasta 30 segundos luego del deploy.

Solucion: Ir a [https://console.aws.amazon.com/lambda/](https://console.aws.amazon.com/lambda/), seleccionar la region `us-east-1` en el menu superior derecho y buscar `remotion-render`.

---

## 8. Estimacion de costos

Los costos de AWS para este proyecto en uso tipico son extremadamente bajos.

### Lambda

| Parametro | Valor |
|-----------|-------|
| Memoria | 2048 MB |
| Duracion promedio por video de 30 seg | ~30 segundos de ejecucion |
| Precio por GB-segundo | $0.0000166667 |
| Costo por video de 30 seg | ~$0.001 |
| 30 videos/mes | ~$0.03/mes |

### S3

| Parametro | Valor |
|-----------|-------|
| Almacenamiento del site (bundle Remotion) | ~50 MB = $0.001/mes |
| Videos renderizados (temporales) | depende del uso |
| GET requests | ~$0.004 por 10,000 requests |
| Costo estimado total S3 | <$1/mes en uso normal |

### Costo total estimado

**30 videos de 30 segundos por mes: aproximadamente $0.05 - $0.10 USD/mes**

Para un SaaS en produccion con cientos de renders, el costo sigue siendo bajo gracias al modelo de pago por uso de Lambda. A escala de 1000 renders/mes de 30 segundos: ~$1-2 USD/mes.

> Estos valores son estimaciones basadas en precios de AWS `us-east-1` a mayo 2026. Los precios pueden variar. Usar la [calculadora de AWS](https://calculator.aws/pricing/2/home) para calculos precisos.

---

## Referencias

- Documentacion oficial Remotion Lambda: [https://www.remotion.dev/docs/lambda](https://www.remotion.dev/docs/lambda)
- Permisos IAM Remotion: [https://www.remotion.dev/docs/lambda/permissions](https://www.remotion.dev/docs/lambda/permissions)
- Precios AWS Lambda: [https://aws.amazon.com/lambda/pricing/](https://aws.amazon.com/lambda/pricing/)
- Precios AWS S3: [https://aws.amazon.com/s3/pricing/](https://aws.amazon.com/s3/pricing/)
- Calculadora de costos AWS: [https://calculator.aws/pricing/2/home](https://calculator.aws/pricing/2/home)
