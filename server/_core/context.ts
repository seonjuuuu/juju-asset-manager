import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifySupabaseAccessToken } from "./supabaseAuth";
import { getUserById, getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_USER_ID = 1;

function hasBearerAttempt(authorization: string | undefined): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  return authorization.slice(7).trim().length > 0;
}

async function resolveUserFromBearer(authorization: string | undefined): Promise<User | null> {
  const jwtUser = await verifySupabaseAccessToken(authorization);
  if (!jwtUser) return null;
  let user = await getUserByOpenId(jwtUser.openId) ?? null;
  if (!user) {
    await upsertUser({
      openId: jwtUser.openId,
      email: jwtUser.email,
      loginMethod: "supabase",
      lastSignedIn: new Date(),
    });
    user = await getUserByOpenId(jwtUser.openId) ?? null;
  }
  return user;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const authHeader = opts.req.headers.authorization;

  if (process.env.NODE_ENV === "development") {
    const fromJwt = await resolveUserFromBearer(authHeader);
    if (fromJwt) {
      return { req: opts.req, res: opts.res, user: fromJwt };
    }
    /** 로그인 토큰을 보냈는데 검증 실패 → 예전처럼 DEV_USER 로 뭉개면 모든 계정이 데이터 공유됨 */
    if (hasBearerAttempt(authHeader)) {
      return { req: opts.req, res: opts.res, user: null };
    }
    const dbUser = await getUserById(DEV_USER_ID);
    const user: User = dbUser ?? {
      id: DEV_USER_ID,
      openId: "jY7bjoHqY74ENsqhHuGYab",
      name: "seonju Moon",
      email: "seonjuuu116@gmail.com",
      loginMethod: null,
      role: "admin",
      birthDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    return { req: opts.req, res: opts.res, user };
  }

  let user: User | null = null;
  try {
    user = await resolveUserFromBearer(authHeader);
  } catch (err) {
    console.error("[Context] auth error:", err);
  }
  return { req: opts.req, res: opts.res, user };
}
