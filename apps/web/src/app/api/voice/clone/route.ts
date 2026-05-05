import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKETS } from '@/lib/storage/buckets';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

interface CloneRequestBody {
  storagePath: string;
  voiceName?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('[clone] ELEVENLABS_API_KEY is not set');
      return NextResponse.json(
        { error: { code: 'SERVER_MISCONFIGURATION', message: 'Voice cloning is not configured' } },
        { status: 503 },
      );
    }

    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    // 2. Parse + validate body
    let body: CloneRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }

    const { storagePath, voiceName = 'Manuel ES' } = body;

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing required field: storagePath' } },
        { status: 400 },
      );
    }

    // Verify the path belongs to the authenticated user (prevents accessing other users' samples)
    if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes('..')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Access denied to this storage path' } },
        { status: 403 },
      );
    }

    const admin = createAdminClient();

    // 3. Get a signed URL for the stored audio file
    const { data: signedData, error: signedError } = await admin.storage
      .from(BUCKETS.voiceSamples)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      console.error('[clone] Failed to create signed URL:', signedError);
      return NextResponse.json(
        { error: { code: 'UPLOAD_FAILED', message: 'Could not access audio sample' } },
        { status: 500 },
      );
    }

    // 4. Download the audio file as ArrayBuffer
    const audioRes = await fetch(signedData.signedUrl);
    if (!audioRes.ok) {
      console.error('[clone] Failed to download audio from signed URL:', audioRes.status);
      return NextResponse.json(
        { error: { code: 'UPLOAD_FAILED', message: 'Could not download audio sample' } },
        { status: 500 },
      );
    }
    const audioBuffer = await audioRes.arrayBuffer();

    // Derive filename and MIME type from storagePath
    const originalFilename = storagePath.split('/').pop() ?? 'voice.webm';
    const extToMime: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      webm: 'audio/webm',
    };
    const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'webm';
    const mimeType = extToMime[ext] ?? 'audio/webm';

    // 5. Build multipart form and call ElevenLabs Instant Voice Cloning
    const form = new FormData();
    form.append('name', voiceName);
    form.append(
      'files',
      new Blob([audioBuffer], { type: mimeType }),
      originalFilename,
    );

    const elevenRes = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: form,
    });

    // 6. Handle ElevenLabs error responses
    if (!elevenRes.ok) {
      const responseText = await elevenRes.text();
      console.error('[clone] ElevenLabs error:', elevenRes.status, responseText);

      if (elevenRes.status === 402) {
        return NextResponse.json(
          { error: { code: 'QUOTA_EXCEEDED', message: 'ElevenLabs quota exceeded' } },
          { status: 402 },
        );
      }

      if (elevenRes.status === 422) {
        return NextResponse.json(
          {
            error: {
              code: 'VOICE_CLONE_FAILED',
              message: 'Audio quality insufficient. Try recording in a quieter environment.',
            },
          },
          { status: 422 },
        );
      }

      return NextResponse.json(
        { error: { code: 'ELEVENLABS_ERROR', message: responseText } },
        { status: elevenRes.status },
      );
    }

    // Parse voice_id from ElevenLabs response
    const elevenData = await elevenRes.json() as { voice_id: string };
    const voiceId = elevenData.voice_id;

    // 7. Save voice_id to the user's profile
    const { error: profileError } = await admin
      .from('profiles')
      .update({ default_voice_clone_id: voiceId })
      .eq('id', user.id);

    if (profileError) {
      console.error('[clone] Failed to update profile with voice ID:', profileError);
      return NextResponse.json(
        { error: { code: 'PROFILE_UPDATE_FAILED', message: 'Voz clonada en ElevenLabs pero no se pudo guardar en el perfil. Intentá de nuevo.' } },
        { status: 500 },
      );
    }

    // 8. Run test synthesis to verify the voice works
    const ttsRes = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Hola, esta es mi voz clonada.',
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    // 9. Convert test audio to base64 if synthesis succeeded
    let testAudio: string | undefined;
    let testAudioMime: string | undefined;

    if (ttsRes.ok) {
      const ttsBuffer = await ttsRes.arrayBuffer();
      testAudio = Buffer.from(ttsBuffer).toString('base64');
      testAudioMime = 'audio/mpeg';
    } else {
      console.error('[clone] TTS test failed (non-fatal):', ttsRes.status);
    }

    // 10. Return response
    return NextResponse.json(
      {
        voiceId,
        ...(testAudio !== undefined && { testAudio, testAudioMime }),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[clone] Unexpected error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error during voice cloning' } },
      { status: 500 },
    );
  }
}
