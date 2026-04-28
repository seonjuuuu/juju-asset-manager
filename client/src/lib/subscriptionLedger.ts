/** 가계부·대시보드 공통: 구독 결제일 산정 및 일시정지 반영 */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clampDayInMonth(year: number, month: number, day: number) {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

function parseYmd(dateStr: string | null | undefined) {
  const match = dateStr?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
    value: `${y}-${m}-${d}`,
  };
}

export function subscriptionLedgerDate(
  year: number,
  month: number,
  billingCycle: string,
  billingDay: number | null | undefined,
  startDate: string | null | undefined
): string {
  let dayOfMonth = 1;

  if (billingDay != null && billingDay > 100) {
    dayOfMonth = billingDay % 100;
  } else if (billingDay != null && billingDay >= 1 && billingDay <= 31) {
    dayOfMonth = billingDay;
  } else if (startDate) {
    dayOfMonth = parseYmd(startDate)?.day ?? dayOfMonth;
  }

  if (billingCycle === "매일") {
    return `${year}-${pad2(month)}-01`;
  }

  dayOfMonth = clampDayInMonth(year, month, dayOfMonth);
  return `${year}-${pad2(month)}-${pad2(dayOfMonth)}`;
}

export function calcSubCostForMonth(
  price: number,
  billingCycle: string,
  sharedCount: number,
  billingDay: number | null | undefined,
  startDate: string | null | undefined,
  month: number
): number {
  const shared = Math.max(1, sharedCount);
  if (billingCycle === "매달" || billingCycle === "매주" || billingCycle === "매일") {
    const base = billingCycle === "매달" ? price : billingCycle === "매주" ? Math.round(price * 4.33) : price * 30;
    return Math.round(base / shared);
  }
  if (billingCycle === "매년") {
    let billingMonth: number;
    if (billingDay && billingDay > 100) billingMonth = Math.floor(billingDay / 100);
    else if (startDate) billingMonth = new Date(startDate).getMonth() + 1;
    else billingMonth = 1;
    return billingMonth === month ? Math.round(price / shared) : 0;
  }
  return 0;
}

type PauseAwareSub = {
  billingCycle: string;
  billingDay?: number | null;
  startDate?: string | null;
  isPaused?: boolean | null;
  pausedFrom?: string | null;
};

function yearlyBillingMonth(sub: PauseAwareSub): number {
  if (sub.billingDay != null && sub.billingDay > 100) return Math.floor(sub.billingDay / 100);
  return parseYmd(sub.startDate)?.month ?? 1;
}

function monthEndStr(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${pad2(month)}-${pad2(last)}`;
}

/** 시작일 이전 결제분은 월별가계부/대시보드에 반영하지 않는다. */
function subscriptionHasStartedForLedgerMonth(year: number, month: number, sub: PauseAwareSub): boolean {
  const start = parseYmd(sub.startDate);
  if (!start) return true;

  if (sub.billingCycle === "매일" || sub.billingCycle === "매주") {
    return monthEndStr(year, month) >= start.value;
  }

  const paymentStr = subscriptionLedgerDate(year, month, sub.billingCycle, sub.billingDay, sub.startDate);
  return paymentStr >= start.value;
}

/** 해당 월 가계부/차트에 구독 비용을 넣을지 (일시정지·결제일 기준) */
export function subscriptionAppliesToLedgerMonth(year: number, month: number, sub: PauseAwareSub): boolean {
  if (!subscriptionHasStartedForLedgerMonth(year, month, sub)) return false;
  if (!sub.isPaused) return true;
  const pf = sub.pausedFrom?.trim();
  if (!pf) return false;

  if (sub.billingCycle === "매년" && month !== yearlyBillingMonth(sub)) {
    return true;
  }

  if (sub.billingCycle === "매일" || sub.billingCycle === "매주") {
    // 월 환산 구독은 일할 계산하지 않으므로, 일시정지가 시작된 달까지는 반영하고 다음 달부터 제외한다.
    const monthStart = `${year}-${pad2(month)}-01`;
    return monthStart <= pf;
  }

  const paymentStr = subscriptionLedgerDate(year, month, sub.billingCycle, sub.billingDay, sub.startDate);
  return paymentStr <= pf;
}

export function ledgerSubCostForMonth(
  year: number,
  month: number,
  sub: PauseAwareSub & {
    price: number;
    sharedCount?: number;
  }
): number {
  const base = calcSubCostForMonth(
    sub.price,
    sub.billingCycle,
    sub.sharedCount ?? 1,
    sub.billingDay,
    sub.startDate,
    month
  );
  if (base === 0) return 0;
  if (!subscriptionAppliesToLedgerMonth(year, month, sub)) return 0;
  return base;
}

/** 요약 카드용: 이번 달 합계에 넣을지 (= 가계부와 동일한 일시정지·결제일 규칙) */
export function subscriptionActiveForSummaryToday(sub: PauseAwareSub): boolean {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  return subscriptionAppliesToLedgerMonth(y, m, sub);
}
