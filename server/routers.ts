import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

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
});
const subscriptionInput = z.object({
  serviceName: z.string(),
  category: z.enum(["비즈니스", "미디어", "자기계발", "기타"]).default("기타"),
  billingCycle: z.enum(["매달", "매주", "매일", "매년"]).default("매달"),
  price: z.number().default(0),
  sharedCount: z.number().int().min(1).default(1),
  billingDay: z.number().int().min(1).max(1231).nullable().optional(),
  startDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
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
  paymentAccount: z.string().optional(),
  monthlyAmount: z.number(),
  totalAmount: z.number().optional(),
  interestRate: z.string().optional(),
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
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  visitDate: z.string().optional(),
  reviewDone: z.boolean().optional(),
  completed: z.boolean().optional(),
  note: z.string().optional(),
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
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input, ctx }) => db.getLedgerEntries(ctx.user.id, input.year, input.month)),
    monthSummary: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input, ctx }) => db.getLedgerMonthSummary(ctx.user.id, input.year, input.month)),
    create: protectedProcedure.input(ledgerEntryInput).mutation(({ input, ctx }) =>
      db.createLedgerEntry(ctx.user.id, {
        ...input,
        entryDate: input.entryDate as unknown as Date,
      })
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: ledgerEntryInput.partial() }))
      .mutation(({ input, ctx }) => db.updateLedgerEntry(ctx.user.id, input.id, input.data as Parameters<typeof db.updateLedgerEntry>[2])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
      db.deleteLedgerEntry(ctx.user.id, input.id)
    ),
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

  // ─── 구독결제 서비스 ─────────────────────────────────────────────────────────
  subscription: router({
    list: protectedProcedure.query(({ ctx }) => db.getSubscriptions(ctx.user.id)),
    create: protectedProcedure.input(subscriptionInput).mutation(({ input, ctx }) =>
      db.createSubscription(ctx.user.id, input as Parameters<typeof db.createSubscription>[1])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: subscriptionInput.partial() }))
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
        const { callDataApi } = await import("./_core/dataApi");
        // 한국 시장은 .KS 접미사 추가, 해외는 그대로
        const symbol = input.market === "KR"
          ? (input.ticker.includes(".") ? input.ticker : `${input.ticker}.KS`)
          : input.ticker;
        try {
          const resp = await callDataApi("YahooFinance/get_stock_chart", {
            query: { symbol, region: input.market === "KR" ? "KR" : "US", interval: "1d", range: "1d" },
          }) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; longName?: string; currency?: string } }> } };
          const meta = resp?.chart?.result?.[0]?.meta;
          if (!meta?.regularMarketPrice) throw new Error("현재가 조회 실패");
          return {
            ticker: input.ticker,
            symbol,
            price: meta.regularMarketPrice,
            name: meta.longName ?? "",
            currency: meta.currency ?? (input.market === "KR" ? "KRW" : "USD"),
            updatedAt: new Date().toISOString(),
          };
        } catch (e) {
          throw new Error(`ETF 현재가 조회 실패: ${(e as Error).message}`);
        }
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
          entryDate: input.incomeDate as unknown as Date,
          year: input.year,
          month: input.month,
          mainCategory: "수입",
          subCategory: input.categoryName ?? "부수입",
          description: input.description ?? "",
          amount: input.amount,
          note: `[부수입 자동연동] ${input.note ?? ""}`.trim(),
        }) as { insertId?: number } | undefined;
        const ledgerEntryId = ledgerResult?.insertId;
        return db.createSideIncome(ctx.user.id, {
          ...input,
          incomeDate: input.incomeDate as unknown as Date,
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
          ...(incomeDate ? { incomeDate: incomeDate as unknown as Date } : {}),
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
