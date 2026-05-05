import type { SpeedBuildInput } from './schema';

// 30 fps · scene durations: 300 + 360 + 360 + 330 = 1350 frames = 45 s (frames 150..1500, i.e. sec 5..50)
export const speedBuildDefaults: SpeedBuildInput = {
  totalDurationSec: 60,
  themeColor: '#635BFF', // Stripe purple
  language: 'es',
  audioUrl: 'https://example.com/sample.mp3',

  speedBuild: {
    elapsedTimeStartSec: 0,
    elapsedTimeEndSec: 47,
    promptCount: 4,
    scenes: [
      {
        label: 'Prompt 1 — Setup Stripe',
        languageId: 'typescript',
        durationFrames: 300,
        code: `// app/api/checkout/route.ts
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  { apiVersion: '2024-10-28' }
);`,
      },
      {
        label: 'Prompt 2 — Checkout session',
        languageId: 'typescript',
        durationFrames: 360,
        code: `export async function POST(req: NextRequest) {
  const { priceId, userId } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: \`\${process.env.NEXT_PUBLIC_URL}/success\`,
    cancel_url: \`\${process.env.NEXT_PUBLIC_URL}/pricing\`,
    metadata: { userId },
  });

  return NextResponse.json({ url: session.url });
}`,
      },
      {
        label: 'Prompt 3 — Payment button',
        languageId: 'tsx',
        durationFrames: 360,
        code: `// components/checkout-button.tsx
'use client';
import { useState } from 'react';

export function CheckoutButton({ priceId }: { priceId: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    const { url } = await res.json();
    window.location.href = url;
  };

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Redirigiendo...' : 'Comprar — $97'}
    </button>
  );
}`,
      },
      {
        label: 'Prompt 4 — Webhook handler',
        languageId: 'typescript',
        durationFrames: 330,
        code: `// app/api/webhooks/stripe/route.ts
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  const event = stripe.webhooks.constructEvent(
    body, sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await db.users.update({
      where: { id: session.metadata?.userId },
      data: { plan: 'pro' },
    });
  }

  return NextResponse.json({ received: true });
}`,
      },
    ],
  },

  segments: [
    {
      index: 0,
      role: 'hook',
      startSec: 0,
      endSec: 2,
      voiceover: 'Construí un Stripe checkout en 47 segundos. Vibe coding nivel dios.',
      onScreenText: 'Construí un\nStripe Checkout\nen 47 segundos',
      visualCue: 'hook-card-punch',
      soundEffect: 'whoosh',
    },
    {
      index: 1,
      role: 'setup',
      startSec: 2,
      endSec: 5,
      voiceover: 'Cursor más Claude Sonnet. Cero código escrito a mano.',
      onScreenText: 'Cursor + Claude Sonnet\nCero código a mano',
      visualCue: 'hook-card-slide',
      soundEffect: 'click',
    },
    {
      index: 2,
      role: 'development',
      startSec: 5,
      endSec: 50,
      voiceover:
        'Cuatro prompts. Setup de Stripe, endpoint, componente de pago, y webhook.',
      visualCue: 'screen-recording',
    },
    {
      index: 3,
      role: 'reveal',
      startSec: 50,
      endSec: 55,
      voiceover: 'El checkout está live. Listo para producción.',
      onScreenText: 'Stripe Checkout\nLive ✓',
      visualCue: 'hook-card-punch',
      soundEffect: 'ding',
    },
    {
      index: 4,
      role: 'cta',
      startSec: 55,
      endSec: 60,
      voiceover: 'Comentá BUILD y te mando los cuatro prompts exactos.',
      visualCue: 'cta-card',
      soundEffect: 'pop',
    },
  ],

  captions: {
    words: [
      { text: 'Construí', startMs: 0, endMs: 380 },
      { text: 'un', startMs: 400, endMs: 520 },
      { text: 'Stripe', startMs: 540, endMs: 980 },
      { text: 'checkout', startMs: 1000, endMs: 1480 },
      { text: 'en', startMs: 1500, endMs: 1640 },
      { text: '47', startMs: 1660, endMs: 1960 },
      { text: 'segundos', startMs: 1980, endMs: 2600 },
      { text: 'Cursor', startMs: 2700, endMs: 3100 },
      { text: 'más', startMs: 3120, endMs: 3340 },
      { text: 'Claude', startMs: 3360, endMs: 3760 },
      { text: 'Sonnet', startMs: 3780, endMs: 4260 },
      { text: 'Cero', startMs: 4380, endMs: 4700 },
      { text: 'código', startMs: 4720, endMs: 5140 },
      { text: 'escrito', startMs: 5160, endMs: 5540 },
      { text: 'a', startMs: 5560, endMs: 5680 },
      { text: 'mano', startMs: 5700, endMs: 6180 },
      { text: 'El', startMs: 50100, endMs: 50300 },
      { text: 'checkout', startMs: 50320, endMs: 50820 },
      { text: 'está', startMs: 50840, endMs: 51140 },
      { text: 'live', startMs: 51160, endMs: 51600 },
      { text: 'Listo', startMs: 51700, endMs: 52060 },
      { text: 'para', startMs: 52080, endMs: 52380 },
      { text: 'producción', startMs: 52400, endMs: 53200 },
      { text: 'Comentá', startMs: 55100, endMs: 55560 },
      { text: 'BUILD', startMs: 55580, endMs: 56060 },
      { text: 'y', startMs: 56080, endMs: 56200 },
      { text: 'te', startMs: 56220, endMs: 56380 },
      { text: 'mando', startMs: 56400, endMs: 56820 },
      { text: 'los', startMs: 56840, endMs: 57040 },
      { text: 'cuatro', startMs: 57060, endMs: 57480 },
      { text: 'prompts', startMs: 57500, endMs: 57980 },
      { text: 'exactos', startMs: 58000, endMs: 58700 },
    ],
  },

  brand: {
    handle: '@manunavarro',
  },
};
