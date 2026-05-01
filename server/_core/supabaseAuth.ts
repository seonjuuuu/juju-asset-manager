import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Supabase 사용자 JWT(Access token) 검증 결과 — DB users.openId 와 매핑 */
export type SupabaseJwtIdentity = {
  openId: string;
  email: string | undefined;
};

function stripBearer(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith("Bearer ")) return "";
  return authorizationHeader.slice(7).trim();
}

function getSupabaseUrl(): string | undefined {
  const u = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  return u || undefined;
}

let _serviceClient: SupabaseClient | null = null;
let _serviceTried = false;

function getServiceRoleClient(): SupabaseClient | null {
  if (_serviceTried) return _serviceClient;
  _serviceTried = true;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = getSupabaseUrl();
  if (!key || !url) return null;
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/** HS256 레거시 JWT Secret (대시보드 Legacy JWT secret) */
async function verifyWithJwtSecret(bearer: string): Promise<SupabaseJwtIdentity | null> {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(bearer, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { openId: sub, email };
  } catch {
    return null;
  }
}

/** 비대칭 JWT(신규 서명키) — SERVICE_ROLE 없이도 `VITE_SUPABASE_URL` 만 있으면 검증 가능 */
async function verifyWithProjectJwks(bearer: string): Promise<SupabaseJwtIdentity | null> {
  const base = getSupabaseUrl()?.replace(/\/$/, "");
  if (!base) return null;
  const issuer = `${base}/auth/v1`;
  const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
  const JWKS = createRemoteJWKSet(jwksUrl);
  try {
    const { payload } = await jwtVerify(bearer, JWKS, {
      issuer,
      audience: "authenticated",
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { openId: sub, email };
  } catch {
    try {
      const { payload } = await jwtVerify(bearer, JWKS, { issuer });
      const sub = typeof payload.sub === "string" ? payload.sub : null;
      if (!sub) return null;
      const email = typeof payload.email === "string" ? payload.email : undefined;
      return { openId: sub, email };
    } catch {
      return null;
    }
  }
}

/**
 * Authorization: Bearer <access_token>
 * 1) `SUPABASE_SERVICE_ROLE_KEY` 가 있으면 `getUser` 시도 후 실패 시 아래로 폴백
 * 2) `SUPABASE_JWT_SECRET` 으로 HS256
 * 3) 프로젝트 JWKS(`/auth/v1/.well-known/jwks.json`)로 비대칭 JWT (`VITE_SUPABASE_URL` 또는 `SUPABASE_URL` 필요)
 */
export async function verifySupabaseAccessToken(
  authorizationHeader: string | undefined
): Promise<SupabaseJwtIdentity | null> {
  const bearer = stripBearer(authorizationHeader);
  if (!bearer) return null;

  const svc = getServiceRoleClient();
  if (svc) {
    const { data, error } = await svc.auth.getUser(bearer);
    if (!error && data.user) {
      const u = data.user;
      return { openId: u.id, email: u.email ?? undefined };
    }
    console.warn("[auth] service getUser 실패, JWKS/레거시 시크릿으로 재시도:", error?.message ?? "no user");
  }

  const fromSecret = await verifyWithJwtSecret(bearer);
  if (fromSecret) return fromSecret;

  const fromJwks = await verifyWithProjectJwks(bearer);
  if (fromJwks) return fromJwks;

  console.warn(
    "[auth] 토큰 검증 실패. 로컬: .env에 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_URL+VITE 동일 프로젝트, 또는 SUPABASE_JWT_SECRET 를 확인하세요."
  );
  return null;
}
