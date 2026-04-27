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
    summary: protectedProcedure.query(() => db.getDashboardSummary()),
    yearlySummary: protectedProcedure.input(z.object({ year: z.number() })).query(({ input }) =>
      db.getYearlySummary(input.year)
    ),
  }),

  // ─── 가계부 ─────────────────────────────────────────────────────────────────
  ledger: router({
    list: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input }) => db.getLedgerEntries(input.year, input.month)),
    monthSummary: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input }) => db.getLedgerMonthSummary(input.year, input.month)),
    create: protectedProcedure.input(ledgerEntryInput).mutation(({ input }) =>
      db.createLedgerEntry({
        ...input,
        entryDate: input.entryDate as unknown as Date,
      })
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: ledgerEntryInput.partial() }))
      .mutation(({ input }) => db.updateLedgerEntry(input.id, input.data as Parameters<typeof db.updateLedgerEntry>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteLedgerEntry(input.id)
    ),
  }),

  // ─── 고정지출 ───────────────────────────────────────────────────────────────
  fixedExpense: router({
    list: protectedProcedure.query(() => db.getFixedExpenses()),
    create: protectedProcedure.input(fixedExpenseInput).mutation(({ input }) =>
      db.createFixedExpense(input as Parameters<typeof db.createFixedExpense>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: fixedExpenseInput.partial() }))
      .mutation(({ input }) => db.updateFixedExpense(input.id, input.data as Parameters<typeof db.updateFixedExpense>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteFixedExpense(input.id)
    ),
  }),

  // ─── 주식 포트폴리오 ─────────────────────────────────────────────────────────
  stock: router({
    list: protectedProcedure.input(z.object({ snapshotMonth: z.string().optional() })).query(({ input }) =>
      db.getStockPortfolio(input.snapshotMonth)
    ),
    create: protectedProcedure.input(stockInput).mutation(({ input }) =>
      db.createStockEntry(input as Parameters<typeof db.createStockEntry>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: stockInput.partial() }))
      .mutation(({ input }) => db.updateStockEntry(input.id, input.data as Parameters<typeof db.updateStockEntry>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteStockEntry(input.id)
    ),
  }),

  // ─── 저축 및 현금성 자산 ──────────────────────────────────────────────────────
  savings: router({
    list: protectedProcedure.query(() => db.getSavingsAssets()),
    create: protectedProcedure.input(savingsInput).mutation(({ input }) =>
      db.createSavingsAsset(input as Parameters<typeof db.createSavingsAsset>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: savingsInput.partial() }))
      .mutation(({ input }) => db.updateSavingsAsset(input.id, input.data as Parameters<typeof db.updateSavingsAsset>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteSavingsAsset(input.id)
    ),
  }),

  // ─── 연금 ───────────────────────────────────────────────────────────────────
  pension: router({
    list: protectedProcedure.query(() => db.getPensionAssets()),
    create: protectedProcedure.input(pensionInput).mutation(({ input }) =>
      db.createPensionAsset(input as Parameters<typeof db.createPensionAsset>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: pensionInput.partial() }))
      .mutation(({ input }) => db.updatePensionAsset(input.id, input.data as Parameters<typeof db.updatePensionAsset>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deletePensionAsset(input.id)
    ),
  }),

  // ─── 기타 자산 ──────────────────────────────────────────────────────────────
  otherAsset: router({
    list: protectedProcedure.query(() => db.getOtherAssets()),
    create: protectedProcedure.input(otherAssetInput).mutation(({ input }) =>
      db.createOtherAsset(input as Parameters<typeof db.createOtherAsset>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: otherAssetInput.partial() }))
      .mutation(({ input }) => db.updateOtherAsset(input.id, input.data as Parameters<typeof db.updateOtherAsset>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteOtherAsset(input.id)
    ),
  }),

  // ─── 부동산 ─────────────────────────────────────────────────────────────────
  realEstate: router({
    list: protectedProcedure.query(() => db.getRealEstates()),
    create: protectedProcedure.input(realEstateInput).mutation(({ input }) =>
      db.createRealEstate(input as Parameters<typeof db.createRealEstate>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: realEstateInput.partial() }))
      .mutation(({ input }) => db.updateRealEstate(input.id, input.data as Parameters<typeof db.updateRealEstate>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteRealEstate(input.id)
    ),
  }),

  // ─── 블로그 체험단 ───────────────────────────────────────────────────────────
  blogCampaign: router({
    list: protectedProcedure.query(() => db.getBlogCampaigns()),
    create: protectedProcedure.input(blogCampaignInput).mutation(({ input }) =>
      db.createBlogCampaign(input as Parameters<typeof db.createBlogCampaign>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: blogCampaignInput.partial() }))
      .mutation(({ input }) => db.updateBlogCampaign(input.id, input.data as Parameters<typeof db.updateBlogCampaign>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteBlogCampaign(input.id)
    ),
  }),

  // ─── 구독결제 서비스 ─────────────────────────────────────────────────────────
  subscription: router({
    list: protectedProcedure.query(() => db.getSubscriptions()),
    create: protectedProcedure.input(subscriptionInput).mutation(({ input }) =>
      db.createSubscription(input as Parameters<typeof db.createSubscription>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: subscriptionInput.partial() }))
      .mutation(({ input }) => db.updateSubscription(input.id, input.data as Parameters<typeof db.updateSubscription>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteSubscription(input.id)
    ),
  }),

  // ─── 보유카드 ──────────────────────────────────────────────────────────────
  card: router({
    list: protectedProcedure.query(() => db.getCards()),
    create: protectedProcedure.input(cardInput).mutation(({ input }) =>
      db.createCard(input as Parameters<typeof db.createCard>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: cardInput.partial() }))
      .mutation(({ input }) => db.updateCard(input.id, input.data as Parameters<typeof db.updateCard>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteCard(input.id)
    ),
  }),

  // ─── 포인트/마일리지 ─────────────────────────────────────────────────────────
  cardPoint: router({
    list: protectedProcedure.query(() => db.getCardPoints()),
    create: protectedProcedure.input(cardPointInput).mutation(({ input }) =>
      db.createCardPoint(input as Parameters<typeof db.createCardPoint>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: cardPointInput.partial() }))
      .mutation(({ input }) => db.updateCardPoint(input.id, input.data as Parameters<typeof db.updateCardPoint>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteCardPoint(input.id)
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
    list: protectedProcedure.query(() => db.getDebts()),
    create: protectedProcedure.input(debtInput).mutation(({ input }) =>
      db.createDebt(input as Parameters<typeof db.createDebt>[0])
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: debtInput.partial() }))
      .mutation(({ input }) => db.updateDebt(input.id, input.data as Parameters<typeof db.updateDebt>[1])),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteDebt(input.id)
    ),
  }),

  // ─── 부수입 카테고리 ───────────────────────────────────────────────────────────
  sideIncomeCategory: router({
    list: protectedProcedure.query(() => db.getSideIncomeCategories()),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
      .mutation(({ input }) => db.createSideIncomeCategory(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.object({ name: z.string().optional(), color: z.string().optional() }) }))
      .mutation(({ input }) => db.updateSideIncomeCategory(input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteSideIncomeCategory(input.id)),
  }),

  // ─── 부수입 내역 ───────────────────────────────────────────────────────────────
  sideIncome: router({
    list: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(({ input }) => db.getSideIncomes(input.year, input.month)),
    yearlySummary: protectedProcedure
      .input(z.object({ year: z.number() }))
      .query(({ input }) => db.getSideIncomeMonthlySummary(input.year)),
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
      .mutation(async ({ input }) => {
        // 가계부 수입 항목 자동 추가
        const ledgerResult = await db.createLedgerEntry({
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
        return db.createSideIncome({
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
      .mutation(({ input }) => {
        const { incomeDate, ...rest } = input.data;
        return db.updateSideIncome(input.id, {
          ...rest,
          ...(incomeDate ? { incomeDate: incomeDate as unknown as Date } : {}),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteSideIncome(input.id)),
  }),
  account: router({
    list: protectedProcedure.query(() => db.listAccounts()),
    create: protectedProcedure.input(accountInput).mutation(({ input }) => db.createAccount(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: accountInput.partial() }))
      .mutation(({ input }) => db.updateAccount(input.id, input.data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteAccount(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
