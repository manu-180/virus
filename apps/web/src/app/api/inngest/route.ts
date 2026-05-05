import { serve } from 'inngest/next';
import { inngest, functions } from '@virus/inngest';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
