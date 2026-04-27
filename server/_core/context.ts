import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
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
    const sessionUser = await sdk.authenticateRequest(opts.req);
    if (sessionUser?.openId) {
      const dbUser = await getUserByOpenId(sessionUser.openId);
      user = dbUser ?? sessionUser;
    }
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
