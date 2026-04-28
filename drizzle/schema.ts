import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  birthDate: varchar("birth_date", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 가계부 ───────────────────────────────────────────────────────────────────
export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  entryDate: date("entry_date").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  mainCategory: varchar("main_category", { length: 50 }).notNull(),
  subCategory: varchar("sub_category", { length: 100 }),
  description: text("description"),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntries.$inferInsert;

// ─── 고정지출 ─────────────────────────────────────────────────────────────────
export const fixedExpenses = mysqlTable("fixed_expenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  mainCategory: varchar("main_category", { length: 100 }).notNull(),
  subCategory: varchar("sub_category", { length: 100 }),
  description: varchar("description", { length: 300 }),
  paymentAccount: varchar("payment_account", { length: 100 }),
  monthlyAmount: bigint("monthly_amount", { mode: "number" }).notNull().default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }),
  startDate: varchar("start_date", { length: 50 }),
  expiryDate: varchar("expiry_date", { length: 50 }),
  paymentDay: int("payment_day"),
  note: text("note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FixedExpense = typeof fixedExpenses.$inferSelect;
export type InsertFixedExpense = typeof fixedExpenses.$inferInsert;

// ─── 주식 포트폴리오 ──────────────────────────────────────────────────────────
export const stockPortfolio = mysqlTable("stock_portfolio", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockPortfolio = typeof stockPortfolio.$inferSelect;
export type InsertStockPortfolio = typeof stockPortfolio.$inferInsert;

// ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
export const savingsAssets = mysqlTable("savings_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavingsAsset = typeof savingsAssets.$inferSelect;
export type InsertSavingsAsset = typeof savingsAssets.$inferInsert;

// ─── 연금 ─────────────────────────────────────────────────────────────────────
export const pensionAssets = mysqlTable("pension_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PensionAsset = typeof pensionAssets.$inferSelect;
export type InsertPensionAsset = typeof pensionAssets.$inferInsert;

// ─── 기타 자산 ────────────────────────────────────────────────────────────────
export const otherAssets = mysqlTable("other_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  category: varchar("category", { length: 100 }).notNull(),
  monthlyDeposit: bigint("monthly_deposit", { mode: "number" }).default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OtherAsset = typeof otherAssets.$inferSelect;
export type InsertOtherAsset = typeof otherAssets.$inferInsert;

// ─── 부동산 ───────────────────────────────────────────────────────────────────
export const realEstates = mysqlTable("real_estates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  district: varchar("district", { length: 100 }),
  dong: varchar("dong", { length: 100 }),
  aptName: varchar("apt_name", { length: 100 }).notNull(),
  builtYear: varchar("built_year", { length: 20 }),
  households: int("households"),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RealEstate = typeof realEstates.$inferSelect;
export type InsertRealEstate = typeof realEstates.$inferInsert;

// ─── 블로그 체험단 ────────────────────────────────────────────────────────────
export const blogCampaigns = mysqlTable("blog_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogCampaign = typeof blogCampaigns.$inferSelect;
export type InsertBlogCampaign = typeof blogCampaigns.$inferInsert;

// ─── 부채 ─────────────────────────────────────────────────────────────────────
export const debts = mysqlTable("debts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Debt = typeof debts.$inferSelect;
export type InsertDebt = typeof debts.$inferInsert;

// ─── 보유카드 ─────────────────────────────────────────────────────────────────
export const cards = mysqlTable("cards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  cardType: mysqlEnum("card_type", ["신용카드", "체크카드"]).notNull().default("신용카드"),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

// ─── 포인트/마일리지 ──────────────────────────────────────────────────────────
export const cardPoints = mysqlTable("card_points", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  benefits: text("benefits"),
  balance: bigint("balance", { mode: "number" }).default(0),
  purpose: varchar("purpose", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CardPoint = typeof cardPoints.$inferSelect;
export type InsertCardPoint = typeof cardPoints.$inferInsert;

// ─── 구독결제 서비스 ──────────────────────────────────────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  category: mysqlEnum("category", ["비즈니스", "미디어", "자기계발", "기타"]).notNull().default("기타"),
  billingCycle: mysqlEnum("billing_cycle", ["매달", "매주", "매일", "매년"]).notNull().default("매달"),
  price: bigint("price", { mode: "number" }).notNull().default(0),
  sharedCount: int("shared_count").notNull().default(1),
  billingDay: int("billing_day"),
  startDate: varchar("start_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 200 }),
  note: text("note"),
  isPaused: boolean("is_paused").notNull().default(false),
  /** 일시정지 적용 시작일 (YYYY-MM-DD). 이 날짜 이후의 해당월 결제분은 가계부에서 제외 */
  pausedFrom: varchar("paused_from", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── 부수입 카테고리 ──────────────────────────────────────────────────────────
export const sideIncomeCategories = mysqlTable("side_income_categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#5b7cfa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SideIncomeCategory = typeof sideIncomeCategories.$inferSelect;
export type InsertSideIncomeCategory = typeof sideIncomeCategories.$inferInsert;

// ─── 부수입 내역 ──────────────────────────────────────────────────────────────
export const sideIncomes = mysqlTable("side_incomes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  incomeDate: date("income_date").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  categoryId: int("category_id"),
  categoryName: varchar("category_name", { length: 100 }),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  description: varchar("description", { length: 300 }),
  isRegular: boolean("is_regular").notNull().default(false),
  note: text("note"),
  ledgerEntryId: int("ledger_entry_id"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SideIncome = typeof sideIncomes.$inferSelect;
export type InsertSideIncome = typeof sideIncomes.$inferInsert;

// ─── 사업소득 ─────────────────────────────────────────────────────────────────
export const businessIncomes = mysqlTable("business_incomes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientType: mysqlEnum("client_type", ["회사", "개인"]),
  depositorName: varchar("depositor_name", { length: 100 }),
  phoneNumber: varchar("phone_number", { length: 30 }),
  workAmount: bigint("work_amount", { mode: "number" }).notNull().default(0),
  depositPercent: int("deposit_percent").notNull().default(50),
  workStartDate: varchar("work_start_date", { length: 20 }),
  isCompleted: boolean("is_completed").notNull().default(false),
  settlementDate: varchar("settlement_date", { length: 20 }),
  cashReceiptDone: boolean("cash_receipt_done").notNull().default(false),
  depositLedgerEntryId: int("deposit_ledger_entry_id"),
  balanceLedgerEntryId: int("balance_ledger_entry_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BusinessIncome = typeof businessIncomes.$inferSelect;
export type InsertBusinessIncome = typeof businessIncomes.$inferInsert;

// ─── 사업비용 ─────────────────────────────────────────────────────────────────
export const businessExpenses = mysqlTable("business_expenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  expenseDate: date("expense_date").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  category: mysqlEnum("category", ["광고", "대납", "세금", "수수료", "소모품", "기타"]).notNull().default("기타"),
  vendor: varchar("vendor", { length: 200 }),
  description: varchar("description", { length: 300 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  paymentMethod: varchar("payment_method", { length: 200 }),
  isTaxDeductible: boolean("is_tax_deductible").notNull().default(true),
  ledgerEntryId: int("ledger_entry_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type InsertBusinessExpense = typeof businessExpenses.$inferInsert;

// ─── 보유 계좌 ────────────────────────────────────────────────────────────────
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountType: mysqlEnum("account_type", ["입출금", "저축", "CMA", "파킹통장", "청약", "기타"]).notNull().default("입출금"),
  accountNumber: varchar("account_number", { length: 100 }),
  accountHolder: varchar("account_holder", { length: 100 }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  interestRate: varchar("interest_rate", { length: 20 }),
  linkedCard: varchar("linked_card", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

// ─── 할부 내역 ────────────────────────────────────────────────────────────────
export const installments = mysqlTable("installments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  cardId: int("card_id"),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
  months: int("months").notNull().default(1),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  isInterestFree: boolean("is_interest_free").notNull().default(true),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }).default("0"),
  categoryId: int("category_id"),
  subCategoryId: int("sub_category_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Installment = typeof installments.$inferSelect;
export type InsertInstallment = typeof installments.$inferInsert;

// ─── 보험 ─────────────────────────────────────────────────────────────────────
export const insurance = mysqlTable("insurance", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 200 }),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }),
  insuranceType: mysqlEnum("insurance_type", ["보장형", "저축형"]),
  renewalType: mysqlEnum("renewal_type", ["비갱신형", "갱신형"]).notNull().default("비갱신형"),
  renewalCycleYears: int("renewal_cycle_years"),
  paymentType: mysqlEnum("payment_type", ["monthly", "annual"]).notNull().default("monthly"),
  paymentDay: int("payment_day"),
  paymentAmount: bigint("payment_amount", { mode: "number" }).notNull().default(0),
  durationYears: int("duration_years"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InsuranceRecord = typeof insurance.$inferSelect;
export type InsertInsurance = typeof insurance.$inferInsert;

// ─── 카테고리 (대분류 / 중분류) ──────────────────────────────────────────────
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["expense", "income", "both"]).notNull().default("expense"),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export const subCategories = mysqlTable("sub_categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().default(0),
  categoryId: int("category_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SubCategory = typeof subCategories.$inferSelect;
export type InsertSubCategory = typeof subCategories.$inferInsert;
