import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Use the request's own origin so this works on Railway/preview/local
  // without depending on NEXT_PUBLIC_APP_URL being set.
  return NextResponse.redirect(new URL('/login', request.url), {
    status: 303,
  });
}
