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
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const cardTypeEnum = pgEnum("card_type", ["신용카드", "체크카드"]);
export const subscriptionCategoryEnum = pgEnum("subscription_category", ["비즈니스", "미디어", "자기계발", "쇼핑", "기타"]);
export const billingCycleEnum = pgEnum("billing_cycle", ["매달", "매주", "매일", "매년"]);
export const accountTypeEnum = pgEnum("account_type", ["입출금", "저축", "CMA", "파킹통장", "청약", "기타"]);
export const insuranceTypeEnum = pgEnum("insurance_type", ["보장형", "저축형"]);
export const renewalTypeEnum = pgEnum("renewal_type", ["비갱신형", "갱신형"]);
export const paymentTypeEnum = pgEnum("payment_type", ["monthly", "annual"]);
export const categoryTypeEnum = pgEnum("category_type", ["expense", "income", "both"]);
export const clientTypeEnum = pgEnum("client_type", ["회사", "개인"]);
export const businessExpenseCategoryEnum = pgEnum("business_expense_category", ["광고", "대납", "세금", "수수료", "소모품", "인건비", "기타"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  birthDate: varchar("birth_date", { length: 20 }),
  /** JSON: { realEstate, blogCampaigns, weddingBudget, businessIncome } — false면 사이드바 기록 메뉴에서 숨김 */
  navPreferences: text("nav_preferences"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 가계부 ───────────────────────────────────────────────────────────────────
export const ledgerEntries = pgTable("ledger_entries", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntries.$inferInsert;

// ─── 고정지출 ─────────────────────────────────────────────────────────────────
export const fixedExpenses = pgTable("fixed_expenses", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type FixedExpense = typeof fixedExpenses.$inferSelect;
export type InsertFixedExpense = typeof fixedExpenses.$inferInsert;

// ─── 주식 포트폴리오 ──────────────────────────────────────────────────────────
export const stockPortfolio = pgTable("stock_portfolio", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type StockPortfolio = typeof stockPortfolio.$inferSelect;
export type InsertStockPortfolio = typeof stockPortfolio.$inferInsert;

// ─── 사용자별 메모 ─────────────────────────────────────────────────────────────
export const userMemos = pgTable("user_memos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  memoKey: varchar("memo_key", { length: 100 }).notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userMemoKeyIdx: uniqueIndex("user_memos_user_id_memo_key_idx").on(table.userId, table.memoKey),
}));

export type UserMemo = typeof userMemos.$inferSelect;
export type InsertUserMemo = typeof userMemos.$inferInsert;

// ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
export const savingsAssets = pgTable("savings_assets", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SavingsAsset = typeof savingsAssets.$inferSelect;
export type InsertSavingsAsset = typeof savingsAssets.$inferInsert;

// ─── 연금 ─────────────────────────────────────────────────────────────────────
export const pensionAssets = pgTable("pension_assets", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PensionAsset = typeof pensionAssets.$inferSelect;
export type InsertPensionAsset = typeof pensionAssets.$inferInsert;

// ─── 기타 자산 ────────────────────────────────────────────────────────────────
export const otherAssets = pgTable("other_assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  category: varchar("category", { length: 100 }).notNull(),
  monthlyDeposit: bigint("monthly_deposit", { mode: "number" }).default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type OtherAsset = typeof otherAssets.$inferSelect;
export type InsertOtherAsset = typeof otherAssets.$inferInsert;

// ─── 부동산 ───────────────────────────────────────────────────────────────────
export const realEstates = pgTable("real_estates", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RealEstate = typeof realEstates.$inferSelect;
export type InsertRealEstate = typeof realEstates.$inferInsert;

// ─── 블로그 체험단 ────────────────────────────────────────────────────────────
export const blogCampaigns = pgTable("blog_campaigns", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BlogCampaign = typeof blogCampaigns.$inferSelect;
export type InsertBlogCampaign = typeof blogCampaigns.$inferInsert;

// ─── 결혼예산 ────────────────────────────────────────────────────────────────
export const weddingBudgetSettings = pgTable("wedding_budget_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  weddingDate: varchar("wedding_date", { length: 20 }),
  venueName: varchar("venue_name", { length: 200 }),
  totalBudget: bigint("total_budget", { mode: "number" }).notNull().default(0),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  weddingBudgetUserIdx: uniqueIndex("wedding_budget_settings_user_id_idx").on(table.userId),
}));

export type WeddingBudgetSetting = typeof weddingBudgetSettings.$inferSelect;
export type InsertWeddingBudgetSetting = typeof weddingBudgetSettings.$inferInsert;

export const weddingBudgetItems = pgTable("wedding_budget_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  category: varchar("category", { length: 100 }).notNull(),
  itemName: varchar("item_name", { length: 200 }).notNull(),
  vendorName: varchar("vendor_name", { length: 200 }),
  estimatedAmount: bigint("estimated_amount", { mode: "number" }).notNull().default(0),
  contractAmount: bigint("contract_amount", { mode: "number" }).notNull().default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
  dueDate: varchar("due_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 200 }),
  status: varchar("status", { length: 50 }).notNull().default("견적"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WeddingBudgetItem = typeof weddingBudgetItems.$inferSelect;
export type InsertWeddingBudgetItem = typeof weddingBudgetItems.$inferInsert;

// ─── 부채 ─────────────────────────────────────────────────────────────────────
export const debts = pgTable("debts", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Debt = typeof debts.$inferSelect;
export type InsertDebt = typeof debts.$inferInsert;

// ─── 보유카드 ─────────────────────────────────────────────────────────────────
export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  cardType: cardTypeEnum("card_type").notNull().default("신용카드"),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

// ─── 포인트/마일리지 ──────────────────────────────────────────────────────────
export const cardPoints = pgTable("card_points", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  benefits: text("benefits"),
  balance: bigint("balance", { mode: "number" }).default(0),
  purpose: varchar("purpose", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CardPoint = typeof cardPoints.$inferSelect;
export type InsertCardPoint = typeof cardPoints.$inferInsert;

// ─── 구독결제 서비스 ──────────────────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  category: subscriptionCategoryEnum("category").notNull().default("기타"),
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("매달"),
  price: bigint("price", { mode: "number" }).notNull().default(0),
  sharedCount: integer("shared_count").notNull().default(1),
  billingDay: integer("billing_day"),
  startDate: varchar("start_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 200 }),
  note: text("note"),
  isPaused: boolean("is_paused").notNull().default(false),
  pausedFrom: varchar("paused_from", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── 부수입 카테고리 ──────────────────────────────────────────────────────────
export const sideIncomeCategories = pgTable("side_income_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#5b7cfa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SideIncomeCategory = typeof sideIncomeCategories.$inferSelect;
export type InsertSideIncomeCategory = typeof sideIncomeCategories.$inferInsert;

// ─── 부수입 내역 ──────────────────────────────────────────────────────────────
export const sideIncomes = pgTable("side_incomes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SideIncome = typeof sideIncomes.$inferSelect;
export type InsertSideIncome = typeof sideIncomes.$inferInsert;

// ─── 사업소득 ─────────────────────────────────────────────────────────────────
export const businessIncomes = pgTable("business_incomes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BusinessIncome = typeof businessIncomes.$inferSelect;
export type InsertBusinessIncome = typeof businessIncomes.$inferInsert;

// ─── 사업비용 ─────────────────────────────────────────────────────────────────
export const businessExpenses = pgTable("business_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  expenseDate: date("expense_date").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  category: businessExpenseCategoryEnum("category").notNull().default("기타"),
  vendor: varchar("vendor", { length: 200 }),
  description: varchar("description", { length: 300 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  paymentMethod: varchar("payment_method", { length: 200 }),
  isTaxDeductible: boolean("is_tax_deductible").notNull().default(true),
  ledgerEntryId: integer("ledger_entry_id"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type InsertBusinessExpense = typeof businessExpenses.$inferInsert;

// ─── 보유 계좌 ────────────────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountType: accountTypeEnum("account_type").notNull().default("입출금"),
  accountNumber: varchar("account_number", { length: 100 }),
  accountHolder: varchar("account_holder", { length: 100 }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  interestRate: varchar("interest_rate", { length: 20 }),
  linkedCard: varchar("linked_card", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

// ─── 할부 내역 ────────────────────────────────────────────────────────────────
export const installments = pgTable("installments", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Installment = typeof installments.$inferSelect;
export type InsertInstallment = typeof installments.$inferInsert;

// ─── 대출 내역 ────────────────────────────────────────────────────────────────
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  loanType: varchar("loan_type", { length: 50 }).notNull().default("기타"),
  lender: varchar("lender", { length: 100 }),
  principalAmount: bigint("principal_amount", { mode: "number" }).notNull().default(0),
  remainingPrincipal: bigint("remaining_principal", { mode: "number" }).notNull().default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }).default("0"),
  repaymentType: varchar("repayment_type", { length: 50 }).notNull().default("수동입력"),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  maturityDate: varchar("maturity_date", { length: 20 }),
  paymentDay: integer("payment_day"),
  monthlyPayment: bigint("monthly_payment", { mode: "number" }).notNull().default(0),
  graceMonths: integer("grace_months").default(0),
  note: text("note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

// ─── 사용자 연락처 ───────────────────────────────────────────────────────────
export const userContacts = pgTable("user_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  contactUserId: integer("contact_user_id").notNull(),
  nickname: varchar("nickname", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userContactUserIdx: uniqueIndex("user_contacts_user_contact_idx").on(table.userId, table.contactUserId),
}));
export type UserContact = typeof userContacts.$inferSelect;
export type InsertUserContact = typeof userContacts.$inferInsert;

// ─── 빌린돈 ───────────────────────────────────────────────────────────────────
export const borrowedMoney = pgTable("borrowed_money", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  lenderUserId: integer("lender_user_id"),
  borrowerUserId: integer("borrower_user_id"),
  shareStatus: varchar("share_status", { length: 30 }).notNull().default("private"),
  lenderName: varchar("lender_name", { length: 200 }).notNull(),
  principalAmount: bigint("principal_amount", { mode: "number" }).notNull().default(0),
  repaidAmount: bigint("repaid_amount", { mode: "number" }).notNull().default(0),
  borrowedDate: varchar("borrowed_date", { length: 20 }),
  repaymentType: varchar("repayment_type", { length: 30 }).notNull().default("자유상환"),
  repaymentStartDate: varchar("repayment_start_date", { length: 20 }),
  repaymentDueDate: varchar("repayment_due_date", { length: 20 }),
  paymentDay: integer("payment_day"),
  monthlyPayment: bigint("monthly_payment", { mode: "number" }).notNull().default(0),
  totalInstallments: integer("total_installments"),
  installmentMode: varchar("installment_mode", { length: 20 }).notNull().default("equal"),
  repaymentSchedule: text("repayment_schedule"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BorrowedMoney = typeof borrowedMoney.$inferSelect;
export type InsertBorrowedMoney = typeof borrowedMoney.$inferInsert;

export const borrowedMoneyPayments = pgTable("borrowed_money_payments", {
  id: serial("id").primaryKey(),
  borrowedMoneyId: integer("borrowed_money_id").notNull(),
  userId: integer("user_id").notNull().default(0),
  paymentDate: varchar("payment_date", { length: 20 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  installmentNo: integer("installment_no"),
  note: text("note"),
  ledgerEntryId: integer("ledger_entry_id"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BorrowedMoneyPayment = typeof borrowedMoneyPayments.$inferSelect;
export type InsertBorrowedMoneyPayment = typeof borrowedMoneyPayments.$inferInsert;

// ─── 보험 ─────────────────────────────────────────────────────────────────────
export const insurance = pgTable("insurance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 200 }),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }),
  insuranceType: insuranceTypeEnum("insurance_type"),
  renewalType: renewalTypeEnum("renewal_type").notNull().default("비갱신형"),
  renewalCycleYears: integer("renewal_cycle_years"),
  paymentType: paymentTypeEnum("payment_type").notNull().default("monthly"),
  paymentDay: integer("payment_day"),
  paymentAmount: bigint("payment_amount", { mode: "number" }).notNull().default(0),
  durationYears: integer("duration_years"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type InsuranceRecord = typeof insurance.$inferSelect;
export type InsertInsurance = typeof insurance.$inferInsert;

// ─── 카테고리 (대분류 / 중분류) ──────────────────────────────────────────────
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  name: varchar("name", { length: 100 }).notNull(),
  type: categoryTypeEnum("type").notNull().default("expense"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export const subCategories = pgTable("sub_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  categoryId: integer("category_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SubCategory = typeof subCategories.$inferSelect;
export type InsertSubCategory = typeof subCategories.$inferInsert;

// ─── 인건비 ───────────────────────────────────────────────────────────────────
export const laborCosts = pgTable("labor_costs", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type LaborCost = typeof laborCosts.$inferSelect;
export type InsertLaborCost = typeof laborCosts.$inferInsert;

// ─── 기능 요청 게시판 ───────────────────────────────────────────────────────
export const featureRequests = pgTable("feature_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(0),
  authorName: varchar("author_name", { length: 120 }),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("요청"),
  isDone: boolean("is_done").notNull().default(false),
  checkedByUserId: integer("checked_by_user_id"),
  checkedAt: timestamp("checked_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type FeatureRequest = typeof featureRequests.$inferSelect;
export type InsertFeatureRequest = typeof featureRequests.$inferInsert;
