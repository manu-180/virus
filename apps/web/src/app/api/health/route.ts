import { createAdminClient } from "@/lib/supabase/admin";

async function checkSupabase(): Promise<{ ok: boolean; latency_ms?: number }> {
  try {
    const t0 = Date.now();
    const supabase = createAdminClient();
    const { error } = await supabase.from("videos").select("id").limit(1);
    if (error) return { ok: false };
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch {
    return { ok: false };
  }
}

async function checkAnthropic(): Promise<{ ok: boolean }> {
  return { ok: !!process.env.ANTHROPIC_API_KEY };
}

async function checkElevenLabs(): Promise<{ ok: boolean }> {
  return { ok: !!process.env.ELEVENLABS_API_KEY };
}

async function checkLambda(): Promise<{ ok: boolean }> {
  return {
    ok:
      !!process.env.AWS_ACCESS_KEY_ID &&
      !!process.env.REMOTION_LAMBDA_FUNCTION_NAME &&
      !!process.env.REMOTION_SERVE_URL,
  };
}

export async function GET() {
  const [db, anthropic, elevenlabs, lambda] = await Promise.all([
    checkSupabase(),
    checkAnthropic(),
    checkElevenLabs(),
    checkLambda(),
  ]);

  const checks = { db, anthropic, elevenlabs, lambda };
  const ok = Object.values(checks).every((c) => c.ok);

  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
