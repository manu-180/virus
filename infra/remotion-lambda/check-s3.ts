import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, GetBucketPolicyCommand, GetBucketPolicyStatusCommand, HeadObjectCommand, GetObjectAclCommand } from '@aws-sdk/client-s3';
import { IAMClient, SimulatePrincipalPolicyCommand } from '@aws-sdk/client-iam';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../../apps/worker/.env.local'), override: true });

const BUCKET = 'remotionlambda-useast1-lfc3xynwxa';
const KEY = 'sites/virus-prod/public/sfx/glitch.mp3';
const ACCOUNT_ID = '241533136569';
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/remotion-lambda-role`;

const s3 = new S3Client({ region: 'us-east-1' });

async function main() {
  // Check if object exists from the local credentials
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: KEY }));
    console.log('Object exists, ContentType:', head.ContentType, 'Size:', head.ContentLength);
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    console.log('Object check error:', e.name, e.$metadata?.httpStatusCode);
  }

  // Simulate what the Lambda role can do
  const iam = new IAMClient({ region: 'us-east-1' });
  const sim = await iam.send(new SimulatePrincipalPolicyCommand({
    PolicySourceArn: ROLE_ARN,
    ActionNames: ['s3:GetObject'],
    ResourceArns: [`arn:aws:s3:::${BUCKET}/${KEY}`],
  }));

  const result = sim.EvaluationResults?.[0];
  console.log('IAM simulation s3:GetObject:', result?.EvalDecision, '| Matched statements:', result?.MatchedStatements?.map(s => s.SourcePolicyId));
}

main().catch(err => { console.error(err); process.exit(1); });
