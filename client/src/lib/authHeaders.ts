import { supabase } from "./supabase";

/** 만료 직전이면 한 번 갱신해 빈 Bearer·401 줄임 */
async function ensureFreshSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.expires_at) return session;
  const msLeft = session.expires_at * 1000 - Date.now();
  if (msLeft > 120_000) return session;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return session;
  return data.session ?? session;
}

/** tRPC httpBatchLink 용 Bearer 헤더 (액세스 토큰이 있을 때만) */
export async function getAuthorizationHeader(): Promise<Record<string, string>> {
  const session = await ensureFreshSession();
  const token = session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
