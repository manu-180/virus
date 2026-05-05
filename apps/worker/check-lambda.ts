import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

import { LambdaClient, GetAccountSettingsCommand, ListFunctionsCommand, GetFunctionConcurrencyCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

const settings = await lambda.send(new GetAccountSettingsCommand({}));
console.log('Account limits:', JSON.stringify({
  totalConcurrentExecutions: settings.AccountLimit?.ConcurrentExecutions,
  unreservedConcurrentExecutions: settings.AccountLimit?.UnreservedConcurrentExecutions,
  totalCodeSize: settings.AccountLimit?.TotalCodeSize,
}, null, 2));
