import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), override: true });
import { createServer } from 'inngest/node';
import { inngest, functions } from './index.js';

const PORT = Number(process.env['WORKER_PORT'] ?? 3001);

createServer({ client: inngest, functions: [...functions] }).listen(PORT, () => {
  console.log(`[worker] Inngest serve → http://localhost:${PORT}/api/inngest`);
});
