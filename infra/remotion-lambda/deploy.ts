import { deployFunction, deploySite, getOrCreateBucket } from '@remotion/lambda';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const envPath = path.join(repoRoot, 'apps/web/.env.local');
const remotionPkg = path.join(repoRoot, 'packages/remotion');
const remotionSrc = path.join(remotionPkg, 'src');
const entryPoint = path.join(remotionSrc, 'index.ts');

config({ path: envPath });

async function main() {
  console.log('Creating bucket...');
  const { bucketName } = await getOrCreateBucket({ region: 'us-east-1' });

  console.log('Deploying function...');
  const { functionName, alreadyExisted: fnExisted } = await deployFunction({
    region: 'us-east-1',
    timeoutInSeconds: 300,
    memorySizeInMb: 2048,
    diskSizeInMb: 2048,
    createCloudWatchLogGroup: true,
  });

  if (fnExisted) {
    console.log(`  Function already existed: ${functionName}`);
  } else {
    console.log(`  Function created: ${functionName}`);
  }

  console.log('Deploying site...');
  console.log(`  entryPoint:  ${entryPoint}`);
  console.log(`  alias @ ->   ${remotionSrc}`);

  const { serveUrl } = await deploySite({
    region: 'us-east-1',
    bucketName,
    entryPoint,
    siteName: 'virus-prod',
    options: {
      webpackOverride: (currentConfig) => ({
        ...currentConfig,
        resolve: {
          ...currentConfig.resolve,
          alias: {
            ...(currentConfig.resolve?.alias ?? {}),
            '@': remotionSrc,
          },
          extensionAlias: {
            ...(currentConfig.resolve?.extensionAlias ?? {}),
            '.js': ['.ts', '.tsx', '.js', '.jsx'],
            '.mjs': ['.mts', '.mjs'],
          },
        },
        module: {
          ...currentConfig.module,
          rules: [
            ...(currentConfig.module?.rules ?? []),
            // Vite-style `?raw` imports → import file as string
            {
              resourceQuery: /raw/,
              type: 'asset/source',
            },
          ],
        },
      }),
    },
  });

  console.log('\nDeployment complete:');
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
