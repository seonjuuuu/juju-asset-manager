import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  blogCampaigns,
  cards,
  cardPoints,
  debts,
  fixedExpenses,
  InsertBlogCampaign,
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
  InsertSubscription,
  ledgerEntries,
  otherAssets,
  pensionAssets,
  realEstates,
  savingsAssets,
  stockPortfolio,
  subscriptions,
  sideIncomeCategories,
  sideIncomes,
  InsertSideIncomeCategory,
  InsertSideIncome,
  accounts,
  InsertAccount,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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

export async function createLedgerEntry(userId: number, data: InsertLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(ledgerEntries).values({ ...data, userId });
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
  return db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
}

export async function createSubscription(userId: number, data: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(subscriptions).values({ ...data, userId });
}

export async function updateSubscription(userId: number, id: number, data: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
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
  await db.update(sideIncomeCategories).set(data).where(and(eq(sideIncomeCategories.id, id), eq(sideIncomeCategories.userId, userId)));
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
export async function createSideIncome(userId: number, data: InsertSideIncome) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sideIncomes).values({ ...data, userId }).$returningId();
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
