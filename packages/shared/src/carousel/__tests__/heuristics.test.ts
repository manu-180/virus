/**
 * Tests for inferTopicDefaults.
 *
 * The function is PURE — feed it a title string, get back angles/tones/
 * slide count suggestions. Every test below should be readable as a
 * mini-spec: "given this kind of title, the heuristic returns ...".
 */

import { describe, it, expect } from 'vitest';
import { inferTopicDefaults } from '../heuristics.js';

describe('inferTopicDefaults — target_slide_count', () => {
  it('"N errores" → N + 2 slides', () => {
    expect(inferTopicDefaults('5 errores que hacen que tu sitio web no venda').targetSlideCount).toBe(7);
  });

  it('"Las N cosas" → N + 2 slides (leading article OK)', () => {
    expect(
      inferTopicDefaults('Las 3 cosas que tus clientes buscan en tu web').targetSlideCount,
    ).toBe(5);
  });

  it('"N preguntas" → N + 2 slides', () => {
    expect(
      inferTopicDefaults('7 preguntas que tu chatbot debería hacer antes de pedir el contacto')
        .targetSlideCount,
    ).toBe(9);
  });

  it('"N funcionalidades" → N + 2 slides', () => {
    expect(
      inferTopicDefaults('5 funcionalidades que toda web profesional debería tener').targetSlideCount,
    ).toBe(7);
  });

  it('no leading number → null (random distribution)', () => {
    expect(
      inferTopicDefaults('WordPress te está saliendo más caro de lo que pensás').targetSlideCount,
    ).toBeNull();
  });

  it('numbers outside [3, 9] do not trigger', () => {
    expect(inferTopicDefaults('2 cosas que aprendí').targetSlideCount).toBeNull();
    expect(inferTopicDefaults('15 errores típicos').targetSlideCount).toBeNull();
  });

  it('numbers without a recognised noun do not trigger', () => {
    expect(inferTopicDefaults('5 minutos para mejorar tu web').targetSlideCount).toBeNull();
  });

  it('handles spanish accents in the noun', () => {
    expect(inferTopicDefaults('5 mitos sobre los chatbots').targetSlideCount).toBe(7);
    expect(inferTopicDefaults('5 mítos sobre los chatbots').targetSlideCount).toBe(7);
  });
});

describe('inferTopicDefaults — additional_angles', () => {
  it('"antes y después" → before-after', () => {
    const r = inferTopicDefaults('Antes y después: de web estática a sistema que vende');
    expect(r.additionalAngles).toContain('before-after');
  });

  it('"X vs Y" → listicle', () => {
    const r = inferTopicDefaults('Landing page vs Web Interactiva: cuál necesita tu negocio');
    expect(r.additionalAngles).toContain('listicle');
  });

  it('"por qué ..." → contrarian', () => {
    const r = inferTopicDefaults('Por qué WordPress te está saliendo más caro');
    expect(r.additionalAngles).toContain('contrarian');
  });

  it('"mito ..." → contrarian', () => {
    const r = inferTopicDefaults('Mito: la gente odia hablar con bots');
    expect(r.additionalAngles).toContain('contrarian');
  });

  it('"cómo ..." → educational', () => {
    const r = inferTopicDefaults('Cómo embedés BotLode en tu sitio en 2 minutos');
    expect(r.additionalAngles).toContain('educational');
  });

  it('"el día que ..." → story-arc', () => {
    const r = inferTopicDefaults('El día que un bot me cerró una venta a las 3 AM');
    expect(r.additionalAngles).toContain('story-arc');
  });

  it('numbered listicle title → adds listicle even if main angle is educational', () => {
    const r = inferTopicDefaults('5 razones por las que tu sitio necesita un bot');
    expect(r.additionalAngles).toContain('listicle');
  });

  it('result is deduplicated', () => {
    // "Cómo" + numbered title would normally add 'educational' once.
    const r = inferTopicDefaults('Cómo escribir las 3 reglas perfectas');
    const unique = new Set(r.additionalAngles);
    expect(unique.size).toBe(r.additionalAngles.length);
  });
});

describe('inferTopicDefaults — additional_tones', () => {
  it('numbered listicle → authoritative', () => {
    expect(
      inferTopicDefaults('5 errores que hacen que tu sitio web no venda').additionalTones,
    ).toContain('authoritative');
  });

  it('"por qué ..." → authoritative', () => {
    expect(inferTopicDefaults('Por qué cobro $300.000 por una landing').additionalTones).toContain(
      'authoritative',
    );
  });

  it('"cómo ..." → casual', () => {
    expect(
      inferTopicDefaults('Cómo agendar reuniones desde el chat').additionalTones,
    ).toContain('casual');
  });

  it('plain title without trigger → no extra tones', () => {
    expect(
      inferTopicDefaults('WordPress te está saliendo más caro de lo que pensás').additionalTones,
    ).toEqual([]);
  });
});

describe('inferTopicDefaults — full realistic examples', () => {
  it('"5 errores que hacen que tu sitio web no venda"', () => {
    const r = inferTopicDefaults('5 errores que hacen que tu sitio web no venda');
    expect(r.targetSlideCount).toBe(7);
    expect(r.additionalAngles).toContain('listicle');
    expect(r.additionalTones).toContain('authoritative');
  });

  it('"Antes y después: cómo BotLode levantó la conversión"', () => {
    const r = inferTopicDefaults('Antes y después: cómo BotLode levantó la conversión');
    expect(r.additionalAngles).toContain('before-after');
    expect(r.additionalAngles).toContain('educational'); // "cómo"
    expect(r.targetSlideCount).toBeNull();
  });

  it('"Por qué WhatsApp Business no reemplaza a un chatbot IA"', () => {
    const r = inferTopicDefaults('Por qué WhatsApp Business no reemplaza a un chatbot IA');
    expect(r.additionalAngles).toContain('contrarian');
    expect(r.additionalTones).toContain('authoritative');
  });

  it('plain title with no patterns → all empty / null', () => {
    const r = inferTopicDefaults('Carrusel sobre nuestra empresa');
    expect(r.targetSlideCount).toBeNull();
    expect(r.additionalAngles).toEqual([]);
    expect(r.additionalTones).toEqual([]);
  });
});
