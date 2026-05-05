import { inngest } from './inngest.js';
import type { Events } from './inngest.js';

export async function send<K extends keyof Events>(name: K, data: Events[K]['data']) {
  return inngest.send({ name, data });
}
