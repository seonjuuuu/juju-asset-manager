import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { clerkClient } from "./sdk";
import { getUserById, getUserByOpenId } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_USER_ID = 1;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // 로컬 개발 환경에서는 DB에서 실제 유저를 읽어 최신 정보를 반영
  if (process.env.NODE_ENV === "development") {
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
    const requestState = await clerkClient.authenticateRequest(opts.req as unknown as Request, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const payload = requestState.toAuth();
    const openId = payload?.userId;
    if (openId) {
      user = await getUserByOpenId(openId) ?? null;
    }
  } catch {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
