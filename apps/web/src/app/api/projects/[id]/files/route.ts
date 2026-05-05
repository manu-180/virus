import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadProjectFile } from '@/server/projects/upload';

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

    const { id } = await params;
    const formData = await request.formData();

    const kind = formData.get('kind');
    const file = formData.get('file');

    if (kind !== 'viral_patterns' && kind !== 'project_info') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'kind must be "viral_patterns" or "project_info"' } },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'file must be a valid File' } },
        { status: 400 }
      );
    }

    const result = await uploadProjectFile({ projectId: id, kind, file });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    if (msg === 'Unauthorized') return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: msg } }, { status: 401 });
    if (msg === 'Forbidden') return NextResponse.json({ error: { code: 'FORBIDDEN', message: msg } }, { status: 403 });
    if (msg.startsWith('MIME type') || msg.startsWith('File too large')) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, { status: 500 });
  }
}
