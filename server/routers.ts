import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const insuranceInput = z.object({
  name: z.string(),
  insuranceType: z.enum(["보장형", "저축형"]).nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  renewalType: z.enum(["비갱신형", "갱신형"]).optional(),
  renewalCycleYears: z.number().int().min(1).nullable().optional(),
  paymentType: z.enum(["monthly", "annual"]).default("monthly"),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  paymentAmount: z.number().default(0),
  durationYears: z.number().int().min(1).nullable().optional(),
  note: z.string().nullable().optional(),
});

const businessExpenseInput = z.object({
  expenseDate: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  category: z.enum(["광고", "대납", "세금", "수수료", "소모품", "인건비", "기타"]).default("기타"),
  vendor: z.string().nullable().optional(),
  description: z.string().min(1),
  amount: z.number().default(0),
  paymentMethod: z.string().nullable().optional(),
  isTaxDeductible: z.boolean().default(true),
  note: z.string().nullable().optional(),
});

function getInsertId(result: unknown): number | null {
  const direct = (result as { insertId?: number })?.insertId;
  if (typeof direct === "number" && direct > 0) return direct;
  const first = Array.isArray(result) ? (result[0] as { insertId?: number } | undefined)?.insertId : undefined;
  return typeof first === "number" && first > 0 ? first : null;
}

const accountInput = z.object({
  bankName: z.string(),
  accountType: z.enum(["입출금", "저축", "CMA", "파킹통장", "청약", "기타"]).default("입출금"),
  accountNumber: z.string().optional(),
  accountHolder: z.string().optional(),
  balance: z.number().default(0),
  interestRate: z.string().optional(),
  linkedCard: z.string().optional(),
  note: z.string().optional(),
});
const installmentInput = z.object({
  name: z.string(),
  cardId: z.number().int().nullable().optional(),
  totalAmount: z.number().default(0),
  months: z.number().int().min(1).default(1),
  startDate: z.string(),
  endDate: z.string(),
  isInterestFree: z.boolean().default(true),
  interestRate: z.string().optional(),
  categoryId: z.number().int().nullable().optional(),
  subCategoryId: z.number().int().nullable().optional(),
  note: z.string().optional(),
  earlyRepaymentAmount: z.number().nullable().optional(),
  earlyRepaymentDate: z.string().nullable().optional(),
});
const loanInput = z.object({
  name: z.string(),
  loanType: z.enum(["주택담보대출", "신용대출", "전세대출", "사업자대출", "마이너스통장", "기타"]).default("기타"),
  lender: z.string().nullable().optional(),
  principalAmount: z.number().default(0),
  remainingPrincipal: z.number().default(0),
  interestRate: z.string().optional(),
  repaymentType: z.enum(["원리금균등", "원금균등", "만기일시", "체납식", "수동입력"]).default("수동입력"),
  startDate: z.string(),
  maturityDate: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  monthlyPayment: z.number().default(0),
  graceMonths: z.number().int().min(0).optional(),
  note: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
const borrowedMoneyInput = z.object({
  lenderName: z.string().min(1),
  lenderUserId: z.number().int().nullable().optional(),
  borrowerUserId: z.number().int().nullable().optional(),
  shareStatus: z.enum(["private", "pending", "accepted", "rejected"]).optional(),
  principalAmount: z.number().int().min(0).default(0),
  repaidAmount: z.number().int().min(0).default(0),
  borrowedDate: z.string().nullable().optional(),
  repaymentType: z.enum(["일시상환", "할부상환", "자유상환"]).default("자유상환"),
  repaymentStartDate: z.string().nullable().optional(),
  repaymentDueDate: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  monthlyPayment: z.number().int().min(0).default(0),
  totalInstallments: z.number().int().min(1).nullable().optional(),
  installmentMode: z.enum(["equal", "custom"]).default("equal"),
  repaymentSchedule: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
const borrowedMoneyUpdateInput = borrowedMoneyInput.omit({
  principalAmount: true,
  repaidAmount: true,
  repaymentType: true,
  monthlyPayment: true,
  installmentMode: true,
}).extend({
  principalAmount: z.number().int().min(0).optional(),
  repaidAmount: z.number().int().min(0).optional(),
  repaymentType: z.enum(["일시상환", "할부상환", "자유상환"]).optional(),
  monthlyPayment: z.number().int().min(0).optional(),
  installmentMode: z.enum(["equal", "custom"]).optional(),
}).partial();

const borrowedMoneyPaymentInput = z.object({
  borrowedMoneyId: z.number().int(),
  paymentDate: z.string(),
  amount: z.number().int().min(1),
  installmentNo: z.number().int().min(1).nullable().optional(),
  note: z.string().nullable().optional(),
});
const subscriptionInput = z.object({
  serviceName: z.string(),
  category: z.enum(["비즈니스", "미디어", "자기계발", "쇼핑", "기타"]).default("기타"),
  billingCycle: z.enum(["매달", "매주", "매일", "매년"]).default("매달"),
  price: z.number().default(0),
  sharedCount: z.number().int().min(1).default(1),
  /** 1–31: 매달 등 결제일, 101–1231: 매년(M×100+D, 예 428=4/28) */
  billingDay: z.number().int().min(1).max(1231).nullable().optional(),
  startDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
  isPaused: z.boolean().optional(),
  pausedFrom: z.string().nullable().optional(),
});
const subscriptionUpdateInput = z.object({
  serviceName: z.string().optional(),
  category: z.enum(["비즈니스", "미디어", "자기계발", "쇼핑", "기타"]).optional(),
  billingCycle: z.enum(["매달", "매주", "매일", "매년"]).optional(),
  price: z.number().optional(),
  sharedCount: z.number().int().min(1).optional(),
  /** 1–31: 매달 등 결제일, 101–1231: 매년(M×100+D, 예 428=4/28) */
  billingDay: z.number().int().min(1).max(1231).nullable().optional(),
  startDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
  isPaused: z.boolean().optional(),
  pausedFrom: z.string().nullable().optional(),
});

const cardInput = z.object({
  cardType: z.enum(["신용카드", "체크카드"]).default("신용카드"),
  cardCompany: z.string(),
  cardName: z.string().optional(),
  benefits: z.string().optional(),
  annualFee: z.number().optional(),
  performance: z.string().optional(),
  purpose: z.string().optional(),
  creditLimit: z.number().optional(),
  expiryDate: z.string().optional(),
  paymentDate: z.string().optional(),
  paymentAccount: z.string().optional(),
  note: z.string().optional(),
});

const cardPointInput = z.object({
  name: z.string(),
  benefits: z.string().optional(),
  balance: z.number().optional(),
  purpose: z.string().optional(),
  note: z.string().optional(),
});


const ledgerEntryInput = z.object({
  entryDate: z.string(),
  year: z.number(),
  month: z.number(),
  mainCategory: z.string(),
  subCategory: z.string().optional(),
  description: z.string().optional(),
  amount: z.number(),
  note: z.string().optional(),
});

const fixedExpenseInput = z.object({
  mainCategory: z.string(),
  subCategory: z.string().optional(),
  description: z.string().optional(),
  paymentAccount: z.string().optional(),
  monthlyAmount: z.number(),
  totalAmount: z.number().optional(),
  interestRate: z.string().optional(),
  startDate: z.string().optional(),
  expiryDate: z.string().optional(),
  paymentDay: z.number().optional(),
  note: z.string().optional(),
  isActive: z.boolean().optional(),
});

const stockInput = z.object({
  market: z.string().optional(),
  broker: z.string().optional(),
  sector: z.string().optional(),
  stockName: z.string(),
  ticker: z.string().optional(),
  avgBuyPrice: z.number().optional(),
  quantity: z.string().optional(),
  buyAmount: z.number().optional(),
  currentPrice: z.number().optional(),
  currentAmount: z.number().optional(),
  returnRate: z.string().optional(),
  note: z.string().optional(),
  snapshotMonth: z.string().optional(),
});

const userMemoInput = z.object({
  key: z.string().min(1).max(100),
  content: z.string().max(20000).default(""),
});

const savingsInput = z.object({
  category: z.string(),
  description: z.string(),
  bank: z.string().optional(),
  accountNumber: z.string().optional(),
  monthlyDeposit: z.string().optional(),
  interestRate: z.string().optional(),
  totalAmount: z.string().optional(),
  expiryDate: z.string().optional(),
  note: z.string().optional(),
  isActive: z.boolean().optional(),
});

const pensionInput = z.object({
  pensionType: z.string(),
  company: z.string().optional(),
  assetType: z.string().optional(),
  stockName: z.string().optional(),
  ticker: z.string().optional(),
  avgBuyPrice: z.number().optional(),
  quantity: z.string().optional(),
  buyAmount: z.number().optional(),
  currentPrice: z.number().optional(),
  currentAmount: z.number().optional(),
  returnRate: z.string().optional(),
  note: z.string().optional(),
});

const otherAssetInput = z.object({
  category: z.string(),
  monthlyDeposit: z.number().optional(),
  paidAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  note: z.string().optional(),
});

const realEstateInput = z.object({
  district: z.string().optional(),
  dong: z.string().optional(),
  aptName: z.string(),
  builtYear: z.string().optional(),
  households: z.number().optional(),
  areaSize: z.string().optional(),
  floor: z.string().optional(),
  direction: z.string().optional(),
  salePrice: z.number().optional(),
  leasePrice: z.number().optional(),
  leaseRatio: z.string().optional(),
  gap: z.number().optional(),
  pricePerPyeong: z.string().optional(),
  price201912: z.number().optional(),
  price202112: z.number().optional(),
  currentPrice: z.number().optional(),
  riseFrom201912: z.string().optional(),
  riseFrom202112: z.string().optional(),
  note: z.string().optional(),
});

const blogCampaignInput = z.object({
  platform: z.string().optional(),
  campaignType: z.string().optional(),
  category: z.string().optional(),
  businessName: z.string().optional(),
  amount: z.number().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  visitDate: z.string().nullable().optional(),
  reviewDone: z.boolean().optional(),
  completed: z.boolean().optional(),
  note: z.string().optional(),
});

const weddingBudgetSettingInput = z.object({
  weddingDate: z.string().nullable().optional(),
  venueName: z.string().nullable().optional(),
  totalBudget: z.number().default(0),
  note: z.string().nullable().optional(),
});

const weddingBudgetItemInput = z.object({
  category: z.string().min(1),
  itemName: z.string().min(1),
  vendorName: z.string().nullable().optional(),
  estimatedAmount: z.number().default(0),
  contractAmount: z.number().default(0),
  paidAmount: z.number().default(0),
  dueDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  status: z.enum(["견적", "계약", "결제중", "완료"]).default("견적"),
  note: z.string().nullable().optional(),
});

const debtInput = z.object({
  category: z.string(),
  description: z.string().optional(),
  debtType: z.string().optional(),
  principal: z.number().optional(),
  monthlyPayment: z.number().optional(),
  interestRate: z.string().optional(),
  balance: z.number().optional(),
  expiryDate: z.string().optional(),
  note: z.string().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────
async function callGroq(prompt: string, maxTokens = 1024): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq API error: ${res.status} - ${errBody}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "분석 결과를 가져올 수 없습니다.";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    shareableUsers: protectedProcedure.query(({ ctx }) => db.listShareableUsers(ctx.user.id)),
    contacts: protectedProcedure.query(({ ctx }) => db.listUserContacts(ctx.user.id)),
    searchUsers: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input, ctx }) => db.searchUsersForContact(ctx.user.id, input.query)),
    upsertContact: protectedProcedure
      .input(z.object({ contactUserId: z.number().int(), nickname: z.string().min(1) }))
      .mutation(({ input, ctx }) => db.upsertUserContact(ctx.user.id, input)),
    updateProfile: protectedProcedure
      .input(
        z.object({
          birthDate: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
          navPreferences: z.string().nullable().optional(),
          monthlySalary: z.number().int().nullable().optional(),
        }),
      )
      .mutation(({ input, ctx }) => db.updateUserProfile(ctx.user.id, input)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.res as any).clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── 대시보드 ───────────────────────────────────────────────────────────────
  dashboard: router({
    summary: protectedProcedure.query(({ ctx }) => db.getDashboardSummary(ctx.user.id)),
    yearlySummary: protectedProcedure.input(z.object({ year: z.number() })).query(({ input, ctx }) =>
      db.getYearlySummary(ctx.user.id, input.year)
    ),
  }),

  // ─── 가계부 ─────────────────────────────────────────────────────────────────
  ledger: router({
    list: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(200).default(50) }))
      .query(({ input, ctx }) => db.getLedgerEntries(ctx.user.id, input.year, input.month, input.page, input.pageSize)),
    count: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input, ctx }) => db.getLedgerCount(ctx.user.id, input.year, input.month)),
    monthSummary: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input, ctx }) => db.getLedgerMonthSummary(ctx.user.id, input.year, input.month)),
    create: protectedProcedure.input(ledgerEntryInput).mutation(({ input, ctx }) =>
      db.createLedgerEntry(ctx.user.id, {
        ...input,
        entryDate: input.entryDate,
      })
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: ledgerEntryInput.partial() }))
      .mutation(({ input, ctx }) => db.updateLedgerEntry(ctx.user.id, input.id, input.data as Parameters<typeof db.updateLedgerEntry>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteLedgerEntry(ctx.user.id, input.id)
    ),
    yearlySubCatExpense: protectedProcedure
      .input(z.object({ year: z.number() }))
      .query(({ input, ctx }) => db.getYearlySubCatExpenseSummary(ctx.user.id, input.year)),
  }),

  // ─── 고정지출 ───────────────────────────────────────────────────────────────
  fixedExpense: router({
    list: protectedProcedure.query(({ ctx }) => db.getFixedExpenses(ctx.user.id)),
    create: protectedProcedure.input(fixedExpenseInput).mutation(({ input, ctx }) =>
      db.createFixedExpense(ctx.user.id, input as Parameters<typeof db.createFixedExpense>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: fixedExpenseInput.partial() }))
      .mutation(({ input, ctx }) => db.updateFixedExpense(ctx.user.id, input.id, input.data as Parameters<typeof db.updateFixedExpense>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteFixedExpense(ctx.user.id, input.id)
    ),
  }),

  // ─── 주식 포트폴리오 ─────────────────────────────────────────────────────────
  stock: router({
    list: protectedProcedure.input(z.object({ snapshotMonth: z.string().optional() })).query(({ input, ctx }) =>
      db.getStockPortfolio(ctx.user.id, input.snapshotMonth)
    ),
    create: protectedProcedure.input(stockInput).mutation(({ input, ctx }) =>
      db.createStockEntry(ctx.user.id, input as Parameters<typeof db.createStockEntry>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: stockInput.partial() }))
      .mutation(({ input, ctx }) => db.updateStockEntry(ctx.user.id, input.id, input.data as Parameters<typeof db.updateStockEntry>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteStockEntry(ctx.user.id, input.id)
    ),
  }),

  userMemo: router({
    get: protectedProcedure.input(z.object({ key: z.string().min(1).max(100) })).query(({ input, ctx }) =>
      db.getUserMemo(ctx.user.id, input.key)
    ),
    upsert: protectedProcedure.input(userMemoInput).mutation(({ input, ctx }) =>
      db.upsertUserMemo(ctx.user.id, { memoKey: input.key, content: input.content })
    ),
  }),

  // ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
  savings: router({
    list: protectedProcedure.query(({ ctx }) => db.getSavingsAssets(ctx.user.id)),
    create: protectedProcedure.input(savingsInput).mutation(({ input, ctx }) =>
      db.createSavingsAsset(ctx.user.id, input as Parameters<typeof db.createSavingsAsset>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: savingsInput.partial() }))
      .mutation(({ input, ctx }) => db.updateSavingsAsset(ctx.user.id, input.id, input.data as Parameters<typeof db.updateSavingsAsset>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteSavingsAsset(ctx.user.id, input.id)
    ),
  }),

  // ─── 연금 ───────────────────────────────────────────────────────────────────
  pension: router({
    list: protectedProcedure.query(({ ctx }) => db.getPensionAssets(ctx.user.id)),
    create: protectedProcedure.input(pensionInput).mutation(({ input, ctx }) =>
      db.createPensionAsset(ctx.user.id, input as Parameters<typeof db.createPensionAsset>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: pensionInput.partial() }))
      .mutation(({ input, ctx }) => db.updatePensionAsset(ctx.user.id, input.id, input.data as Parameters<typeof db.updatePensionAsset>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deletePensionAsset(ctx.user.id, input.id)
    ),
  }),

  // ─── 기타 자산 ──────────────────────────────────────────────────────────────
  otherAsset: router({
    list: protectedProcedure.query(({ ctx }) => db.getOtherAssets(ctx.user.id)),
    create: protectedProcedure.input(otherAssetInput).mutation(({ input, ctx }) =>
      db.createOtherAsset(ctx.user.id, input as Parameters<typeof db.createOtherAsset>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: otherAssetInput.partial() }))
      .mutation(({ input, ctx }) => db.updateOtherAsset(ctx.user.id, input.id, input.data as Parameters<typeof db.updateOtherAsset>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteOtherAsset(ctx.user.id, input.id)
    ),
  }),

  // ─── 부동산 ─────────────────────────────────────────────────────────────────
  realEstate: router({
    list: protectedProcedure.query(({ ctx }) => db.getRealEstates(ctx.user.id)),
    create: protectedProcedure.input(realEstateInput).mutation(({ input, ctx }) =>
      db.createRealEstate(ctx.user.id, input as Parameters<typeof db.createRealEstate>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: realEstateInput.partial() }))
      .mutation(({ input, ctx }) => db.updateRealEstate(ctx.user.id, input.id, input.data as Parameters<typeof db.updateRealEstate>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteRealEstate(ctx.user.id, input.id)
    ),
  }),

  // ─── 블로그 체험단 ───────────────────────────────────────────────────────────
  blogCampaign: router({
    list: protectedProcedure.query(({ ctx }) => db.getBlogCampaigns(ctx.user.id)),
    create: protectedProcedure.input(blogCampaignInput).mutation(({ input, ctx }) =>
      db.createBlogCampaign(ctx.user.id, input as Parameters<typeof db.createBlogCampaign>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: blogCampaignInput.partial() }))
      .mutation(({ input, ctx }) => db.updateBlogCampaign(ctx.user.id, input.id, input.data as Parameters<typeof db.updateBlogCampaign>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteBlogCampaign(ctx.user.id, input.id)
    ),
  }),

  // ─── 결혼예산 ───────────────────────────────────────────────────────────────
  weddingBudget: router({
    setting: protectedProcedure.query(({ ctx }) => db.getWeddingBudgetSetting(ctx.user.id)),
    upsertSetting: protectedProcedure.input(weddingBudgetSettingInput).mutation(({ input, ctx }) =>
      db.upsertWeddingBudgetSetting(ctx.user.id, input as Parameters<typeof db.upsertWeddingBudgetSetting>[1])
    ),
    listItems: protectedProcedure.query(({ ctx }) => db.listWeddingBudgetItems(ctx.user.id)),
    createItem: protectedProcedure.input(weddingBudgetItemInput).mutation(({ input, ctx }) =>
      db.createWeddingBudgetItem(ctx.user.id, input as Parameters<typeof db.createWeddingBudgetItem>[1])
    ),
    updateItem: protectedProcedure
      .input(z.object({ id: z.number(), data: weddingBudgetItemInput.partial() }))
      .mutation(({ input, ctx }) => db.updateWeddingBudgetItem(ctx.user.id, input.id, input.data as Parameters<typeof db.updateWeddingBudgetItem>[2])),
    deleteItem: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteWeddingBudgetItem(ctx.user.id, input.id)
    ),
  }),

  // ─── 구독결제 서비스 ─────────────────────────────────────────────────────────
  subscription: router({
    list: protectedProcedure.query(({ ctx }) => db.getSubscriptions(ctx.user.id)),
    create: protectedProcedure.input(subscriptionInput).mutation(({ input, ctx }) =>
      db.createSubscription(ctx.user.id, input as Parameters<typeof db.createSubscription>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: subscriptionUpdateInput }))
      .mutation(({ input, ctx }) => db.updateSubscription(ctx.user.id, input.id, input.data as Parameters<typeof db.updateSubscription>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteSubscription(ctx.user.id, input.id)
    ),
  }),

  // ─── 보유카드 ──────────────────────────────────────────────────────────────
  card: router({
    list: protectedProcedure.query(({ ctx }) => db.getCards(ctx.user.id)),
    create: protectedProcedure.input(cardInput).mutation(({ input, ctx }) =>
      db.createCard(ctx.user.id, input as Parameters<typeof db.createCard>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: cardInput.partial() }))
      .mutation(({ input, ctx }) => db.updateCard(ctx.user.id, input.id, input.data as Parameters<typeof db.updateCard>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteCard(ctx.user.id, input.id)
    ),
  }),

  // ─── 포인트/마일리지 ─────────────────────────────────────────────────────────
  cardPoint: router({
    list: protectedProcedure.query(({ ctx }) => db.getCardPoints(ctx.user.id)),
    create: protectedProcedure.input(cardPointInput).mutation(({ input, ctx }) =>
      db.createCardPoint(ctx.user.id, input as Parameters<typeof db.createCardPoint>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: cardPointInput.partial() }))
      .mutation(({ input, ctx }) => db.updateCardPoint(ctx.user.id, input.id, input.data as Parameters<typeof db.updateCardPoint>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteCardPoint(ctx.user.id, input.id)
    ),
  }),

  // ─── ETF 현재가 ───────────────────────────────────────────────────────────────────────────
  etfPrice: router({
    // 한국 ETF 종목코드 (예: 360750) 입력 시 Yahoo Finance에서 현재가 조회
    // 한국: 종목코드.KS, 해외: 종목코드 그대로 (AAPL, QQQ 등)
    getPrice: protectedProcedure
      .input(z.object({ ticker: z.string(), market: z.enum(["KR", "US"]).default("KR") }))
      .query(async ({ input }) => {
        const symbol = input.market === "KR"
          ? (input.ticker.includes(".") ? input.ticker : `${input.ticker}.KS`)
          : input.ticker;
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const resp = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; longName?: string; currency?: string } }> } };
          const meta = resp?.chart?.result?.[0]?.meta;
          if (!meta?.regularMarketPrice) throw new Error("현재가 없음");
          return {
            ticker: input.ticker,
            symbol,
            price: meta.regularMarketPrice,
            name: meta.longName ?? "",
            currency: meta.currency ?? (input.market === "KR" ? "KRW" : "USD"),
            updatedAt: new Date().toISOString(),
          };
        } catch (e) {
          throw new Error(`현재가 조회 실패: ${(e as Error).message}`);
        }
      }),

    // 종목명·티커로 검색 — 한글/영문 모두 NAVER + Yahoo Finance 병렬 시도 후 합산
    search: protectedProcedure
      .input(z.object({ query: z.string().min(1), market: z.enum(["국내", "해외"]).optional() }))
      .query(async ({ input }) => {
        const isKoreanQuery = /[가-힣]/.test(input.query);
        const KOREAN_EXCHANGES = new Set(["KSC", "KOE", "KOS"]);

        const [naverResults, yahooResults] = await Promise.all([
          // NAVER — 한글 쿼리일 때만
          isKoreanQuery
            ? fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(input.query)}&target=stock,index,marketindicator`, { headers: { "User-Agent": "Mozilla/5.0" } })
                .then(r => r.ok ? r.json() : { items: [] })
                .then((data: { items?: Array<{ code: string; name: string; typeCode: string }> }) =>
                  (data.items ?? []).filter(i => i.code).map(i => ({
                    ticker: i.code,
                    name: i.name,
                    exchange: i.typeCode,
                    market: "국내" as const,
                  }))
                )
                .catch(() => [])
            : Promise.resolve([]),

          // Yahoo Finance — 항상 시도
          fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(input.query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`, { headers: { "User-Agent": "Mozilla/5.0" } })
            .then(r => r.ok ? r.json() : { quotes: [] })
            .then((data: { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }> }) =>
              (data.quotes ?? [])
                .filter(q => q.quoteType === "EQUITY" || q.quoteType === "ETF")
                .map(q => {
                  const isKorean = q.symbol.endsWith(".KS") || q.symbol.endsWith(".KQ") || KOREAN_EXCHANGES.has(q.exchange ?? "");
                  return {
                    ticker: isKorean ? q.symbol.replace(/\.(KS|KQ)$/, "") : q.symbol,
                    name: q.longname || q.shortname || q.symbol,
                    exchange: q.exchange ?? "",
                    market: isKorean ? "국내" as const : "해외" as const,
                  };
                })
            )
            .catch(() => []),
        ]);

        // NAVER 결과 우선, Yahoo 결과에서 티커 중복 제거 후 합산, 최대 10개
        const seen = new Set(naverResults.map(r => r.ticker));
        const merged = [
          ...naverResults,
          ...yahooResults.filter(r => !seen.has(r.ticker)),
        ];
        return merged.slice(0, 10);
      }),
  }),

  // ─── 부체 ───────────────────────────────────────────────────────────────────────────
  debt: router({
    list: protectedProcedure.query(({ ctx }) => db.getDebts(ctx.user.id)),
    create: protectedProcedure.input(debtInput).mutation(({ input, ctx }) =>
      db.createDebt(ctx.user.id, input as Parameters<typeof db.createDebt>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: debtInput.partial() }))
      .mutation(({ input, ctx }) => db.updateDebt(ctx.user.id, input.id, input.data as Parameters<typeof db.updateDebt>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteDebt(ctx.user.id, input.id)
    ),
  }),

  // ─── 부수입 카테고리 ───────────────────────────────────────────────────────────
  sideIncomeCategory: router({
    list: protectedProcedure.query(({ ctx }) => db.getSideIncomeCategories(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
      .mutation(({ input, ctx }) => db.createSideIncomeCategory(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.object({ name: z.string().optional(), color: z.string().optional() }) }))
      .mutation(({ input, ctx }) => db.updateSideIncomeCategory(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteSideIncomeCategory(ctx.user.id, input.id)),
  }),

  // ─── 부수입 내역 ───────────────────────────────────────────────────────────────
  sideIncome: router({
    list: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input, ctx }) => db.getSideIncomes(ctx.user.id, input.year, input.month)),
    yearlySummary: protectedProcedure
      .input(z.object({ year: z.number() }))
      .query(({ input, ctx }) => db.getSideIncomeMonthlySummary(ctx.user.id, input.year)),
    total: protectedProcedure.query(({ ctx }) => db.getSideIncomeTotal(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        incomeDate: z.string(),
        year: z.number(),
        month: z.number(),
        categoryId: z.number().optional(),
        categoryName: z.string().optional(),
        amount: z.number(),
        description: z.string().optional(),
        isRegular: z.boolean().default(false),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 가계부 수입 항목 자동 추가
        const ledgerResult = await db.createLedgerEntry(ctx.user.id, {
          entryDate: input.incomeDate,
          year: input.year,
          month: input.month,
          mainCategory: "기타소득",
          subCategory: input.categoryName ?? "부수입",
          description: input.description ?? "",
          amount: input.amount,
          note: `[부수입 자동연동] ${input.note ?? ""}`.trim(),
        }) as { insertId?: number } | undefined;
        const ledgerEntryId = ledgerResult?.insertId;
        return db.createSideIncome(ctx.user.id, {
          ...input,
          incomeDate: input.incomeDate,
          ledgerEntryId,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          incomeDate: z.string().optional(),
          year: z.number().optional(),
          month: z.number().optional(),
          categoryId: z.number().optional(),
          categoryName: z.string().optional(),
          amount: z.number().optional(),
          description: z.string().optional(),
          isRegular: z.boolean().optional(),
          note: z.string().optional(),
        }),
      }))
      .mutation(({ input, ctx }) => {
        const { incomeDate, ...rest } = input.data;
        return db.updateSideIncome(ctx.user.id, input.id, {
          ...rest,
          ...(incomeDate ? { incomeDate: incomeDate } : {}),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteSideIncome(ctx.user.id, input.id)),
  }),
  account: router({
    list: protectedProcedure.query(({ ctx }) => db.listAccounts(ctx.user.id)),
    create: protectedProcedure.input(accountInput).mutation(({ input, ctx }) => db.createAccount(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: accountInput.partial() }))
      .mutation(({ input, ctx }) => db.updateAccount(ctx.user.id, input.id, input.data)),
    toggleActive: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(({ input, ctx }) => db.updateAccount(ctx.user.id, input.id, { isActive: input.isActive })),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteAccount(ctx.user.id, input.id)),
  }),
  installment: router({
    list: protectedProcedure.query(({ ctx }) => db.listInstallments(ctx.user.id)),
    create: protectedProcedure
      .input(installmentInput)
      .mutation(({ input, ctx }) => db.createInstallment(ctx.user.id, {
        ...input,
        interestRate: input.interestRate ?? "0",
        cardId: input.cardId ?? null,
      })),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: installmentInput.partial() }))
      .mutation(({ input, ctx }) => db.updateInstallment(ctx.user.id, input.id, {
        ...input.data,
        cardId: input.data.cardId ?? null,
      })),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteInstallment(ctx.user.id, input.id)),
  }),
  loan: router({
    list: protectedProcedure.query(({ ctx }) => db.listLoans(ctx.user.id)),
    create: protectedProcedure.input(loanInput).mutation(({ input, ctx }) => db.createLoan(ctx.user.id, {
      ...input,
      lender: input.lender ?? null,
      maturityDate: input.maturityDate ?? null,
      paymentDay: input.paymentDay ?? null,
      interestRate: input.interestRate ?? "0",
      graceMonths: input.graceMonths ?? 0,
      isActive: input.isActive ?? true,
    })),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: loanInput.partial() }))
      .mutation(({ input, ctx }) => db.updateLoan(ctx.user.id, input.id, {
        ...input.data,
        lender: input.data.lender ?? undefined,
        maturityDate: input.data.maturityDate ?? undefined,
        paymentDay: input.data.paymentDay ?? undefined,
      })),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteLoan(ctx.user.id, input.id)),
  }),
  borrowedMoney: router({
    list: protectedProcedure.query(({ ctx }) => db.listBorrowedMoney(ctx.user.id)),
    create: protectedProcedure.input(borrowedMoneyInput).mutation(({ input, ctx }) => db.createBorrowedMoney(ctx.user.id, {
      ...input,
      lenderUserId: input.lenderUserId ?? null,
      borrowerUserId: input.borrowerUserId ?? null,
      shareStatus: input.shareStatus ?? "private",
      borrowedDate: input.borrowedDate ?? null,
      repaymentStartDate: input.repaymentStartDate ?? null,
      repaymentDueDate: input.repaymentDueDate ?? null,
      paymentDay: input.paymentDay ?? null,
      totalInstallments: input.totalInstallments ?? null,
      installmentMode: input.installmentMode ?? "equal",
      repaymentSchedule: input.repaymentSchedule ?? null,
      isActive: input.isActive ?? true,
    })),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: borrowedMoneyUpdateInput }))
      .mutation(({ input, ctx }) => db.updateBorrowedMoney(ctx.user.id, input.id, {
        ...input.data,
        lenderUserId: input.data.lenderUserId ?? undefined,
        borrowerUserId: input.data.borrowerUserId ?? undefined,
        shareStatus: input.data.shareStatus ?? undefined,
        borrowedDate: input.data.borrowedDate ?? undefined,
        repaymentStartDate: input.data.repaymentStartDate ?? undefined,
        repaymentDueDate: input.data.repaymentDueDate ?? undefined,
        paymentDay: input.data.paymentDay ?? undefined,
        totalInstallments: input.data.totalInstallments ?? undefined,
        repaymentSchedule: input.data.repaymentSchedule ?? undefined,
      })),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteBorrowedMoney(ctx.user.id, input.id)),
    listPayments: protectedProcedure
      .input(z.object({ borrowedMoneyId: z.number().int().optional() }).optional())
      .query(({ input, ctx }) => db.listBorrowedMoneyPayments(ctx.user.id, input?.borrowedMoneyId)),
    addPayment: protectedProcedure
      .input(borrowedMoneyPaymentInput)
      .mutation(({ input, ctx }) => db.createBorrowedMoneyPayment(ctx.user.id, {
        ...input,
        installmentNo: input.installmentNo ?? null,
        note: input.note ?? null,
      })),
    deletePayment: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input, ctx }) => db.deleteBorrowedMoneyPayment(ctx.user.id, input.id)),
  }),
  categories: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        await db.seedDefaultCategories(ctx.user.id);
        return db.listCategories(ctx.user.id);
      }),
    addMain: protectedProcedure
      .input(z.object({ name: z.string().min(1), type: z.enum(["expense", "income", "both"]), sortOrder: z.number().default(0) }))
      .mutation(({ input, ctx }) => db.createCategory(ctx.user.id, input)),
    updateMain: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), type: z.enum(["expense", "income", "both"]).optional(), sortOrder: z.number().optional() }))
      .mutation(({ input, ctx }) => {
        const { id, ...data } = input;
        return db.updateCategory(ctx.user.id, id, data);
      }),
    deleteMain: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteCategory(ctx.user.id, input.id)),
    addSub: protectedProcedure
      .input(z.object({ categoryId: z.number(), name: z.string().min(1), sortOrder: z.number().default(0) }))
      .mutation(({ input, ctx }) => db.createSubCategory(ctx.user.id, input)),
    updateSub: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), sortOrder: z.number().optional() }))
      .mutation(({ input, ctx }) => {
        const { id, ...data } = input;
        return db.updateSubCategory(ctx.user.id, id, data);
      }),
    deleteSub: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteSubCategory(ctx.user.id, input.id)),
  }),
  insurance: router({
    list: protectedProcedure.query(({ ctx }) => db.listInsurance(ctx.user.id)),
    create: protectedProcedure
      .input(insuranceInput)
      .mutation(({ input, ctx }) => db.createInsurance(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: insuranceInput.partial() }))
      .mutation(({ input, ctx }) => db.updateInsurance(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteInsurance(ctx.user.id, input.id)),
  }),
  businessIncome: router({
    list: protectedProcedure.query(({ ctx }) => db.listBusinessIncomes(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        clientName: z.string(),
        clientType: z.enum(["회사", "개인"]).nullable().optional(),
        depositorName: z.string().nullable().optional(),
        phoneNumber: z.string().nullable().optional(),
        workAmount: z.number().default(0),
        depositPercent: z.number().int().min(1).max(100).default(50),
        workStartDate: z.string().nullable().optional(),
        isCompleted: z.boolean().default(false),
        settlementDate: z.string().nullable().optional(),
        cashReceiptDone: z.boolean().default(false),
        note: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const today = new Date().toISOString().slice(0, 10);
        const deposit = Math.round(input.workAmount * (input.depositPercent ?? 50) / 100);
        const balance = input.workAmount - deposit;
        let depositLedgerEntryId: number | null = null;
        let balanceLedgerEntryId: number | null = null;

        if (input.workStartDate && input.workStartDate <= today && deposit > 0) {
          const [y, m] = input.workStartDate.split("-").map(Number);
          const r = await db.createLedgerEntry(ctx.user.id, {
            entryDate: input.workStartDate,
            year: y, month: m,
            mainCategory: "사업소득", subCategory: "사업소득",
            description: `${input.clientName} 계약금`,
            amount: deposit,
            note: "[사업소득 자동연동]",
          }) as unknown as { insertId?: number };
          depositLedgerEntryId = r?.insertId ?? null;
        }
        if (input.isCompleted && input.settlementDate && balance > 0) {
          const [y, m] = input.settlementDate.split("-").map(Number);
          const r = await db.createLedgerEntry(ctx.user.id, {
            entryDate: input.settlementDate,
            year: y, month: m,
            mainCategory: "사업소득", subCategory: "사업소득",
            description: `${input.clientName} 잔금`,
            amount: balance,
            note: "[사업소득 자동연동]",
          }) as unknown as { insertId?: number };
          balanceLedgerEntryId = r?.insertId ?? null;
        }
        return db.createBusinessIncome(ctx.user.id, { ...input, depositLedgerEntryId, balanceLedgerEntryId });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          clientName: z.string().optional(),
          clientType: z.enum(["회사", "개인"]).nullable().optional(),
          depositorName: z.string().nullable().optional(),
          phoneNumber: z.string().nullable().optional(),
          workAmount: z.number().optional(),
          depositPercent: z.number().int().min(1).max(100).optional(),
          workStartDate: z.string().nullable().optional(),
          isCompleted: z.boolean().optional(),
          settlementDate: z.string().nullable().optional(),
          cashReceiptDone: z.boolean().optional(),
          note: z.string().nullable().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getBusinessIncome(ctx.user.id, input.id);
        if (!current) throw new Error("Not found");

        const today = new Date().toISOString().slice(0, 10);
        const merged = { ...current, ...input.data };
        const deposit = Math.round(merged.workAmount * merged.depositPercent / 100);
        const balance = merged.workAmount - deposit;

        let depositLedgerEntryId = current.depositLedgerEntryId ?? null;
        let balanceLedgerEntryId = current.balanceLedgerEntryId ?? null;

        // ─ 계약금 ledger
        const needDeposit = !!(merged.workStartDate && merged.workStartDate <= today && deposit > 0);
        if (needDeposit) {
          const [y, m] = merged.workStartDate!.split("-").map(Number);
          if (depositLedgerEntryId) {
            await db.updateLedgerEntry(ctx.user.id, depositLedgerEntryId, {
              entryDate: merged.workStartDate!,
              year: y, month: m,
              mainCategory: "사업소득",
              subCategory: "사업소득",
              description: `${merged.clientName} 계약금`,
              amount: deposit,
            });
          } else {
            const r = await db.createLedgerEntry(ctx.user.id, {
              entryDate: merged.workStartDate!,
              year: y, month: m,
              mainCategory: "사업소득", subCategory: "사업소득",
              description: `${merged.clientName} 계약금`,
              amount: deposit,
              note: "[사업소득 자동연동]",
            }) as unknown as { insertId?: number };
            depositLedgerEntryId = r?.insertId ?? null;
          }
        } else if (!needDeposit && depositLedgerEntryId) {
          await db.deleteLedgerEntry(ctx.user.id, depositLedgerEntryId);
          depositLedgerEntryId = null;
        }

        // ─ 잔금 ledger
        const needBalance = !!(merged.isCompleted && merged.settlementDate && balance > 0);
        if (needBalance) {
          const [y, m] = merged.settlementDate!.split("-").map(Number);
          if (balanceLedgerEntryId) {
            await db.updateLedgerEntry(ctx.user.id, balanceLedgerEntryId, {
              entryDate: merged.settlementDate!,
              year: y, month: m,
              mainCategory: "사업소득",
              subCategory: "사업소득",
              description: `${merged.clientName} 잔금`,
              amount: balance,
            });
          } else {
            const r = await db.createLedgerEntry(ctx.user.id, {
              entryDate: merged.settlementDate!,
              year: y, month: m,
              mainCategory: "사업소득", subCategory: "사업소득",
              description: `${merged.clientName} 잔금`,
              amount: balance,
              note: "[사업소득 자동연동]",
            }) as unknown as { insertId?: number };
            balanceLedgerEntryId = r?.insertId ?? null;
          }
        } else if (!needBalance && balanceLedgerEntryId) {
          await db.deleteLedgerEntry(ctx.user.id, balanceLedgerEntryId);
          balanceLedgerEntryId = null;
        }

        return db.updateBusinessIncome(ctx.user.id, input.id, {
          ...input.data, depositLedgerEntryId, balanceLedgerEntryId,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getBusinessIncome(ctx.user.id, input.id);
        if (current?.depositLedgerEntryId) await db.deleteLedgerEntry(ctx.user.id, current.depositLedgerEntryId);
        if (current?.balanceLedgerEntryId) await db.deleteLedgerEntry(ctx.user.id, current.balanceLedgerEntryId);
        return db.deleteBusinessIncome(ctx.user.id, input.id);
      }),
  }),
  businessExpense: router({
    list: protectedProcedure.query(({ ctx }) => db.listBusinessExpenses(ctx.user.id)),
    create: protectedProcedure
      .input(businessExpenseInput)
      .mutation(async ({ input, ctx }) => {
        let ledgerEntryId: number | null = null;
        if (input.category === "광고" && input.amount > 0) {
          const r = await db.createLedgerEntry(ctx.user.id, {
            entryDate: input.expenseDate,
            year: input.year,
            month: input.month,
            mainCategory: "사업지출",
            subCategory: "광고",
            description: input.description,
            amount: -Math.abs(input.amount),
            note: `[사업비용 자동연동]${input.vendor ? ` ${input.vendor}` : ""}${input.note ? ` · ${input.note}` : ""}`,
          }) as unknown as { insertId?: number };
          ledgerEntryId = getInsertId(r);
        }
        return db.createBusinessExpense(ctx.user.id, {
          ...input,
          expenseDate: input.expenseDate,
          ledgerEntryId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: businessExpenseInput.partial() }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getBusinessExpense(ctx.user.id, input.id);
        if (!current) throw new Error("Not found");
        const { expenseDate, ...rest } = input.data;
        const merged = {
          ...current,
          ...input.data,
          expenseDate: expenseDate ?? String(current.expenseDate).split("T")[0],
        };
        let ledgerEntryId = current.ledgerEntryId ?? null;
        const needsLedger = merged.category === "광고" && merged.amount > 0;
        if (needsLedger) {
          const ledgerData = {
            entryDate: merged.expenseDate,
            year: merged.year,
            month: merged.month,
            mainCategory: "사업지출",
            subCategory: "광고",
            description: merged.description,
            amount: -Math.abs(merged.amount),
            note: `[사업비용 자동연동]${merged.vendor ? ` ${merged.vendor}` : ""}${merged.note ? ` · ${merged.note}` : ""}`,
          };
          if (ledgerEntryId) {
            await db.updateLedgerEntry(ctx.user.id, ledgerEntryId, ledgerData);
          } else {
            const r = await db.createLedgerEntry(ctx.user.id, ledgerData);
            ledgerEntryId = getInsertId(r);
          }
        } else if (ledgerEntryId) {
          await db.deleteLedgerEntry(ctx.user.id, ledgerEntryId);
          ledgerEntryId = null;
        }
        return db.updateBusinessExpense(ctx.user.id, input.id, {
          ...rest,
          ...(expenseDate ? { expenseDate: expenseDate } : {}),
          ledgerEntryId,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getBusinessExpense(ctx.user.id, input.id);
        if (current?.ledgerEntryId) await db.deleteLedgerEntry(ctx.user.id, current.ledgerEntryId);
        return db.deleteBusinessExpense(ctx.user.id, input.id);
      }),
  }),
  laborCost: router({
    list: protectedProcedure.query(({ ctx }) => db.listLaborCosts(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        freelancerName: z.string().min(1),
        description: z.string().nullable().optional(),
        grossAmount: z.number().int().min(0),
        withholdingRate: z.string().default("3.30"),
        withholdingAmount: z.number().int().min(0),
        netAmount: z.number().int().min(0),
        paymentDate: z.string().nullable().optional(),
        reportDate: z.string().nullable().optional(),
        taxPaymentDate: z.string().nullable().optional(),
        taxPaymentAccount: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => db.createLaborCost(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: z.object({
          freelancerName: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          grossAmount: z.number().int().min(0).optional(),
          withholdingRate: z.string().optional(),
          withholdingAmount: z.number().int().min(0).optional(),
          netAmount: z.number().int().min(0).optional(),
          paymentDate: z.string().nullable().optional(),
          reportDate: z.string().nullable().optional(),
          taxPaymentDate: z.string().nullable().optional(),
          taxPaymentAccount: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
        }),
      }))
      .mutation(({ input, ctx }) => db.updateLaborCost(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input, ctx }) => db.deleteLaborCost(ctx.user.id, input.id)),
  }),
  featureRequest: router({
    list: protectedProcedure.query(() => db.listFeatureRequests()),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(5000),
      }))
      .mutation(({ input, ctx }) => db.createFeatureRequest(ctx.user.id, {
        ...input,
        authorName: ctx.user.name ?? ctx.user.email ?? "사용자",
      })),
    setDone: adminProcedure
      .input(z.object({ id: z.number().int(), isDone: z.boolean() }))
      .mutation(({ input, ctx }) => db.updateFeatureRequestStatus(ctx.user.id, input.id, input.isDone)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input }) => db.deleteFeatureRequest(input.id)),
  }),
  businessCardLedger: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().int().optional(), month: z.number().int().min(1).max(12).optional() }))
      .query(({ input, ctx }) => db.listBusinessCardLedger(ctx.user.id, input.year, input.month)),
    create: protectedProcedure
      .input(z.object({
        transactionDate: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        merchant: z.string().min(1),
        amount: z.number().int().min(0),
        category: z.string().nullable().optional(),
        cardName: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => db.createBusinessCardLedgerEntry(ctx.user.id, input)),
    bulkCreate: protectedProcedure
      .input(z.array(z.object({
        transactionDate: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        merchant: z.string().min(1),
        amount: z.number().int().min(0),
        category: z.string().nullable().optional(),
        cardName: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })))
      .mutation(({ input, ctx }) => db.bulkCreateBusinessCardLedger(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: z.object({
          transactionDate: z.string().optional(),
          year: z.number().int().optional(),
          month: z.number().int().min(1).max(12).optional(),
          merchant: z.string().min(1).optional(),
          amount: z.number().int().min(0).optional(),
          category: z.string().nullable().optional(),
          cardName: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
        }),
      }))
      .mutation(({ input, ctx }) => db.updateBusinessCardLedgerEntry(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input, ctx }) => db.deleteBusinessCardLedgerEntry(ctx.user.id, input.id)),
  }),
  businessBankLedger: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().int().optional(), month: z.number().int().min(1).max(12).optional() }))
      .query(({ input, ctx }) => db.listBusinessBankLedger(ctx.user.id, input.year, input.month)),
    create: protectedProcedure
      .input(z.object({
        transactionDate: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        transactionType: z.enum(["입금", "출금"]).default("출금"),
        description: z.string().min(1),
        counterparty: z.string().nullable().optional(),
        depositAmount: z.number().int().min(0).default(0),
        withdrawAmount: z.number().int().min(0).default(0),
        balance: z.number().int().nullable().optional(),
        accountName: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => db.createBusinessBankLedgerEntry(ctx.user.id, input)),
    bulkCreate: protectedProcedure
      .input(z.array(z.object({
        transactionDate: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        transactionType: z.enum(["입금", "출금"]).default("출금"),
        description: z.string().min(1),
        counterparty: z.string().nullable().optional(),
        depositAmount: z.number().int().min(0).default(0),
        withdrawAmount: z.number().int().min(0).default(0),
        balance: z.number().int().nullable().optional(),
        accountName: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })))
      .mutation(({ input, ctx }) => db.bulkCreateBusinessBankLedger(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: z.object({
          transactionDate: z.string().optional(),
          year: z.number().int().optional(),
          month: z.number().int().min(1).max(12).optional(),
          transactionType: z.enum(["입금", "출금"]).optional(),
          description: z.string().min(1).optional(),
          counterparty: z.string().nullable().optional(),
          depositAmount: z.number().int().min(0).optional(),
          withdrawAmount: z.number().int().min(0).optional(),
          balance: z.number().int().nullable().optional(),
          accountName: z.string().nullable().optional(),
          category: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
        }),
      }))
      .mutation(({ input, ctx }) => db.updateBusinessBankLedgerEntry(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input, ctx }) => db.deleteBusinessBankLedgerEntry(ctx.user.id, input.id)),
  }),
  ai: router({
    savingsAdvice: protectedProcedure
      .input(z.object({
        age: z.number(),
        monthlySalary: z.number(),
        monthlyIncome: z.number(),
        fixedExpenses: z.number(),
        variableExpenses: z.number(),
        businessExpenses: z.number(),
        subscriptions: z.number(),
        insurance: z.number(),
        installments: z.number(),
        loans: z.number(),
        borrowedRepayment: z.number(),
        monthlySavingsDeposit: z.number(),
        currentSavings: z.number(),
      }))
      .mutation(async ({ input }) => {
        const totalExpense = input.fixedExpenses + input.variableExpenses + input.businessExpenses + input.subscriptions + input.insurance + input.installments + input.loans + input.borrowedRepayment;
        const surplus = input.monthlySalary - totalExpense - input.monthlySavingsDeposit;
        const savingsRate = input.monthlySalary > 0 ? Math.round((input.monthlySavingsDeposit / input.monthlySalary) * 100) : 0;
        const prompt = `당신은 친근하고 따뜻한 한국인 재무 상담사예요. 아래 사용자의 이번 달 재무 현황을 보고, 마치 오랜 친구처럼 편하고 다정하게 저축 조언을 해주세요. 딱딱하지 않게, 공감하는 톤으로 이야기해주세요.

[사용자 정보]
- 나이: ${input.age}세
- 월 실수령액: ${input.monthlySalary.toLocaleString()}원

[이번 달 재무 현황]
- 가계부 수입 합계: ${input.monthlyIncome.toLocaleString()}원
- 고정지출: ${input.fixedExpenses.toLocaleString()}원
- 변동지출 (가계부): ${input.variableExpenses.toLocaleString()}원
- 사업지출: ${input.businessExpenses.toLocaleString()}원
- 구독서비스: ${input.subscriptions.toLocaleString()}원
- 보험료: ${input.insurance.toLocaleString()}원
- 할부금: ${input.installments.toLocaleString()}원
- 대출상환: ${input.loans.toLocaleString()}원
- 빌린돈 상환: ${input.borrowedRepayment.toLocaleString()}원
- 총 지출 합계: ${totalExpense.toLocaleString()}원
- 월 저축 납입액 (예적금·파킹통장 등): ${input.monthlySavingsDeposit.toLocaleString()}원
- 현재 저축률: ${savingsRate}% (월 납입액 / 월급)
- 지출+저축 후 남는 돈: ${surplus.toLocaleString()}원
- 현재 저축/현금성 자산 총액: ${input.currentSavings.toLocaleString()}원

아래 형식으로 답변해주세요. 마크다운 기호(**,##,- 등) 없이 순수 텍스트로 작성하고, 친근하고 따뜻한 말투를 유지해주세요.

[재무 진단]
(나이와 월급 대비 현재 상황을 공감하는 말투로 2~3문장. 잘 하고 있는 점도 언급해주세요)

[추천 월 저축액]
(현실적인 저축 금액과 이유를 친근하게. 목표 저축률도 함께 알려주세요)

[저축률 개선 팁]
1.
2.
3.

[주의할 점]
(걱정되는 부분을 부드럽게, 겁주지 않고 조언해주세요)`;
        const result = await callGroq(prompt);
        return { advice: result };
      }),
    portfolioAnalysis: protectedProcedure
      .input(z.object({
        totalBuy: z.number(),
        totalCurrent: z.number(),
        totalReturn: z.number(),
        stocks: z.array(z.object({
          name: z.string(),
          market: z.string(),
          sector: z.string(),
          weight: z.number(),
          returnRate: z.number().nullable(),
          buyAmount: z.number(),
          currentAmount: z.number(),
        })),
        sectorBreakdown: z.array(z.object({
          sector: z.string(),
          weight: z.number(),
          amount: z.number(),
        })),
        domesticRatio: z.number(),
        foreignRatio: z.number(),
      }))
      .mutation(async ({ input }) => {
        // 실시간 주요 지수 조회 (Yahoo Finance)
        type IndexMeta = { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketChangePercent?: number };
        async function fetchIndex(symbol: string): Promise<{ price: number; change: number } | null> {
          try {
            const res = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
              { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) }
            );
            if (!res.ok) return null;
            const data = await res.json() as { chart?: { result?: Array<{ meta?: IndexMeta }> } };
            const meta = data?.chart?.result?.[0]?.meta;
            if (!meta?.regularMarketPrice) return null;
            const prev = meta.chartPreviousClose ?? meta.regularMarketPrice;
            const change = meta.regularMarketChangePercent != null
              ? meta.regularMarketChangePercent
              : ((meta.regularMarketPrice - prev) / prev) * 100;
            return { price: meta.regularMarketPrice, change };
          } catch { return null; }
        }

        const [kospi, kosdaq, sp500, nasdaq, usdkrw] = await Promise.all([
          fetchIndex("^KS11"),
          fetchIndex("^KQ11"),
          fetchIndex("^GSPC"),
          fetchIndex("^IXIC"),
          fetchIndex("KRW=X"),
        ]);

        const fmtIdx = (v: { price: number; change: number } | null, decimals = 0) =>
          v ? `${v.price.toLocaleString("ko-KR", { maximumFractionDigits: decimals })} (${v.change >= 0 ? "+" : ""}${v.change.toFixed(2)}%)` : "조회 불가";

        const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

        const stockLines = input.stocks
          .sort((a, b) => b.weight - a.weight)
          .map(s => {
            const ret = s.returnRate !== null ? `${s.returnRate >= 0 ? "+" : ""}${s.returnRate.toFixed(2)}%` : "수익률 미입력";
            const profit = s.currentAmount - s.buyAmount;
            const profitStr = profit >= 0 ? `+${profit.toLocaleString()}원` : `${profit.toLocaleString()}원`;
            return `  - ${s.name} [${s.market}/${s.sector}]: 비중 ${s.weight.toFixed(1)}%, 수익률 ${ret}, 평가손익 ${profitStr}`;
          }).join("\n");

        const sectorLines = input.sectorBreakdown
          .sort((a, b) => b.weight - a.weight)
          .map(s => `  - ${s.sector}: ${s.weight.toFixed(1)}% (${s.amount.toLocaleString()}원)`)
          .join("\n");

        const topSector = input.sectorBreakdown.sort((a, b) => b.weight - a.weight)[0];
        const isConcentrated = topSector?.weight > 50;
        const hasForeign = input.foreignRatio > 0;
        const profitStocks = input.stocks.filter(s => s.returnRate !== null && s.returnRate > 10).sort((a, b) => (b.returnRate ?? 0) - (a.returnRate ?? 0));
        const lossStocks = input.stocks.filter(s => s.returnRate !== null && s.returnRate < -10).sort((a, b) => (a.returnRate ?? 0) - (b.returnRate ?? 0));

        const prompt = `당신은 친근하고 따뜻하면서도 전문성 있는 한국인 투자 상담사예요. 아래 사용자의 주식 포트폴리오와 오늘의 실시간 시장 데이터를 보고, 마치 오랜 친구이자 전문가처럼 깊이 있고 솔직하게 분석해주세요.

=== 오늘 날짜: ${today} ===

[실시간 시장 현황]
- KOSPI: ${fmtIdx(kospi)}
- KOSDAQ: ${fmtIdx(kosdaq)}
- S&P 500: ${fmtIdx(sp500)}
- NASDAQ: ${fmtIdx(nasdaq)}
- USD/KRW 환율: ${fmtIdx(usdkrw, 1)}원

[내 포트폴리오 요약]
- 총 매수원금: ${input.totalBuy.toLocaleString()}원
- 총 평가금액: ${input.totalCurrent.toLocaleString()}원
- 전체 수익률: ${input.totalReturn >= 0 ? "+" : ""}${input.totalReturn.toFixed(2)}% (평가손익: ${(input.totalCurrent - input.totalBuy).toLocaleString()}원)
- 국내/해외 비중: ${input.domesticRatio.toFixed(1)}% / ${input.foreignRatio.toFixed(1)}%
- 총 종목 수: ${input.stocks.length}개
- 주요 집중 섹터: ${topSector?.sector ?? "없음"} (${topSector?.weight.toFixed(1) ?? 0}%)
- 섹터 집중도: ${isConcentrated ? "⚠️ 특정 섹터 집중 위험" : "양호"}
${profitStocks.length > 0 ? `- 수익 상위 종목: ${profitStocks.slice(0, 3).map(s => `${s.name}(+${s.returnRate?.toFixed(1)}%)`).join(", ")}` : ""}
${lossStocks.length > 0 ? `- 손실 하위 종목: ${lossStocks.slice(0, 3).map(s => `${s.name}(${s.returnRate?.toFixed(1)}%)`).join(", ")}` : ""}

[섹터별 비중 상세]
${sectorLines}

[종목별 현황 상세]
${stockLines}

아래 형식 그대로 답변해주세요. 마크다운 기호(**,##,*,- 등) 없이 순수 텍스트로만 작성하고, 각 항목은 번호를 매겨 구체적으로 적어주세요. 친근하지만 전문적인 말투를 유지해주세요.

[오늘의 시장 맥락]
(오늘 실시간 지수 데이터를 기반으로 현재 시장 분위기를 2~3문장으로 설명해주세요. 사용자 포트폴리오와의 연관성도 언급)

[포트폴리오 종합 진단]
(총 수익률, 섹터 구성, 국내/해외 비중을 종합해서 잘하고 있는 점과 개선할 점을 구체적으로 3~4문장)

[섹터 비중 분석]
1. (현재 가장 비중 큰 섹터 평가 — 적정한지, 과한지)
2. (비어있거나 부족한 섹터 — 추가를 고려할 만한 이유)
3. (국내/해외 비중 평가 — 현재 환율과 시장 상황 감안)

[주목할 만한 분야 (지금 이 시점)]
1. (현재 글로벌 트렌드 기반 주목 섹터 — 구체적 이유 포함)
2. (국내 시장에서 주목할 섹터)
3. (해외 시장에서 주목할 섹터)

[추가를 고려할 종목 힌트]
국내:
1. (구체적인 종목 또는 유형, 이유)
2.
해외:
1. (구체적인 종목 또는 유형, 이유)
2.

[리밸런싱 액션 플랜]
1. (지금 당장 해야 할 것 — 구체적)
2. (1~3개월 내 검토할 것)
3. (장기적으로 고려할 것)

[내 종목 중 주의 신호]
(손실이 크거나 비중이 과도하거나 섹터 리스크가 있는 종목을 구체적으로, 부드럽게)`;

        const result = await callGroq(prompt, 2000);
        return { advice: result };
      }),
    ledgerAnalysis: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number(),
        income: z.number(),
        fixedExpenses: z.number(),
        variableExpenses: z.number(),
        businessExpenses: z.number(),
        savings: z.number(),
        subscriptions: z.number(),
        installments: z.number(),
        loans: z.number(),
        balance: z.number(),
        topCategories: z.array(z.object({
          name: z.string(),
          amount: z.number(),
          ratio: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        const totalExp = input.fixedExpenses + input.variableExpenses + input.businessExpenses
          + input.subscriptions + input.installments + input.loans;
        const savingsRate = input.income > 0 ? Math.round((input.savings / input.income) * 100) : 0;
        const expenseRate = input.income > 0 ? Math.round((totalExp / input.income) * 100) : 0;
        const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

        const categoryLines = input.topCategories
          .map(c => `  - ${c.name}: ${c.amount.toLocaleString()}원 (${c.ratio.toFixed(1)}%)`)
          .join("\n");

        const prompt = `당신은 친근하고 따뜻하면서도 솔직한 한국인 가계부 분석 전문가예요. 아래 ${input.year}년 ${input.month}월 가계부 데이터를 보고 마치 오랜 친구처럼 깊이 있게 분석해주세요.

=== 분석 기준일: ${today} ===

[${input.year}년 ${input.month}월 재무 현황]
- 총 소득: ${input.income.toLocaleString()}원
- 총 지출: ${totalExp.toLocaleString()}원 (소득 대비 ${expenseRate}%)
  · 고정지출: ${input.fixedExpenses.toLocaleString()}원
  · 변동지출: ${input.variableExpenses.toLocaleString()}원
  · 구독서비스: ${input.subscriptions.toLocaleString()}원
  · 할부결제: ${input.installments.toLocaleString()}원
  · 대출상환: ${input.loans.toLocaleString()}원
  · 사업지출: ${input.businessExpenses.toLocaleString()}원
- 저축/투자: ${input.savings.toLocaleString()}원 (저축률 ${savingsRate}%)
- 잔액 (소득-지출-저축): ${input.balance.toLocaleString()}원
- 잔액 상태: ${input.balance >= 0 ? "흑자" : "적자 ⚠️"}

[지출 세부 항목 TOP]
${categoryLines || "  - 데이터 없음"}

아래 형식으로 답변해주세요. 마크다운 기호(**,##,*,- 등) 없이 순수 텍스트로만 작성하세요. 숫자는 구체적으로 언급해주고, 친근하고 따뜻한 말투를 유지해주세요.

[이달 재무 진단]
(이번 달 전반적인 재무 상태를 소득/지출/저축 균형 중심으로 3~4문장. 잘하고 있는 점을 먼저 말해주세요)

[지출 패턴 분석]
1. (가장 큰 지출 항목 평가 — 적정한지, 줄일 여지가 있는지)
2. (변동지출에서 눈에 띄는 항목 분석)
3. (고정비용 구조 평가 — 구독·할부·대출 합산 부담도)

[이달의 절약 포인트]
1. (가장 효과적으로 줄일 수 있는 항목 — 구체적 금액 제안)
2. (다음으로 절약 가능한 항목)
3. (장기적으로 재검토할 고정비용)

[저축률 평가]
(현재 ${savingsRate}% 저축률에 대한 솔직한 평가. 이 월 소득 기준으로 권장 저축액과 비교해주세요)

[다음 달 실천 계획]
1. (당장 실천할 수 있는 구체적인 행동)
2. (이번 달 데이터 기반 개선 목표 — 금액 포함)
3. (중장기적으로 신경 쓸 재무 습관)`;

        const result = await callGroq(prompt, 1800);
        return { advice: result };
      }),
  }),
  exchangeRate: router({
    get: protectedProcedure
      .input(z.object({ currency: z.string() }))
      .query(async ({ input }) => {
        const { currency } = input;
        if (currency === 'KRW') return { rate: 1, currency: 'KRW', base: 'KRW' };
        try {
          const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
          if (!res.ok) throw new Error('fetch failed');
          const data = await res.json() as { rates: Record<string, number>; result: string };
          if (data.result !== 'success') throw new Error('API error');
          const krwRate = data.rates['KRW'];
          if (!krwRate) throw new Error('KRW rate not found');
          return { rate: krwRate, currency, base: currency };
        } catch {
          // 폴백: 고정 환율
          const fallback: Record<string, number> = { USD: 1380, EUR: 1500, JPY: 9.2, GBP: 1750, CNY: 190 };
          return { rate: fallback[currency] ?? 1, currency, base: currency, fallback: true };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
