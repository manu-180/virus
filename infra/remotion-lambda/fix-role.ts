import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../../apps/worker/.env.local'), override: true });

const iam = new IAMClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const ROLE_NAME = 'remotion-lambda-role';

// Corrected policy: s3:GetObject needs object-level resource (bucket/*)
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: '0',
      Effect: 'Allow',
      Action: ['s3:ListAllMyBuckets'],
      Resource: ['*'],
    },
    {
      Sid: '1',
      Effect: 'Allow',
      Action: [
        's3:CreateBucket',
        's3:ListBucket',
        's3:PutBucketAcl',
        's3:GetBucketLocation',
        's3:PutBucketOwnershipControls',
        's3:PutBucketPublicAccessBlock',
        's3:PutBucketPolicy',
        's3:PutLifecycleConfiguration',
        's3:DeleteBucket',
      ],
      Resource: ['arn:aws:s3:::remotionlambda-*'],
    },
    {
      Sid: '2',
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:DeleteObject',
        's3:PutObjectAcl',
        's3:PutObject',
      ],
      Resource: ['arn:aws:s3:::remotionlambda-*/*'],
    },
    {
      Sid: '3',
      Effect: 'Allow',
      Action: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      Resource: ['arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render*'],
    },
    {
      Sid: '4',
      Effect: 'Allow',
      Action: ['lambda:InvokeFunction'],
      Resource: ['arn:aws:lambda:*:*:function:remotion-render-*'],
    },
  ],
};

async function main() {
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: 'remotion-execution-policy',
    PolicyDocument: JSON.stringify(policy),
  }));
  console.log('✅ Policy updated for', ROLE_NAME);
}

main().catch((err) => { console.error(err); process.exit(1); });
