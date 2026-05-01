import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthSessionContextValue = {
  session: Session | null;
  user: User | null;
  isReady: boolean;
  signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  /** PKCE/OAuth 후 URL에서 세션 교환 전에 getSession 이 null 로 끝나면 로그인↔메인 무한 리다이렉트 발생 → isReady 는 onAuthStateChange(INITIAL_SESSION) 기준으로만 올린다 */
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unblock = window.setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 12000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next);
      setIsReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(unblock);
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isReady,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isReady]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const v = useContext(AuthSessionContext);
  if (!v) throw new Error("useAuthSession 은 AuthSessionProvider 안에서만 사용하세요.");
  return v;
}
