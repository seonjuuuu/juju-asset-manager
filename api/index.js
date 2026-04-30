// server/vercel-handler.ts
import "dotenv/config";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function getSessionCookieOptions(req) {
  const isSecure = (() => {
    if (req?.protocol === "https") return true;
    const proto = req?.headers?.["x-forwarded-proto"];
    if (!proto) return false;
    const list = Array.isArray(proto) ? proto : proto.split(",");
    return list.some((p) => p.trim().toLowerCase() === "https");
  })();
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecure
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";

// server/db.ts
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

// drizzle/schema.ts
import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  boolean,
  bigint,
  uniqueIndex
} from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var cardTypeEnum = pgEnum("card_type", ["\uC2E0\uC6A9\uCE74\uB4DC", "\uCCB4\uD06C\uCE74\uB4DC"]);
var subscriptionCategoryEnum = pgEnum("subscription_category", ["\uBE44\uC988\uB2C8\uC2A4", "\uBBF8\uB514\uC5B4", "\uC790\uAE30\uACC4\uBC1C", "\uAE30\uD0C0"]);
var billingCycleEnum = pgEnum("billing_cycle", ["\uB9E4\uB2EC", "\uB9E4\uC8FC", "\uB9E4\uC77C", "\uB9E4\uB144"]);
var accountTypeEnum = pgEnum("account_type", ["\uC785\uCD9C\uAE08", "\uC800\uCD95", "CMA", "\uD30C\uD0B9\uD1B5\uC7A5", "\uCCAD\uC57D", "\uAE30\uD0C0"]);
var insuranceTypeEnum = pgEnum("insurance_type", ["\uBCF4\uC7A5\uD615", "\uC800\uCD95\uD615"]);
var renewalTypeEnum = pgEnum("renewal_type", ["\uBE44\uAC31\uC2E0\uD615", "\uAC31\uC2E0\uD615"]);
var paymentTypeEnum = pgEnum("payment_type", ["monthly", "annual"]);
var categoryTypeEnum = pgEnum("category_type", ["expense", "income", "both"]);
var clientTypeEnum = pgEnum("client_type", ["\uD68C\uC0AC", "\uAC1C\uC778"]);
var businessExpenseCategoryEnum = pgEnum("business_expense_category", ["\uAD11\uACE0", "\uB300\uB0A9", "\uC138\uAE08", "\uC218\uC218\uB8CC", "\uC18C\uBAA8\uD488", "\uC778\uAC74\uBE44", "\uAE30\uD0C0"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  birthDate: varchar("birth_date", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  entryDate: date("entry_date").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  mainCategory: varchar("main_category", { length: 50 }).notNull(),
  subCategory: varchar("sub_category", { length: 100 }),
  description: text("description"),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var fixedExpenses = pgTable("fixed_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  mainCategory: varchar("main_category", { length: 100 }).notNull(),
  subCategory: varchar("sub_category", { length: 100 }),
  description: varchar("description", { length: 300 }),
  paymentAccount: varchar("payment_account", { length: 100 }),
  monthlyAmount: bigint("monthly_amount", { mode: "number" }).notNull().default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }),
  startDate: varchar("start_date", { length: 50 }),
  expiryDate: varchar("expiry_date", { length: 50 }),
  paymentDay: integer("payment_day"),
  note: text("note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var stockPortfolio = pgTable("stock_portfolio", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  market: varchar("market", { length: 20 }),
  broker: varchar("broker", { length: 50 }),
  sector: varchar("sector", { length: 50 }),
  stockName: varchar("stock_name", { length: 100 }).notNull(),
  ticker: varchar("ticker", { length: 20 }),
  avgBuyPrice: bigint("avg_buy_price", { mode: "number" }).default(0),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("0"),
  buyAmount: bigint("buy_amount", { mode: "number" }).default(0),
  currentPrice: bigint("current_price", { mode: "number" }).default(0),
  currentAmount: bigint("current_amount", { mode: "number" }).default(0),
  returnRate: decimal("return_rate", { precision: 10, scale: 6 }).default("0"),
  note: text("note"),
  snapshotMonth: varchar("snapshot_month", { length: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var userMemos = pgTable("user_memos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  memoKey: varchar("memo_key", { length: 100 }).notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => ({
  userMemoKeyIdx: uniqueIndex("user_memos_user_id_memo_key_idx").on(table.userId, table.memoKey)
}));
var savingsAssets = pgTable("savings_assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  category: varchar("category", { length: 50 }).notNull(),
  description: varchar("description", { length: 100 }).notNull(),
  bank: varchar("bank", { length: 100 }),
  accountNumber: varchar("account_number", { length: 100 }),
  monthlyDeposit: varchar("monthly_deposit", { length: 50 }),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }),
  totalAmount: decimal("total_amount", { precision: 20, scale: 4 }).default("0"),
  expiryDate: varchar("expiry_date", { length: 50 }),
  note: text("note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var pensionAssets = pgTable("pension_assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  pensionType: varchar("pension_type", { length: 50 }).notNull(),
  company: varchar("company", { length: 100 }),
  assetType: varchar("asset_type", { length: 20 }),
  stockName: varchar("stock_name", { length: 100 }),
  ticker: varchar("ticker", { length: 20 }),
  avgBuyPrice: bigint("avg_buy_price", { mode: "number" }).default(0),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("0"),
  buyAmount: bigint("buy_amount", { mode: "number" }).default(0),
  currentPrice: bigint("current_price", { mode: "number" }).default(0),
  currentAmount: bigint("current_amount", { mode: "number" }).default(0),
  returnRate: decimal("return_rate", { precision: 10, scale: 6 }).default("0"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var otherAssets = pgTable("other_assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  category: varchar("category", { length: 100 }).notNull(),
  monthlyDeposit: bigint("monthly_deposit", { mode: "number" }).default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var realEstates = pgTable("real_estates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  district: varchar("district", { length: 100 }),
  dong: varchar("dong", { length: 100 }),
  aptName: varchar("apt_name", { length: 100 }).notNull(),
  builtYear: varchar("built_year", { length: 20 }),
  households: integer("households"),
  areaSize: decimal("area_size", { precision: 10, scale: 2 }),
  floor: varchar("floor", { length: 20 }),
  direction: varchar("direction", { length: 20 }),
  salePrice: bigint("sale_price", { mode: "number" }).default(0),
  leasePrice: bigint("lease_price", { mode: "number" }).default(0),
  leaseRatio: decimal("lease_ratio", { precision: 10, scale: 6 }),
  gap: bigint("gap", { mode: "number" }).default(0),
  pricePerPyeong: decimal("price_per_pyeong", { precision: 15, scale: 4 }),
  price201912: bigint("price_201912", { mode: "number" }).default(0),
  price202112: bigint("price_202112", { mode: "number" }).default(0),
  currentPrice: bigint("current_price", { mode: "number" }).default(0),
  riseFrom201912: decimal("rise_from_201912", { precision: 10, scale: 6 }),
  riseFrom202112: decimal("rise_from_202112", { precision: 10, scale: 6 }),
  note: text("note"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var blogCampaigns = pgTable("blog_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  platform: varchar("platform", { length: 100 }),
  campaignType: varchar("campaign_type", { length: 50 }),
  category: varchar("category", { length: 50 }),
  businessName: varchar("business_name", { length: 200 }),
  amount: bigint("amount", { mode: "number" }).default(0),
  startDate: varchar("start_date", { length: 20 }),
  endDate: varchar("end_date", { length: 20 }),
  visitDate: varchar("visit_date", { length: 20 }),
  reviewDone: boolean("review_done").default(false),
  completed: boolean("completed").default(false),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var debts = pgTable("debts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  category: varchar("category", { length: 100 }).notNull(),
  description: varchar("description", { length: 200 }),
  debtType: varchar("debt_type", { length: 50 }),
  principal: bigint("principal", { mode: "number" }).default(0),
  monthlyPayment: bigint("monthly_payment", { mode: "number" }).default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }),
  balance: bigint("balance", { mode: "number" }).default(0),
  expiryDate: varchar("expiry_date", { length: 50 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  cardType: cardTypeEnum("card_type").notNull().default("\uC2E0\uC6A9\uCE74\uB4DC"),
  cardCompany: varchar("card_company", { length: 100 }).notNull(),
  cardName: varchar("card_name", { length: 200 }),
  benefits: text("benefits"),
  annualFee: bigint("annual_fee", { mode: "number" }).default(0),
  performance: varchar("performance", { length: 200 }),
  purpose: varchar("purpose", { length: 200 }),
  creditLimit: bigint("credit_limit", { mode: "number" }).default(0),
  expiryDate: varchar("expiry_date", { length: 10 }),
  paymentDate: varchar("payment_date", { length: 50 }),
  paymentAccount: varchar("payment_account", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var cardPoints = pgTable("card_points", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  benefits: text("benefits"),
  balance: bigint("balance", { mode: "number" }).default(0),
  purpose: varchar("purpose", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  category: subscriptionCategoryEnum("category").notNull().default("\uAE30\uD0C0"),
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("\uB9E4\uB2EC"),
  price: bigint("price", { mode: "number" }).notNull().default(0),
  sharedCount: integer("shared_count").notNull().default(1),
  billingDay: integer("billing_day"),
  startDate: varchar("start_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 200 }),
  note: text("note"),
  isPaused: boolean("is_paused").notNull().default(false),
  pausedFrom: varchar("paused_from", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var sideIncomeCategories = pgTable("side_income_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#5b7cfa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var sideIncomes = pgTable("side_incomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  incomeDate: date("income_date").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  categoryId: integer("category_id"),
  categoryName: varchar("category_name", { length: 100 }),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  description: varchar("description", { length: 300 }),
  isRegular: boolean("is_regular").notNull().default(false),
  note: text("note"),
  ledgerEntryId: integer("ledger_entry_id"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var businessIncomes = pgTable("business_incomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientType: clientTypeEnum("client_type"),
  depositorName: varchar("depositor_name", { length: 100 }),
  phoneNumber: varchar("phone_number", { length: 30 }),
  workAmount: bigint("work_amount", { mode: "number" }).notNull().default(0),
  depositPercent: integer("deposit_percent").notNull().default(50),
  workStartDate: varchar("work_start_date", { length: 20 }),
  isCompleted: boolean("is_completed").notNull().default(false),
  settlementDate: varchar("settlement_date", { length: 20 }),
  cashReceiptDone: boolean("cash_receipt_done").notNull().default(false),
  depositLedgerEntryId: integer("deposit_ledger_entry_id"),
  balanceLedgerEntryId: integer("balance_ledger_entry_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var businessExpenses = pgTable("business_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  expenseDate: date("expense_date").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  category: businessExpenseCategoryEnum("category").notNull().default("\uAE30\uD0C0"),
  vendor: varchar("vendor", { length: 200 }),
  description: varchar("description", { length: 300 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  paymentMethod: varchar("payment_method", { length: 200 }),
  isTaxDeductible: boolean("is_tax_deductible").notNull().default(true),
  ledgerEntryId: integer("ledger_entry_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountType: accountTypeEnum("account_type").notNull().default("\uC785\uCD9C\uAE08"),
  accountNumber: varchar("account_number", { length: 100 }),
  accountHolder: varchar("account_holder", { length: 100 }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  interestRate: varchar("interest_rate", { length: 20 }),
  linkedCard: varchar("linked_card", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var installments = pgTable("installments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  cardId: integer("card_id"),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
  months: integer("months").notNull().default(1),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  isInterestFree: boolean("is_interest_free").notNull().default(true),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }).default("0"),
  categoryId: integer("category_id"),
  subCategoryId: integer("sub_category_id"),
  note: text("note"),
  earlyRepaymentAmount: bigint("early_repayment_amount", { mode: "number" }),
  earlyRepaymentDate: varchar("early_repayment_date", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  loanType: varchar("loan_type", { length: 50 }).notNull().default("\uAE30\uD0C0"),
  lender: varchar("lender", { length: 100 }),
  principalAmount: bigint("principal_amount", { mode: "number" }).notNull().default(0),
  remainingPrincipal: bigint("remaining_principal", { mode: "number" }).notNull().default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }).default("0"),
  repaymentType: varchar("repayment_type", { length: 50 }).notNull().default("\uC218\uB3D9\uC785\uB825"),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  maturityDate: varchar("maturity_date", { length: 20 }),
  paymentDay: integer("payment_day"),
  monthlyPayment: bigint("monthly_payment", { mode: "number" }).notNull().default(0),
  graceMonths: integer("grace_months").default(0),
  note: text("note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var insurance = pgTable("insurance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 200 }),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }),
  insuranceType: insuranceTypeEnum("insurance_type"),
  renewalType: renewalTypeEnum("renewal_type").notNull().default("\uBE44\uAC31\uC2E0\uD615"),
  renewalCycleYears: integer("renewal_cycle_years"),
  paymentType: paymentTypeEnum("payment_type").notNull().default("monthly"),
  paymentDay: integer("payment_day"),
  paymentAmount: bigint("payment_amount", { mode: "number" }).notNull().default(0),
  durationYears: integer("duration_years"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  type: categoryTypeEnum("type").notNull().default("expense"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var subCategories = pgTable("sub_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  categoryId: integer("category_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var laborCosts = pgTable("labor_costs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  freelancerName: varchar("freelancer_name", { length: 200 }).notNull(),
  description: text("description"),
  grossAmount: bigint("gross_amount", { mode: "number" }).notNull().default(0),
  withholdingRate: decimal("withholding_rate", { precision: 5, scale: 2 }).notNull().default("3.30"),
  withholdingAmount: bigint("withholding_amount", { mode: "number" }).notNull().default(0),
  netAmount: bigint("net_amount", { mode: "number" }).notNull().default(0),
  paymentDate: varchar("payment_date", { length: 20 }),
  reportDate: varchar("report_date", { length: 20 }),
  taxPaymentDate: varchar("tax_payment_date", { length: 20 }),
  taxPaymentAccount: varchar("tax_payment_account", { length: 200 }),
  linkedExpenseId: integer("linked_expense_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql2 = neon(process.env.DATABASE_URL);
      _db = drizzle(sql2);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function ensureUserMemosTable(db) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_memos" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "memo_key" varchar(100) NOT NULL,
      "content" text NOT NULL DEFAULT '',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_memos_user_id_memo_key_idx"
    ON "user_memos" ("user_id", "memo_key")
  `);
}
async function ensureLoansTable(db) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "loans" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "name" varchar(200) NOT NULL,
      "loan_type" varchar(50) NOT NULL DEFAULT '기타',
      "lender" varchar(100),
      "principal_amount" bigint NOT NULL DEFAULT 0,
      "remaining_principal" bigint NOT NULL DEFAULT 0,
      "interest_rate" numeric(10, 4) DEFAULT '0',
      "repayment_type" varchar(50) NOT NULL DEFAULT '수동입력',
      "start_date" varchar(20) NOT NULL,
      "maturity_date" varchar(20),
      "payment_day" integer,
      "monthly_payment" bigint NOT NULL DEFAULT 0,
      "grace_months" integer DEFAULT 0,
      "note" text,
      "is_active" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values = { openId: user.openId };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserProfile(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set(data).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}
async function getLedgerEntries(userId, year, month) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year), eq(ledgerEntries.month, month))).orderBy(ledgerEntries.entryDate);
}
async function getLedgerMonthSummary(userId, year, month) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    mainCategory: ledgerEntries.mainCategory,
    total: sql`SUM(${ledgerEntries.amount})`
  }).from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year), eq(ledgerEntries.month, month))).groupBy(ledgerEntries.mainCategory);
}
async function getYearlySummary(userId, year) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    month: ledgerEntries.month,
    mainCategory: ledgerEntries.mainCategory,
    total: sql`SUM(${ledgerEntries.amount})`
  }).from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year))).groupBy(ledgerEntries.month, ledgerEntries.mainCategory).orderBy(ledgerEntries.month);
}
async function getYearlySubCatExpenseSummary(userId, year) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    month: ledgerEntries.month,
    subCategory: ledgerEntries.subCategory,
    total: sql`SUM(${ledgerEntries.amount})`
  }).from(ledgerEntries).where(
    and(
      eq(ledgerEntries.userId, userId),
      eq(ledgerEntries.year, year),
      sql`${ledgerEntries.mainCategory} IN ('고정지출', '변동지출', '사업지출')`
    )
  ).groupBy(ledgerEntries.month, ledgerEntries.subCategory).orderBy(ledgerEntries.month);
}
async function createLedgerEntry(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ledgerEntries).values({ ...data, userId });
  return result;
}
async function updateLedgerEntry(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ledgerEntries).set(data).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.userId, userId)));
}
async function deleteLedgerEntry(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ledgerEntries).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.userId, userId)));
}
async function getFixedExpenses(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fixedExpenses).where(and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.isActive, true))).orderBy(fixedExpenses.mainCategory);
}
async function createFixedExpense(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(fixedExpenses).values({ ...data, userId });
}
async function updateFixedExpense(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set(data).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));
}
async function deleteFixedExpense(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set({ isActive: false }).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));
}
async function getStockPortfolio(userId, snapshotMonth) {
  const db = await getDb();
  if (!db) return [];
  if (snapshotMonth) {
    return db.select().from(stockPortfolio).where(and(eq(stockPortfolio.userId, userId), eq(stockPortfolio.snapshotMonth, snapshotMonth)));
  }
  const latest = await db.select({ snapshotMonth: stockPortfolio.snapshotMonth }).from(stockPortfolio).where(eq(stockPortfolio.userId, userId)).orderBy(desc(stockPortfolio.snapshotMonth)).limit(1);
  if (latest.length === 0) return [];
  return db.select().from(stockPortfolio).where(and(eq(stockPortfolio.userId, userId), eq(stockPortfolio.snapshotMonth, latest[0].snapshotMonth)));
}
async function createStockEntry(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(stockPortfolio).values({ ...data, userId });
}
async function updateStockEntry(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(stockPortfolio).set(data).where(and(eq(stockPortfolio.id, id), eq(stockPortfolio.userId, userId)));
}
async function deleteStockEntry(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(stockPortfolio).where(and(eq(stockPortfolio.id, id), eq(stockPortfolio.userId, userId)));
}
async function listLoans(userId) {
  const db = await getDb();
  if (!db) return [];
  await ensureLoansTable(db);
  return db.select().from(loans).where(and(eq(loans.userId, userId), eq(loans.isActive, true))).orderBy(desc(loans.createdAt));
}
async function createLoan(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.insert(loans).values({ ...data, userId });
}
async function updateLoan(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.userId, userId)));
}
async function deleteLoan(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.update(loans).set({ isActive: false }).where(and(eq(loans.id, id), eq(loans.userId, userId)));
}
async function getUserMemo(userId, memoKey) {
  const db = await getDb();
  if (!db) return null;
  await ensureUserMemosTable(db);
  const result = await db.select().from(userMemos).where(and(eq(userMemos.userId, userId), eq(userMemos.memoKey, memoKey))).limit(1);
  return result[0] ?? null;
}
async function upsertUserMemo(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureUserMemosTable(db);
  const existing = await getUserMemo(userId, data.memoKey);
  if (existing) {
    await db.update(userMemos).set({ content: data.content, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(userMemos.userId, userId), eq(userMemos.memoKey, data.memoKey)));
    return;
  }
  await db.insert(userMemos).values({ userId, memoKey: data.memoKey, content: data.content });
}
async function getSavingsAssets(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savingsAssets).where(and(eq(savingsAssets.userId, userId), eq(savingsAssets.isActive, true))).orderBy(savingsAssets.category);
}
async function createSavingsAsset(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(savingsAssets).values({ ...data, userId });
}
async function updateSavingsAsset(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set(data).where(and(eq(savingsAssets.id, id), eq(savingsAssets.userId, userId)));
}
async function deleteSavingsAsset(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set({ isActive: false }).where(and(eq(savingsAssets.id, id), eq(savingsAssets.userId, userId)));
}
async function getPensionAssets(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pensionAssets).where(eq(pensionAssets.userId, userId)).orderBy(pensionAssets.pensionType);
}
async function createPensionAsset(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pensionAssets).values({ ...data, userId });
}
async function updatePensionAsset(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pensionAssets).set(data).where(and(eq(pensionAssets.id, id), eq(pensionAssets.userId, userId)));
}
async function deletePensionAsset(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pensionAssets).where(and(eq(pensionAssets.id, id), eq(pensionAssets.userId, userId)));
}
async function getOtherAssets(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(otherAssets).where(eq(otherAssets.userId, userId));
}
async function createOtherAsset(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(otherAssets).values({ ...data, userId });
}
async function updateOtherAsset(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(otherAssets).set(data).where(and(eq(otherAssets.id, id), eq(otherAssets.userId, userId)));
}
async function deleteOtherAsset(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(otherAssets).where(and(eq(otherAssets.id, id), eq(otherAssets.userId, userId)));
}
async function getRealEstates(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(realEstates).where(eq(realEstates.userId, userId)).orderBy(realEstates.aptName);
}
async function createRealEstate(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(realEstates).values({ ...data, userId });
}
async function updateRealEstate(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(realEstates).set(data).where(and(eq(realEstates.id, id), eq(realEstates.userId, userId)));
}
async function deleteRealEstate(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(realEstates).where(and(eq(realEstates.id, id), eq(realEstates.userId, userId)));
}
async function getBlogCampaigns(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogCampaigns).where(eq(blogCampaigns.userId, userId)).orderBy(desc(blogCampaigns.createdAt));
}
async function createBlogCampaign(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(blogCampaigns).values({ ...data, userId });
}
async function updateBlogCampaign(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(blogCampaigns).set(data).where(and(eq(blogCampaigns.id, id), eq(blogCampaigns.userId, userId)));
}
async function deleteBlogCampaign(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(blogCampaigns).where(and(eq(blogCampaigns.id, id), eq(blogCampaigns.userId, userId)));
}
async function getDebts(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(debts).where(eq(debts.userId, userId));
}
async function createDebt(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(debts).values({ ...data, userId });
}
async function updateDebt(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(debts).set(data).where(and(eq(debts.id, id), eq(debts.userId, userId)));
}
async function deleteDebt(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, userId)));
}
async function getDashboardSummary(userId) {
  const db = await getDb();
  if (!db) return null;
  const [stocks, savings, pension, other, debt] = await Promise.all([
    getStockPortfolio(userId),
    getSavingsAssets(userId),
    getPensionAssets(userId),
    getOtherAssets(userId),
    getDebts(userId)
  ]);
  const stockTotal = stocks.reduce((s, r) => s + (r.currentAmount ?? 0), 0);
  const savingsTotal = savings.reduce((s, r) => s + parseFloat(String(r.totalAmount ?? 0)), 0);
  const pensionTotal = pension.reduce((s, r) => s + (r.currentAmount ?? 0), 0);
  const otherTotal = other.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const debtTotal = debt.reduce((s, r) => s + Math.abs(r.principal ?? 0), 0);
  return {
    stockTotal,
    savingsTotal,
    pensionTotal,
    otherTotal,
    debtTotal,
    netAsset: stockTotal + savingsTotal + pensionTotal + otherTotal - debtTotal
  };
}
async function getCards(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cards).where(eq(cards.userId, userId)).orderBy(desc(cards.createdAt));
}
async function createCard(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cards).values({ ...data, userId });
}
async function updateCard(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cards).set(data).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}
async function deleteCard(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}
async function getCardPoints(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cardPoints).where(eq(cardPoints.userId, userId)).orderBy(desc(cardPoints.createdAt));
}
async function createCardPoint(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cardPoints).values({ ...data, userId });
}
async function updateCardPoint(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cardPoints).set(data).where(and(eq(cardPoints.id, id), eq(cardPoints.userId, userId)));
}
async function deleteCardPoint(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cardPoints).where(and(eq(cardPoints.id, id), eq(cardPoints.userId, userId)));
}
async function getSubscriptions(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt));
}
async function createSubscription(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(subscriptions).values({ ...data, userId });
}
async function updateSubscription(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(subscriptions).set(data).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}
async function deleteSubscription(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}
async function getSideIncomeCategories(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomeCategories).where(eq(sideIncomeCategories.userId, userId)).orderBy(sideIncomeCategories.name);
}
async function createSideIncomeCategory(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(sideIncomeCategories).values({ ...data, userId });
}
async function updateSideIncomeCategory(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(sideIncomeCategories).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId))).limit(1);
  await db.update(sideIncomeCategories).set(data).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)));
  if (current && data.name && data.name !== current.name) {
    await db.update(sideIncomes).set({ categoryName: data.name }).where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.categoryId, id)));
    await db.update(ledgerEntries).set({ subCategory: data.name }).where(and(
      eq(ledgerEntries.userId, userId),
      eq(ledgerEntries.subCategory, current.name),
      sql`${ledgerEntries.note} LIKE '[부수입 자동연동]%'`
    ));
  }
}
async function deleteSideIncomeCategory(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(sideIncomeCategories).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)));
}
async function getSideIncomes(userId, year, month) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes).where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.year, year), eq(sideIncomes.month, month))).orderBy(desc(sideIncomes.incomeDate));
}
async function createSideIncome(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sideIncomes).values({ ...data, userId }).returning({ id: sideIncomes.id });
  return result;
}
async function updateSideIncome(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sideIncomes).set(data).where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId)));
}
async function deleteSideIncome(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [entry] = await db.select().from(sideIncomes).where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId))).limit(1);
  if (entry?.ledgerEntryId) {
    await db.delete(ledgerEntries).where(and(eq(ledgerEntries.id, entry.ledgerEntryId), eq(ledgerEntries.userId, userId)));
  }
  await db.delete(sideIncomes).where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId)));
}
async function getSideIncomeMonthlySummary(userId, year) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes).where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.year, year))).orderBy(sideIncomes.month, desc(sideIncomes.incomeDate));
}
async function listAccounts(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.createdAt);
}
async function createAccount(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(accounts).values({ ...data, userId });
}
async function updateAccount(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(accounts).set(data).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
async function deleteAccount(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
async function listInstallments(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(installments).where(eq(installments.userId, userId)).orderBy(desc(installments.createdAt));
}
async function createInstallment(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(installments).values({ ...data, userId }).returning({ id: installments.id });
  return result;
}
async function updateInstallment(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(installments).set(data).where(and(eq(installments.id, id), eq(installments.userId, userId)));
}
async function deleteInstallment(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(installments).where(and(eq(installments.id, id), eq(installments.userId, userId)));
}
async function listCategories(userId) {
  const db = await getDb();
  if (!db) return [];
  const cats = await db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.sortOrder, categories.createdAt);
  const subs = await db.select().from(subCategories).where(eq(subCategories.userId, userId)).orderBy(subCategories.sortOrder, subCategories.createdAt);
  return cats.map((c) => ({
    ...c,
    subCategories: subs.filter((s) => s.categoryId === c.id)
  }));
}
async function createCategory(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(categories).values({ ...data, userId }).returning({ id: categories.id });
  return result;
}
async function updateCategory(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
  if (!current) return;
  await db.update(categories).set(data).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  if (data.name && data.name !== current.name) {
    await db.update(ledgerEntries).set({ mainCategory: data.name }).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.mainCategory, current.name)));
    await db.update(fixedExpenses).set({ mainCategory: data.name }).where(and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.mainCategory, current.name)));
  }
}
async function deleteCategory(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(subCategories).where(and(eq(subCategories.categoryId, id), eq(subCategories.userId, userId)));
  return db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
}
async function createSubCategory(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(subCategories).values({ ...data, userId }).returning({ id: subCategories.id });
  return result;
}
async function updateSubCategory(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(subCategories).where(and(eq(subCategories.id, id), eq(subCategories.userId, userId))).limit(1);
  if (!current) return;
  const [parent] = await db.select().from(categories).where(and(eq(categories.id, current.categoryId), eq(categories.userId, userId))).limit(1);
  await db.update(subCategories).set(data).where(and(eq(subCategories.id, id), eq(subCategories.userId, userId)));
  if (data.name && data.name !== current.name) {
    const ledgerWhere = parent ? and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.mainCategory, parent.name), eq(ledgerEntries.subCategory, current.name)) : and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.subCategory, current.name));
    const fixedWhere = parent ? and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.mainCategory, parent.name), eq(fixedExpenses.subCategory, current.name)) : and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.subCategory, current.name));
    await db.update(ledgerEntries).set({ subCategory: data.name }).where(ledgerWhere);
    await db.update(fixedExpenses).set({ subCategory: data.name }).where(fixedWhere);
  }
}
async function deleteSubCategory(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(subCategories).where(and(eq(subCategories.id, id), eq(subCategories.userId, userId)));
}
var DEFAULT_CATEGORIES = [
  { name: "\uACE0\uC815\uC9C0\uCD9C", type: "expense", subs: ["\uAD6C\uB3C5\uC11C\uBE44\uC2A4", "\uBCF4\uD5D8", "\uBAA8\uC784\uBE44"] },
  { name: "\uC0AC\uC5C5\uC9C0\uCD9C", type: "expense", subs: ["\uAD11\uACE0"] },
  { name: "\uC2DD\uBE44", type: "expense", subs: ["\uC2DD\uB8CC\uD488", "\uC678\uC2DD", "\uCE74\uD398/\uC74C\uB8CC", "\uBC30\uB2EC\uC74C\uC2DD"] },
  { name: "\uAD50\uD1B5/\uCC28\uB7C9", type: "expense", subs: ["\uB300\uC911\uAD50\uD1B5", "\uD0DD\uC2DC", "\uC8FC\uC720", "\uC8FC\uCC28", "\uCC28\uB7C9\uC720\uC9C0"] },
  { name: "\uC8FC\uAC70/\uD1B5\uC2E0", type: "expense", subs: ["\uC6D4\uC138/\uAD00\uB9AC\uBE44", "\uC804\uAE30/\uAC00\uC2A4/\uC218\uB3C4", "\uC778\uD130\uB137/\uD1B5\uC2E0"] },
  { name: "\uC758\uB8CC/\uAC74\uAC15", type: "expense", subs: ["\uBCD1\uC6D0", "\uC57D\uAD6D", "\uD5EC\uC2A4/\uC6B4\uB3D9", "\uAC74\uAC15\uC2DD\uD488"] },
  { name: "\uC1FC\uD551/\uC758\uB958", type: "expense", subs: ["\uC758\uB958/\uC7A1\uD654", "\uC804\uC790\uC81C\uD488", "\uC0DD\uD65C\uC6A9\uD488", "\uC628\uB77C\uC778\uC1FC\uD551"] },
  { name: "\uBB38\uD654/\uC5EC\uAC00", type: "expense", subs: ["\uC601\uD654/\uACF5\uC5F0", "\uC5EC\uD589", "\uCDE8\uBBF8"] },
  { name: "\uAD50\uC721", type: "expense", subs: ["\uD559\uC6D0/\uAC15\uC758", "\uB3C4\uC11C", "\uC628\uB77C\uC778\uAC15\uC758"] },
  { name: "\uAE08\uC735", type: "expense", subs: ["\uC774\uCCB4/\uC1A1\uAE08", "\uC218\uC218\uB8CC", "\uC138\uAE08"] },
  { name: "\uAE30\uD0C0\uC9C0\uCD9C", type: "expense", subs: ["\uACBD\uC870\uC0AC", "\uAE30\uBD80", "\uAE30\uD0C0"] },
  { name: "\uC18C\uB4DD", type: "income", subs: ["\uAE09\uC5EC", "\uC0AC\uC5C5\uC18C\uB4DD", "\uBD80\uC218\uC785", "\uD22C\uC790\uC218\uC775", "\uAE30\uD0C0\uC218\uC785"] }
];
var CANONICAL_SUB_NAMES = /* @__PURE__ */ new Set(["\uAD6C\uB3C5\uC11C\uBE44\uC2A4", "\uBCF4\uD5D8", "\uBAA8\uC784\uBE44", "\uAD11\uACE0", "\uAE09\uC5EC", "\uC0AC\uC5C5\uC18C\uB4DD", "\uBD80\uC218\uC785", "\uD22C\uC790\uC218\uC775", "\uAE30\uD0C0\uC218\uC785"]);
async function seedDefaultCategories(userId) {
  const db = await getDb();
  if (!db) return;
  await ensureDefaultCategorySet(userId);
}
async function ensureDefaultCategorySet(userId) {
  const db = await getDb();
  if (!db) return;
  const [legacyIncome] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.name, "\uC218\uC785"))).limit(1);
  const [incomeCategory] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.name, "\uC18C\uB4DD"))).limit(1);
  if (legacyIncome && !incomeCategory) {
    await db.update(categories).set({ name: "\uC18C\uB4DD", type: "income" }).where(and(eq(categories.id, legacyIncome.id), eq(categories.userId, userId)));
  } else if (legacyIncome && incomeCategory) {
    await db.update(subCategories).set({ categoryId: incomeCategory.id }).where(and(eq(subCategories.categoryId, legacyIncome.id), eq(subCategories.userId, userId)));
    await db.delete(categories).where(and(eq(categories.id, legacyIncome.id), eq(categories.userId, userId)));
  }
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    const [existingCategory] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.name, cat.name))).limit(1);
    let categoryId = existingCategory?.id;
    if (categoryId) {
      await db.update(categories).set({ type: cat.type, sortOrder: i }).where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    } else {
      const [result] = await db.insert(categories).values({ name: cat.name, type: cat.type, sortOrder: i, userId }).returning({ id: categories.id });
      categoryId = result.id;
    }
    for (let j = 0; j < cat.subs.length; j++) {
      const subName = cat.subs[j];
      const existingUnderCategory = await db.select().from(subCategories).where(and(eq(subCategories.userId, userId), eq(subCategories.categoryId, categoryId), eq(subCategories.name, subName))).limit(1);
      if (existingUnderCategory.length > 0) {
        await db.update(subCategories).set({ sortOrder: j }).where(and(eq(subCategories.userId, userId), eq(subCategories.categoryId, categoryId), eq(subCategories.name, subName)));
        continue;
      }
      if (CANONICAL_SUB_NAMES.has(subName)) {
        const existingByName = await db.select().from(subCategories).where(and(eq(subCategories.userId, userId), eq(subCategories.name, subName))).limit(1);
        if (existingByName.length > 0) {
          await db.update(subCategories).set({ categoryId, sortOrder: j }).where(and(eq(subCategories.userId, userId), eq(subCategories.name, subName)));
          continue;
        }
      }
      await db.insert(subCategories).values({ categoryId, name: subName, sortOrder: j, userId });
    }
  }
}
async function listInsurance(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(insurance).where(eq(insurance.userId, userId)).orderBy(desc(insurance.createdAt));
}
async function createInsurance(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(insurance).values({ ...data, userId });
  const result = await db.select().from(insurance).where(eq(insurance.userId, userId)).orderBy(desc(insurance.createdAt)).limit(1);
  return result[0];
}
async function updateInsurance(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(insurance).set(data).where(and(eq(insurance.id, id), eq(insurance.userId, userId)));
  const result = await db.select().from(insurance).where(eq(insurance.id, id)).limit(1);
  return result[0];
}
async function deleteInsurance(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(insurance).where(and(eq(insurance.id, id), eq(insurance.userId, userId)));
  return { id };
}
async function listBusinessIncomes(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businessIncomes).where(eq(businessIncomes.userId, userId)).orderBy(desc(businessIncomes.createdAt));
}
async function getBusinessIncome(userId, id) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(businessIncomes).where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId))).limit(1);
  return result[0] ?? null;
}
async function createBusinessIncome(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(businessIncomes).values({ ...data, userId });
  const result = await db.select().from(businessIncomes).where(eq(businessIncomes.userId, userId)).orderBy(desc(businessIncomes.createdAt)).limit(1);
  return result[0];
}
async function updateBusinessIncome(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(businessIncomes).set(data).where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId)));
  const result = await db.select().from(businessIncomes).where(eq(businessIncomes.id, id)).limit(1);
  return result[0];
}
async function deleteBusinessIncome(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(businessIncomes).where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId)));
  return { id };
}
async function listBusinessExpenses(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businessExpenses).where(eq(businessExpenses.userId, userId)).orderBy(desc(businessExpenses.expenseDate), desc(businessExpenses.createdAt));
}
async function getBusinessExpense(userId, id) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(businessExpenses).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId))).limit(1);
  return result[0] ?? null;
}
async function createBusinessExpense(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(businessExpenses).values({ ...data, userId });
  const result = await db.select().from(businessExpenses).where(eq(businessExpenses.userId, userId)).orderBy(desc(businessExpenses.createdAt)).limit(1);
  return result[0];
}
async function updateBusinessExpense(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(businessExpenses).set(data).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)));
  const result = await db.select().from(businessExpenses).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId))).limit(1);
  return result[0];
}
async function deleteBusinessExpense(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(businessExpenses).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)));
  return { id };
}
async function listLaborCosts(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(laborCosts).where(eq(laborCosts.userId, userId)).orderBy(desc(laborCosts.paymentDate), desc(laborCosts.createdAt));
}
function laborExpenseDescription(name, desc2) {
  return desc2 ? `${name} \uC778\uAC74\uBE44 (${desc2})` : `${name} \uC778\uAC74\uBE44`;
}
async function createLaborCost(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let linkedExpenseId;
  if (data.paymentDate && data.netAmount) {
    const [y, m] = data.paymentDate.split("-").map(Number);
    const expDesc = laborExpenseDescription(data.freelancerName, data.description);
    await db.insert(businessExpenses).values({
      userId,
      expenseDate: data.paymentDate,
      year: y,
      month: m,
      category: "\uC778\uAC74\uBE44",
      vendor: data.freelancerName,
      description: expDesc,
      amount: data.netAmount,
      isTaxDeductible: true
    });
    const exp = await db.select().from(businessExpenses).where(eq(businessExpenses.userId, userId)).orderBy(desc(businessExpenses.createdAt)).limit(1);
    linkedExpenseId = exp[0]?.id;
  }
  await db.insert(laborCosts).values({ ...data, userId, linkedExpenseId });
  const result = await db.select().from(laborCosts).where(eq(laborCosts.userId, userId)).orderBy(desc(laborCosts.createdAt)).limit(1);
  return result[0];
}
async function updateLaborCost(userId, id, data) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const current = await db.select().from(laborCosts).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  const cur = current[0];
  if (!cur) throw new Error("Not found");
  const newPaymentDate = "paymentDate" in data ? data.paymentDate : cur.paymentDate;
  const newNetAmount = "netAmount" in data ? data.netAmount : cur.netAmount;
  const newName = "freelancerName" in data ? data.freelancerName : cur.freelancerName;
  const newDesc = "description" in data ? data.description : cur.description;
  let linkedExpenseId = cur.linkedExpenseId;
  if (newPaymentDate && newNetAmount) {
    const [y, m] = newPaymentDate.split("-").map(Number);
    const expDesc = laborExpenseDescription(newName, newDesc);
    if (linkedExpenseId) {
      await db.update(businessExpenses).set({
        expenseDate: newPaymentDate,
        year: y,
        month: m,
        vendor: newName,
        description: expDesc,
        amount: newNetAmount
      }).where(and(eq(businessExpenses.id, linkedExpenseId), eq(businessExpenses.userId, userId)));
    } else {
      await db.insert(businessExpenses).values({
        userId,
        expenseDate: newPaymentDate,
        year: y,
        month: m,
        category: "\uC778\uAC74\uBE44",
        vendor: newName,
        description: expDesc,
        amount: newNetAmount,
        isTaxDeductible: true
      });
      const exp = await db.select().from(businessExpenses).where(eq(businessExpenses.userId, userId)).orderBy(desc(businessExpenses.createdAt)).limit(1);
      linkedExpenseId = exp[0]?.id;
    }
  } else if (!newPaymentDate && linkedExpenseId) {
    await db.delete(businessExpenses).where(and(eq(businessExpenses.id, linkedExpenseId), eq(businessExpenses.userId, userId)));
    linkedExpenseId = null;
  }
  await db.update(laborCosts).set({ ...data, linkedExpenseId }).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId)));
  const result = await db.select().from(laborCosts).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  return result[0];
}
async function deleteLaborCost(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const current = await db.select().from(laborCosts).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  if (current[0]?.linkedExpenseId) {
    await db.delete(businessExpenses).where(
      and(eq(businessExpenses.id, current[0].linkedExpenseId), eq(businessExpenses.userId, userId))
    );
  }
  await db.delete(laborCosts).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId)));
  return { id };
}

// server/routers.ts
var insuranceInput = z2.object({
  name: z2.string(),
  insuranceType: z2.enum(["\uBCF4\uC7A5\uD615", "\uC800\uCD95\uD615"]).nullable().optional(),
  paymentMethod: z2.string().nullable().optional(),
  startDate: z2.string(),
  endDate: z2.string().nullable().optional(),
  renewalType: z2.enum(["\uBE44\uAC31\uC2E0\uD615", "\uAC31\uC2E0\uD615"]).optional(),
  renewalCycleYears: z2.number().int().min(1).nullable().optional(),
  paymentType: z2.enum(["monthly", "annual"]).default("monthly"),
  paymentDay: z2.number().int().min(1).max(31).nullable().optional(),
  paymentAmount: z2.number().default(0),
  durationYears: z2.number().int().min(1).nullable().optional(),
  note: z2.string().nullable().optional()
});
var businessExpenseInput = z2.object({
  expenseDate: z2.string(),
  year: z2.number().int(),
  month: z2.number().int().min(1).max(12),
  category: z2.enum(["\uAD11\uACE0", "\uB300\uB0A9", "\uC138\uAE08", "\uC218\uC218\uB8CC", "\uC18C\uBAA8\uD488", "\uC778\uAC74\uBE44", "\uAE30\uD0C0"]).default("\uAE30\uD0C0"),
  vendor: z2.string().nullable().optional(),
  description: z2.string().min(1),
  amount: z2.number().default(0),
  paymentMethod: z2.string().nullable().optional(),
  isTaxDeductible: z2.boolean().default(true),
  note: z2.string().nullable().optional()
});
function getInsertId(result) {
  const direct = result?.insertId;
  if (typeof direct === "number" && direct > 0) return direct;
  const first = Array.isArray(result) ? result[0]?.insertId : void 0;
  return typeof first === "number" && first > 0 ? first : null;
}
var accountInput = z2.object({
  bankName: z2.string(),
  accountType: z2.enum(["\uC785\uCD9C\uAE08", "\uC800\uCD95", "CMA", "\uD30C\uD0B9\uD1B5\uC7A5", "\uCCAD\uC57D", "\uAE30\uD0C0"]).default("\uC785\uCD9C\uAE08"),
  accountNumber: z2.string().optional(),
  accountHolder: z2.string().optional(),
  balance: z2.number().default(0),
  interestRate: z2.string().optional(),
  linkedCard: z2.string().optional(),
  note: z2.string().optional()
});
var installmentInput = z2.object({
  name: z2.string(),
  cardId: z2.number().int().nullable().optional(),
  totalAmount: z2.number().default(0),
  months: z2.number().int().min(1).default(1),
  startDate: z2.string(),
  endDate: z2.string(),
  isInterestFree: z2.boolean().default(true),
  interestRate: z2.string().optional(),
  categoryId: z2.number().int().nullable().optional(),
  subCategoryId: z2.number().int().nullable().optional(),
  note: z2.string().optional(),
  earlyRepaymentAmount: z2.number().nullable().optional(),
  earlyRepaymentDate: z2.string().nullable().optional()
});
var loanInput = z2.object({
  name: z2.string(),
  loanType: z2.enum(["\uC8FC\uD0DD\uB2F4\uBCF4\uB300\uCD9C", "\uC2E0\uC6A9\uB300\uCD9C", "\uC804\uC138\uB300\uCD9C", "\uC0AC\uC5C5\uC790\uB300\uCD9C", "\uB9C8\uC774\uB108\uC2A4\uD1B5\uC7A5", "\uAE30\uD0C0"]).default("\uAE30\uD0C0"),
  lender: z2.string().nullable().optional(),
  principalAmount: z2.number().default(0),
  remainingPrincipal: z2.number().default(0),
  interestRate: z2.string().optional(),
  repaymentType: z2.enum(["\uC6D0\uB9AC\uAE08\uADE0\uB4F1", "\uC6D0\uAE08\uADE0\uB4F1", "\uB9CC\uAE30\uC77C\uC2DC", "\uCCB4\uB0A9\uC2DD", "\uC218\uB3D9\uC785\uB825"]).default("\uC218\uB3D9\uC785\uB825"),
  startDate: z2.string(),
  maturityDate: z2.string().nullable().optional(),
  paymentDay: z2.number().int().min(1).max(31).nullable().optional(),
  monthlyPayment: z2.number().default(0),
  graceMonths: z2.number().int().min(0).optional(),
  note: z2.string().nullable().optional(),
  isActive: z2.boolean().optional()
});
var subscriptionInput = z2.object({
  serviceName: z2.string(),
  category: z2.enum(["\uBE44\uC988\uB2C8\uC2A4", "\uBBF8\uB514\uC5B4", "\uC790\uAE30\uACC4\uBC1C", "\uAE30\uD0C0"]).default("\uAE30\uD0C0"),
  billingCycle: z2.enum(["\uB9E4\uB2EC", "\uB9E4\uC8FC", "\uB9E4\uC77C", "\uB9E4\uB144"]).default("\uB9E4\uB2EC"),
  price: z2.number().default(0),
  sharedCount: z2.number().int().min(1).default(1),
  /** 1–31: 매달 등 결제일, 101–1231: 매년(M×100+D, 예 428=4/28) */
  billingDay: z2.number().int().min(1).max(1231).nullable().optional(),
  startDate: z2.string().optional(),
  paymentMethod: z2.string().optional(),
  note: z2.string().optional(),
  isPaused: z2.boolean().optional(),
  pausedFrom: z2.string().nullable().optional()
});
var subscriptionUpdateInput = z2.object({
  serviceName: z2.string().optional(),
  category: z2.enum(["\uBE44\uC988\uB2C8\uC2A4", "\uBBF8\uB514\uC5B4", "\uC790\uAE30\uACC4\uBC1C", "\uAE30\uD0C0"]).optional(),
  billingCycle: z2.enum(["\uB9E4\uB2EC", "\uB9E4\uC8FC", "\uB9E4\uC77C", "\uB9E4\uB144"]).optional(),
  price: z2.number().optional(),
  sharedCount: z2.number().int().min(1).optional(),
  /** 1–31: 매달 등 결제일, 101–1231: 매년(M×100+D, 예 428=4/28) */
  billingDay: z2.number().int().min(1).max(1231).nullable().optional(),
  startDate: z2.string().optional(),
  paymentMethod: z2.string().optional(),
  note: z2.string().optional(),
  isPaused: z2.boolean().optional(),
  pausedFrom: z2.string().nullable().optional()
});
var cardInput = z2.object({
  cardType: z2.enum(["\uC2E0\uC6A9\uCE74\uB4DC", "\uCCB4\uD06C\uCE74\uB4DC"]).default("\uC2E0\uC6A9\uCE74\uB4DC"),
  cardCompany: z2.string(),
  cardName: z2.string().optional(),
  benefits: z2.string().optional(),
  annualFee: z2.number().optional(),
  performance: z2.string().optional(),
  purpose: z2.string().optional(),
  creditLimit: z2.number().optional(),
  expiryDate: z2.string().optional(),
  paymentDate: z2.string().optional(),
  paymentAccount: z2.string().optional(),
  note: z2.string().optional()
});
var cardPointInput = z2.object({
  name: z2.string(),
  benefits: z2.string().optional(),
  balance: z2.number().optional(),
  purpose: z2.string().optional(),
  note: z2.string().optional()
});
var ledgerEntryInput = z2.object({
  entryDate: z2.string(),
  year: z2.number(),
  month: z2.number(),
  mainCategory: z2.string(),
  subCategory: z2.string().optional(),
  description: z2.string().optional(),
  amount: z2.number(),
  note: z2.string().optional()
});
var fixedExpenseInput = z2.object({
  mainCategory: z2.string(),
  subCategory: z2.string().optional(),
  description: z2.string().optional(),
  paymentAccount: z2.string().optional(),
  monthlyAmount: z2.number(),
  totalAmount: z2.number().optional(),
  interestRate: z2.string().optional(),
  startDate: z2.string().optional(),
  expiryDate: z2.string().optional(),
  paymentDay: z2.number().optional(),
  note: z2.string().optional(),
  isActive: z2.boolean().optional()
});
var stockInput = z2.object({
  market: z2.string().optional(),
  broker: z2.string().optional(),
  sector: z2.string().optional(),
  stockName: z2.string(),
  ticker: z2.string().optional(),
  avgBuyPrice: z2.number().optional(),
  quantity: z2.string().optional(),
  buyAmount: z2.number().optional(),
  currentPrice: z2.number().optional(),
  currentAmount: z2.number().optional(),
  returnRate: z2.string().optional(),
  note: z2.string().optional(),
  snapshotMonth: z2.string().optional()
});
var userMemoInput = z2.object({
  key: z2.string().min(1).max(100),
  content: z2.string().max(2e4).default("")
});
var savingsInput = z2.object({
  category: z2.string(),
  description: z2.string(),
  bank: z2.string().optional(),
  accountNumber: z2.string().optional(),
  monthlyDeposit: z2.string().optional(),
  interestRate: z2.string().optional(),
  totalAmount: z2.string().optional(),
  expiryDate: z2.string().optional(),
  note: z2.string().optional(),
  isActive: z2.boolean().optional()
});
var pensionInput = z2.object({
  pensionType: z2.string(),
  company: z2.string().optional(),
  assetType: z2.string().optional(),
  stockName: z2.string().optional(),
  ticker: z2.string().optional(),
  avgBuyPrice: z2.number().optional(),
  quantity: z2.string().optional(),
  buyAmount: z2.number().optional(),
  currentPrice: z2.number().optional(),
  currentAmount: z2.number().optional(),
  returnRate: z2.string().optional(),
  note: z2.string().optional()
});
var otherAssetInput = z2.object({
  category: z2.string(),
  monthlyDeposit: z2.number().optional(),
  paidAmount: z2.number().optional(),
  totalAmount: z2.number().optional(),
  note: z2.string().optional()
});
var realEstateInput = z2.object({
  district: z2.string().optional(),
  dong: z2.string().optional(),
  aptName: z2.string(),
  builtYear: z2.string().optional(),
  households: z2.number().optional(),
  areaSize: z2.string().optional(),
  floor: z2.string().optional(),
  direction: z2.string().optional(),
  salePrice: z2.number().optional(),
  leasePrice: z2.number().optional(),
  leaseRatio: z2.string().optional(),
  gap: z2.number().optional(),
  pricePerPyeong: z2.string().optional(),
  price201912: z2.number().optional(),
  price202112: z2.number().optional(),
  currentPrice: z2.number().optional(),
  riseFrom201912: z2.string().optional(),
  riseFrom202112: z2.string().optional(),
  note: z2.string().optional()
});
var blogCampaignInput = z2.object({
  platform: z2.string().optional(),
  campaignType: z2.string().optional(),
  category: z2.string().optional(),
  businessName: z2.string().optional(),
  amount: z2.number().optional(),
  startDate: z2.string().optional(),
  endDate: z2.string().optional(),
  visitDate: z2.string().optional(),
  reviewDone: z2.boolean().optional(),
  completed: z2.boolean().optional(),
  note: z2.string().optional()
});
var debtInput = z2.object({
  category: z2.string(),
  description: z2.string().optional(),
  debtType: z2.string().optional(),
  principal: z2.number().optional(),
  monthlyPayment: z2.number().optional(),
  interestRate: z2.string().optional(),
  balance: z2.number().optional(),
  expiryDate: z2.string().optional(),
  note: z2.string().optional()
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    updateProfile: protectedProcedure.input(z2.object({ birthDate: z2.string().nullable().optional(), name: z2.string().nullable().optional() })).mutation(({ input, ctx }) => updateUserProfile(ctx.user.id, input)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // ─── 대시보드 ───────────────────────────────────────────────────────────────
  dashboard: router({
    summary: protectedProcedure.query(({ ctx }) => getDashboardSummary(ctx.user.id)),
    yearlySummary: protectedProcedure.input(z2.object({ year: z2.number() })).query(
      ({ input, ctx }) => getYearlySummary(ctx.user.id, input.year)
    )
  }),
  // ─── 가계부 ─────────────────────────────────────────────────────────────────
  ledger: router({
    list: protectedProcedure.input(z2.object({ year: z2.number(), month: z2.number() })).query(({ input, ctx }) => getLedgerEntries(ctx.user.id, input.year, input.month)),
    monthSummary: protectedProcedure.input(z2.object({ year: z2.number(), month: z2.number() })).query(({ input, ctx }) => getLedgerMonthSummary(ctx.user.id, input.year, input.month)),
    create: protectedProcedure.input(ledgerEntryInput).mutation(
      ({ input, ctx }) => createLedgerEntry(ctx.user.id, {
        ...input,
        entryDate: input.entryDate
      })
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: ledgerEntryInput.partial() })).mutation(({ input, ctx }) => updateLedgerEntry(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteLedgerEntry(ctx.user.id, input.id)
    ),
    yearlySubCatExpense: protectedProcedure.input(z2.object({ year: z2.number() })).query(({ input, ctx }) => getYearlySubCatExpenseSummary(ctx.user.id, input.year))
  }),
  // ─── 고정지출 ───────────────────────────────────────────────────────────────
  fixedExpense: router({
    list: protectedProcedure.query(({ ctx }) => getFixedExpenses(ctx.user.id)),
    create: protectedProcedure.input(fixedExpenseInput).mutation(
      ({ input, ctx }) => createFixedExpense(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: fixedExpenseInput.partial() })).mutation(({ input, ctx }) => updateFixedExpense(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteFixedExpense(ctx.user.id, input.id)
    )
  }),
  // ─── 주식 포트폴리오 ─────────────────────────────────────────────────────────
  stock: router({
    list: protectedProcedure.input(z2.object({ snapshotMonth: z2.string().optional() })).query(
      ({ input, ctx }) => getStockPortfolio(ctx.user.id, input.snapshotMonth)
    ),
    create: protectedProcedure.input(stockInput).mutation(
      ({ input, ctx }) => createStockEntry(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: stockInput.partial() })).mutation(({ input, ctx }) => updateStockEntry(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteStockEntry(ctx.user.id, input.id)
    )
  }),
  userMemo: router({
    get: protectedProcedure.input(z2.object({ key: z2.string().min(1).max(100) })).query(
      ({ input, ctx }) => getUserMemo(ctx.user.id, input.key)
    ),
    upsert: protectedProcedure.input(userMemoInput).mutation(
      ({ input, ctx }) => upsertUserMemo(ctx.user.id, { memoKey: input.key, content: input.content })
    )
  }),
  // ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
  savings: router({
    list: protectedProcedure.query(({ ctx }) => getSavingsAssets(ctx.user.id)),
    create: protectedProcedure.input(savingsInput).mutation(
      ({ input, ctx }) => createSavingsAsset(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: savingsInput.partial() })).mutation(({ input, ctx }) => updateSavingsAsset(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteSavingsAsset(ctx.user.id, input.id)
    )
  }),
  // ─── 연금 ───────────────────────────────────────────────────────────────────
  pension: router({
    list: protectedProcedure.query(({ ctx }) => getPensionAssets(ctx.user.id)),
    create: protectedProcedure.input(pensionInput).mutation(
      ({ input, ctx }) => createPensionAsset(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: pensionInput.partial() })).mutation(({ input, ctx }) => updatePensionAsset(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deletePensionAsset(ctx.user.id, input.id)
    )
  }),
  // ─── 기타 자산 ──────────────────────────────────────────────────────────────
  otherAsset: router({
    list: protectedProcedure.query(({ ctx }) => getOtherAssets(ctx.user.id)),
    create: protectedProcedure.input(otherAssetInput).mutation(
      ({ input, ctx }) => createOtherAsset(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: otherAssetInput.partial() })).mutation(({ input, ctx }) => updateOtherAsset(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteOtherAsset(ctx.user.id, input.id)
    )
  }),
  // ─── 부동산 ─────────────────────────────────────────────────────────────────
  realEstate: router({
    list: protectedProcedure.query(({ ctx }) => getRealEstates(ctx.user.id)),
    create: protectedProcedure.input(realEstateInput).mutation(
      ({ input, ctx }) => createRealEstate(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: realEstateInput.partial() })).mutation(({ input, ctx }) => updateRealEstate(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteRealEstate(ctx.user.id, input.id)
    )
  }),
  // ─── 블로그 체험단 ───────────────────────────────────────────────────────────
  blogCampaign: router({
    list: protectedProcedure.query(({ ctx }) => getBlogCampaigns(ctx.user.id)),
    create: protectedProcedure.input(blogCampaignInput).mutation(
      ({ input, ctx }) => createBlogCampaign(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: blogCampaignInput.partial() })).mutation(({ input, ctx }) => updateBlogCampaign(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteBlogCampaign(ctx.user.id, input.id)
    )
  }),
  // ─── 구독결제 서비스 ─────────────────────────────────────────────────────────
  subscription: router({
    list: protectedProcedure.query(({ ctx }) => getSubscriptions(ctx.user.id)),
    create: protectedProcedure.input(subscriptionInput).mutation(
      ({ input, ctx }) => createSubscription(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: subscriptionUpdateInput })).mutation(({ input, ctx }) => updateSubscription(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteSubscription(ctx.user.id, input.id)
    )
  }),
  // ─── 보유카드 ──────────────────────────────────────────────────────────────
  card: router({
    list: protectedProcedure.query(({ ctx }) => getCards(ctx.user.id)),
    create: protectedProcedure.input(cardInput).mutation(
      ({ input, ctx }) => createCard(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: cardInput.partial() })).mutation(({ input, ctx }) => updateCard(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteCard(ctx.user.id, input.id)
    )
  }),
  // ─── 포인트/마일리지 ─────────────────────────────────────────────────────────
  cardPoint: router({
    list: protectedProcedure.query(({ ctx }) => getCardPoints(ctx.user.id)),
    create: protectedProcedure.input(cardPointInput).mutation(
      ({ input, ctx }) => createCardPoint(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: cardPointInput.partial() })).mutation(({ input, ctx }) => updateCardPoint(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteCardPoint(ctx.user.id, input.id)
    )
  }),
  // ─── ETF 현재가 ───────────────────────────────────────────────────────────────────────────
  etfPrice: router({
    // 한국 ETF 종목코드 (예: 360750) 입력 시 Yahoo Finance에서 현재가 조회
    // 한국: 종목코드.KS, 해외: 종목코드 그대로 (AAPL, QQQ 등)
    getPrice: protectedProcedure.input(z2.object({ ticker: z2.string(), market: z2.enum(["KR", "US"]).default("KR") })).query(async ({ input }) => {
      const symbol = input.market === "KR" ? input.ticker.includes(".") ? input.ticker : `${input.ticker}.KS` : input.ticker;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const resp = await res.json();
        const meta = resp?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) throw new Error("\uD604\uC7AC\uAC00 \uC5C6\uC74C");
        return {
          ticker: input.ticker,
          symbol,
          price: meta.regularMarketPrice,
          name: meta.longName ?? "",
          currency: meta.currency ?? (input.market === "KR" ? "KRW" : "USD"),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      } catch (e) {
        throw new Error(`\uD604\uC7AC\uAC00 \uC870\uD68C \uC2E4\uD328: ${e.message}`);
      }
    }),
    // 종목명·티커로 검색 — 한글/영문 모두 NAVER + Yahoo Finance 병렬 시도 후 합산
    search: protectedProcedure.input(z2.object({ query: z2.string().min(1), market: z2.enum(["\uAD6D\uB0B4", "\uD574\uC678"]).optional() })).query(async ({ input }) => {
      const isKoreanQuery = /[가-힣]/.test(input.query);
      const KOREAN_EXCHANGES = /* @__PURE__ */ new Set(["KSC", "KOE", "KOS"]);
      const [naverResults, yahooResults] = await Promise.all([
        // NAVER — 한글 쿼리일 때만
        isKoreanQuery ? fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(input.query)}&target=stock,index,marketindicator`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.json() : { items: [] }).then(
          (data) => (data.items ?? []).filter((i) => i.code).map((i) => ({
            ticker: i.code,
            name: i.name,
            exchange: i.typeCode,
            market: "\uAD6D\uB0B4"
          }))
        ).catch(() => []) : Promise.resolve([]),
        // Yahoo Finance — 항상 시도
        fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(input.query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.json() : { quotes: [] }).then(
          (data) => (data.quotes ?? []).filter((q) => q.quoteType === "EQUITY" || q.quoteType === "ETF").map((q) => {
            const isKorean = q.symbol.endsWith(".KS") || q.symbol.endsWith(".KQ") || KOREAN_EXCHANGES.has(q.exchange ?? "");
            return {
              ticker: isKorean ? q.symbol.replace(/\.(KS|KQ)$/, "") : q.symbol,
              name: q.longname || q.shortname || q.symbol,
              exchange: q.exchange ?? "",
              market: isKorean ? "\uAD6D\uB0B4" : "\uD574\uC678"
            };
          })
        ).catch(() => [])
      ]);
      const seen = new Set(naverResults.map((r) => r.ticker));
      const merged = [
        ...naverResults,
        ...yahooResults.filter((r) => !seen.has(r.ticker))
      ];
      return merged.slice(0, 10);
    })
  }),
  // ─── 부체 ───────────────────────────────────────────────────────────────────────────
  debt: router({
    list: protectedProcedure.query(({ ctx }) => getDebts(ctx.user.id)),
    create: protectedProcedure.input(debtInput).mutation(
      ({ input, ctx }) => createDebt(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: debtInput.partial() })).mutation(({ input, ctx }) => updateDebt(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ input, ctx }) => deleteDebt(ctx.user.id, input.id)
    )
  }),
  // ─── 부수입 카테고리 ───────────────────────────────────────────────────────────
  sideIncomeCategory: router({
    list: protectedProcedure.query(({ ctx }) => getSideIncomeCategories(ctx.user.id)),
    create: protectedProcedure.input(z2.object({ name: z2.string().min(1), color: z2.string().optional() })).mutation(({ input, ctx }) => createSideIncomeCategory(ctx.user.id, input)),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: z2.object({ name: z2.string().optional(), color: z2.string().optional() }) })).mutation(({ input, ctx }) => updateSideIncomeCategory(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteSideIncomeCategory(ctx.user.id, input.id))
  }),
  // ─── 부수입 내역 ───────────────────────────────────────────────────────────────
  sideIncome: router({
    list: protectedProcedure.input(z2.object({ year: z2.number(), month: z2.number() })).query(({ input, ctx }) => getSideIncomes(ctx.user.id, input.year, input.month)),
    yearlySummary: protectedProcedure.input(z2.object({ year: z2.number() })).query(({ input, ctx }) => getSideIncomeMonthlySummary(ctx.user.id, input.year)),
    create: protectedProcedure.input(z2.object({
      incomeDate: z2.string(),
      year: z2.number(),
      month: z2.number(),
      categoryId: z2.number().optional(),
      categoryName: z2.string().optional(),
      amount: z2.number(),
      description: z2.string().optional(),
      isRegular: z2.boolean().default(false),
      note: z2.string().optional()
    })).mutation(async ({ input, ctx }) => {
      const ledgerResult = await createLedgerEntry(ctx.user.id, {
        entryDate: input.incomeDate,
        year: input.year,
        month: input.month,
        mainCategory: "\uC18C\uB4DD",
        subCategory: input.categoryName ?? "\uBD80\uC218\uC785",
        description: input.description ?? "",
        amount: input.amount,
        note: `[\uBD80\uC218\uC785 \uC790\uB3D9\uC5F0\uB3D9] ${input.note ?? ""}`.trim()
      });
      const ledgerEntryId = ledgerResult?.insertId;
      return createSideIncome(ctx.user.id, {
        ...input,
        incomeDate: input.incomeDate,
        ledgerEntryId
      });
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      data: z2.object({
        incomeDate: z2.string().optional(),
        year: z2.number().optional(),
        month: z2.number().optional(),
        categoryId: z2.number().optional(),
        categoryName: z2.string().optional(),
        amount: z2.number().optional(),
        description: z2.string().optional(),
        isRegular: z2.boolean().optional(),
        note: z2.string().optional()
      })
    })).mutation(({ input, ctx }) => {
      const { incomeDate, ...rest } = input.data;
      return updateSideIncome(ctx.user.id, input.id, {
        ...rest,
        ...incomeDate ? { incomeDate } : {}
      });
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteSideIncome(ctx.user.id, input.id))
  }),
  account: router({
    list: protectedProcedure.query(({ ctx }) => listAccounts(ctx.user.id)),
    create: protectedProcedure.input(accountInput).mutation(({ input, ctx }) => createAccount(ctx.user.id, input)),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: accountInput.partial() })).mutation(({ input, ctx }) => updateAccount(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteAccount(ctx.user.id, input.id))
  }),
  installment: router({
    list: protectedProcedure.query(({ ctx }) => listInstallments(ctx.user.id)),
    create: protectedProcedure.input(installmentInput).mutation(({ input, ctx }) => createInstallment(ctx.user.id, {
      ...input,
      interestRate: input.interestRate ?? "0",
      cardId: input.cardId ?? null
    })),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: installmentInput.partial() })).mutation(({ input, ctx }) => updateInstallment(ctx.user.id, input.id, {
      ...input.data,
      cardId: input.data.cardId ?? null
    })),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteInstallment(ctx.user.id, input.id))
  }),
  loan: router({
    list: protectedProcedure.query(({ ctx }) => listLoans(ctx.user.id)),
    create: protectedProcedure.input(loanInput).mutation(({ input, ctx }) => createLoan(ctx.user.id, {
      ...input,
      lender: input.lender ?? null,
      maturityDate: input.maturityDate ?? null,
      paymentDay: input.paymentDay ?? null,
      interestRate: input.interestRate ?? "0",
      graceMonths: input.graceMonths ?? 0,
      isActive: input.isActive ?? true
    })),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: loanInput.partial() })).mutation(({ input, ctx }) => updateLoan(ctx.user.id, input.id, {
      ...input.data,
      lender: input.data.lender ?? void 0,
      maturityDate: input.data.maturityDate ?? void 0,
      paymentDay: input.data.paymentDay ?? void 0
    })),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteLoan(ctx.user.id, input.id))
  }),
  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await seedDefaultCategories(ctx.user.id);
      return listCategories(ctx.user.id);
    }),
    addMain: protectedProcedure.input(z2.object({ name: z2.string().min(1), type: z2.enum(["expense", "income", "both"]), sortOrder: z2.number().default(0) })).mutation(({ input, ctx }) => createCategory(ctx.user.id, input)),
    updateMain: protectedProcedure.input(z2.object({ id: z2.number(), name: z2.string().min(1).optional(), type: z2.enum(["expense", "income", "both"]).optional(), sortOrder: z2.number().optional() })).mutation(({ input, ctx }) => {
      const { id, ...data } = input;
      return updateCategory(ctx.user.id, id, data);
    }),
    deleteMain: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteCategory(ctx.user.id, input.id)),
    addSub: protectedProcedure.input(z2.object({ categoryId: z2.number(), name: z2.string().min(1), sortOrder: z2.number().default(0) })).mutation(({ input, ctx }) => createSubCategory(ctx.user.id, input)),
    updateSub: protectedProcedure.input(z2.object({ id: z2.number(), name: z2.string().min(1).optional(), sortOrder: z2.number().optional() })).mutation(({ input, ctx }) => {
      const { id, ...data } = input;
      return updateSubCategory(ctx.user.id, id, data);
    }),
    deleteSub: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteSubCategory(ctx.user.id, input.id))
  }),
  insurance: router({
    list: protectedProcedure.query(({ ctx }) => listInsurance(ctx.user.id)),
    create: protectedProcedure.input(insuranceInput).mutation(({ input, ctx }) => createInsurance(ctx.user.id, input)),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: insuranceInput.partial() })).mutation(({ input, ctx }) => updateInsurance(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(({ input, ctx }) => deleteInsurance(ctx.user.id, input.id))
  }),
  businessIncome: router({
    list: protectedProcedure.query(({ ctx }) => listBusinessIncomes(ctx.user.id)),
    create: protectedProcedure.input(z2.object({
      clientName: z2.string(),
      clientType: z2.enum(["\uD68C\uC0AC", "\uAC1C\uC778"]).nullable().optional(),
      depositorName: z2.string().nullable().optional(),
      phoneNumber: z2.string().nullable().optional(),
      workAmount: z2.number().default(0),
      depositPercent: z2.number().int().min(1).max(100).default(50),
      workStartDate: z2.string().nullable().optional(),
      isCompleted: z2.boolean().default(false),
      settlementDate: z2.string().nullable().optional(),
      cashReceiptDone: z2.boolean().default(false),
      note: z2.string().nullable().optional()
    })).mutation(async ({ input, ctx }) => {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const deposit = Math.round(input.workAmount * (input.depositPercent ?? 50) / 100);
      const balance = input.workAmount - deposit;
      let depositLedgerEntryId = null;
      let balanceLedgerEntryId = null;
      if (input.workStartDate && input.workStartDate <= today && deposit > 0) {
        const [y, m] = input.workStartDate.split("-").map(Number);
        const r = await createLedgerEntry(ctx.user.id, {
          entryDate: input.workStartDate,
          year: y,
          month: m,
          mainCategory: "\uC18C\uB4DD",
          subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
          description: `${input.clientName} \uACC4\uC57D\uAE08`,
          amount: deposit,
          note: "[\uC0AC\uC5C5\uC18C\uB4DD \uC790\uB3D9\uC5F0\uB3D9]"
        });
        depositLedgerEntryId = r?.insertId ?? null;
      }
      if (input.isCompleted && input.settlementDate && balance > 0) {
        const [y, m] = input.settlementDate.split("-").map(Number);
        const r = await createLedgerEntry(ctx.user.id, {
          entryDate: input.settlementDate,
          year: y,
          month: m,
          mainCategory: "\uC18C\uB4DD",
          subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
          description: `${input.clientName} \uC794\uAE08`,
          amount: balance,
          note: "[\uC0AC\uC5C5\uC18C\uB4DD \uC790\uB3D9\uC5F0\uB3D9]"
        });
        balanceLedgerEntryId = r?.insertId ?? null;
      }
      return createBusinessIncome(ctx.user.id, { ...input, depositLedgerEntryId, balanceLedgerEntryId });
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      data: z2.object({
        clientName: z2.string().optional(),
        clientType: z2.enum(["\uD68C\uC0AC", "\uAC1C\uC778"]).nullable().optional(),
        depositorName: z2.string().nullable().optional(),
        phoneNumber: z2.string().nullable().optional(),
        workAmount: z2.number().optional(),
        depositPercent: z2.number().int().min(1).max(100).optional(),
        workStartDate: z2.string().nullable().optional(),
        isCompleted: z2.boolean().optional(),
        settlementDate: z2.string().nullable().optional(),
        cashReceiptDone: z2.boolean().optional(),
        note: z2.string().nullable().optional()
      })
    })).mutation(async ({ input, ctx }) => {
      const current = await getBusinessIncome(ctx.user.id, input.id);
      if (!current) throw new Error("Not found");
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const merged = { ...current, ...input.data };
      const deposit = Math.round(merged.workAmount * merged.depositPercent / 100);
      const balance = merged.workAmount - deposit;
      let depositLedgerEntryId = current.depositLedgerEntryId ?? null;
      let balanceLedgerEntryId = current.balanceLedgerEntryId ?? null;
      const needDeposit = !!(merged.workStartDate && merged.workStartDate <= today && deposit > 0);
      if (needDeposit) {
        const [y, m] = merged.workStartDate.split("-").map(Number);
        if (depositLedgerEntryId) {
          await updateLedgerEntry(ctx.user.id, depositLedgerEntryId, {
            entryDate: merged.workStartDate,
            year: y,
            month: m,
            mainCategory: "\uC18C\uB4DD",
            subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
            description: `${merged.clientName} \uACC4\uC57D\uAE08`,
            amount: deposit
          });
        } else {
          const r = await createLedgerEntry(ctx.user.id, {
            entryDate: merged.workStartDate,
            year: y,
            month: m,
            mainCategory: "\uC18C\uB4DD",
            subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
            description: `${merged.clientName} \uACC4\uC57D\uAE08`,
            amount: deposit,
            note: "[\uC0AC\uC5C5\uC18C\uB4DD \uC790\uB3D9\uC5F0\uB3D9]"
          });
          depositLedgerEntryId = r?.insertId ?? null;
        }
      } else if (!needDeposit && depositLedgerEntryId) {
        await deleteLedgerEntry(ctx.user.id, depositLedgerEntryId);
        depositLedgerEntryId = null;
      }
      const needBalance = !!(merged.isCompleted && merged.settlementDate && balance > 0);
      if (needBalance) {
        const [y, m] = merged.settlementDate.split("-").map(Number);
        if (balanceLedgerEntryId) {
          await updateLedgerEntry(ctx.user.id, balanceLedgerEntryId, {
            entryDate: merged.settlementDate,
            year: y,
            month: m,
            mainCategory: "\uC18C\uB4DD",
            subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
            description: `${merged.clientName} \uC794\uAE08`,
            amount: balance
          });
        } else {
          const r = await createLedgerEntry(ctx.user.id, {
            entryDate: merged.settlementDate,
            year: y,
            month: m,
            mainCategory: "\uC18C\uB4DD",
            subCategory: "\uC0AC\uC5C5\uC18C\uB4DD",
            description: `${merged.clientName} \uC794\uAE08`,
            amount: balance,
            note: "[\uC0AC\uC5C5\uC18C\uB4DD \uC790\uB3D9\uC5F0\uB3D9]"
          });
          balanceLedgerEntryId = r?.insertId ?? null;
        }
      } else if (!needBalance && balanceLedgerEntryId) {
        await deleteLedgerEntry(ctx.user.id, balanceLedgerEntryId);
        balanceLedgerEntryId = null;
      }
      return updateBusinessIncome(ctx.user.id, input.id, {
        ...input.data,
        depositLedgerEntryId,
        balanceLedgerEntryId
      });
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const current = await getBusinessIncome(ctx.user.id, input.id);
      if (current?.depositLedgerEntryId) await deleteLedgerEntry(ctx.user.id, current.depositLedgerEntryId);
      if (current?.balanceLedgerEntryId) await deleteLedgerEntry(ctx.user.id, current.balanceLedgerEntryId);
      return deleteBusinessIncome(ctx.user.id, input.id);
    })
  }),
  businessExpense: router({
    list: protectedProcedure.query(({ ctx }) => listBusinessExpenses(ctx.user.id)),
    create: protectedProcedure.input(businessExpenseInput).mutation(async ({ input, ctx }) => {
      let ledgerEntryId = null;
      if (input.category === "\uAD11\uACE0" && input.amount > 0) {
        const r = await createLedgerEntry(ctx.user.id, {
          entryDate: input.expenseDate,
          year: input.year,
          month: input.month,
          mainCategory: "\uC0AC\uC5C5\uC9C0\uCD9C",
          subCategory: "\uAD11\uACE0",
          description: input.description,
          amount: -Math.abs(input.amount),
          note: `[\uC0AC\uC5C5\uBE44\uC6A9 \uC790\uB3D9\uC5F0\uB3D9]${input.vendor ? ` ${input.vendor}` : ""}${input.note ? ` \xB7 ${input.note}` : ""}`
        });
        ledgerEntryId = getInsertId(r);
      }
      return createBusinessExpense(ctx.user.id, {
        ...input,
        expenseDate: input.expenseDate,
        ledgerEntryId
      });
    }),
    update: protectedProcedure.input(z2.object({ id: z2.number(), data: businessExpenseInput.partial() })).mutation(async ({ input, ctx }) => {
      const current = await getBusinessExpense(ctx.user.id, input.id);
      if (!current) throw new Error("Not found");
      const { expenseDate, ...rest } = input.data;
      const merged = {
        ...current,
        ...input.data,
        expenseDate: expenseDate ?? String(current.expenseDate).split("T")[0]
      };
      let ledgerEntryId = current.ledgerEntryId ?? null;
      const needsLedger = merged.category === "\uAD11\uACE0" && merged.amount > 0;
      if (needsLedger) {
        const ledgerData = {
          entryDate: merged.expenseDate,
          year: merged.year,
          month: merged.month,
          mainCategory: "\uC0AC\uC5C5\uC9C0\uCD9C",
          subCategory: "\uAD11\uACE0",
          description: merged.description,
          amount: -Math.abs(merged.amount),
          note: `[\uC0AC\uC5C5\uBE44\uC6A9 \uC790\uB3D9\uC5F0\uB3D9]${merged.vendor ? ` ${merged.vendor}` : ""}${merged.note ? ` \xB7 ${merged.note}` : ""}`
        };
        if (ledgerEntryId) {
          await updateLedgerEntry(ctx.user.id, ledgerEntryId, ledgerData);
        } else {
          const r = await createLedgerEntry(ctx.user.id, ledgerData);
          ledgerEntryId = getInsertId(r);
        }
      } else if (ledgerEntryId) {
        await deleteLedgerEntry(ctx.user.id, ledgerEntryId);
        ledgerEntryId = null;
      }
      return updateBusinessExpense(ctx.user.id, input.id, {
        ...rest,
        ...expenseDate ? { expenseDate } : {},
        ledgerEntryId
      });
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const current = await getBusinessExpense(ctx.user.id, input.id);
      if (current?.ledgerEntryId) await deleteLedgerEntry(ctx.user.id, current.ledgerEntryId);
      return deleteBusinessExpense(ctx.user.id, input.id);
    })
  }),
  laborCost: router({
    list: protectedProcedure.query(({ ctx }) => listLaborCosts(ctx.user.id)),
    create: protectedProcedure.input(z2.object({
      freelancerName: z2.string().min(1),
      description: z2.string().nullable().optional(),
      grossAmount: z2.number().int().min(0),
      withholdingRate: z2.string().default("3.30"),
      withholdingAmount: z2.number().int().min(0),
      netAmount: z2.number().int().min(0),
      paymentDate: z2.string().nullable().optional(),
      reportDate: z2.string().nullable().optional(),
      taxPaymentDate: z2.string().nullable().optional(),
      taxPaymentAccount: z2.string().nullable().optional(),
      note: z2.string().nullable().optional()
    })).mutation(({ input, ctx }) => createLaborCost(ctx.user.id, input)),
    update: protectedProcedure.input(z2.object({
      id: z2.number().int(),
      data: z2.object({
        freelancerName: z2.string().min(1).optional(),
        description: z2.string().nullable().optional(),
        grossAmount: z2.number().int().min(0).optional(),
        withholdingRate: z2.string().optional(),
        withholdingAmount: z2.number().int().min(0).optional(),
        netAmount: z2.number().int().min(0).optional(),
        paymentDate: z2.string().nullable().optional(),
        reportDate: z2.string().nullable().optional(),
        taxPaymentDate: z2.string().nullable().optional(),
        taxPaymentAccount: z2.string().nullable().optional(),
        note: z2.string().nullable().optional()
      })
    })).mutation(({ input, ctx }) => updateLaborCost(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(z2.object({ id: z2.number().int() })).mutation(({ input, ctx }) => deleteLaborCost(ctx.user.id, input.id))
  }),
  exchangeRate: router({
    get: protectedProcedure.input(z2.object({ currency: z2.string() })).query(async ({ input }) => {
      const { currency } = input;
      if (currency === "KRW") return { rate: 1, currency: "KRW", base: "KRW" };
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (data.result !== "success") throw new Error("API error");
        const krwRate = data.rates["KRW"];
        if (!krwRate) throw new Error("KRW rate not found");
        return { rate: krwRate, currency, base: currency };
      } catch {
        const fallback = { USD: 1380, EUR: 1500, JPY: 9.2, GBP: 1750, CNY: 190 };
        return { rate: fallback[currency] ?? 1, currency, base: currency, fallback: true };
      }
    })
  })
});

// server/_core/context.ts
import { getAuth } from "@clerk/express";
var DEV_USER_ID = 1;
async function createContext(opts) {
  if (process.env.NODE_ENV === "development") {
    const dbUser = await getUserById(DEV_USER_ID);
    const user2 = dbUser ?? {
      id: DEV_USER_ID,
      openId: "jY7bjoHqY74ENsqhHuGYab",
      name: "seonju Moon",
      email: "seonjuuu116@gmail.com",
      loginMethod: null,
      role: "admin",
      birthDate: null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date(),
      lastSignedIn: /* @__PURE__ */ new Date()
    };
    return { req: opts.req, res: opts.res, user: user2 };
  }
  let user = null;
  try {
    const auth = getAuth(opts.req);
    const openId = auth?.userId;
    if (openId) {
      user = await getUserByOpenId(openId) ?? null;
      if (!user) {
        await upsertUser({ openId, lastSignedIn: /* @__PURE__ */ new Date() });
        user = await getUserByOpenId(openId) ?? null;
      }
    }
  } catch (err) {
    console.error("[Context] auth error:", err);
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}

// server/vercel-handler.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
var fallbackClerkPublishableKey = "pk_test_YmFsYW5jZWQtb3N0cmljaC0yNi5jbGVyay5hY2NvdW50cy5kZXYk";
var clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? fallbackClerkPublishableKey;
app.use(clerkMiddleware({
  publishableKey: clerkPublishableKey,
  secretKey: process.env.CLERK_SECRET_KEY
}));
registerStorageProxy(app);
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);
app.use((err, _req, res, _next) => {
  console.error("[API Error]", err?.message ?? err);
  res.status(500).json({ error: { message: err?.message ?? "Internal Server Error" } });
});
var vercel_handler_default = app;
export {
  vercel_handler_default as default
};
