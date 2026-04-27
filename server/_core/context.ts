import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// ─── 로컬 개발용 더미 유저 ────────────────────────────────────────────────────
// NODE_ENV=development 일 때만 활성화됩니다.
// 절대 production 환경에서는 사용되지 않습니다.
const DEV_USER: User = {
  id: 1,
  openId: "jY7bjoHqY74ENsqhHuGYab",
  name: "seonju Moon",
  email: "seonjuuu116@gmail.com",
  loginMethod: null,
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // 로컬 개발 환경에서는 OAuth 없이 자동으로 로그인 처리
  if (process.env.NODE_ENV === "development") {
    return {
      req: opts.req,
      res: opts.res,
      user: DEV_USER,
    };
  }

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
