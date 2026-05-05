import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

import { createClient } from '@supabase/supabase-js';

const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
const key = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const db = createClient(url, key);

const VIDEO_ID = 'ccff06ca-fb9e-4256-9f5a-9999f19d37a6';
const AUDIO_PATH = '5b74c262-6cb1-4f85-87d3-168391b934d9/ccff06ca-fb9e-4256-9f5a-9999f19d37a6/processed.mp3';
const INNGEST_EVENT_KEY = process.env['INNGEST_EVENT_KEY']!;

const { data: urlData, error: urlError } = await db.storage
  .from('audio')
  .createSignedUrl(AUDIO_PATH, 604800);

if (urlError || !urlData?.signedUrl) {
  console.error('Failed to sign URL:', urlError?.message);
  process.exit(1);
}

const res = await fetch(`http://localhost:8288/e/${INNGEST_EVENT_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'virus/captions.ready',
    data: { videoId: VIDEO_ID },
  }),
});

console.log('Event sent:', res.status, await res.text());
