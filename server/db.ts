import { and, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import {
  InsertUser,
  blogCampaigns,
  borrowedMoney,
  borrowedMoneyPayments,
  cards,
  cardPoints,
  debts,
  fixedExpenses,
  featureRequests,
  InsertBlogCampaign,
  InsertBorrowedMoney,
  InsertBorrowedMoneyPayment,
  InsertFeatureRequest,
  InsertWeddingBudgetItem,
  InsertWeddingBudgetSetting,
  InsertCard,
  InsertCardPoint,
  InsertDebt,
  InsertFixedExpense,
  InsertLedgerEntry,
  InsertOtherAsset,
  InsertPensionAsset,
  InsertRealEstate,
  InsertSavingsAsset,
  InsertStockPortfolio,
  InsertUserMemo,
  InsertLoan,
  InsertSubscription,
  ledgerEntries,
  otherAssets,
  pensionAssets,
  realEstates,
  savingsAssets,
  stockPortfolio,
  userMemos,
  loans,
  subscriptions,
  sideIncomeCategories,
  sideIncomes,
  InsertSideIncomeCategory,
  InsertSideIncome,
  accounts,
  InsertAccount,
  installments,
  InsertInstallment,
  insurance,
  InsertInsurance,
  businessIncomes,
  InsertBusinessIncome,
  businessExpenses,
  InsertBusinessExpense,
  categories,
  subCategories,
  InsertCategory,
  InsertSubCategory,
  users,
  weddingBudgetItems,
  weddingBudgetSettings,
  laborCosts,
  InsertLaborCost,
  userContacts,
  InsertUserContact,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function ensureUserMemosTable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
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

async function ensureUserContactsTable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_contacts" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "contact_user_id" integer NOT NULL,
      "nickname" varchar(100) NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_contacts_user_contact_idx"
    ON "user_contacts" ("user_id", "contact_user_id")
  `);
}

async function ensureLoansTable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
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

async function ensureBorrowedMoneyTable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "borrowed_money" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "lender_user_id" integer,
      "borrower_user_id" integer,
      "share_status" varchar(30) NOT NULL DEFAULT 'private',
      "lender_name" varchar(200) NOT NULL,
      "principal_amount" bigint NOT NULL DEFAULT 0,
      "repaid_amount" bigint NOT NULL DEFAULT 0,
      "borrowed_date" varchar(20),
      "repayment_type" varchar(30) NOT NULL DEFAULT '자유상환',
      "repayment_start_date" varchar(20),
      "repayment_due_date" varchar(20),
      "payment_day" integer,
      "monthly_payment" bigint NOT NULL DEFAULT 0,
      "total_installments" integer,
      "installment_mode" varchar(20) NOT NULL DEFAULT 'equal',
      "repayment_schedule" text,
      "note" text,
      "is_active" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "lender_user_id" integer`);
  await db.execute(sql`ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "borrower_user_id" integer`);
  await db.execute(sql`ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "share_status" varchar(30) NOT NULL DEFAULT 'private'`);
  await db.execute(sql`ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "installment_mode" varchar(20) NOT NULL DEFAULT 'equal'`);
  await db.execute(sql`ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "repayment_schedule" text`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "borrowed_money_payments" (
      "id" serial PRIMARY KEY,
      "borrowed_money_id" integer NOT NULL,
      "user_id" integer NOT NULL DEFAULT 0,
      "payment_date" varchar(20) NOT NULL,
      "amount" bigint NOT NULL DEFAULT 0,
      "installment_no" integer,
      "note" text,
      "ledger_entry_id" integer,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
}

async function ensureWeddingBudgetTables(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "wedding_budget_settings" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "wedding_date" varchar(20),
      "venue_name" varchar(200),
      "total_budget" bigint NOT NULL DEFAULT 0,
      "note" text,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wedding_budget_settings_user_id_idx"
    ON "wedding_budget_settings" ("user_id")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "wedding_budget_items" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "category" varchar(100) NOT NULL,
      "item_name" varchar(200) NOT NULL,
      "vendor_name" varchar(200),
      "estimated_amount" bigint NOT NULL DEFAULT 0,
      "contract_amount" bigint NOT NULL DEFAULT 0,
      "paid_amount" bigint NOT NULL DEFAULT 0,
      "due_date" varchar(20),
      "payment_method" varchar(200),
      "status" varchar(50) NOT NULL DEFAULT '견적',
      "note" text,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
}

async function ensureSubscriptionCategoryValues(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql`ALTER TYPE "subscription_category" ADD VALUE IF NOT EXISTS '쇼핑'`);
}

async function ensureFeatureRequestsTable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "feature_requests" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL DEFAULT 0,
      "author_name" varchar(120),
      "title" varchar(200) NOT NULL,
      "content" text NOT NULL,
      "status" varchar(30) NOT NULL DEFAULT '요청',
      "is_done" boolean NOT NULL DEFAULT false,
      "checked_by_user_id" integer,
      "checked_at" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listShareableUsers(currentUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(sql`${users.id} <> ${currentUserId}`)
    .orderBy(users.name, users.email);
}

export async function listUserContacts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureUserContactsTable(db);
  return db
    .select({
      id: userContacts.id,
      userId: userContacts.userId,
      contactUserId: userContacts.contactUserId,
      nickname: userContacts.nickname,
      name: users.name,
      email: users.email,
    })
    .from(userContacts)
    .leftJoin(users, eq(userContacts.contactUserId, users.id))
    .where(eq(userContacts.userId, userId))
    .orderBy(userContacts.nickname);
}

export async function searchUsersForContact(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(
      sql`${users.id} <> ${userId}`,
      or(
        sql`LOWER(COALESCE(${users.name}, '')) LIKE ${`%${normalized}%`}`,
        sql`LOWER(COALESCE(${users.email}, '')) LIKE ${`%${normalized}%`}`,
        sql`CAST(${users.id} AS text) = ${normalized}`,
      ),
    ))
    .orderBy(users.name, users.email)
    .limit(8);
}

export async function upsertUserContact(userId: number, data: Pick<InsertUserContact, "contactUserId" | "nickname">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureUserContactsTable(db);
  if (data.contactUserId === userId) throw new Error("내 계정은 연락처로 추가할 수 없습니다");
  const nickname = data.nickname.trim();
  if (!nickname) throw new Error("별칭을 입력해주세요");
  await db
    .insert(userContacts)
    .values({ userId, contactUserId: data.contactUserId, nickname })
    .onConflictDoUpdate({
      target: [userContacts.userId, userContacts.contactUserId],
      set: { nickname, updatedAt: new Date() },
    });
}

export async function updateUserProfile(
  userId: number,
  data: { birthDate?: string | null; name?: string | null; navPreferences?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set(data).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

// ─── 가계부 ───────────────────────────────────────────────────────────────────
export async function getLedgerEntries(userId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year), eq(ledgerEntries.month, month)))
    .orderBy(ledgerEntries.entryDate);
}

export async function getLedgerMonthSummary(userId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      mainCategory: ledgerEntries.mainCategory,
      total: sql<number>`SUM(${ledgerEntries.amount})`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year), eq(ledgerEntries.month, month)))
    .groupBy(ledgerEntries.mainCategory);
}

export async function getYearlySummary(userId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      month: ledgerEntries.month,
      mainCategory: ledgerEntries.mainCategory,
      total: sql<number>`SUM(${ledgerEntries.amount})`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.year, year)))
    .groupBy(ledgerEntries.month, ledgerEntries.mainCategory)
    .orderBy(ledgerEntries.month);
}

export async function getYearlySubCatExpenseSummary(userId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      month: ledgerEntries.month,
      subCategory: ledgerEntries.subCategory,
      total: sql<number>`SUM(${ledgerEntries.amount})`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.year, year),
        sql`${ledgerEntries.mainCategory} IN ('고정지출', '변동지출', '사업지출')`
      )
    )
    .groupBy(ledgerEntries.month, ledgerEntries.subCategory)
    .orderBy(ledgerEntries.month);
}

export async function createLedgerEntry(userId: number, data: InsertLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ledgerEntries).values({ ...data, userId });
  return result;
}

export async function updateLedgerEntry(userId: number, id: number, data: Partial<InsertLedgerEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ledgerEntries).set(data).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.userId, userId)));
}

export async function deleteLedgerEntry(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ledgerEntries).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.userId, userId)));
}

// ─── 고정지출 ─────────────────────────────────────────────────────────────────
export async function getFixedExpenses(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fixedExpenses)
    .where(and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.isActive, true)))
    .orderBy(fixedExpenses.mainCategory);
}

export async function createFixedExpense(userId: number, data: InsertFixedExpense) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(fixedExpenses).values({ ...data, userId });
}

export async function updateFixedExpense(userId: number, id: number, data: Partial<InsertFixedExpense>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set(data).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));
}

export async function deleteFixedExpense(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set({ isActive: false }).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));
}

// ─── 주식 포트폴리오 ──────────────────────────────────────────────────────────
export async function getStockPortfolio(userId: number, snapshotMonth?: string) {
  const db = await getDb();
  if (!db) return [];
  if (snapshotMonth) {
    return db.select().from(stockPortfolio)
      .where(and(eq(stockPortfolio.userId, userId), eq(stockPortfolio.snapshotMonth, snapshotMonth)));
  }
  const latest = await db
    .select({ snapshotMonth: stockPortfolio.snapshotMonth })
    .from(stockPortfolio)
    .where(eq(stockPortfolio.userId, userId))
    .orderBy(desc(stockPortfolio.snapshotMonth))
    .limit(1);
  if (latest.length === 0) return [];
  return db
    .select()
    .from(stockPortfolio)
    .where(and(eq(stockPortfolio.userId, userId), eq(stockPortfolio.snapshotMonth, latest[0].snapshotMonth!)));
}

export async function createStockEntry(userId: number, data: InsertStockPortfolio) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(stockPortfolio).values({ ...data, userId });
}

export async function updateStockEntry(userId: number, id: number, data: Partial<InsertStockPortfolio>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(stockPortfolio).set(data).where(and(eq(stockPortfolio.id, id), eq(stockPortfolio.userId, userId)));
}

export async function deleteStockEntry(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(stockPortfolio).where(and(eq(stockPortfolio.id, id), eq(stockPortfolio.userId, userId)));
}

// ─── 대출 ─────────────────────────────────────────────────────────────────────
export async function listLoans(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureLoansTable(db);
  return db.select().from(loans)
    .where(and(eq(loans.userId, userId), eq(loans.isActive, true)))
    .orderBy(desc(loans.createdAt));
}

export async function createLoan(userId: number, data: InsertLoan) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.insert(loans).values({ ...data, userId });
}

export async function updateLoan(userId: number, id: number, data: Partial<InsertLoan>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.userId, userId)));
}

export async function deleteLoan(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureLoansTable(db);
  await db.update(loans).set({ isActive: false }).where(and(eq(loans.id, id), eq(loans.userId, userId)));
}

// ─── 빌린돈 ───────────────────────────────────────────────────────────────────
export async function listBorrowedMoney(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureBorrowedMoneyTable(db);
  return db.select({
    ...getTableColumns(borrowedMoney),
    lenderUserName: sql<string | null>`(SELECT COALESCE(${users.name}, ${users.email}) FROM ${users} WHERE ${users.id} = ${borrowedMoney.lenderUserId} LIMIT 1)`,
    borrowerUserName: sql<string | null>`(SELECT COALESCE(${users.name}, ${users.email}) FROM ${users} WHERE ${users.id} = ${borrowedMoney.borrowerUserId} LIMIT 1)`,
  }).from(borrowedMoney)
    .where(and(
      or(
        eq(borrowedMoney.userId, userId),
        eq(borrowedMoney.lenderUserId, userId),
        eq(borrowedMoney.borrowerUserId, userId),
      ),
      eq(borrowedMoney.isActive, true),
    ))
    .orderBy(desc(borrowedMoney.createdAt));
}

export async function createBorrowedMoney(userId: number, data: InsertBorrowedMoney) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureBorrowedMoneyTable(db);
  await db.insert(borrowedMoney).values({ ...data, userId });
}

export async function updateBorrowedMoney(userId: number, id: number, data: Partial<InsertBorrowedMoney>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureBorrowedMoneyTable(db);
  await db.update(borrowedMoney)
    .set({ ...data, updatedAt: new Date() })
    .where(and(
      eq(borrowedMoney.id, id),
      or(eq(borrowedMoney.userId, userId), eq(borrowedMoney.lenderUserId, userId), eq(borrowedMoney.borrowerUserId, userId)),
    ));
}

export async function deleteBorrowedMoney(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureBorrowedMoneyTable(db);
  await db.update(borrowedMoney)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(borrowedMoney.id, id), eq(borrowedMoney.userId, userId)));
}

export async function listBorrowedMoneyPayments(userId: number, borrowedMoneyId?: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureBorrowedMoneyTable(db);
  const accessible = await db
    .select({ id: borrowedMoney.id })
    .from(borrowedMoney)
    .where(and(
      or(eq(borrowedMoney.userId, userId), eq(borrowedMoney.lenderUserId, userId), eq(borrowedMoney.borrowerUserId, userId)),
      eq(borrowedMoney.isActive, true),
    ));
  const ids = accessible.map((item) => item.id);
  if (ids.length === 0) return [];
  const where = borrowedMoneyId
    ? and(inArray(borrowedMoneyPayments.borrowedMoneyId, ids), eq(borrowedMoneyPayments.borrowedMoneyId, borrowedMoneyId))
    : inArray(borrowedMoneyPayments.borrowedMoneyId, ids);
  return db.select().from(borrowedMoneyPayments)
    .where(where)
    .orderBy(desc(borrowedMoneyPayments.paymentDate), desc(borrowedMoneyPayments.createdAt));
}

export async function createBorrowedMoneyPayment(
  userId: number,
  data: {
    borrowedMoneyId: number;
    paymentDate: string;
    amount: number;
    installmentNo?: number | null;
    note?: string | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureBorrowedMoneyTable(db);
  const [target] = await db.select().from(borrowedMoney)
    .where(and(
      eq(borrowedMoney.id, data.borrowedMoneyId),
      or(eq(borrowedMoney.userId, userId), eq(borrowedMoney.lenderUserId, userId), eq(borrowedMoney.borrowerUserId, userId)),
      eq(borrowedMoney.isActive, true),
    ))
    .limit(1);
  if (!target) throw new Error("빌린돈 내역을 찾을 수 없습니다");
  if (target.shareStatus !== "private" && target.shareStatus !== "accepted" && target.shareStatus !== "shared") {
    throw new Error("상대방 승인 후 상환 기록을 추가할 수 있습니다");
  }
  const remaining = Math.max(0, target.principalAmount - target.repaidAmount);
  const amount = Math.min(Math.max(0, data.amount), remaining);
  if (amount <= 0) throw new Error("상환할 금액이 없습니다");

  const [y, m] = data.paymentDate.split("-").map(Number);
  if (!y || !m) throw new Error("상환일 형식이 올바르지 않습니다");
  const isReceiver = target.lenderUserId === userId && target.borrowerUserId !== userId;
  const ledgerResult = await db.insert(ledgerEntries).values({
    userId,
    entryDate: data.paymentDate,
    year: y,
    month: m,
    mainCategory: isReceiver ? "수입" : "변동지출",
    subCategory: "빌린돈상환",
    description: isReceiver ? `${target.lenderName} 입금 확인` : `${target.lenderName} 상환`,
    amount: isReceiver ? Math.abs(amount) : -Math.abs(amount),
    note: `[빌린돈 자동연동]${data.note ? ` ${data.note}` : ""}`,
  }).returning({ id: ledgerEntries.id });
  const ledgerEntryId = ledgerResult[0]?.id ?? null;

  await db.insert(borrowedMoneyPayments).values({ ...data, amount, ledgerEntryId, userId });
  await db.update(borrowedMoney)
    .set({ repaidAmount: Math.min(target.principalAmount, target.repaidAmount + amount), updatedAt: new Date() })
    .where(and(
      eq(borrowedMoney.id, data.borrowedMoneyId),
      or(eq(borrowedMoney.userId, userId), eq(borrowedMoney.lenderUserId, userId), eq(borrowedMoney.borrowerUserId, userId)),
    ));
}

export async function deleteBorrowedMoneyPayment(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureBorrowedMoneyTable(db);
  const [payment] = await db.select().from(borrowedMoneyPayments)
    .where(and(eq(borrowedMoneyPayments.id, id), eq(borrowedMoneyPayments.userId, userId)))
    .limit(1);
  if (!payment) throw new Error("상환 기록을 찾을 수 없습니다");
  const [target] = await db.select().from(borrowedMoney)
    .where(and(eq(borrowedMoney.id, payment.borrowedMoneyId), eq(borrowedMoney.userId, userId)))
    .limit(1);
  if (payment.ledgerEntryId) await deleteLedgerEntry(userId, payment.ledgerEntryId);
  await db.delete(borrowedMoneyPayments)
    .where(and(eq(borrowedMoneyPayments.id, id), eq(borrowedMoneyPayments.userId, userId)));
  if (target) {
    await db.update(borrowedMoney)
      .set({ repaidAmount: Math.max(0, target.repaidAmount - payment.amount), updatedAt: new Date() })
      .where(and(eq(borrowedMoney.id, payment.borrowedMoneyId), eq(borrowedMoney.userId, userId)));
  }
}

export async function getUserMemo(userId: number, memoKey: string) {
  const db = await getDb();
  if (!db) return null;
  await ensureUserMemosTable(db);
  const result = await db.select().from(userMemos)
    .where(and(eq(userMemos.userId, userId), eq(userMemos.memoKey, memoKey)))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertUserMemo(userId: number, data: Pick<InsertUserMemo, "memoKey" | "content">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureUserMemosTable(db);
  const existing = await getUserMemo(userId, data.memoKey);
  if (existing) {
    await db.update(userMemos)
      .set({ content: data.content, updatedAt: new Date() })
      .where(and(eq(userMemos.userId, userId), eq(userMemos.memoKey, data.memoKey)));
    return;
  }
  await db.insert(userMemos).values({ userId, memoKey: data.memoKey, content: data.content });
}

// ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
export async function getSavingsAssets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savingsAssets)
    .where(and(eq(savingsAssets.userId, userId), eq(savingsAssets.isActive, true)))
    .orderBy(savingsAssets.category);
}

export async function createSavingsAsset(userId: number, data: InsertSavingsAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(savingsAssets).values({ ...data, userId });
}

export async function updateSavingsAsset(userId: number, id: number, data: Partial<InsertSavingsAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set(data).where(and(eq(savingsAssets.id, id), eq(savingsAssets.userId, userId)));
}

export async function deleteSavingsAsset(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set({ isActive: false }).where(and(eq(savingsAssets.id, id), eq(savingsAssets.userId, userId)));
}

// ─── 연금 ─────────────────────────────────────────────────────────────────────
export async function getPensionAssets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pensionAssets)
    .where(eq(pensionAssets.userId, userId))
    .orderBy(pensionAssets.pensionType);
}

export async function createPensionAsset(userId: number, data: InsertPensionAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pensionAssets).values({ ...data, userId });
}

export async function updatePensionAsset(userId: number, id: number, data: Partial<InsertPensionAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pensionAssets).set(data).where(and(eq(pensionAssets.id, id), eq(pensionAssets.userId, userId)));
}

export async function deletePensionAsset(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pensionAssets).where(and(eq(pensionAssets.id, id), eq(pensionAssets.userId, userId)));
}

// ─── 기타 자산 ────────────────────────────────────────────────────────────────
export async function getOtherAssets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(otherAssets).where(eq(otherAssets.userId, userId));
}

export async function createOtherAsset(userId: number, data: InsertOtherAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(otherAssets).values({ ...data, userId });
}

export async function updateOtherAsset(userId: number, id: number, data: Partial<InsertOtherAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(otherAssets).set(data).where(and(eq(otherAssets.id, id), eq(otherAssets.userId, userId)));
}

export async function deleteOtherAsset(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(otherAssets).where(and(eq(otherAssets.id, id), eq(otherAssets.userId, userId)));
}

// ─── 부동산 ───────────────────────────────────────────────────────────────────
export async function getRealEstates(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(realEstates)
    .where(eq(realEstates.userId, userId))
    .orderBy(realEstates.aptName);
}

export async function createRealEstate(userId: number, data: InsertRealEstate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(realEstates).values({ ...data, userId });
}

export async function updateRealEstate(userId: number, id: number, data: Partial<InsertRealEstate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(realEstates).set(data).where(and(eq(realEstates.id, id), eq(realEstates.userId, userId)));
}

export async function deleteRealEstate(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(realEstates).where(and(eq(realEstates.id, id), eq(realEstates.userId, userId)));
}

// ─── 블로그 체험단 ────────────────────────────────────────────────────────────
export async function getBlogCampaigns(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogCampaigns)
    .where(eq(blogCampaigns.userId, userId))
    .orderBy(desc(blogCampaigns.createdAt));
}

export async function createBlogCampaign(userId: number, data: InsertBlogCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(blogCampaigns).values({ ...data, userId });
}

export async function updateBlogCampaign(userId: number, id: number, data: Partial<InsertBlogCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(blogCampaigns).set(data).where(and(eq(blogCampaigns.id, id), eq(blogCampaigns.userId, userId)));
}

export async function deleteBlogCampaign(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(blogCampaigns).where(and(eq(blogCampaigns.id, id), eq(blogCampaigns.userId, userId)));
}

// ─── 결혼예산 ────────────────────────────────────────────────────────────────
export async function getWeddingBudgetSetting(userId: number) {
  const db = await getDb();
  if (!db) return null;
  await ensureWeddingBudgetTables(db);
  const result = await db.select().from(weddingBudgetSettings)
    .where(eq(weddingBudgetSettings.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertWeddingBudgetSetting(
  userId: number,
  data: Pick<InsertWeddingBudgetSetting, "weddingDate" | "venueName" | "totalBudget" | "note">,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureWeddingBudgetTables(db);
  const current = await getWeddingBudgetSetting(userId);
  if (current) {
    await db.update(weddingBudgetSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(weddingBudgetSettings.id, current.id), eq(weddingBudgetSettings.userId, userId)));
    return;
  }
  await db.insert(weddingBudgetSettings).values({ ...data, userId });
}

export async function listWeddingBudgetItems(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureWeddingBudgetTables(db);
  return db.select().from(weddingBudgetItems)
    .where(eq(weddingBudgetItems.userId, userId))
    .orderBy(desc(weddingBudgetItems.createdAt));
}

export async function createWeddingBudgetItem(userId: number, data: InsertWeddingBudgetItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureWeddingBudgetTables(db);
  await db.insert(weddingBudgetItems).values({ ...data, userId });
}

export async function updateWeddingBudgetItem(userId: number, id: number, data: Partial<InsertWeddingBudgetItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureWeddingBudgetTables(db);
  await db.update(weddingBudgetItems)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(weddingBudgetItems.id, id), eq(weddingBudgetItems.userId, userId)));
}

export async function deleteWeddingBudgetItem(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureWeddingBudgetTables(db);
  await db.delete(weddingBudgetItems).where(and(eq(weddingBudgetItems.id, id), eq(weddingBudgetItems.userId, userId)));
}

// ─── 기능 요청 게시판 ───────────────────────────────────────────────────────
export async function listFeatureRequests() {
  const db = await getDb();
  if (!db) return [];
  await ensureFeatureRequestsTable(db);
  return db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt));
}

export async function createFeatureRequest(
  userId: number,
  data: Pick<InsertFeatureRequest, "title" | "content" | "authorName">,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureFeatureRequestsTable(db);
  await db.insert(featureRequests).values({ ...data, userId });
}

export async function updateFeatureRequestStatus(userId: number, id: number, isDone: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureFeatureRequestsTable(db);
  await db.update(featureRequests)
    .set({
      isDone,
      status: isDone ? "처리완료" : "요청",
      checkedByUserId: isDone ? userId : null,
      checkedAt: isDone ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(featureRequests.id, id));
}

export async function deleteFeatureRequest(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureFeatureRequestsTable(db);
  await db.delete(featureRequests).where(eq(featureRequests.id, id));
}

// ─── 부채 ─────────────────────────────────────────────────────────────────────
export async function getDebts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(debts).where(eq(debts.userId, userId));
}

export async function createDebt(userId: number, data: InsertDebt) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(debts).values({ ...data, userId });
}

export async function updateDebt(userId: number, id: number, data: Partial<InsertDebt>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(debts).set(data).where(and(eq(debts.id, id), eq(debts.userId, userId)));
}

export async function deleteDebt(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, userId)));
}

// ─── 대시보드 집계 ────────────────────────────────────────────────────────────
export async function getDashboardSummary(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [stocks, savings, pension, other, debt] = await Promise.all([
    getStockPortfolio(userId),
    getSavingsAssets(userId),
    getPensionAssets(userId),
    getOtherAssets(userId),
    getDebts(userId),
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
    netAsset: stockTotal + savingsTotal + pensionTotal + otherTotal - debtTotal,
  };
}

// ─── 보유카드 ─────────────────────────────────────────────────────────────────
export async function getCards(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cards)
    .where(eq(cards.userId, userId))
    .orderBy(desc(cards.createdAt));
}

export async function createCard(userId: number, data: InsertCard) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cards).values({ ...data, userId });
}

export async function updateCard(userId: number, id: number, data: Partial<InsertCard>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cards).set(data).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

export async function deleteCard(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

// ─── 포인트/마일리지 ──────────────────────────────────────────────────────────
export async function getCardPoints(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cardPoints)
    .where(eq(cardPoints.userId, userId))
    .orderBy(desc(cardPoints.createdAt));
}

export async function createCardPoint(userId: number, data: InsertCardPoint) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cardPoints).values({ ...data, userId });
}

export async function updateCardPoint(userId: number, id: number, data: Partial<InsertCardPoint>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cardPoints).set(data).where(and(eq(cardPoints.id, id), eq(cardPoints.userId, userId)));
}

export async function deleteCardPoint(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cardPoints).where(and(eq(cardPoints.id, id), eq(cardPoints.userId, userId)));
}

// ─── 구독결제 서비스 ──────────────────────────────────────────────────────────
export async function getSubscriptions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureSubscriptionCategoryValues(db);
  return db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
}

export async function createSubscription(userId: number, data: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureSubscriptionCategoryValues(db);
  await db.insert(subscriptions).values({ ...data, userId });
}

export async function updateSubscription(userId: number, id: number, data: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureSubscriptionCategoryValues(db);
  await db.update(subscriptions).set(data).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}

export async function deleteSubscription(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}

// ─── 부수입 카테고리 ──────────────────────────────────────────────────────────
export async function getSideIncomeCategories(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomeCategories)
    .where(eq(sideIncomeCategories.userId, userId))
    .orderBy(sideIncomeCategories.name);
}
export async function createSideIncomeCategory(userId: number, data: InsertSideIncomeCategory) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(sideIncomeCategories).values({ ...data, userId });
}
export async function updateSideIncomeCategory(userId: number, id: number, data: Partial<InsertSideIncomeCategory>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(sideIncomeCategories)
    .where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)))
    .limit(1);
  await db.update(sideIncomeCategories).set(data).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)));
  if (current && data.name && data.name !== current.name) {
    await db.update(sideIncomes)
      .set({ categoryName: data.name })
      .where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.categoryId, id)));
    await db.update(ledgerEntries)
      .set({ subCategory: data.name })
      .where(and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.subCategory, current.name),
        sql`${ledgerEntries.note} LIKE '[부수입 자동연동]%'`
      ));
  }
}
export async function deleteSideIncomeCategory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(sideIncomeCategories).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)));
}

// ─── 부수입 내역 ──────────────────────────────────────────────────────────────
export async function getSideIncomes(userId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes)
    .where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.year, year), eq(sideIncomes.month, month)))
    .orderBy(desc(sideIncomes.incomeDate));
}

export async function getSideIncomeTotal(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ total: sql<number>`COALESCE(SUM(${sideIncomes.amount}), 0)` })
    .from(sideIncomes)
    .where(eq(sideIncomes.userId, userId));
  return Number(result[0]?.total ?? 0);
}

export async function createSideIncome(userId: number, data: InsertSideIncome) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sideIncomes).values({ ...data, userId }).returning({ id: sideIncomes.id });
  return result;
}
export async function updateSideIncome(userId: number, id: number, data: Partial<InsertSideIncome>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sideIncomes).set(data).where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId)));
}
export async function deleteSideIncome(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [entry] = await db.select().from(sideIncomes)
    .where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId))).limit(1);
  if (entry?.ledgerEntryId) {
    await db.delete(ledgerEntries).where(and(eq(ledgerEntries.id, entry.ledgerEntryId), eq(ledgerEntries.userId, userId)));
  }
  await db.delete(sideIncomes).where(and(eq(sideIncomes.id, id), eq(sideIncomes.userId, userId)));
}
export async function getSideIncomeMonthlySummary(userId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes)
    .where(and(eq(sideIncomes.userId, userId), eq(sideIncomes.year, year)))
    .orderBy(sideIncomes.month, desc(sideIncomes.incomeDate));
}

// ─── 계좌 ─────────────────────────────────────────────────────────────────────
export async function listAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(accounts.createdAt);
}
export async function createAccount(userId: number, data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(accounts).values({ ...data, userId });
}
export async function updateAccount(userId: number, id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(accounts).set(data).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
export async function deleteAccount(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
// ─── 할부 내역 ────────────────────────────────────────────────────────────────
export async function listInstallments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(installments)
    .where(eq(installments.userId, userId))
    .orderBy(desc(installments.createdAt));
}
export async function createInstallment(userId: number, data: InsertInstallment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(installments).values({ ...data, userId }).returning({ id: installments.id });
  return result;
}
export async function updateInstallment(userId: number, id: number, data: Partial<InsertInstallment>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(installments).set(data).where(and(eq(installments.id, id), eq(installments.userId, userId)));
}
export async function deleteInstallment(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(installments).where(and(eq(installments.id, id), eq(installments.userId, userId)));
}

// ─── 카테고리 (대분류 / 중분류) ──────────────────────────────────────────────
export async function listCategories(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const cats = await db.select().from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(categories.sortOrder, categories.createdAt);
  const subs = await db.select().from(subCategories)
    .where(eq(subCategories.userId, userId))
    .orderBy(subCategories.sortOrder, subCategories.createdAt);
  return cats.map((c) => ({
    ...c,
    subCategories: subs.filter((s) => s.categoryId === c.id),
  }));
}
export async function createCategory(userId: number, data: Pick<InsertCategory, "name" | "type" | "sortOrder">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(categories).values({ ...data, userId }).returning({ id: categories.id });
  return result;
}
export async function updateCategory(userId: number, id: number, data: Partial<Pick<InsertCategory, "name" | "type" | "sortOrder">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!current) return;

  await db.update(categories).set(data).where(and(eq(categories.id, id), eq(categories.userId, userId)));

  if (data.name && data.name !== current.name) {
    await db.update(ledgerEntries)
      .set({ mainCategory: data.name })
      .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.mainCategory, current.name)));
    await db.update(fixedExpenses)
      .set({ mainCategory: data.name })
      .where(and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.mainCategory, current.name)));
  }
}
export async function deleteCategory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 중분류도 함께 삭제
  await db.delete(subCategories).where(and(eq(subCategories.categoryId, id), eq(subCategories.userId, userId)));
  return db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
}
export async function createSubCategory(userId: number, data: Pick<InsertSubCategory, "categoryId" | "name" | "sortOrder">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(subCategories).values({ ...data, userId }).returning({ id: subCategories.id });
  return result;
}
export async function updateSubCategory(userId: number, id: number, data: Partial<Pick<InsertSubCategory, "name" | "sortOrder">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(subCategories)
    .where(and(eq(subCategories.id, id), eq(subCategories.userId, userId)))
    .limit(1);
  if (!current) return;
  const [parent] = await db.select().from(categories)
    .where(and(eq(categories.id, current.categoryId), eq(categories.userId, userId)))
    .limit(1);

  await db.update(subCategories).set(data).where(and(eq(subCategories.id, id), eq(subCategories.userId, userId)));

  if (data.name && data.name !== current.name) {
    const ledgerWhere = parent
      ? and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.mainCategory, parent.name), eq(ledgerEntries.subCategory, current.name))
      : and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.subCategory, current.name));
    const fixedWhere = parent
      ? and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.mainCategory, parent.name), eq(fixedExpenses.subCategory, current.name))
      : and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.subCategory, current.name));

    await db.update(ledgerEntries).set({ subCategory: data.name }).where(ledgerWhere);
    await db.update(fixedExpenses).set({ subCategory: data.name }).where(fixedWhere);
  }
}
export async function deleteSubCategory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(subCategories).where(and(eq(subCategories.id, id), eq(subCategories.userId, userId)));
}

// 기본 카테고리 시드 데이터
const DEFAULT_WORK_INCOME_SUB_CATEGORIES = ["월급", "상여", "성과급", "퇴직금"];
const DEFAULT_BUSINESS_INCOME_SUB_CATEGORIES = ["사업소득", "프리랜서", "외주", "정산금"];
const DEFAULT_INVESTMENT_INCOME_SUB_CATEGORIES = ["이자수익", "배당금", "투자수익", "환차익"];
const DEFAULT_OTHER_INCOME_SUB_CATEGORIES = ["부수입", "환급금", "지원금", "중고거래", "기타수입"];
const DEFAULT_INCOME_SUB_CATEGORIES = [
  ...DEFAULT_WORK_INCOME_SUB_CATEGORIES,
  ...DEFAULT_BUSINESS_INCOME_SUB_CATEGORIES,
  ...DEFAULT_INVESTMENT_INCOME_SUB_CATEGORIES,
  ...DEFAULT_OTHER_INCOME_SUB_CATEGORIES,
];

const DEFAULT_CATEGORIES: { name: string; type: "expense" | "income" | "both"; subs: string[] }[] = [
  { name: "고정지출", type: "expense", subs: ["구독서비스", "보험", "모임비"] },
  { name: "사업지출", type: "expense", subs: ["광고"] },
  { name: "식비", type: "expense", subs: ["식료품", "외식", "카페/음료", "배달음식"] },
  { name: "교통/차량", type: "expense", subs: ["대중교통", "택시", "주유", "주차", "톨비", "차량유지"] },
  { name: "주거/통신", type: "expense", subs: ["월세/관리비", "전기/가스/수도", "인터넷/통신"] },
  { name: "의료/건강", type: "expense", subs: ["병원", "약국", "헬스/운동", "건강식품"] },
  { name: "쇼핑/의류", type: "expense", subs: ["의류/잡화", "전자제품", "생활용품", "온라인쇼핑"] },
  { name: "문화/여가", type: "expense", subs: ["영화/공연", "여행", "취미"] },
  { name: "교육", type: "expense", subs: ["학원/강의", "도서", "온라인강의"] },
  { name: "금융", type: "expense", subs: ["이체/송금", "수수료", "세금", "빌린돈상환"] },
  { name: "기타지출", type: "expense", subs: ["경조사", "기부", "기타"] },
  { name: "근로소득", type: "income", subs: DEFAULT_WORK_INCOME_SUB_CATEGORIES },
  { name: "사업소득", type: "income", subs: DEFAULT_BUSINESS_INCOME_SUB_CATEGORIES },
  { name: "투자소득", type: "income", subs: DEFAULT_INVESTMENT_INCOME_SUB_CATEGORIES },
  { name: "기타소득", type: "income", subs: DEFAULT_OTHER_INCOME_SUB_CATEGORIES },
];

const CANONICAL_SUB_NAMES = new Set([
  "구독서비스",
  "보험",
  "모임비",
  "광고",
  "급여",
  ...DEFAULT_INCOME_SUB_CATEGORIES,
]);

export async function seedDefaultCategories(userId: number) {
  const db = await getDb();
  if (!db) return;

  await ensureDefaultCategorySet(userId);
}

export async function ensureDefaultCategorySet(userId: number) {
  const db = await getDb();
  if (!db) return;

  const [workIncomeCategory] = await db.select().from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, "근로소득")))
    .limit(1);

  for (const legacyName of ["수입", "소득"]) {
    const [legacyIncome] = await db.select().from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.name, legacyName)))
      .limit(1);
    if (!legacyIncome) continue;

    const [targetIncome] = workIncomeCategory
      ? [workIncomeCategory]
      : await db.select().from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.name, "근로소득")))
        .limit(1);

    if (!targetIncome) {
      await db.update(categories)
        .set({ name: "근로소득", type: "income" })
        .where(and(eq(categories.id, legacyIncome.id), eq(categories.userId, userId)));
    } else {
      await db.update(subCategories)
        .set({ categoryId: targetIncome.id })
        .where(and(eq(subCategories.categoryId, legacyIncome.id), eq(subCategories.userId, userId)));
      await db.delete(categories)
        .where(and(eq(categories.id, legacyIncome.id), eq(categories.userId, userId)));
    }
  }

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    const [existingCategory] = await db.select().from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.name, cat.name)))
      .limit(1);

    let categoryId = existingCategory?.id;
    if (categoryId) {
      await db.update(categories)
        .set({ type: cat.type, sortOrder: i })
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    } else {
      const [result] = await db.insert(categories).values({ name: cat.name, type: cat.type, sortOrder: i, userId }).returning({ id: categories.id });
      categoryId = result.id;
    }

    for (let j = 0; j < cat.subs.length; j++) {
      const subName = cat.subs[j];
      const existingUnderCategory = await db.select().from(subCategories)
        .where(and(eq(subCategories.userId, userId), eq(subCategories.categoryId, categoryId), eq(subCategories.name, subName)))
        .limit(1);

      if (existingUnderCategory.length > 0) {
        await db.update(subCategories)
          .set({ sortOrder: j })
          .where(and(eq(subCategories.userId, userId), eq(subCategories.categoryId, categoryId), eq(subCategories.name, subName)));
        continue;
      }

      if (CANONICAL_SUB_NAMES.has(subName)) {
        const existingByName = await db.select().from(subCategories)
          .where(and(eq(subCategories.userId, userId), eq(subCategories.name, subName)))
          .limit(1);

        if (existingByName.length > 0) {
          await db.update(subCategories)
            .set({ categoryId, sortOrder: j })
            .where(and(eq(subCategories.userId, userId), eq(subCategories.name, subName)));
          continue;
        }
      }

      await db.insert(subCategories).values({ categoryId, name: subName, sortOrder: j, userId });
    }
  }
}

export async function ensureFixedExpenseCategory(userId: number) {
  const db = await getDb();
  if (!db) return;

  const [fixed] = await db.select().from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, "고정지출")))
    .limit(1);

  let fixedId = fixed?.id;
  if (!fixedId) {
    const [result] = await db.insert(categories).values({ name: "고정지출", type: "expense", sortOrder: 0, userId }).returning({ id: categories.id });
    fixedId = result.id;
  }

  const fixedSubNames = ["구독서비스", "보험"];
  for (let sortOrder = 0; sortOrder < fixedSubNames.length; sortOrder++) {
    const name = fixedSubNames[sortOrder];
    const existing = await db.select().from(subCategories)
      .where(and(eq(subCategories.userId, userId), eq(subCategories.name, name)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(subCategories)
        .set({ categoryId: fixedId, sortOrder })
        .where(and(eq(subCategories.userId, userId), eq(subCategories.name, name)));
    } else {
      await db.insert(subCategories).values({ categoryId: fixedId, name, sortOrder, userId });
    }
  }
}

export async function ensureBusinessExpenseCategory(userId: number) {
  const db = await getDb();
  if (!db) return;

  const [business] = await db.select().from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, "사업지출")))
    .limit(1);

  let businessId = business?.id;
  if (!businessId) {
    const [result] = await db.insert(categories).values({ name: "사업지출", type: "expense", sortOrder: 1, userId }).returning({ id: categories.id });
    businessId = result.id;
  }

  const existing = await db.select().from(subCategories)
    .where(and(eq(subCategories.userId, userId), eq(subCategories.name, "광고")))
    .limit(1);

  if (existing.length > 0) {
    await db.update(subCategories)
      .set({ categoryId: businessId, sortOrder: 0 })
      .where(and(eq(subCategories.userId, userId), eq(subCategories.name, "광고")));
  } else {
    await db.insert(subCategories).values({ categoryId: businessId, name: "광고", sortOrder: 0, userId });
  }
}

export async function ensureIncomeCategory(userId: number) {
  await ensureDefaultCategorySet(userId);
}

// ─── 보험 ─────────────────────────────────────────────────────────────────────
export async function listInsurance(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(insurance).where(eq(insurance.userId, userId)).orderBy(desc(insurance.createdAt));
}

export async function createInsurance(userId: number, data: Omit<InsertInsurance, "userId" | "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(insurance).values({ ...data, userId });
  const result = await db.select().from(insurance).where(eq(insurance.userId, userId)).orderBy(desc(insurance.createdAt)).limit(1);
  return result[0];
}

export async function updateInsurance(userId: number, id: number, data: Partial<Omit<InsertInsurance, "userId" | "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(insurance).set(data).where(and(eq(insurance.id, id), eq(insurance.userId, userId)));
  const result = await db.select().from(insurance).where(eq(insurance.id, id)).limit(1);
  return result[0];
}

export async function deleteInsurance(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(insurance).where(and(eq(insurance.id, id), eq(insurance.userId, userId)));
  return { id };
}

// ─── 사업소득 ─────────────────────────────────────────────────────────────────
export async function listBusinessIncomes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businessIncomes).where(eq(businessIncomes.userId, userId)).orderBy(desc(businessIncomes.createdAt));
}

export async function getBusinessIncome(userId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(businessIncomes)
    .where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId))).limit(1);
  return result[0] ?? null;
}

export async function createBusinessIncome(userId: number, data: Omit<InsertBusinessIncome, "userId" | "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(businessIncomes).values({ ...data, userId });
  const result = await db.select().from(businessIncomes).where(eq(businessIncomes.userId, userId)).orderBy(desc(businessIncomes.createdAt)).limit(1);
  return result[0];
}

export async function updateBusinessIncome(userId: number, id: number, data: Partial<Omit<InsertBusinessIncome, "userId" | "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(businessIncomes).set(data).where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId)));
  const result = await db.select().from(businessIncomes).where(eq(businessIncomes.id, id)).limit(1);
  return result[0];
}

export async function deleteBusinessIncome(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(businessIncomes).where(and(eq(businessIncomes.id, id), eq(businessIncomes.userId, userId)));
  return { id };
}

// ─── 사업비용 ─────────────────────────────────────────────────────────────────
export async function listBusinessExpenses(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businessExpenses)
    .where(eq(businessExpenses.userId, userId))
    .orderBy(desc(businessExpenses.expenseDate), desc(businessExpenses.createdAt));
}

export async function getBusinessExpense(userId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(businessExpenses)
    .where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createBusinessExpense(userId: number, data: Omit<InsertBusinessExpense, "userId" | "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(businessExpenses).values({ ...data, userId });
  const result = await db.select().from(businessExpenses)
    .where(eq(businessExpenses.userId, userId))
    .orderBy(desc(businessExpenses.createdAt))
    .limit(1);
  return result[0];
}

export async function updateBusinessExpense(userId: number, id: number, data: Partial<Omit<InsertBusinessExpense, "userId" | "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(businessExpenses).set(data).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)));
  const result = await db.select().from(businessExpenses).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId))).limit(1);
  return result[0];
}

export async function deleteBusinessExpense(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(businessExpenses).where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)));
  return { id };
}

// ─── 인건비 ───────────────────────────────────────────────────────────────────
export async function listLaborCosts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(laborCosts)
    .where(eq(laborCosts.userId, userId))
    .orderBy(desc(laborCosts.paymentDate), desc(laborCosts.createdAt));
}

function laborExpenseDescription(name: string, desc: string | null | undefined) {
  return desc ? `${name} 인건비 (${desc})` : `${name} 인건비`;
}

export async function createLaborCost(userId: number, data: Omit<InsertLaborCost, "userId" | "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let linkedExpenseId: number | undefined;
  if (data.paymentDate && data.netAmount) {
    const [y, m] = data.paymentDate.split("-").map(Number);
    const expDesc = laborExpenseDescription(data.freelancerName, data.description as string | null);
    await db.insert(businessExpenses).values({
      userId, expenseDate: data.paymentDate as unknown as string,
      year: y, month: m, category: "인건비",
      vendor: data.freelancerName, description: expDesc,
      amount: data.netAmount, isTaxDeductible: true,
    });
    const exp = await db.select().from(businessExpenses)
      .where(eq(businessExpenses.userId, userId))
      .orderBy(desc(businessExpenses.createdAt)).limit(1);
    linkedExpenseId = exp[0]?.id;
  }

  await db.insert(laborCosts).values({ ...data, userId, linkedExpenseId });
  const result = await db.select().from(laborCosts)
    .where(eq(laborCosts.userId, userId))
    .orderBy(desc(laborCosts.createdAt)).limit(1);
  return result[0];
}

export async function updateLaborCost(userId: number, id: number, data: Partial<Omit<InsertLaborCost, "userId" | "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const current = await db.select().from(laborCosts)
    .where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  const cur = current[0];
  if (!cur) throw new Error("Not found");

  const newPaymentDate = "paymentDate" in data ? data.paymentDate : cur.paymentDate;
  const newNetAmount = "netAmount" in data ? data.netAmount : cur.netAmount;
  const newName = "freelancerName" in data ? data.freelancerName! : cur.freelancerName;
  const newDesc = "description" in data ? data.description : cur.description;

  let linkedExpenseId = cur.linkedExpenseId;

  if (newPaymentDate && newNetAmount) {
    const [y, m] = newPaymentDate.split("-").map(Number);
    const expDesc = laborExpenseDescription(newName, newDesc as string | null);
    if (linkedExpenseId) {
      await db.update(businessExpenses).set({
        expenseDate: newPaymentDate as unknown as string, year: y, month: m,
        vendor: newName, description: expDesc, amount: newNetAmount,
      }).where(and(eq(businessExpenses.id, linkedExpenseId), eq(businessExpenses.userId, userId)));
    } else {
      await db.insert(businessExpenses).values({
        userId, expenseDate: newPaymentDate as unknown as string,
        year: y, month: m, category: "인건비",
        vendor: newName, description: expDesc,
        amount: newNetAmount, isTaxDeductible: true,
      });
      const exp = await db.select().from(businessExpenses)
        .where(eq(businessExpenses.userId, userId))
        .orderBy(desc(businessExpenses.createdAt)).limit(1);
      linkedExpenseId = exp[0]?.id;
    }
  } else if (!newPaymentDate && linkedExpenseId) {
    await db.delete(businessExpenses).where(and(eq(businessExpenses.id, linkedExpenseId), eq(businessExpenses.userId, userId)));
    linkedExpenseId = null;
  }

  await db.update(laborCosts).set({ ...data, linkedExpenseId })
    .where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId)));
  const result = await db.select().from(laborCosts)
    .where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  return result[0];
}

export async function deleteLaborCost(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const current = await db.select().from(laborCosts)
    .where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId))).limit(1);
  if (current[0]?.linkedExpenseId) {
    await db.delete(businessExpenses).where(
      and(eq(businessExpenses.id, current[0].linkedExpenseId), eq(businessExpenses.userId, userId))
    );
  }
  await db.delete(laborCosts).where(and(eq(laborCosts.id, id), eq(laborCosts.userId, userId)));
  return { id };
}
