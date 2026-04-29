import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById, getUserByClerkId } from "../db";
import { verifyToken } from "@clerk/backend";

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
      clerkId: "dev_user",
      name: "Dev User",
      email: "dev@localhost",
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
    const authHeader = opts.req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (token) {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      if (payload.sub) {
        user = (await getUserByClerkId(payload.sub)) ?? null;
      }
    }
  } catch {
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}

// Vercel Functions용 context (fetch Request 기반)
export async function createContextFromRequest(req: Request): Promise<{ user: User | null }> {
  if (process.env.NODE_ENV === "development") {
    const dbUser = await getUserById(DEV_USER_ID);
    return { user: dbUser ?? null };
  }

  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return { user: null };
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const user = payload.sub ? ((await getUserByClerkId(payload.sub)) ?? null) : null;
    return { user };
  } catch {
    return { user: null };
  }
}
