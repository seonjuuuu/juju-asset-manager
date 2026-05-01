import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** anon(레거시) 또는 대시보드의 Publishable 키 — 둘 중 하나만 있으면 됨 */
const anonOrPublishable =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

if (!url || !anonOrPublishable) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL 과 (VITE_SUPABASE_ANON_KEY 또는 VITE_SUPABASE_PUBLISHABLE_KEY) 가 필요합니다"
  );
}

/**
 * 브라우저 전용 공개 키. PKCE 권장(Implicit 대신).
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google
 */
export const supabase = createClient(url ?? "", anonOrPublishable ?? "", {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Google OAuth — Supabase 대시보드에서 Google Provider·리다이렉트 URL 설정 필요 */
export async function signInWithGoogle(): Promise<{ error: { message: string } | null }> {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) return { error: { message: error.message } };
  if (data.url) window.location.href = data.url;
  return { error: null };
}
