import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

import { pollRender } from '@virus/shared/render';

const RENDER_ID = 'xp275fitn4';
const BUCKET = 'remotionlambda-useast1-lfc3xynwxa';

const result = await pollRender({ renderId: RENDER_ID, bucketName: BUCKET });
console.log(JSON.stringify(result, null, 2));
// Also check old render
const result2 = await pollRender({ renderId: '3ldyd4clgw', bucketName: BUCKET });
console.log('Old render:', JSON.stringify({ done: result2.done, errors: result2.errors?.length, overallProgress: result2.overallProgress }));
