/** `RealEstateFundPlan` 과 동일 키 localStorage 에 저장된 활성 항목 금액 합(만원) */
export const RE_FUND_PLAN_LS_KEY = "re_fund_plan_v1";

export function readReFundPlanTotalManwon(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    const raw = localStorage.getItem(RE_FUND_PLAN_LS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, { enabled?: boolean; amount?: number }>;
    if (!parsed || typeof parsed !== "object") return 0;
    return Object.values(parsed).reduce((sum, row) => {
      if (!row || row.enabled !== true) return sum;
      const n = typeof row.amount === "number" && Number.isFinite(row.amount) ? row.amount : 0;
      return sum + Math.max(0, n);
    }, 0);
  } catch {
    return 0;
  }
}
