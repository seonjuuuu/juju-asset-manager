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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 가계부 ───────────────────────────────────────────────────────────────────
export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  entryDate: date("entry_date").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  mainCategory: varchar("main_category", { length: 50 }).notNull(), // 수입, 고정지출, 변동지출, 저축/투자
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
  mainCategory: varchar("main_category", { length: 100 }).notNull(), // 주거비, 통신비, 보험료 등
  subCategory: varchar("sub_category", { length: 100 }),
  paymentAccount: varchar("payment_account", { length: 100 }),
  monthlyAmount: bigint("monthly_amount", { mode: "number" }).notNull().default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).default(0),
  interestRate: decimal("interest_rate", { precision: 10, scale: 4 }),
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
  market: varchar("market", { length: 20 }), // NASDAQ, KRX 등
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
  snapshotMonth: varchar("snapshot_month", { length: 7 }), // YYYY-MM (월별 스냅샷)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockPortfolio = typeof stockPortfolio.$inferSelect;
export type InsertStockPortfolio = typeof stockPortfolio.$inferInsert;

// ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
export const savingsAssets = mysqlTable("savings_assets", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 50 }).notNull(), // 예적금, 입출금통장, 기타
  description: varchar("description", { length: 100 }).notNull(),
  bank: varchar("bank", { length: 100 }),
  accountNumber: varchar("account_number", { length: 100 }),
  monthlyDeposit: varchar("monthly_deposit", { length: 50 }), // 변동금액 등 텍스트도 허용
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
  pensionType: varchar("pension_type", { length: 50 }).notNull(), // 개인연금, 퇴직연금
  company: varchar("company", { length: 100 }),
  assetType: varchar("asset_type", { length: 20 }), // ETF, 펀드, 예적금
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
  category: varchar("category", { length: 100 }).notNull(), // 교직원공제회, 저축성보험 등
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
  district: varchar("district", { length: 100 }), // 구
  dong: varchar("dong", { length: 100 }), // 동
  aptName: varchar("apt_name", { length: 100 }).notNull(), // 아파트명
  builtYear: varchar("built_year", { length: 20 }),
  households: int("households"),
  areaSize: decimal("area_size", { precision: 10, scale: 2 }), // 평(㎡)
  floor: varchar("floor", { length: 20 }),
  direction: varchar("direction", { length: 20 }),
  salePrice: bigint("sale_price", { mode: "number" }).default(0), // 매매가 (만원)
  leasePrice: bigint("lease_price", { mode: "number" }).default(0), // 전세가 (만원)
  leaseRatio: decimal("lease_ratio", { precision: 10, scale: 6 }), // 전세가율
  gap: bigint("gap", { mode: "number" }).default(0), // 갭
  pricePerPyeong: decimal("price_per_pyeong", { precision: 15, scale: 4 }), // 평당가
  price201912: bigint("price_201912", { mode: "number" }).default(0), // 19.12 실거래가
  price202112: bigint("price_202112", { mode: "number" }).default(0), // 21.12 실거래가
  currentPrice: bigint("current_price", { mode: "number" }).default(0), // 현재가
  riseFrom201912: decimal("rise_from_201912", { precision: 10, scale: 6 }), // 19.12~현재 상승률
  riseFrom202112: decimal("rise_from_202112", { precision: 10, scale: 6 }), // 21.12~현재 상승률
  note: text("note"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RealEstate = typeof realEstates.$inferSelect;
export type InsertRealEstate = typeof realEstates.$inferInsert;

// ─── 블로그 체험단 ────────────────────────────────────────────────────────────
export const blogCampaigns = mysqlTable("blog_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  platform: varchar("platform", { length: 100 }), // 디너의여왕, 리뷰노트 등
  campaignType: varchar("campaign_type", { length: 50 }), // 방문형, 배송형 등
  category: varchar("category", { length: 50 }), // 카페, 맛집, 숙소 등
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
  cardType: mysqlEnum("card_type", ["신용카드", "체크카드"]).notNull().default("신용카드"),
  cardCompany: varchar("card_company", { length: 100 }).notNull(), // 카드사
  cardName: varchar("card_name", { length: 200 }),                 // 카드명
  benefits: text("benefits"),                                       // 혜택 (textarea)
  annualFee: bigint("annual_fee", { mode: "number" }).default(0),  // 연회비
  performance: varchar("performance", { length: 200 }),             // 실적
  purpose: varchar("purpose", { length: 200 }),                    // 용도
  creditLimit: bigint("credit_limit", { mode: "number" }).default(0), // 카드한도
  expiryDate: varchar("expiry_date", { length: 10 }),               // 유효기간 DD/YY
  paymentDate: varchar("payment_date", { length: 50 }),             // 결제일
  paymentAccount: varchar("payment_account", { length: 200 }),      // 결제계좌
  note: text("note"),                                               // 비고
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

// ─── 포인트/마일리지 ──────────────────────────────────────────────────────────
export const cardPoints = mysqlTable("card_points", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),   // 카드/포인트명
  benefits: text("benefits"),                          // 혜택
  balance: bigint("balance", { mode: "number" }).default(0), // 잔액
  purpose: varchar("purpose", { length: 200 }),        // 용도
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CardPoint = typeof cardPoints.$inferSelect;
export type InsertCardPoint = typeof cardPoints.$inferInsert;

// ─── 정기결제 서비스 ──────────────────────────────────────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  serviceName: varchar("service_name", { length: 200 }).notNull(),           // 구독 서비스명
  category: mysqlEnum("category", ["비즈니스", "미디어", "자기계발", "기타"]).notNull().default("기타"),
  billingCycle: mysqlEnum("billing_cycle", ["매달", "매주", "매일"]).notNull().default("매달"),
  price: bigint("price", { mode: "number" }).notNull().default(0),           // 구독료
  startDate: varchar("start_date", { length: 20 }),                          // 구독시작일 YYYY-MM-DD
  paymentMethod: varchar("payment_method", { length: 200 }),                 // 결제방법 (카드명/현금/계좌출금)
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
