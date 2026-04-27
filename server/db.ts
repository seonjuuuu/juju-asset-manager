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
export async function getLedgerEntries(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.year, year), eq(ledgerEntries.month, month)))
    .orderBy(ledgerEntries.entryDate);
}

export async function getLedgerMonthSummary(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      mainCategory: ledgerEntries.mainCategory,
      total: sql<number>`SUM(${ledgerEntries.amount})`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.year, year), eq(ledgerEntries.month, month)))
    .groupBy(ledgerEntries.mainCategory);
}

export async function getYearlySummary(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      month: ledgerEntries.month,
      mainCategory: ledgerEntries.mainCategory,
      total: sql<number>`SUM(${ledgerEntries.amount})`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.year, year))
    .groupBy(ledgerEntries.month, ledgerEntries.mainCategory)
    .orderBy(ledgerEntries.month);
}

export async function createLedgerEntry(data: InsertLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(ledgerEntries).values(data);
}

export async function updateLedgerEntry(id: number, data: Partial<InsertLedgerEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ledgerEntries).set(data).where(eq(ledgerEntries.id, id));
}

export async function deleteLedgerEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ledgerEntries).where(eq(ledgerEntries.id, id));
}

// ─── 고정지출 ─────────────────────────────────────────────────────────────────
export async function getFixedExpenses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fixedExpenses).where(eq(fixedExpenses.isActive, true)).orderBy(fixedExpenses.mainCategory);
}

export async function createFixedExpense(data: InsertFixedExpense) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(fixedExpenses).values(data);
}

export async function updateFixedExpense(id: number, data: Partial<InsertFixedExpense>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set(data).where(eq(fixedExpenses.id, id));
}

export async function deleteFixedExpense(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fixedExpenses).set({ isActive: false }).where(eq(fixedExpenses.id, id));
}

// ─── 주식 포트폴리오 ──────────────────────────────────────────────────────────
export async function getStockPortfolio(snapshotMonth?: string) {
  const db = await getDb();
  if (!db) return [];
  if (snapshotMonth) {
    return db.select().from(stockPortfolio).where(eq(stockPortfolio.snapshotMonth, snapshotMonth));
  }
  // 최신 스냅샷 월 조회
  const latest = await db
    .select({ snapshotMonth: stockPortfolio.snapshotMonth })
    .from(stockPortfolio)
    .orderBy(desc(stockPortfolio.snapshotMonth))
    .limit(1);
  if (latest.length === 0) return [];
  return db
    .select()
    .from(stockPortfolio)
    .where(eq(stockPortfolio.snapshotMonth, latest[0].snapshotMonth!));
}

export async function createStockEntry(data: InsertStockPortfolio) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(stockPortfolio).values(data);
}

export async function updateStockEntry(id: number, data: Partial<InsertStockPortfolio>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(stockPortfolio).set(data).where(eq(stockPortfolio.id, id));
}

export async function deleteStockEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(stockPortfolio).where(eq(stockPortfolio.id, id));
}

// ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
export async function getSavingsAssets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savingsAssets).where(eq(savingsAssets.isActive, true)).orderBy(savingsAssets.category);
}

export async function createSavingsAsset(data: InsertSavingsAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(savingsAssets).values(data);
}

export async function updateSavingsAsset(id: number, data: Partial<InsertSavingsAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set(data).where(eq(savingsAssets.id, id));
}

export async function deleteSavingsAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savingsAssets).set({ isActive: false }).where(eq(savingsAssets.id, id));
}

// ─── 연금 ─────────────────────────────────────────────────────────────────────
export async function getPensionAssets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pensionAssets).orderBy(pensionAssets.pensionType);
}

export async function createPensionAsset(data: InsertPensionAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pensionAssets).values(data);
}

export async function updatePensionAsset(id: number, data: Partial<InsertPensionAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pensionAssets).set(data).where(eq(pensionAssets.id, id));
}

export async function deletePensionAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pensionAssets).where(eq(pensionAssets.id, id));
}

// ─── 기타 자산 ────────────────────────────────────────────────────────────────
export async function getOtherAssets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(otherAssets);
}

export async function createOtherAsset(data: InsertOtherAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(otherAssets).values(data);
}

export async function updateOtherAsset(id: number, data: Partial<InsertOtherAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(otherAssets).set(data).where(eq(otherAssets.id, id));
}

export async function deleteOtherAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(otherAssets).where(eq(otherAssets.id, id));
}

// ─── 부동산 ───────────────────────────────────────────────────────────────────
export async function getRealEstates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(realEstates).orderBy(realEstates.aptName);
}

export async function createRealEstate(data: InsertRealEstate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(realEstates).values(data);
}

export async function updateRealEstate(id: number, data: Partial<InsertRealEstate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(realEstates).set(data).where(eq(realEstates.id, id));
}

export async function deleteRealEstate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(realEstates).where(eq(realEstates.id, id));
}

// ─── 블로그 체험단 ────────────────────────────────────────────────────────────
export async function getBlogCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogCampaigns).orderBy(desc(blogCampaigns.createdAt));
}

export async function createBlogCampaign(data: InsertBlogCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(blogCampaigns).values(data);
}

export async function updateBlogCampaign(id: number, data: Partial<InsertBlogCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(blogCampaigns).set(data).where(eq(blogCampaigns.id, id));
}

export async function deleteBlogCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(blogCampaigns).where(eq(blogCampaigns.id, id));
}

// ─── 부채 ─────────────────────────────────────────────────────────────────────
export async function getDebts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(debts);
}

export async function createDebt(data: InsertDebt) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(debts).values(data);
}

export async function updateDebt(id: number, data: Partial<InsertDebt>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(debts).set(data).where(eq(debts.id, id));
}

export async function deleteDebt(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(debts).where(eq(debts.id, id));
}

// ─── 대시보드 집계 ────────────────────────────────────────────────────────────
export async function getDashboardSummary() {
  const db = await getDb();
  if (!db) return null;

  const [stocks, savings, pension, other, debt] = await Promise.all([
    getStockPortfolio(),
    getSavingsAssets(),
    getPensionAssets(),
    getOtherAssets(),
    getDebts(),
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
export async function getCards() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cards).orderBy(desc(cards.createdAt));
}

export async function createCard(data: InsertCard) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cards).values(data);
}

export async function updateCard(id: number, data: Partial<InsertCard>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cards).set(data).where(eq(cards.id, id));
}

export async function deleteCard(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cards).where(eq(cards.id, id));
}

// ─── 포인트/마일리지 ──────────────────────────────────────────────────────────
export async function getCardPoints() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cardPoints).orderBy(desc(cardPoints.createdAt));
}

export async function createCardPoint(data: InsertCardPoint) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cardPoints).values(data);
}

export async function updateCardPoint(id: number, data: Partial<InsertCardPoint>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cardPoints).set(data).where(eq(cardPoints.id, id));
}

export async function deleteCardPoint(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cardPoints).where(eq(cardPoints.id, id));
}

// ─── 구독결제 서비스 ──────────────────────────────────────────────────────────
export async function getSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
}

export async function createSubscription(data: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(subscriptions).values(data);
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

export async function deleteSubscription(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
}

// ─── 부수입 카테고리 ──────────────────────────────────────────────────────────
export async function getSideIncomeCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomeCategories).orderBy(sideIncomeCategories.name);
}
export async function createSideIncomeCategory(data: InsertSideIncomeCategory) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(sideIncomeCategories).values(data);
}
export async function updateSideIncomeCategory(id: number, data: Partial<InsertSideIncomeCategory>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sideIncomeCategories).set(data).where(eq(sideIncomeCategories.id, id));
}
export async function deleteSideIncomeCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(sideIncomeCategories).where(eq(sideIncomeCategories.id, id));
}

// ─── 부수입 내역 ──────────────────────────────────────────────────────────────
export async function getSideIncomes(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes)
    .where(and(eq(sideIncomes.year, year), eq(sideIncomes.month, month)))
    .orderBy(desc(sideIncomes.incomeDate));
}
export async function createSideIncome(data: InsertSideIncome) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sideIncomes).values(data).$returningId();
  return result;
}
export async function updateSideIncome(id: number, data: Partial<InsertSideIncome>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sideIncomes).set(data).where(eq(sideIncomes.id, id));
}
export async function deleteSideIncome(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 연결된 가계부 항목도 삭제
  const [entry] = await db.select().from(sideIncomes).where(eq(sideIncomes.id, id)).limit(1);
  if (entry?.ledgerEntryId) {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.id, entry.ledgerEntryId));
  }
  await db.delete(sideIncomes).where(eq(sideIncomes.id, id));
}
export async function getSideIncomeMonthlySummary(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sideIncomes)
    .where(eq(sideIncomes.year, year))
    .orderBy(sideIncomes.month, desc(sideIncomes.incomeDate));
}

// ─── 계좌 ─────────────────────────────────────────────────────────────────────
export async function listAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts).orderBy(accounts.createdAt);
}
export async function createAccount(data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(accounts).values(data);
}
export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(accounts).set(data).where(eq(accounts.id, id));
}
export async function deleteAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(accounts).where(eq(accounts.id, id));
}

