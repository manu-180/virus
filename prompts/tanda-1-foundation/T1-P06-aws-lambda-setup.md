---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: cloud-architect
tanda: 1
depende-de: []
file-ownership:
  - docs/setup/aws-remotion-lambda.md
  - infra/remotion-lambda/policy.json
  - infra/remotion-lambda/deploy.ts
duracion-estimada: 45 min (20 min agente + 25 min Manuel)
---

# T1-P06 — Setup AWS + Remotion Lambda (con guía paso a paso)

## Contexto

Los videos se renderizan con **Remotion Lambda** porque:
1. Renderiza videos React en serverless en paralelo (no bloquea el server de Manuel).
2. Costo bajo (~$0.0001/segundo de video).
3. Escala a cero cuando no hay videos en cola.

Tu tarea:
1. Generar guía paso a paso para que Manuel cree cuenta AWS, IAM user con permisos mínimos, y deploy de la función Lambda de Remotion.
2. Crear el script de deploy reproducible.

## Guía a producir (`docs/setup/aws-remotion-lambda.md`)

### 1. Cuenta AWS

- Si Manuel ya tiene cuenta AWS personal → usarla.
- Si no, crear nueva en https://aws.amazon.com/free/ (12 meses free tier).
- Tarjeta requerida pero no se cobra si está dentro del free tier.

### 2. IAM User con permisos mínimos (NO usar root)

Crear un user IAM dedicado al proyecto Virus.

#### Pasos en la consola AWS:

1. AWS Console → IAM → Users → "Create user".
2. Nombre: `virus-remotion`.
3. **NO** marcar "Provide user access to AWS Management Console" (es solo programmatic).
4. "Next" → Attach policies directly → "Create policy" (en otra pestaña).
5. Policy en modo JSON, pegar el contenido de `infra/remotion-lambda/policy.json` que vos vas a crear (ver abajo).
6. Nombre de la policy: `RemotionLambdaPolicy`.
7. Volver a la creación del user, refrescar policies, attach `RemotionLambdaPolicy`.
8. "Create user".
9. Click en el user → "Security credentials" → "Create access key" → use case "Application running outside AWS" → confirmar → copiar `Access Key ID` y `Secret Access Key`.

### 3. Variables a agregar a `.env.local`

```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=         # se llena después del deploy
REMOTION_S3_BUCKET=                    # se llena después del deploy
```

### 4. Deploy de Remotion Lambda

```bash
# Una sola vez por entorno
pnpm --filter @virus/remotion exec remotion lambda functions deploy
pnpm --filter @virus/remotion exec remotion lambda sites create src/index.ts --site-name=virus-prod
```

El primer comando devuelve algo como:
```
Function name: remotion-render-4-0-XXX-mem2048-disk2048-300sec
Bucket name: remotionlambda-useast1-XXX
```

Ambos van a `.env.local` en `REMOTION_LAMBDA_FUNCTION_NAME` y `REMOTION_S3_BUCKET`.

### 5. Validación

Render de prueba (después de que T3 tenga al menos un template):

```bash
pnpm --filter @virus/remotion exec remotion lambda render \
  https://virus-prod.s3.amazonaws.com/sites/virus-prod/index.html \
  HelloWorld out.mp4
```

### 6. Troubleshooting

- "Operation not permitted": faltan permisos en la policy. Revisar.
- "Region mismatch": Remotion Lambda DEBE estar en la misma región que el bucket. Default `us-east-1`.
- Costos: setear billing alert en AWS a $20/mes para no llevarte sorpresas.
- Limit de timeout: 300s default. Para videos < 60s alcanza largo.

## Archivos a crear

### `infra/remotion-lambda/policy.json`

Policy JSON con permisos mínimos para Remotion Lambda. Basate en https://www.remotion.dev/docs/lambda/setup pero con permisos restringidos:

- IAM (CreateRole, AttachRolePolicy, GetRole, PassRole) — solo recursos del proyecto.
- Lambda (CreateFunction, InvokeFunction, GetFunction, DeleteFunction, UpdateFunctionCode) — solo functions con prefix `remotion-render-*`.
- S3 (CreateBucket, ListBucket, GetObject, PutObject, DeleteObject) — solo buckets con prefix `remotionlambda-*`.
- CloudWatch Logs (CreateLogGroup, PutLogEvents, GetLogEvents).
- Service Quotas (read-only, para que Remotion chequee límites antes de renderizar).

Investigá la policy oficial de Remotion 4.x y dejala en JSON válido.

### `infra/remotion-lambda/deploy.ts`

Script Node que ejecuta el deploy programáticamente. Esto es para que Manuel lo corra con `pnpm deploy:lambda` en vez de recordar comandos:

```ts
import { deployFunction, deploySite, getOrCreateBucket } from '@remotion/lambda/client';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '../../.env.local') });

async function main() {
  console.log('🪣 Creating bucket...');
  const { bucketName } = await getOrCreateBucket({ region: 'us-east-1' });

  console.log('λ  Deploying function...');
  const { functionName, alreadyExisted: fnExisted } = await deployFunction({
    region: 'us-east-1',
    timeoutInSeconds: 300,
    memorySizeInMb: 2048,
    diskSizeInMb: 2048,
    createCloudWatchLogGroup: true,
  });

  console.log('🌐 Deploying site...');
  const { serveUrl } = await deploySite({
    region: 'us-east-1',
    bucketName,
    entryPoint: path.resolve(process.cwd(), '../../packages/remotion/src/index.ts'),
    siteName: 'virus-prod',
  });

  console.log('\n✅ Deployment complete:');
  console.log(`  Function name:  ${functionName}`);
  console.log(`  Bucket:         ${bucketName}`);
  console.log(`  Serve URL:      ${serveUrl}`);
  console.log('\nAdd these to .env.local:');
  console.log(`REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_S3_BUCKET=${bucketName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Y en `infra/remotion-lambda/package.json` el script `"deploy": "tsx deploy.ts"` con `@remotion/lambda` y `dotenv` y `tsx` como deps.

## Output esperado

1. `docs/setup/aws-remotion-lambda.md` con la guía completa de Manuel.
2. `infra/remotion-lambda/policy.json` con los permisos IAM.
3. `infra/remotion-lambda/deploy.ts` con el script reproducible.
4. `infra/remotion-lambda/package.json` con `pnpm deploy`.

## Notas

- NO toques `apps/` ni `packages/remotion/src/` (T3 los maneja).
- NO ejecutes el deploy vos — eso lo hace Manuel después de que T3 tenga al menos un template básico.
- Costo: si Manuel renderiza 30 videos/mes a 30s cada uno, eso es ~900 segundos × $0.0001 = $0.09 USD/mes en Lambda. S3 storage: <$1/mes. Total muy bajo.
