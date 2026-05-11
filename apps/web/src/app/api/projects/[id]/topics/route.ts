import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchProjectTopics, userOwnsProject } from '@/server/topics/queries';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * GET /api/projects/:id/topics
 *
 * Devuelve los temas pre-cargados + variantes del usuario para este proyecto
 * + el mapa de usage de angle/tone. Pensado para alimentar el TopicCombobox
 * y los selects de Ángulo/Tono en el formulario de creación de carrusel.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    if (!projectId || projectId.length < 32) {
      return NextResponse.json({ error: 'invalid_project_id' }, { status: 400 });
    }

    const owns = await userOwnsProject(projectId, user.id);
    if (!owns) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const data = await fetchProjectTopics(projectId, user.id);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[GET /api/projects/:id/topics]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
