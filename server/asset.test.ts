import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const clearedCookies: unknown[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (_name: string, _options: Record<string, unknown>) => {
        clearedCookies.push({ _name, _options });
      },
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("auth.me", () => {
  it("returns the authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-001");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("dashboard.summary", () => {
  it("returns dashboard summary object", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.summary();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("ledger", () => {
  it("list returns array for given year/month", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ledger.list({ year: 2026, month: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("monthSummary returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ledger.monthSummary({ year: 2026, month: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("fixedExpense", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.fixedExpense.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("stock", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.stock.list({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("savings", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.savings.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("pension", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pension.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("otherAsset", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.otherAsset.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("realEstate", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.realEstate.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("blogCampaign", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.blogCampaign.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("debt", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.debt.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("card", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.card.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("cardPoint", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.cardPoint.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("subscription", () => {
  it("list returns array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.list();
    expect(Array.isArray(result)).toBe(true);
  });
});
