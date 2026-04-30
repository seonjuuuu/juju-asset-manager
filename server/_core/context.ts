import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getAuth } from "@clerk/express";
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = getAuth(opts.req as any);
    const openId = auth?.userId;
    if (openId) {
      user = await getUserByOpenId(openId) ?? null;
    }
  } catch (err) {
    console.error("[Context] auth error:", err);
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}
