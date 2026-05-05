import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKETS } from '@/lib/storage/buckets';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  };
  // Fall back to subtype if not in map
  return map[mimeType] ?? mimeType.split('/')[1] ?? 'bin';
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    // 2. Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Request must be multipart/form-data' } },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing required field: file' } },
        { status: 400 },
      );
    }

    // 3. Validate MIME type
    const mimeType = file.type;
    if (!mimeType.startsWith('audio/')) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Invalid file type: ${mimeType}. Must be an audio file.` } },
        { status: 400 },
      );
    }

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'File size exceeds 100 MB limit' } },
        { status: 400 },
      );
    }

    // 5. Convert to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. Build storage path: {userId}/{timestamp}.{ext}
    const ext = getExtension(mimeType);
    const timestamp = Date.now();
    const storagePath = `${user.id}/${timestamp}.${ext}`;

    // 7. Upload via admin client (bypasses RLS)
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(BUCKETS.voiceSamples)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[upload-sample] Storage upload failed:', uploadError);
      return NextResponse.json(
        { error: { code: 'UPLOAD_FAILED', message: 'Failed to upload audio sample' } },
        { status: 500 },
      );
    }

    return NextResponse.json({ storagePath }, { status: 200 });
  } catch (err) {
    console.error('[upload-sample] Unexpected error:', err);
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: 'Unexpected error during upload' } },
      { status: 500 },
    );
  }
}
