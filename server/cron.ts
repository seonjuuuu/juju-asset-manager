import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { stockPortfolio } from "../drizzle/schema";
import { callDataApi } from "./_core/dataApi";

const FALLBACK_RATES: Record<string, number> = { USD: 1380, EUR: 1500, JPY: 9.2, GBP: 1750, CNY: 190 };

async function getKrwRate(currency: string): Promise<number> {
  if (currency === "KRW") return 1;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
    const data = await res.json() as { rates: Record<string, number>; result: string };
    if (data.result === "success" && data.rates["KRW"]) return data.rates["KRW"];
  } catch { /* fall through */ }
  return FALLBACK_RATES[currency] ?? 1;
}

async function fetchKrwPrice(ticker: string, market: string): Promise<number | null> {
  const isOverseas = market === "해외";
  const symbol = isOverseas ? ticker : (ticker.includes(".") ? ticker : `${ticker}.KS`);
  try {
    const resp = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, region: isOverseas ? "US" : "KR", interval: "1d", range: "1d" },
    }) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }> } };
    const meta = resp?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const currency = meta.currency ?? (isOverseas ? "USD" : "KRW");
    const rate = await getKrwRate(currency);
    return Math.round(meta.regularMarketPrice * rate);
  } catch {
    return null;
  }
}

export async function runStockPriceUpdate() {
  const db = await getDb();
  if (!db) return;

  const stocks = await db.select().from(stockPortfolio).where(isNotNull(stockPortfolio.ticker));
  if (stocks.length === 0) return;

  let updated = 0;
  let failed = 0;

  for (const stock of stocks) {
    if (!stock.ticker) continue;
    const krwPrice = await fetchKrwPrice(stock.ticker, stock.market ?? "국내");
    if (krwPrice) {
      const qty = parseFloat(stock.quantity ?? "0");
      const currentAmount = qty > 0 ? Math.round(krwPrice * qty) : (stock.currentAmount ?? 0);
      const buyAmount = stock.buyAmount ?? 0;
      const returnRate = buyAmount > 0 && currentAmount > 0
        ? (((currentAmount - buyAmount) / buyAmount) * 100).toFixed(2)
        : (stock.returnRate ?? "0");
      try {
        await db.update(stockPortfolio)
          .set({ currentPrice: krwPrice, currentAmount, returnRate })
          .where(eq(stockPortfolio.id, stock.id));
        updated++;
      } catch {
        failed++;
      }
    } else {
      failed++;
    }
  }

  console.log(`[Stock Cron] ${new Date().toLocaleString("ko-KR")} — 업데이트: ${updated}개, 실패: ${failed}개`);
}

export function startStockPriceCron() {
  const HOUR_MS = 60 * 60 * 1000;

  // 서버 시작 30초 후 첫 실행
  setTimeout(() => {
    console.log("[Stock Cron] 첫 현재가 업데이트 실행");
    runStockPriceUpdate().catch(console.error);
  }, 30_000);

  // 이후 매 1시간마다 실행
  setInterval(() => {
    console.log("[Stock Cron] 정기 현재가 업데이트 실행");
    runStockPriceUpdate().catch(console.error);
  }, HOUR_MS);

  console.log("[Stock Cron] 주식 현재가 자동 업데이트 스케줄러 시작 (1시간 주기)");
}
