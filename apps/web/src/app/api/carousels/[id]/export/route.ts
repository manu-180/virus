import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// archiver v8 is pure ESM with named exports (ZipArchive, TarArchive, …) and
// no default export. We must NOT let webpack bundle it: the externals config
// would emit require('archiver') which returns a namespace object without a
// `.default`, breaking both the old default-import pattern and the new class
// API. The webpackIgnore comment in the dynamic import below tells webpack to
// leave the import() call untouched so Node.js resolves it natively at runtime.
type ArchiverError = Error & { code?: string };

// ---------------------------------------------------------------------------
// README template bundled in every export ZIP
// ---------------------------------------------------------------------------
const README_TEMPLATE = `INSTRUCCIONES PARA SUBIR A INSTAGRAM
=====================================

1. Abrí Instagram y tocá el botón "+" para crear una nueva publicación.
2. Seleccioná los 8 archivos PNG EN ORDEN (01-hook.png primero, 08-cta.png último).
   → En iOS: mantené presionado el primero y seleccioná el resto.
   → En Android: tocá "Seleccionar múltiples" antes de elegir.
3. Elegí el recorte 4:5 (vertical) — ya está preconfigurado en las imágenes.
4. Abrí "caption.txt" y pegá el texto completo en la descripción.
5. Publicá. ¡Listo!

TIPS:
- Publicá entre 18:00 y 21:00 para mayor alcance.
- Respondé los primeros comentarios en los primeros 30 minutos.
- El archivo "caption-alt.txt" tiene 2 variantes adicionales si querés probar otra.

Generado con Virus — theapexweb.com
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SlideSpec {
  idx: number;
  role: string;
  headline: string;
  visualPrompt?: string;
}

function parseOverlayText(raw: string | null, idx: number): SlideSpec {
  if (raw) {
    try {
      return JSON.parse(raw) as SlideSpec;
    } catch {
      // fall through
    }
  }
  return { idx, role: 'slide', headline: '' };
}

function parseBrief(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function pad(n: number): string {
  return String(n + 1).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// GET /api/carousels/[id]/export
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Auth
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Load project — RLS: user_id = user.id
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (project.status !== 'ready') {
      return NextResponse.json({ error: 'NOT_READY' }, { status: 409 });
    }

    // Load slides ordered by idx
    const { data: slides, error: slidesError } = await supabase
      .from('carousel_slides')
      .select('idx, composed_path, image_path, overlay_text')
      .eq('carousel_id', id)
      .order('idx', { ascending: true });

    if (slidesError) {
      console.error('[export] slides error:', slidesError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    // Load captions ordered by variant_idx
    const { data: captions, error: captionsError } = await supabase
      .from('carousel_captions')
      .select('id, variant_idx, framework, text, selected')
      .eq('carousel_id', id)
      .order('variant_idx', { ascending: true });

    if (captionsError) {
      console.error('[export] captions error:', captionsError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    // Resolve selected caption (or fall back to variant_idx=0)
    const allCaptions = captions ?? [];
    const selectedCaption = allCaptions.find((c) => c.selected) ?? allCaptions[0] ?? null;
    const otherCaptions = allCaptions.filter((c) => c.id !== selectedCaption?.id);

    // Build filename
    const brief = parseBrief(project.brief);
    const topic = typeof brief.topic === 'string' ? brief.topic : id;
    const slug = slugify(topic) || id.slice(0, 8);
    const date = new Date().toISOString().slice(0, 10);
    const zipFilename = `carousel-${slug}-${date}.zip`;

    // Build the ZIP fully in memory. 8 PNGs at ~1MB each + small text files
    // fits comfortably in memory and avoids fragile streaming across the
    // Next.js/Node-stream boundary on Railway (where the previous
    // PassThrough → ReadableStream pattern would silently fail without
    // surfacing the archiver error to the client).
    //
    // archiver v8 is ESM-only with named class exports. Use webpackIgnore so
    // webpack leaves this import() untouched and Node.js resolves it natively.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ZipArchive } = await import(/* webpackIgnore: true */ 'archiver') as any;
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    const archiveDone = new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve());
      archive.on('warning', (err: ArchiverError) => {
        if (err.code === 'ENOENT') {
          console.warn('[export] archive warning:', err);
        } else {
          reject(err);
        }
      });
      archive.on('error', reject);
    });

    const warnings: string[] = [];
    const admin = createAdminClient();

    // Add slide images
    for (const slide of (slides ?? [])) {
      const spec = parseOverlayText(slide.overlay_text, slide.idx);
      const entryName = `${pad(slide.idx)}-${spec.role}.png`;
      const storagePath = slide.composed_path ?? slide.image_path;

      if (!storagePath) {
        warnings.push(`slide_${slide.idx}_no_path`);
        continue;
      }

      const { data: blob, error: dlErr } = await admin.storage
        .from('carousels')
        .download(storagePath);

      if (dlErr || !blob) {
        warnings.push(`slide_${slide.idx}_download_failed:${dlErr?.message ?? 'no blob'}`);
        continue;
      }

      archive.append(Buffer.from(await blob.arrayBuffer()), { name: entryName });
    }

    // caption.txt — selected caption text (already includes hashtags)
    if (selectedCaption) {
      archive.append(selectedCaption.text + '\n', { name: 'caption.txt' });
    }

    // caption-alt.txt — remaining variants
    if (otherCaptions.length > 0) {
      const altText = otherCaptions
        .map((c) => `# ${c.framework}\n\n${c.text}`)
        .join('\n\n---\n\n');
      archive.append(altText + '\n', { name: 'caption-alt.txt' });
    }

    // meta.json
    const meta = {
      brief,
      slides: (slides ?? []).map((s) => {
        const spec = parseOverlayText(s.overlay_text, s.idx);
        return { idx: s.idx, role: spec.role, headline: spec.headline };
      }),
      generatedAt: project.updated_at,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    archive.append(JSON.stringify(meta, null, 2) + '\n', { name: 'meta.json' });

    // README.txt
    archive.append(README_TEMPLATE, { name: 'README.txt' });

    // Finalize and wait for the archive 'end' event so we know all chunks
    // have been collected before building the response buffer.
    await archive.finalize();
    await archiveDone;

    if (warnings.length > 0) {
      console.warn('[export] completed with warnings:', warnings);
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      console.error('[export] empty ZIP buffer', { carouselId: id, warnings });
      return NextResponse.json(
        { error: 'empty_archive', warnings },
        { status: 500 },
      );
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[GET /api/carousels/[id]/export]', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 },
    );
  }
}
