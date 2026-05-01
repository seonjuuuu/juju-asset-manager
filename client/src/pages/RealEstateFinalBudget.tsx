import { CurrencyInput } from "@/components/ui/currency-input";
import { formatAmount } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { readReFundPlanTotalManwon, RE_FUND_PLAN_LS_KEY } from "@/lib/real-estate-fund-plan-total";
import { Building2, ClipboardCheck, Home, PiggyBank, Scale, Shield, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type RegionType = "seoul" | "overheated" | "metro" | "other";

/** 스트레스 DSR 적용 여부 선택용: 수도권(서울·경기·인천) vs 그 외 지역 금리 가산 예시 참고용 */
type StressMetroRegion = "capital" | "non_capital";

/** Step 3 참고 정책 상품 선택 (금융기관·연도별로 조건·한도 변동 가능) */
type Step3PolicyProduct = "none" | "ddimmidol" | "bogeumjari" | "newlywed_purchase";

type DdimmidolLoanCapVariant =
  /** 일반 최대 원금 참고 한도 약 2억 원 */
  | "general_2eok"
  /** 생애최초 약 2.4억 원 */
  | "first_home_240"
  /** 신혼·다자녀 등 해당 시 약 3.2억 원 참고 한도·대상 주택가 상한 참고값은 상품별 안내 참조 */
  | "newlywed_or_multiplier_320"
  /** 만 30세 이상 미혼 단독세대, 연소득 6천만 원 이하 등 특례 시 약 3억 참고 */
  | "solo_30_inc60m_300";

type BogeumjariLoanCapVariant =
  | "general_360"
  | "first_home_420"
  /** 전세사기 피해자 채무조정 특례 등 약 4억+ (별도 증빙·기관별 기준 가능) */
  | "jeonse_victim_400_plus";

type BudgetPlan = {
  writtenDate: string;
  ownIncome: number;
  spouseIncome: number;
  hasSpouse: boolean;
  targetHousePriceEok: string;
  region: RegionType;
  isFirstHome: boolean;
  /** 가정 금리(연이자 %), 예: 연 5% → 5 */
  assumedAnnualRatePct: string;
  /** 가정 거치없음 원금균등/원리금 상환 기준 대출 연수 */
  assumedLoanYears: number;
  /** 다른 대출 포함 연간 원리금 부담(만원) — 카드 할부 등은 포함 여부 확인 필요 */
  otherAnnualDebtBurdenManwon: number;
  /** 스트레스 DSR 적용 시 역산에 사용할 명목금리 위에 가산되는 수치(예: 수도권 +3%). 수동값. */
  stressRateAddPct: string;
  applyStressDsr: boolean;
  stressMetroRegion: StressMetroRegion;
  /** true면 stressRateAddPct 수치를 직접 사용, false면 수도권/지방 프리셋(2026.01 기준 참고) */
  stressUseCustomAdd: boolean;
  step3PolicyProduct: Step3PolicyProduct;
  ddimmidolLoanCapVariant: DdimmidolLoanCapVariant;
  bogeumjariLoanCapVariant: BogeumjariLoanCapVariant;
  /** Step 3 정책 상품 월 상환 시뮬레이션용 연 금리(%) 직접 입력. 빈 문자열이면 상품별 중간값 사용 */
  step3PolicyAnnualRatePct: string;
  /** null이면 Step3에서 계산된 제안 대출 원금 사용, 숫자면 월 상환 시뮬에 그 값 사용(과도하면 상한까지 자동 클램프) */
  step3LoanPrincipalManualManwon: number | null;
  /** 로컬 저장 스키마(거치 디폴트 변경 등 업그레이드 구분. 예전 저장분은 필드 없음 → 1로 간주) */
  budgetPlanSchema: number;
  /** null이면 연 총소득에서 세후 월 근산(연간 기준 약 세전의 75%를 12로 나눈 근삿값) 자동 채움 · 단위 만원 */
  step4NetMonthlyManualManwon: number | null;
  /** null이면 Step 3 예상 월 상환으로 채움 · 단위 만원 */
  step4HousingMonthlyManualManwon: number | null;
  /** Step 5 자기자금 억 입력. 빈 문자열이면 가용 자금 계획서(활성 항목) 합계·만원을 자기자금으로 사용합니다. */
  step5OwnFundsEok: string;
  /** true면 신혼가구 장만기 참고 규격 적용 */
  bogeumTermNewlywedHousehold: boolean;
};

const LS_KEY = "re_final_budget_v2";
/** v1 저장분을 한 번 불러오기 위해 남김 */
const LEGACY_LS_KEY = "re_final_budget_v1";

/** 저장 JSON에 붙일 최신 스키마 번호 — 값이 더 낮고 거치연수가 예전 디폴트(30)였으면 디폴트 40년으로 올림 */
const BUDGET_PLAN_SCHEMA_CURRENT = 2;

/** DSR 역산·원리금 시뮬에 쓰는 거치연수 초기값(년). 허용 상한은 따로 클램프합니다. */
const DEFAULT_ASSUMED_LOAN_YEARS = 40;

const DEFAULT_PLAN: BudgetPlan = {
  writtenDate: new Date().toISOString().slice(0, 10),
  ownIncome: 0,
  spouseIncome: 0,
  hasSpouse: false,
  targetHousePriceEok: "",
  region: "seoul",
  isFirstHome: true,
  assumedAnnualRatePct: "5",
  assumedLoanYears: DEFAULT_ASSUMED_LOAN_YEARS,
  otherAnnualDebtBurdenManwon: 0,
  stressRateAddPct: "3",
  applyStressDsr: true,
  stressMetroRegion: "capital",
  stressUseCustomAdd: false,
  step3PolicyProduct: "none",
  ddimmidolLoanCapVariant: "general_2eok",
  bogeumjariLoanCapVariant: "general_360",
  step3PolicyAnnualRatePct: "",
  step3LoanPrincipalManualManwon: null,
  bogeumTermNewlywedHousehold: false,
  budgetPlanSchema: BUDGET_PLAN_SCHEMA_CURRENT,
  step4NetMonthlyManualManwon: null,
  step4HousingMonthlyManualManwon: null,
  step5OwnFundsEok: "",
};

/** localStorage 등에서 문자열로 들어오면 역산에는 항상 기본값만 적용되어 입력이 먹지 않은 것처럼 보일 수 있어 숫자로 고정합니다. */
function clampAssumedLoanYears(raw: unknown): number {
  if (typeof raw === "number") {
    if (Number.isFinite(raw) && raw >= 1) return Math.min(50, Math.round(raw));
    return DEFAULT_ASSUMED_LOAN_YEARS;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return DEFAULT_ASSUMED_LOAN_YEARS;
    const n = Number.parseFloat(t);
    if (Number.isFinite(n) && n >= 1) return Math.min(50, Math.round(n));
  }
  return DEFAULT_ASSUMED_LOAN_YEARS;
}

const REGION_OPTIONS: Array<{
  value: RegionType;
  label: string;
  deduction: number;
  deductionBase: string;
}> = [
  { value: "seoul", label: "서울특별시", deduction: 5500, deductionBase: "1억 6,500만원 이하" },
  { value: "overheated", label: "과밀억제권역·세종·용인·화성·김포", deduction: 4800, deductionBase: "1억 4,500만원 이하" },
  { value: "metro", label: "광역시·안산·광주·파주·이천·평택", deduction: 2800, deductionBase: "8,500만원 이하" },
  { value: "other", label: "그 밖의 지역", deduction: 2500, deductionBase: "7,500만원 이하" },
];

/** Step 4 근산: 세전 연소득 만원 중 세후로 남는다고 보는 연간 비율(÷12 해 월 근산) — 과세 특성마다 크게 다를 수 있습니다. */
const STEP4_ANNUAL_NET_RATIO_FROM_PRETAX = 0.75;

function estimateNetMonthlyManwon(totalPretaxAnnualManwon: number): number {
  if (!Number.isFinite(totalPretaxAnnualManwon) || totalPretaxAnnualManwon <= 0) return 0;
  return Math.max(
    0,
    Math.round(((totalPretaxAnnualManwon * STEP4_ANNUAL_NET_RATIO_FROM_PRETAX) / 12) * 100) / 100,
  );
}

type Step4BurdenBand = "comfort" | "moderate" | "tight" | "severe";

function step4BurdenBandFromPct(pct: number): Step4BurdenBand {
  if (!Number.isFinite(pct) || pct <= 0) return "comfort";
  if (pct <= 30) return "comfort";
  if (pct <= 40) return "moderate";
  if (pct <= 50) return "tight";
  return "severe";
}

function peekLastSavedAtIso(): string {
  try {
    if (typeof localStorage === "undefined") return "";
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return "";
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "";
    const v = (parsed as { lastSavedAtIso?: unknown }).lastSavedAtIso;
    return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : "";
  } catch {
    return "";
  }
}

function loadPlan(): BudgetPlan {
  try {
    let raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw && typeof localStorage !== "undefined") raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return DEFAULT_PLAN;
    const merged = { ...DEFAULT_PLAN, ...JSON.parse(raw) } as BudgetPlan;

    merged.assumedLoanYears = clampAssumedLoanYears(merged.assumedLoanYears);

    const schemaRaw = (merged as { budgetPlanSchema?: unknown }).budgetPlanSchema;
    const prevSchema =
      typeof schemaRaw === "number" && Number.isFinite(schemaRaw) && schemaRaw >= 1
        ? Math.floor(schemaRaw)
        : 1;
    /** 스키마 1·거치연수 30 조합만 예전 기본 디폴트로 보고 40년으로 교체합니다. 재저장 후 schema 2라 이후 사용자가 30을 넣어도 유지됩니다. */
    if (prevSchema < BUDGET_PLAN_SCHEMA_CURRENT && merged.assumedLoanYears === 30)
      merged.assumedLoanYears = DEFAULT_ASSUMED_LOAN_YEARS;
    merged.budgetPlanSchema = BUDGET_PLAN_SCHEMA_CURRENT;

    delete (merged as { lastSavedAtIso?: unknown }).lastSavedAtIso;

    return merged;
  } catch {
    return DEFAULT_PLAN;
  }
}

function getLendingRule(region: RegionType, isFirstHome: boolean) {
  const isSeoulOrRegulated = region === "seoul" || region === "overheated";
  if (isSeoulOrRegulated) {
    return isFirstHome
      ? { ltv: 70, dti: 60, dsr: 40, label: "서울/규제지역 생애최초" }
      : { ltv: 40, dti: 40, dsr: 40, label: "서울/규제지역 일반" };
  }

  return isFirstHome
    ? { ltv: 80, dti: 60, dsr: 40, label: "비규제지역 생애최초" }
    : { ltv: 70, dti: 60, dsr: 40, label: "비규제지역 일반" };
}

function parseEok(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 만원 원금 역산용: 거치 없음 원리금 균등(주택마련·담보 대출 흔한 정액상환 형태 모형과 동일), 월 복리(n>0일 때 유효) */
function amortizedLoanPrincipalLimitManwon(opts: {
  annualPaymentBudgetManwon: number;
  annualRatePct: number;
  loanYears: number;
}): { principal: number; monthlyPaymentApprox: number; annualPaymentFromScheduleManwon: number; note?: string } {
  const { annualPaymentBudgetManwon, loanYears } = opts;
  const annualRatePct = opts.annualRatePct;

  if (annualPaymentBudgetManwon <= 0 || loanYears <= 0) {
    return { principal: 0, monthlyPaymentApprox: 0, annualPaymentFromScheduleManwon: 0, note: "입력값 부족" };
  }

  const months = loanYears * 12;
  const monthlyBudget = annualPaymentBudgetManwon / 12;

  if (annualRatePct <= 0) {
    const principalFloat = monthlyBudget * months;
    /** 만원 단위 올림은 연 상환 허용액을 넘길 수 있어 버림 */
    const principal = Math.max(0, Math.floor(principalFloat));
    const monthlyPaymentApprox = Math.round((months > 0 ? principal / months : 0) * 100) / 100;
    const annualPaymentFromScheduleManwon = Math.round(monthlyPaymentApprox * 12 * 100) / 100;
    return { principal, monthlyPaymentApprox, annualPaymentFromScheduleManwon };
  }

  const r = annualRatePct / 100 / 12;
  const denom = 1 - (1 + r) ** (-months);
  const factor = r / denom;
  if (denom <= 0 || factor <= 0 || !Number.isFinite(factor)) {
    return { principal: 0, monthlyPaymentApprox: 0, annualPaymentFromScheduleManwon: 0, note: "계산 불가" };
  }

  const principalFloat = monthlyBudget / factor;
  /** 만원 버림 후 그 원금에 대해 재계산한 월 원리금 = 같은 조건 다른 계산기와 맞물리기 쉬움(한도도 넘치지 않게) */
  const principal = Math.max(0, Math.floor(principalFloat));
  const monthlyPaymentApprox = amortizedMonthlyPaymentFromPrincipal({
    principalManwon: principal,
    annualRatePct,
    loanYears,
  });
  const annualPaymentFromScheduleManwon = Math.round(monthlyPaymentApprox * 12 * 100) / 100;

  return { principal, monthlyPaymentApprox, annualPaymentFromScheduleManwon };
}

/** 거치 없음 원리금균등: 원금 주어졌을 때 월 상환액(만원) */
function amortizedMonthlyPaymentFromPrincipal(opts: {
  principalManwon: number;
  annualRatePct: number;
  loanYears: number;
}): number {
  const { principalManwon, loanYears } = opts;
  const annualRatePct = opts.annualRatePct;
  if (principalManwon <= 0 || loanYears <= 0) return 0;
  const months = loanYears * 12;
  if (annualRatePct <= 0) {
    return Math.round((principalManwon / months) * 100) / 100;
  }
  const r = annualRatePct / 100 / 12;
  const denom = 1 - (1 + r) ** (-months);
  if (!(denom > 0) || !(r > 0)) return 0;
  const monthly = (principalManwon * r) / denom;
  return Math.round(monthly * 100) / 100;
}

function ddimmidolVariantInfo(v: DdimmidolLoanCapVariant): { capManwon: number; label: string } {
  switch (v) {
    case "general_2eok":
      return { capManwon: 20000, label: "일반 참고 최대 원금 약 2억 원" };
    case "first_home_240":
      return { capManwon: 24000, label: "생애최초 참고 최대 원금 약 2억 4천만 원" };
    case "newlywed_or_multiplier_320":
      return { capManwon: 32000, label: "신혼·2자녀 이상 등 해당 시 참고 최대 원금 약 3억 2천만 원 (대상 주택가 등 별도)" };
    case "solo_30_inc60m_300":
      return {
        capManwon: 30000,
        label: "만 30세 이상 미혼·단독세대 등, 연 소득 6천만 원 이하 요건 충족 시 참고 약 3억 원",
      };
    default:
      return { capManwon: 20000, label: "" };
  }
}

function bogeumjariVariantInfo(v: BogeumjariLoanCapVariant): { capManwon: number; label: string } {
  switch (v) {
    case "general_360":
      return { capManwon: 36000, label: "일반 참고 최대 원금 약 3억 6천만 원" };
    case "first_home_420":
      return { capManwon: 42000, label: "생애최초 참고 최대 원금 약 4억 2천만 원" };
    case "jeonse_victim_400_plus":
      return {
        capManwon: 40000,
        label: "전세사기 피해 채무조정 등 해당 시 참고 약 4억 원+ (증빙·기준 별도)",
      };
    default:
      return { capManwon: 36000, label: "" };
  }
}

function policyCapSummary(plan: BudgetPlan): {
  capManwon: number;
  capDetailLabel: string;
  defaultAnnualRatePct: number;
  productLabel: string;
} {
  if (plan.step3PolicyProduct === "ddimmidol") {
    const { capManwon, label } = ddimmidolVariantInfo(plan.ddimmidolLoanCapVariant);
    return {
      capManwon,
      capDetailLabel: label,
      defaultAnnualRatePct: 2.5,
      productLabel: "디딤돌대출",
    };
  }
  if (plan.step3PolicyProduct === "bogeumjari") {
    const { capManwon, label } = bogeumjariVariantInfo(plan.bogeumjariLoanCapVariant);
    return {
      capManwon,
      capDetailLabel: label,
      defaultAnnualRatePct: 3.5,
      productLabel: "보금자리론",
    };
  }
  if (plan.step3PolicyProduct === "newlywed_purchase") {
    return {
      capManwon: 32000,
      capDetailLabel: "혼인 후 7년 이내 등 요건 해당 시 참고 최대 원금 약 3억 2천만 원 (세부 신청 요건 확인)",
      defaultAnnualRatePct: 3,
      productLabel: "신혼부부 전용구입자금대출 등",
    };
  }
  return {
    capManwon: Number.POSITIVE_INFINITY,
    capDetailLabel: "정책 상품을 선택하면 한도 참고값이 적용됩니다.",
    defaultAnnualRatePct: assumedAnnualRatePctFromPlan(plan),
    productLabel: "해당 없음",
  };
}

/** Step 3에서 정책 미선택일 때 참고 금리: Step 2 가정금리 재사용 */
function assumedAnnualRatePctFromPlan(plan: BudgetPlan): number {
  const n = Number(plan.assumedAnnualRatePct);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function resolvedStep3SimulationRatePct(plan: BudgetPlan, policyFallback: number): number {
  const raw = Number(String(plan.step3PolicyAnnualRatePct ?? "").trim());
  if (Number.isFinite(raw) && raw > 0) return raw;
  return policyFallback >= 0 ? policyFallback : 0;
}

/**
 * 보금자리론 최장 거치 연수 참고값(본 화면 작성용).
 * 사용자 정리형: 「50년: 일반 만 34세 미만 / 신혼 만 39세 미만」「40년: 일반 만 39세 미만 / 신혼 만 49세 미만」
 * 공사 실제 안내와 다를 수 있으므로 접수 전 HF·은행 안내와 대조해야 합니다.
 */
function bogeumjariReferralMaxYears(ageFloored: number, newlywedHousehold: boolean): { years: 0 | 40 | 50; ruleLabel: string } {
  const isNewlywed = newlywedHousehold;
  if (isNewlywed) {
    if (ageFloored < 39) return { years: 50, ruleLabel: "신혼가구·만 39세 미만 → 참고 최장 50년" };
    if (ageFloored < 49) return { years: 40, ruleLabel: "신혼가구·만 49세 미만 → 참고 최장 40년" };
    return { years: 0, ruleLabel: "신혼가구·만 49세 이상(참고 규격 적용 불가 또는 단축일 수 있음)" };
  }
  if (ageFloored < 34) return { years: 50, ruleLabel: "일반·만 34세 미만 → 참고 최장 50년" };
  if (ageFloored < 39) return { years: 40, ruleLabel: "일반·만 39세 미만 → 참고 최장 40년" };
  return { years: 0, ruleLabel: "일반·만 39세 이상(참고 장만기 규격 밖일 수 있음)" };
}

function parseWrittenDateMidnight(dateStr: string): Date | null {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!t) return null;
  const y = Number(t[1]);
  const m = Number(t[2]);
  const d = Number(t[3]);
  if (!(y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0); // 정오 기준 현지 날짜 보정용
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function addLoanYearsApproxMaturity(loanOrigin: Date, years: number): Date {
  const r = new Date(loanOrigin.getTime());
  r.setFullYear(r.getFullYear() + Math.max(0, Math.round(years)));
  return r;
}

function formatKoreanLongDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/** localStorage에 저장한 시각 표시용 (변경 시 자동 갱신) */
function formatLastSavedKo(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** YYYY-MM-DD 달력상 유효 여부 */
function isValidIsoCalendarDate(isoDate: string): boolean {
  const s = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 작성일 등 기준일 시점 만 나이(생일 전이면 1년 차감) */
function ageAtIsoDate(birthIso: string, refIso: string): number | null {
  if (!isValidIsoCalendarDate(birthIso) || !isValidIsoCalendarDate(refIso)) return null;
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = refIso.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Step 5 등에서 근사 억대 한 줄 표기 (예: 약 7.35억) */
function approxEokHeadingFromManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  const eok = manwon / 10000;
  const digits = eok >= 100 ? 0 : eok >= 10 ? 1 : 2;
  const s =
    digits === 0
      ? Math.round(eok).toLocaleString("ko-KR")
      : eok.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return `약 ${s}억`;
}

/** 가용 계획 합(만원)을 Step 5 `type="number"` 자기자금 필드 문자열로. */
function manwonToStep5OwnFundsEokInputValue(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "";
  const eok = Math.round(manwon) / 10000;
  return String(Number(eok.toFixed(4)));
}

/** 저장·계산 단위는 만원. 보조표기는 「○억 + (가능하면) △천만 + 나머지 □□□만원」. */
function formatManwonEokHybrid(manwon: number): string {
  if (!manwon || !Number.isFinite(manwon) || manwon <= 0) return "";
  const eok = Math.floor(manwon / 10000);
  const rem = manwon % 10000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);

  const cheon = Math.floor(rem / 1000);
  const rem1000 = rem % 1000;
  if (cheon > 0) parts.push(`${cheon}천만`);
  if (rem1000 > 0) parts.push(`${rem1000.toLocaleString("ko-KR")}만원`);

  if (parts.length === 0) return "";
  return `(약 ${parts.join(" ")})`;
}

/** 공통 요약 인포: 금액 대비 상대 막대 한 줄 */
function BudgetVsScaleBar({
  title,
  subtitle,
  manwon,
  pct,
  gradientClass,
  amountClassName = "text-primary",
}: {
  title: string;
  subtitle: string;
  manwon: number;
  pct: number;
  gradientClass: string;
  amountClassName?: string;
}) {
  const w = Math.min(100, Math.max(2, Number.isFinite(pct) ? pct : 0));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
        <span className={`text-sm font-bold tabular-nums ${amountClassName}`}>{approxEokHeadingFromManwon(manwon)}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div
          className={`h-full rounded-full bg-gradient-to-r shadow-sm transition-[width] duration-700 ease-out ${gradientClass}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SummaryMoney({ label, manwon }: { label: string; manwon: number }) {
  return (
    <div className="bg-background/70 border border-primary/10 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-bold text-primary leading-tight">{formatAmount(manwon)}만원</p>
      {manwon > 0 && (
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{formatManwonEokHybrid(manwon)}</p>
      )}
    </div>
  );
}

function MoneyPrimary({ amount, emphasized }: { amount: number; emphasized?: boolean }) {
  return (
    <>
      <p className={`font-semibold ${emphasized ? "text-primary" : ""} leading-tight`}>{formatAmount(amount)}만원</p>
      {amount > 0 && (
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{formatManwonEokHybrid(amount)}</p>
      )}
    </>
  );
}

export default function RealEstateFinalBudget() {
  const [plan, setPlan] = useState<BudgetPlan>(loadPlan);
  const [lastSavedAtIso, setLastSavedAtIso] = useState<string>(() => peekLastSavedAtIso());
  /** 원리금 거치연수 입력 중 빈 문자·중간 입력을 허용해 Step 2와 동기화 표시 깨짐을 줄입니다. */
  const [assumedLoanYearsDraft, setAssumedLoanYearsDraft] = useState<string | null>(null);
  const [activeBudgetTab, setActiveBudgetTab] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [fundPlanStorageTick, setFundPlanStorageTick] = useState(0);
  const lastOwnFundsPushedFromPlanRef = useRef<string | null>(null);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === RE_FUND_PLAN_LS_KEY || e.key === null) setFundPlanStorageTick(x => x + 1);
    };
    const onFundPlanUpdated = () => setFundPlanStorageTick(x => x + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener("re-fund-plan-updated", onFundPlanUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("re-fund-plan-updated", onFundPlanUpdated);
    };
  }, []);

  const { data: authMeData, isLoading: authMeLoading } = trpc.auth.me.useQuery();
  const profileBirthIso =
    authMeData && typeof authMeData === "object" && "birthDate" in authMeData
      ? String((authMeData as { birthDate?: string | null }).birthDate ?? "").trim()
      : "";

  useEffect(() => {
    const nowIso = new Date().toISOString();
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ ...plan, lastSavedAtIso: nowIso }),
    );
    setLastSavedAtIso(nowIso);
  }, [plan]);

  const fundPlanTotalManwon = useMemo(() => {
    void fundPlanStorageTick;
    return readReFundPlanTotalManwon();
  }, [fundPlanStorageTick]);

  useEffect(() => {
    const synced =
      fundPlanTotalManwon > 0 ? manwonToStep5OwnFundsEokInputValue(fundPlanTotalManwon) : "";
    if (!synced) {
      lastOwnFundsPushedFromPlanRef.current = null;
      return;
    }

    setPlan(prev => {
      const raw = prev.step5OwnFundsEok;
      const t = raw.trim();
      const fieldManwon = t === "" ? null : Math.max(0, Math.round(parseEok(raw) * 10000));

      const followsEmpty = t === "";
      const matchesPlanManwon = fieldManwon !== null && fieldManwon === fundPlanTotalManwon;
      const wasLastValueFromPlan =
        lastOwnFundsPushedFromPlanRef.current !== null && raw === lastOwnFundsPushedFromPlanRef.current;

      if (!followsEmpty && !matchesPlanManwon && !wasLastValueFromPlan) {
        return prev;
      }

      if (raw === synced) {
        lastOwnFundsPushedFromPlanRef.current = synced;
        return prev;
      }

      lastOwnFundsPushedFromPlanRef.current = synced;
      return { ...prev, step5OwnFundsEok: synced };
    });
  }, [fundPlanTotalManwon, plan.step5OwnFundsEok]);

  const selectedRegion = REGION_OPTIONS.find(option => option.value === plan.region) ?? REGION_OPTIONS[0];
  const lendingRule = getLendingRule(plan.region, plan.isFirstHome);
  const totalIncome = plan.ownIncome + (plan.hasSpouse ? plan.spouseIncome : 0);
  const targetHousePriceManwon = parseEok(plan.targetHousePriceEok) * 10000;
  const ltvLoanLimitRaw = Math.round(targetHousePriceManwon * lendingRule.ltv / 100);
  const estimatedLoanAfterDeduction = Math.max(ltvLoanLimitRaw - selectedRegion.deduction, 0);

  const grossAnnualDsrlimit = Math.round(totalIncome * lendingRule.dsr / 100);
  const annualRepaymentBudget = Math.max(grossAnnualDsrlimit - plan.otherAnnualDebtBurdenManwon, 0);

  const assumedYears = clampAssumedLoanYears(plan.assumedLoanYears);

  const commitAssumedLoanYearsDraft = () => {
    setPlan(prev => ({
      ...prev,
      assumedLoanYears: clampAssumedLoanYears(
        assumedLoanYearsDraft !== null && assumedLoanYearsDraft.trim() !== ""
          ? Number.parseFloat(assumedLoanYearsDraft)
          : prev.assumedLoanYears,
      ),
    }));
    setAssumedLoanYearsDraft(null);
  };

  const loanYearsControlledValue =
    assumedLoanYearsDraft !== null ? assumedLoanYearsDraft : assumedYears;

  const rateNum = Number(plan.assumedAnnualRatePct);

  const assumedRatePct = Number.isFinite(rateNum) ? rateNum : 0;

  /** 다른 차입 미반영 순수 분모 역산 교육용: DSR 40·50%만 비교합니다. 스트레스 금리·규제 DSR 상한 등은 포함하지 않습니다. */
  const pureAnnualDebtCap40 = Math.round(totalIncome * 40 / 100);
  const pureAnnualDebtCap50 = Math.round(totalIncome * 50 / 100);
  const pureDsr40Result = amortizedLoanPrincipalLimitManwon({
    annualPaymentBudgetManwon: pureAnnualDebtCap40,
    annualRatePct: assumedRatePct,
    loanYears: assumedYears,
  });
  const pureDsr50Result = amortizedLoanPrincipalLimitManwon({
    annualPaymentBudgetManwon: pureAnnualDebtCap50,
    annualRatePct: assumedRatePct,
    loanYears: assumedYears,
  });
  const pure40AfterDeduction = Math.max(pureDsr40Result.principal - selectedRegion.deduction, 0);
  const pure50AfterDeduction = Math.max(pureDsr50Result.principal - selectedRegion.deduction, 0);

  const presetStressAddPct = plan.stressMetroRegion === "capital" ? 3 : 0.75;
  const customAddNum = Number(plan.stressRateAddPct);
  const stressAddPct =
    plan.applyStressDsr
      ? (plan.stressUseCustomAdd && Number.isFinite(customAddNum)
        ? customAddNum
        : presetStressAddPct)
      : 0;
  const stressAssumedRatePct = plan.applyStressDsr ? assumedRatePct + stressAddPct : assumedRatePct;

  const dsrLoanLimitResultNominal = amortizedLoanPrincipalLimitManwon({
    annualPaymentBudgetManwon: annualRepaymentBudget,
    annualRatePct: assumedRatePct,
    loanYears: assumedYears,
  });
  const dsrLoanLimitResultStress = amortizedLoanPrincipalLimitManwon({
    annualPaymentBudgetManwon: annualRepaymentBudget,
    annualRatePct: stressAssumedRatePct,
    loanYears: assumedYears,
  });

  const dsrLoanLimitRawNominal = Math.max(dsrLoanLimitResultNominal.principal, 0);
  const dsrLoanLimitAfterDeductionNominal = Math.max(dsrLoanLimitRawNominal - selectedRegion.deduction, 0);

  const dsrLoanLimitRawStress = Math.max(dsrLoanLimitResultStress.principal, 0);
  const dsrLoanLimitAfterDeductionStress = Math.max(dsrLoanLimitRawStress - selectedRegion.deduction, 0);

  let estimatedEffectiveLoan = 0;
  let emphasizeLtvBand = false;
  let emphasizeDsrBand = false;
  let bindingReason = "";

  if (estimatedLoanAfterDeduction <= 0 && dsrLoanLimitAfterDeductionStress <= 0) {
    bindingReason = "";
  } else if (estimatedLoanAfterDeduction > 0 && dsrLoanLimitAfterDeductionStress > 0) {
    estimatedEffectiveLoan = Math.min(estimatedLoanAfterDeduction, dsrLoanLimitAfterDeductionStress);
    if (estimatedEffectiveLoan === estimatedLoanAfterDeduction && estimatedEffectiveLoan === dsrLoanLimitAfterDeductionStress) {
      bindingReason = "두 한도가 동일하게 맞았습니다.";
    } else if (estimatedEffectiveLoan === estimatedLoanAfterDeduction) {
      bindingReason = "LTV(방공제 반영) 쪽 한도가 더 작아 적용 가능 대출금이 줄어듭니다.";
      emphasizeLtvBand = true;
    } else {
      bindingReason = plan.applyStressDsr
        ? `DSR 역산(스트레스 금리 적용, 명목 ${assumedRatePct}% + 가산 ${stressAddPct}% 반영) 결과(방공제 반영) 쪽 한도가 더 작습니다.`
        : "DSR 역산 결과(방공제 반영) 쪽 한도가 더 작아 적용 가능 대출금이 줄어듭니다.";
      emphasizeDsrBand = true;
    }
  } else if (estimatedLoanAfterDeduction > 0) {
    estimatedEffectiveLoan = estimatedLoanAfterDeduction;
    emphasizeLtvBand = true;
    bindingReason =
      annualRepaymentBudget <= 0
        ? "DSR 여유가 부족해 역산 결과가 나오지 않았습니다."
        : "집값·LTV 결과만 존재합니다.";
  } else {
    estimatedEffectiveLoan = dsrLoanLimitAfterDeductionStress;
    emphasizeDsrBand = true;
    bindingReason = targetHousePriceManwon > 0
      ? "희망 집가격을 조정해야 LTV를 비교할 수 있습니다."
      : "먼저 희망 집가격과 LTV를 입력해 두 한도를 비교하세요.";
  }

  const dsrLoanLimitChosenForComparison = plan.applyStressDsr
    ? dsrLoanLimitAfterDeductionStress
    : dsrLoanLimitAfterDeductionNominal;

  const step3CapInfo = policyCapSummary(plan);
  const compliantCapPositive = estimatedEffectiveLoan > 0 ? estimatedEffectiveLoan : Number.POSITIVE_INFINITY;
  const policyCapBound =
    typeof step3CapInfo.capManwon === "number" && Number.isFinite(step3CapInfo.capManwon)
      ? step3CapInfo.capManwon
      : Number.POSITIVE_INFINITY;
  const combinedUpperDraft = Math.min(compliantCapPositive, policyCapBound);
  const step3PrincipalUpper = Number.isFinite(combinedUpperDraft)
    ? combinedUpperDraft
    : Math.max(0, estimatedEffectiveLoan);

  const manualPrincipal = plan.step3LoanPrincipalManualManwon;
  const desiredRawPrincipal =
    manualPrincipal != null && Number.isFinite(manualPrincipal)
      ? manualPrincipal
      : step3PrincipalUpper;
  const appliedStep3PrincipalManwon = Math.max(0, Math.min(desiredRawPrincipal, step3PrincipalUpper));

  const usableProfileManAgeAtWritten =
    profileBirthIso !== ""
    && isValidIsoCalendarDate(profileBirthIso)
    && isValidIsoCalendarDate(plan.writtenDate.trim())
      ? (() => {
        const raw = ageAtIsoDate(profileBirthIso, plan.writtenDate.trim());
        if (raw == null || raw < 0 || raw > 120) return null;
        return raw;
      })()
      : null;

  const bogeumReferralYears =
    plan.step3PolicyProduct !== "bogeumjari"
      ? null
      : usableProfileManAgeAtWritten === null
        ? null
        : bogeumjariReferralMaxYears(Math.floor(usableProfileManAgeAtWritten), plan.bogeumTermNewlywedHousehold);

  const maturityBaseDate =
    parseWrittenDateMidnight(plan.writtenDate)
    ?? (() => {
      const z = new Date();
      z.setHours(12, 0, 0, 0);
      return z;
    })();

  const bogeumMaturityApprox =
    bogeumReferralYears && bogeumReferralYears.years > 0
      ? addLoanYearsApproxMaturity(maturityBaseDate, bogeumReferralYears.years)
      : null;

  const step3AmortYears =
    plan.step3PolicyProduct === "bogeumjari"
    && bogeumReferralYears
    && bogeumReferralYears.years > 0
      ? bogeumReferralYears.years
      : assumedYears;

  const step3SimRatePct = resolvedStep3SimulationRatePct(plan, step3CapInfo.defaultAnnualRatePct);
  const monthlyStep3RepaymentManwon = amortizedMonthlyPaymentFromPrincipal({
    principalManwon: appliedStep3PrincipalManwon,
    annualRatePct: step3SimRatePct,
    loanYears: step3AmortYears,
  });
  const step3AnnualRepaymentApproxManwon = Math.round(monthlyStep3RepaymentManwon * 12 * 100) / 100;
  const step3PrincipalClampNote =
    manualPrincipal != null
    && Number.isFinite(manualPrincipal)
    && manualPrincipal > appliedStep3PrincipalManwon;

  const derivedStep4NetMonthly = estimateNetMonthlyManwon(totalIncome);
  const resolvedStep4NetMonthly = plan.step4NetMonthlyManualManwon ?? derivedStep4NetMonthly;
  const roundedStep3HousingMonthly = Math.round(monthlyStep3RepaymentManwon * 100) / 100;
  const resolvedStep4HousingMonthly =
    plan.step4HousingMonthlyManualManwon ?? roundedStep3HousingMonthly;

  const burdenPctOrNull =
    resolvedStep4NetMonthly > 0
      ? Math.round((resolvedStep4HousingMonthly / resolvedStep4NetMonthly) * 1000) / 10
      : null;
  const step4BurdenBand: Step4BurdenBand =
    burdenPctOrNull !== null ? step4BurdenBandFromPct(burdenPctOrNull) : (resolvedStep4HousingMonthly > 0 ? "severe" : "comfort");
  const step4GaugePct =
    burdenPctOrNull !== null ? Math.min(100, burdenPctOrNull) : resolvedStep4HousingMonthly > 0 ? 100 : 0;

  const step5OwnFundsFieldManwon =
    plan.step5OwnFundsEok.trim() === ""
      ? null
      : Math.max(0, Math.round(parseEok(plan.step5OwnFundsEok) * 10000));
  const resolvedOwnFundsManwon =
    step5OwnFundsFieldManwon === null ? fundPlanTotalManwon : step5OwnFundsFieldManwon;

  /** 정책·시뮬 경로: Step 3에서 적용한 작성 원금(정책 상한 등 반영) */
  const step5PolicyPathLoanManwon = appliedStep3PrincipalManwon;
  /** 일반 주담대 참고 경로: 상단 카드 「예상 적용 대출금(작은 한도)」와 동일 */
  const step5GeneralMortgageLoanManwon = estimatedEffectiveLoan;

  const sumStep5PolicyCombinationManwon = resolvedOwnFundsManwon + step5PolicyPathLoanManwon;
  const sumStep5GeneralCombinationManwon = resolvedOwnFundsManwon + step5GeneralMortgageLoanManwon;

  const step5TargetGapPolicyManwon = targetHousePriceManwon > 0 ? sumStep5PolicyCombinationManwon - targetHousePriceManwon : null;
  const step5TargetGapGeneralManwon = targetHousePriceManwon > 0 ? sumStep5GeneralCombinationManwon - targetHousePriceManwon : null;

  const step5UsingFundPlanForOwnFunds =
    fundPlanTotalManwon <= 0
      ? plan.step5OwnFundsEok.trim() === ""
      : plan.step5OwnFundsEok.trim() === ""
        || (step5OwnFundsFieldManwon !== null && step5OwnFundsFieldManwon === fundPlanTotalManwon);

  const writtenDateReferenceLabel =
    isValidIsoCalendarDate(plan.writtenDate.trim())
      ? parseWrittenDateMidnight(plan.writtenDate.trim())
      : null;

  /** 공통 요약 인포 막대: 최대 금액 기준 상대 비교(0~100%) */
  const vsBarScaleManwon = Math.max(
    targetHousePriceManwon,
    sumStep5PolicyCombinationManwon,
    sumStep5GeneralCombinationManwon,
    1,
  );
  const vsTargetBarPct = targetHousePriceManwon > 0 ? (targetHousePriceManwon / vsBarScaleManwon) * 100 : 0;
  const vsPolicyBarPct = (sumStep5PolicyCombinationManwon / vsBarScaleManwon) * 100;
  const vsGeneralBarPct = (sumStep5GeneralCombinationManwon / vsBarScaleManwon) * 100;
  /** 목표 대비 조달 달성률(100% 초과 가능 — 막대는 100%에서 캡) */
  const policyReachOfTargetPct =
    targetHousePriceManwon > 0 ? (sumStep5PolicyCombinationManwon / targetHousePriceManwon) * 100 : 0;
  const generalReachOfTargetPct =
    targetHousePriceManwon > 0 ? (sumStep5GeneralCombinationManwon / targetHousePriceManwon) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">최종예산확정서</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step 1~4에서 소득·한도·상환을 입력하고, <span className="text-foreground font-medium">조달 대비 목표 집값</span> 요약은 상단에서 항상 보입니다. 막대·자기자금 입력 등 상세는{" "}
            <span className="text-foreground font-medium">Step 5</span>에서 다룹니다.
          </p>
        </div>
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryMoney label="연 총소득" manwon={totalIncome} />
          <div className="bg-background/70 border border-primary/10 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">적용 LTV</p>
            <p className="text-lg font-bold text-primary">{lendingRule.ltv}%</p>
          </div>
          <SummaryMoney label="방공제" manwon={selectedRegion.deduction} />
          <SummaryMoney label="예상 적용 대출금(작은 한도)" manwon={estimatedEffectiveLoan} />
        </div>
      </div>

      <div className="rounded-xl border border-primary/18 bg-card/92 p-4 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <Scale className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-foreground">내 조달 vs 목표 집값 · 요약</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                목표 금액·자기자금·두 가지 조합을 한눈에 봅니다. 상세 막대·입력은 Step 5입니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
            onClick={() => {
              setActiveBudgetTab(5);
              window.requestAnimationFrame(() =>
                document.getElementById("re-budget-vs-target")?.scrollIntoView({ behavior: "smooth", block: "start" }),
              );
            }}
          >
            Step 5 열기
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">목표 집값</p>
            {targetHousePriceManwon > 0 ? (
              <>
                <p className="mt-1 text-sm font-bold tabular-nums text-primary leading-tight">{approxEokHeadingFromManwon(targetHousePriceManwon)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{formatAmount(targetHousePriceManwon)}만원</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">Step 2에서 입력</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">자기자금</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground leading-tight">{formatAmount(resolvedOwnFundsManwon)}만원</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {step5UsingFundPlanForOwnFunds ? "가용 계획 반영" : "직접 입력"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">정책·시뮬 합계</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-400 leading-tight">{approxEokHeadingFromManwon(sumStep5PolicyCombinationManwon)}</p>
            {step5TargetGapPolicyManwon !== null ? (
              <p className={`text-[11px] mt-0.5 font-semibold tabular-nums ${step5TargetGapPolicyManwon >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-200"}`}>
                목표 대비 {step5TargetGapPolicyManwon >= 0 ? "+" : "−"}
                {formatAmount(Math.abs(step5TargetGapPolicyManwon))}만
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">목표 필요</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">일반 참고 합계</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground leading-tight">{approxEokHeadingFromManwon(sumStep5GeneralCombinationManwon)}</p>
            {step5TargetGapGeneralManwon !== null ? (
              <p className={`text-[11px] mt-0.5 font-semibold tabular-nums ${step5TargetGapGeneralManwon >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-200"}`}>
                목표 대비 {step5TargetGapGeneralManwon >= 0 ? "+" : "−"}
                {formatAmount(Math.abs(step5TargetGapGeneralManwon))}만
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">목표 필요</p>
            )}
          </div>
        </div>
      </div>

      <section className="bg-card/80 border border-border/70 rounded-xl px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[11px] text-muted-foreground leading-snug">
            이 페이지에서 값이 바뀔 때마다 이 브라우저에 자동 저장합니다.
          </p>
          {lastSavedAtIso ? (
            <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              저장 시각{" "}
              <time dateTime={lastSavedAtIso} className="text-foreground/85 font-medium">
                {formatLastSavedKo(lastSavedAtIso)}
              </time>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground shrink-0">저장 준비됨</p>
          )}
        </div>
        <details className="mt-2 rounded-md border border-border/70 bg-muted/25 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-foreground hover:underline underline-offset-2">
            참고 연령·보금 장만기에 쓰이는 기준 일자 변경
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">기준 일</span>
              <input
                type="date"
                value={plan.writtenDate}
                onChange={e => setPlan(prev => ({ ...prev, writtenDate: e.target.value }))}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
            {writtenDateReferenceLabel !== null && (
              <span className="text-[11px] text-muted-foreground leading-snug">
                {formatKoreanLongDate(writtenDateReferenceLabel)} 기준 참고 표시입니다.
              </span>
            )}
          </div>
        </details>
      </section>

      <div
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm"
        role="tablist"
        aria-label="예산 작성 단계"
      >
        {(
          [
            [1, "Step 1", "연소득"] as const,
            [2, "Step 2", "LTV·DSR"] as const,
            [3, "Step 3", "대출·월상환"] as const,
            [4, "Step 4", "월부담"] as const,
            [5, "Step 5", "조달·목표"] as const,
          ] as const
        ).map(([id, label, sub]) => {
          const sel = activeBudgetTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={sel}
              id={`re-final-budget-tab-${id}`}
              className={`flex-1 min-w-[4.5rem] rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                sel
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveBudgetTab(id)}
            >
              <span className="block leading-tight">{label}</span>
              <span
                className={`block text-[11px] leading-tight mt-0.5 ${sel ? "text-primary-foreground/85" : ""}`}
              >
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {activeBudgetTab === 1 && (
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1</p>
          <h2 className="text-base font-semibold mt-1">나의 연소득</h2>
          <p className="text-sm text-muted-foreground mt-0.5">연봉은 세전 기준으로 입력하고, 단위는 만원입니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">본인 연봉</span>
            <CurrencyInput
              value={plan.ownIncome}
              onChange={ownIncome => setPlan(prev => ({ ...prev, ownIncome }))}
              suffix="만원"
              koreanUnit="manwon"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">배우자 연봉</span>
            <CurrencyInput
              value={plan.spouseIncome}
              onChange={spouseIncome => setPlan(prev => ({ ...prev, spouseIncome }))}
              suffix="만원"
              koreanUnit="manwon"
              disabled={!plan.hasSpouse}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">연 총소득</span>
            <div className="min-h-9 rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-sm font-semibold leading-tight">{formatAmount(totalIncome)}만원</p>
              {totalIncome > 0 && (
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{formatManwonEokHybrid(totalIncome)}</p>
              )}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={plan.hasSpouse}
            onChange={e => setPlan(prev => ({ ...prev, hasSpouse: e.target.checked }))}
            className="w-4 h-4"
          />
          배우자 소득을 함께 합산합니다
        </label>

        <details className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            참고 · DSR 분모인 연 소득, 은행마다 어떻게 보는 경우가 많나요?
          </summary>
          <p className="mt-2 leading-relaxed">
            DSR은 규제·금융기관 심사 기준이므로 같은 금리라도 신청 건마다 확인 방식이 달라질 수 있습니다.
            입력란에는 본 화면에서 쓸 <span className="text-foreground font-medium">대표 연소득</span>
            하나만 두었고, 아래는 심사에서 자주 들어가는 근거 예시입니다.
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1.5 leading-relaxed">
            <li>
              <span className="text-foreground">직장인</span>: 보통 근로소득 원천징수영수증(연)·급여이체 내역 등. 올해 소득이 전년보다 많이 오른 경우, 일부 금융기관에서는 최근 3개월 급여명세·원천징수로 소득을 설명할 여지가 있을 수 있습니다(승인 보장 아님).
            </li>
            <li>
              <span className="text-foreground">프리랜서·사업 소득</span>: 종합소득세 신고(전년) 기준이 많이 쓰이는 편입니다. 최근 현금흐름과 다를 수 있습니다.
            </li>
            <li>
              <span className="text-foreground">카드 이용·통장 거래 내역</span>: 기관·시기·건전성 심사에 따라 보조 자료로 요청되는 경우가 있으나 필수라고 단정하기 어렵습니다.
            </li>
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed">
            최종 확인은 해당 대출 창구·상품 약관·심사 기준에 따릅니다.
          </p>
        </details>
      </section>
      )}

      {activeBudgetTab === 2 && (
      <section className="bg-card border border-border rounded-xl p-5 space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2</p>
          <h2 className="text-base font-semibold mt-1">LTV &amp; DSR 확인</h2>
          <p className="text-sm text-muted-foreground mt-0.5">지역, 생애최초 여부, 방공제 기준을 반영해 1차 대출 가능액을 계산합니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">희망 집가격</span>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.1"
                value={plan.targetHousePriceEok}
                onChange={e => setPlan(prev => ({ ...prev, targetHousePriceEok: e.target.value }))}
                placeholder="예: 9.5"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">억</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {targetHousePriceManwon > 0 ? (
                <>
                  {formatAmount(targetHousePriceManwon)}만원 기준
                  {" "}
                  <span className="block mt-1">{formatManwonEokHybrid(targetHousePriceManwon)}</span>
                </>
              ) : (
                "억 단위로 입력하세요"
              )}
            </p>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">지역 구분</span>
            <select
              value={plan.region}
              onChange={e => setPlan(prev => ({ ...prev, region: e.target.value as RegionType }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {REGION_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">소액임차보증금 우선변제 기준: {selectedRegion.deductionBase}</p>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">대출금리 가정</span>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={plan.assumedAnnualRatePct}
                onChange={e => setPlan(prev => ({ ...prev, assumedAnnualRatePct: e.target.value }))}
                placeholder="예: 5"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
            </div>
            <p className="text-xs text-muted-foreground">DSR 한도 원금 역산 시 사용하는 가정금리입니다</p>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">원리금 상환 가정연수</span>
            <div className="relative">
              <input
                type="number"
                min={1}
                step={1}
                value={loanYearsControlledValue}
                onFocus={() => setAssumedLoanYearsDraft(String(assumedYears))}
                onChange={e => {
                  const raw = e.target.value;
                  setAssumedLoanYearsDraft(raw);
                  const n = Number.parseFloat(raw);
                  if (Number.isFinite(n)) {
                    setPlan(prev => ({
                      ...prev,
                      assumedLoanYears: clampAssumedLoanYears(n),
                    }));
                  }
                }}
                onBlur={() => commitAssumedLoanYearsDraft()}
                placeholder={`예: ${DEFAULT_ASSUMED_LOAN_YEARS}`}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-10 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">년</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              DSR 역산 및 Step 3 「3-2 순수 DSR」에 동일하게 쓰이며 초기값은 {DEFAULT_ASSUMED_LOAN_YEARS}년(최대 50년까지)입니다.
            </p>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">연간 다른 대출 원리금</span>
            <CurrencyInput
              value={plan.otherAnnualDebtBurdenManwon}
              onChange={otherAnnualDebtBurdenManwon => setPlan(prev => ({ ...prev, otherAnnualDebtBurdenManwon }))}
              suffix="만원/년"
              koreanUnit="manwon"
            />
            <p className="text-xs text-muted-foreground">카드 할부 포함 여부는 본인이 판단해 넣습니다</p>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">스트레스 DSR (역산 금리에 가산)</p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={plan.applyStressDsr}
                onChange={e => setPlan(prev => ({ ...prev, applyStressDsr: e.target.checked }))}
                className="w-4 h-4"
              />
              적용해서 역산
            </label>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            가계대출 DSR 산정 시 <span className="text-foreground">미래 금리변동 가능성을 반영</span>
            해 역산에 쓸 금리에 일정 폭을 <span className="text-foreground">가산</span>하는 방식입니다.
            실제 적용금리나 이자가 그만큼 늘어나는 것이 아니라, <span className="text-foreground">허용 한도를 보수적으로</span>
            보기 위한 제도입니다(2026.01 무렵 공개 안내 기준 참고).
          </p>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${plan.applyStressDsr ? "" : "opacity-50 pointer-events-none"}`}>
            <fieldset className="space-y-2 rounded-md border border-border/80 bg-background/60 p-3">
              <legend className="text-xs font-medium text-foreground px-1">금리 가산 구간 (참고 프리셋)</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="stress-metro"
                  checked={plan.stressMetroRegion === "capital"}
                  onChange={() => setPlan(prev => ({ ...prev, stressMetroRegion: "capital", stressUseCustomAdd: false }))}
                  className="w-4 h-4"
                />
                수도권 (서울·경기·인천) — 프리셋 +3%
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="stress-metro"
                  checked={plan.stressMetroRegion === "non_capital"}
                  onChange={() => setPlan(prev => ({ ...prev, stressMetroRegion: "non_capital", stressUseCustomAdd: false }))}
                  className="w-4 h-4"
                />
                지방 그 외 — 프리셋 +0.75%
              </label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input
                  type="checkbox"
                  checked={plan.stressUseCustomAdd}
                  onChange={e =>
                    setPlan(prev => ({ ...prev, stressUseCustomAdd: e.target.checked }))
                  }
                  className="w-4 h-4"
                />
                가산율 직접 입력
              </label>
              {plan.stressUseCustomAdd && (
                <div className="relative pt-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={plan.stressRateAddPct}
                    onChange={e => setPlan(prev => ({ ...prev, stressRateAddPct: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%p</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                예: 가정 명목금리가 4%면, 적용 체크 시 역산에는 4%+{stressAddPct}% 를 합산한 금리로 계산합니다.
                현재 설정 합산 역산금리는 {stressAssumedRatePct.toFixed(2)}% 입니다.
              </p>
            </fieldset>
            <div className="rounded-md border border-border/80 bg-background/60 p-3 text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                <span className="font-medium text-foreground">역산 분기값</span>
                {": "}
                {plan.applyStressDsr ? (
                  <>스트레스 합산 {stressAssumedRatePct.toFixed(2)}% 기준 원금 역산 결과를 최종 한도 비교에 사용합니다.</>
                ) : (
                  <>명목 {assumedRatePct}% 만으로 역산합니다.</>
                )}
              </p>
              {plan.applyStressDsr && (
                <p>
                  명목금리 역산 한도와의 차이: 방공제 반영 후{" "}
                  <span className="text-foreground font-medium">{formatAmount(dsrLoanLimitAfterDeductionNominal)}만원</span>
                  {dsrLoanLimitAfterDeductionNominal > 0 && <> ({formatManwonEokHybrid(dsrLoanLimitAfterDeductionNominal)})</>}
                  에서 스트레스 적용 시{" "}
                  <span className="text-foreground font-medium">{formatAmount(dsrLoanLimitAfterDeductionStress)}만원</span>
                  {dsrLoanLimitAfterDeductionStress > 0 && <> ({formatManwonEokHybrid(dsrLoanLimitAfterDeductionStress)})</>}
                  까지 줄어듭니다.
                </p>
              )}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm max-w-md">
          <input
            type="checkbox"
            checked={plan.isFirstHome}
            onChange={e => setPlan(prev => ({ ...prev, isFirstHome: e.target.checked }))}
            className="w-4 h-4"
          />
          생애 최초 주택구입자입니다
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-lg border border-border p-4 lg:col-span-1">
            <p className="text-xs text-muted-foreground mb-1">적용 기준</p>
            <p className="font-semibold">{lendingRule.label}</p>
            <p className="text-xs text-muted-foreground mt-1">LTV {lendingRule.ltv}% · DTI {lendingRule.dti}% · DSR {lendingRule.dsr}%</p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug border-t border-border/70 pt-2">
              「DSR {lendingRule.dsr}%」표시는 이 조건에서 자주 참고되는 규제 허용 <span className="text-foreground">비율</span>
              패턴입니다(지역·생애최초를 바꾸면 변할 수 있음). 연 원리금 <span className="text-foreground">금액</span>
              한도는 연 소득에 따라 아래 회색 안내 블록이 바로 바뀝니다.
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">LTV 기준 원금 한도</p>
            <MoneyPrimary amount={ltvLoanLimitRaw} />
            <p className="text-xs text-muted-foreground mt-1">희망 집가격 × LTV</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">방공제 후 (LTV)</p>
            <MoneyPrimary amount={estimatedLoanAfterDeduction} emphasized={emphasizeLtvBand} />
            <p className="text-xs text-muted-foreground mt-1">
              LTV 원금 − 방공제 (담보 위험이 반영되는 방식이라는 가정 아래 참고값)
            </p>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-1">방공제 반영 (DSR 역산)</p>
            <MoneyPrimary
              amount={
                plan.applyStressDsr
                  ? dsrLoanLimitAfterDeductionStress
                  : dsrLoanLimitAfterDeductionNominal
              }
              emphasized={emphasizeDsrBand}
            />
            <p className="text-xs text-muted-foreground mt-1 leading-snug space-y-1">
              <span className="block">
                역산 적용금리{" "}
                {plan.applyStressDsr ? (
                  <>
                    명목 {assumedRatePct}% + 가산 {stressAddPct}% = 합산 {stressAssumedRatePct.toFixed(2)}%
                  </>
                ) : (
                  <>명목 {assumedRatePct}%</>
                )}
              </span>
              <span className="block">
                역산 순원금 {formatAmount(plan.applyStressDsr ? dsrLoanLimitRawStress : dsrLoanLimitRawNominal)}만원
                {(plan.applyStressDsr ? dsrLoanLimitRawStress : dsrLoanLimitRawNominal) > 0 &&
                  ` ${formatManwonEokHybrid(plan.applyStressDsr ? dsrLoanLimitRawStress : dsrLoanLimitRawNominal)}`}
              </span>
              {plan.applyStressDsr ? (
                <span className="block text-[11px]">
                  명목만 역산 시 방공제 후 {formatAmount(dsrLoanLimitAfterDeductionNominal)}만원
                  {dsrLoanLimitAfterDeductionNominal > 0 ? ` (${formatManwonEokHybrid(dsrLoanLimitAfterDeductionNominal)})` : ""}
                </span>
              ) : null}
              <span className="block text-[11px]">
                방공제 차감 {formatAmount(selectedRegion.deduction)}만원
                {selectedRegion.deduction > 0 ? ` (${formatManwonEokHybrid(selectedRegion.deduction)})` : ""}
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
            <p className="text-xs text-muted-foreground mb-1">예상 적용 대출금</p>
            <MoneyPrimary amount={estimatedEffectiveLoan} emphasized />
            <p className="text-xs text-muted-foreground mt-1">{bindingReason}</p>
          </div>
        </div>

        {totalIncome <= 0 && (
          <p className="text-sm text-muted-foreground rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2">
            연 총소득을 Step 1에 입력해야 DSR 쪽 「연 원리금 총한도」 역산이 같이 따라갑니다. 상단 카드 표시 「DSR 40%」는 소득이 아니라 규제상 한도 패턴 참고표시입니다.
          </p>
        )}

        {totalIncome > 0 && estimatedEffectiveLoan > 0 && emphasizeLtvBand && (
          <p className="text-sm leading-relaxed rounded-lg border border-border bg-muted/30 px-3 py-2">
            지금 결과는 집값·LTV 한도가 더 작습니다. 같은 집값이면 소득·DSR 역산만 바꿔도{" "}
            <span className="font-medium text-foreground">예상 적용 대출금</span> 숫자는 안 바뀌고,
            회색 블록의 연 원리금 한도 같은 DSR 라인 숫자는 바뀌는 것이 자연스럽습니다(다만 최종 결과는 계속 집값·LTV 쪽에 고정).
          </p>
        )}
        {totalIncome > 0 && estimatedEffectiveLoan > 0 && emphasizeDsrBand && (
          <p className="text-sm leading-relaxed rounded-lg border border-primary/25 bg-primary/[0.07] px-3 py-2">
            지금 결과는 DSR 역산 한도(<span>{formatAmount(dsrLoanLimitChosenForComparison)}만원</span>)가 더 작습니다.
            연봉·연간 다른 대출 원리금·가정 금리 등을 바꾸면 카드값과 「예상 적용 대출금」이 따라갑니다. 집값만 바꾸면 결과가 그대로인 경우도 많습니다(LTV쪽이 크게 남았을 때).
          </p>
        )}
        {totalIncome > 0 && estimatedEffectiveLoan > 0 && !emphasizeLtvBand && !emphasizeDsrBand && (
          <p className="text-sm leading-relaxed rounded-lg border border-border bg-muted/25 px-3 py-2">
            현재 두 한도 숫자가 같게 걸린 상태입니다. 집값 또는 소득을 조금 바꿔 보면 다음에는 어느 쪽 한도가 더 작아질지 달라질 수 있습니다.
          </p>
        )}

        <div className="rounded-lg bg-muted/30 border border-border p-4 text-sm text-muted-foreground space-y-2">
          <p className="leading-relaxed">
            DSR {lendingRule.dsr}% 기준 연 원리금 총한도 약{" "}
            <span className="font-semibold text-foreground">{formatAmount(grossAnnualDsrlimit)}만원</span>
            {grossAnnualDsrlimit > 0 && <> {formatManwonEokHybrid(grossAnnualDsrlimit)}</>}
            에서 다른 대출{" "}
            <span className="font-semibold text-foreground">{formatAmount(plan.otherAnnualDebtBurdenManwon)}만원</span>
            을 빼면,
            새 대출에서 쓸 수 있는 연 원리금 여유는 약{" "}
            <span className="font-semibold text-foreground">{formatAmount(annualRepaymentBudget)}만원</span>
            입니다 (월 기준 대략 {formatAmount(Math.round(annualRepaymentBudget / 12))}만원).
          </p>
          <p className="text-xs text-muted-foreground">
            같은 방 리스트의 방공제는 LTV 안전마진처럼 쓰이는 참고금액이라, 어떤 은행은 DSR 위주 심사에만 포함할 수도 있습니다. 실제 결과는 신용·상품별 상환방식 차이 때문에 달라질 수 있습니다.
          </p>
          <p>정책자금 조건·한도 참고값은 아래 Step 3에서 상품별로 나누어 적습니다.</p>
          <details className="rounded-md border border-border/80 bg-background/60 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              참고 · DSR에 보통 포함되지 않는 대출 예시
            </summary>
            <p className="mt-2 text-muted-foreground">
              금융기관·시점·연동 여부마다 다를 수 있으며, 신청 시 해당 상품 안내 또는 담당 창구로 확인해야 합니다. 아래는 일반적으로 DSR 분모·분자 설명에서 빼먹기 쉬운 예시 목록입니다.
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-muted-foreground">
              <li>분양 주택·오피스텔 중도금 대출</li>
              <li>재건축·재개발 이주비 대출</li>
              <li>회사 복지 대출</li>
              <li>새희망·사잇돌·징검다리론 등 서민금융상품</li>
              <li>300만 원 이하 소액 신용대출</li>
              <li>전세자금 대출</li>
              <li>주택연금</li>
              <li>정부·공공기관 이자차이 보전 협약 대출 등</li>
              <li>보험계약 대출</li>
              <li>예·적금·주식 등 담보대출</li>
              <li>할부·리스·현금서비스 등</li>
            </ul>
          </details>
        </div>
      </section>
      )}

      {activeBudgetTab === 3 && (
      <section className="bg-card border border-border rounded-xl p-5 space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 3</p>
          <h2 className="text-base font-semibold mt-1">대출 가능액 &amp; 월 상환액 작성</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step 2에서 잡은 LTV·DSR 종합 참고 한도와, 아래 정책 참고 원금 상한 중 작은 쪽을 상한으로 두고 거치 없음 원리금 균등 월 상환을 시뮬합니다.
            보금자리론 선택 시 많은 작성 참고문에서는 규제·심사를 <span className="text-foreground font-medium">DSR보다 DTI 중심</span>으로 설명하기도 해, 같은 소득이라도 이 화면의 DSR 역산보다 「여유가 큽니다」쪽으로 받아들이게 될 수 있습니다.
            구체적인 DTI 예시와 주의점은 아래 3-1 「보금자리론」요약과, 보금자리 패널 상단 노란색 「작성 참고」블록에서 확인할 수 있습니다.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">3-1 적용 가능한 정책 (참고 요약)</p>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            연도·금융기관·안내 변경에 따라 달라질 수 있습니다. 실제 접수 요건과 한도는 주택금융공사·거래은행 안내 및 심사 기준으로 확인하세요.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <details className="rounded-lg border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer font-medium text-foreground">디딤돌대출</summary>
              <ul className="mt-2 list-disc pl-4 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li>
                  금리 수준 참고값은 보통 연 <span className="text-foreground">2~3%대</span> 등 안내되는 경우가 많습니다.
                </li>
                <li>
                  참고 원금 한도 예: 일반 <span className="text-foreground">약 2억</span>,
                  생애최초 <span className="text-foreground">약 2.4억</span>,
                  신혼 등 해당 <span className="text-foreground">약 3.2억</span>.
                </li>
                <li>
                  기혼 가구 등에 대해 적용되는 <span className="text-foreground">대상 주택가격 상한이 약 5억·6억 구간 등</span>
                  차등 안내되는 경우가 있습니다(세부 조건별 상이).
                </li>
                <li>
                  <span className="text-foreground">만 30세 이상 미혼 단독세대</span> 등 특정 요건에
                  연소득 약 <span className="text-foreground">6천만 원 이하</span>일 때
                  참고 한도 약 <span className="text-foreground">3억</span>으로 안내하는 트랙 등이 따로 존재할 수 있습니다.
                </li>
              </ul>
            </details>

            <details className="rounded-lg border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer font-medium text-foreground">보금자리론</summary>
              <ul className="mt-2 list-disc pl-4 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li>
                  대상 주택가·연소득 등 <span className="text-foreground">요건 확인 필수</span>
                  (공고 기준 참고 예: 주택가 약 <span className="text-foreground">6억 원</span> 이하 안내,
                  연소득 약 <span className="text-foreground">7천만 원</span> 등 상한 참고값이 존재).
                </li>
                <li>
                  <span className="text-foreground">장거치(작성 참고값)</span>: 본 화면에서는「내 정보」에 저장된 생년월일과 본 페이지
                  작성일 기준<strong> 만 나이</strong>를 사용합니다. 일반 「만 34세 미만 → 최대 50년 / 만 39세 미만 → 최대 40년」·신혼가구
                  「만 39세 미만 → 50년 / 만 49세 미만 → 40년」조합으로 <span className="text-foreground">참고 최장 거치</span>를 잡습니다(주택금융공사 최신 안내와 다를 수 있음).
                </li>
                <li>
                  금리 참고값은 안내 시 <span className="text-foreground">약 3~4%대</span> 등으로 제시되는 경우가 많습니다.
                </li>
                <li>
                  <span className="text-foreground">2026년 무렵 안내 작성 참고</span>: 많은 설명에서는 보금 신청 분에서
                  규제·심사를 <span className="text-foreground">DSR보다 DTI 쪽 안내 비중으로 보는 패턴</span> 언급이 있습니다.
                  그래서 동일 소득이라도 DSR 기준으로만 보던 「여유」보다 DTI 안내에서는 한도가 더 넓게 산출될 여지 설명도 자주 따라붙습니다(시점·기관별 상이).
                </li>
                <li>
                  같은 맥락에서 <span className="text-foreground">기존 신용대출·마이너스통장 등</span> 다른 대출 안내에서는
                  DSR이라면 매달 나가는 원리금 전체를 넣지만, DTI 쪽에서는 <span className="text-foreground">이자 부담 등만 깎거나 원금 상환액까지는 덜 반영</span>된다는 형태로 설명되는 경우가 있습니다.
                </li>
                <li>
                  작성용 예시(숫자는 비교 학습 목적 근삿값입니다): 연 소득 <span className="text-foreground">약 7천만 원</span>.
                  신용 <span className="text-foreground">5천만 원·연 금리 5%·약 5년 만기 근처</span> 라면 참고안내에서는
                  연 이자 부담 <span className="text-foreground">약 250만 원</span>(5천×5% 근처),
                  연 원리금 수준 안내 예시가 <span className="text-foreground">약 1,100만 원</span>대로 자주 들어갑니다.
                  「DTI 쪽에서는 이자 부담(약 연 250만 원) 근처만 반영된다는」「DSR이면 원리금(약 연 1,100만 원)까지 반영된다는」가정으로 비교하면 같은 부채인데도 여유 차이가 크게 안내되는 패턴 안내 접근이 있습니다.
                </li>
                <li>
                  참고 원금 한도 예: 일반 <span className="text-foreground">약 3.6억</span>,
                  생애최초 <span className="text-foreground">약 4.2억</span>,
                  <span className="text-foreground">전세사기 피해자</span> 특례 시 <span className="text-foreground">약 4억+</span>(별도 증빙·평가).
                </li>
              </ul>
            </details>

            <details className="rounded-lg border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer font-medium text-foreground">신혼부부 전용구입 등</summary>
              <ul className="mt-2 list-disc pl-4 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li>
                  통상 혼인 후 일정 기간(예: <span className="text-foreground">7년 이내</span>) 요건 및
                  <span className="text-foreground"> 혼인·주택 거래 신청 예정 등</span> 일정(예: 접수 또는 등기 전후 소정 기간)을 함께 따집니다.
                </li>
                <li>
                  참고 원금 한도 예: 우대 해당 시 일반 참고값으로 <span className="text-foreground">약 3.2억</span> 구간 안내 예시 존재.
                </li>
              </ul>
            </details>
          </div>
        </div>

        <div className="rounded-lg border border-primary/25 bg-muted/15 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium">3-2 순수 DSR 역산 (기존 차입 없음 가정)</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Step 2와 같은 명목금리(<span>{assumedRatePct}%</span>), 만기(
              <span>{assumedYears}년</span>)으로 원리금 균등만 반영했습니다. 실제 신청에서는 스트레스·규제 기준 차이 등으로 달라질 수 있습니다.
            </p>
          </div>

          <label className="block space-y-1.5 max-w-[11rem]">
            <span className="text-sm font-medium">만기(거치연수)</span>
            <div className="relative">
              <input
                type="number"
                min={1}
                step={1}
                value={loanYearsControlledValue}
                onFocus={() => setAssumedLoanYearsDraft(String(assumedYears))}
                onChange={e => {
                  const raw = e.target.value;
                  setAssumedLoanYearsDraft(raw);
                  const n = Number.parseFloat(raw);
                  if (Number.isFinite(n)) {
                    setPlan(prev => ({
                      ...prev,
                      assumedLoanYears: clampAssumedLoanYears(n),
                    }));
                  }
                }}
                onBlur={() => commitAssumedLoanYearsDraft()}
                placeholder={`예: ${DEFAULT_ASSUMED_LOAN_YEARS}`}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-10 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">년</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Step 2와 같은 값입니다 (1~50년).</p>
          </label>

          {totalIncome > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-background p-4 space-y-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">DSR 40%</p>
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-3">
                    <p className="text-[11px] font-medium text-muted-foreground">대출 가능액 (근사)</p>
                    <p className="text-2xl font-bold text-primary tabular-nums leading-tight mt-1">{formatAmount(pureDsr40Result.principal)}만원</p>
                    {pureDsr40Result.principal > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">{formatManwonEokHybrid(pureDsr40Result.principal)}</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-3">
                    <p className="text-[11px] font-medium text-muted-foreground">월 상환액 (근사)</p>
                    <p className="text-2xl font-bold text-primary tabular-nums leading-tight mt-1">{formatAmount(pureDsr40Result.monthlyPaymentApprox)}만원</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/80 leading-relaxed">
                  방공제 반영 순원금 참고 약{" "}
                  <span className="text-foreground font-medium">{formatAmount(pure40AfterDeduction)}만원</span>
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 space-y-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">DSR 50%</p>
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-3">
                    <p className="text-[11px] font-medium text-muted-foreground">대출 가능액 (근사)</p>
                    <p className="text-2xl font-bold text-primary tabular-nums leading-tight mt-1">{formatAmount(pureDsr50Result.principal)}만원</p>
                    {pureDsr50Result.principal > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">{formatManwonEokHybrid(pureDsr50Result.principal)}</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-3">
                    <p className="text-[11px] font-medium text-muted-foreground">월 상환액 (근사)</p>
                    <p className="text-2xl font-bold text-primary tabular-nums leading-tight mt-1">{formatAmount(pureDsr50Result.monthlyPaymentApprox)}만원</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/80 leading-relaxed">
                  방공제 반영 순원금 참고 약{" "}
                  <span className="text-foreground font-medium">{formatAmount(pure50AfterDeduction)}만원</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">연 총소득을 Step 1에 입력하면 40·50% 카드가 표시됩니다.</p>
          )}
          {pureDsr40Result.note && totalIncome > 0 && pureDsr40Result.principal <= 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-500">DSR 40% 결과: {pureDsr40Result.note}</p>
          )}
          {pureDsr50Result.note && totalIncome > 0 && pureDsr50Result.principal <= 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-500">DSR 50% 결과: {pureDsr50Result.note}</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-4">
          <p className="text-sm font-medium">내가 적용해서 볼 상품 (시뮬레이션)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(
              [
                ["none", "해당 없음 (정책 상한 미적용)", "종합 참고 한도만으로 월 상환을 계산합니다."] as const,
                ["ddimmidol", "디딤돌대출", "상품별 중간금리 참고값 약 연 2.5% 로 시뮬(직접 입력 가능)."] as const,
                ["bogeumjari", "보금자리론", "연 3.5% 참고·내 정보 생년+작성일로 만 나이 적용 장만기·월 상환"] as const,
                ["newlywed_purchase", "신혼부부 전용구입 등", "금리 참고값 약 연 3%(직접 조정 가능)."] as const,
              ]
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                  plan.step3PolicyProduct === value ? "border-primary bg-primary/10" : "border-border bg-background/70"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="step3-product"
                    checked={plan.step3PolicyProduct === value}
                    onChange={() =>
                      setPlan(prev => ({
                        ...prev,
                        step3PolicyProduct: value as Step3PolicyProduct,
                        step3LoanPrincipalManualManwon: null,
                      }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-medium">{label}</span>
                </span>
                <span className="text-xs text-muted-foreground pl-7">{hint}</span>
              </label>
            ))}
          </div>

          {plan.step3PolicyProduct === "ddimmidol" && (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">디딤돌 — 참고 최대 원금 구분</span>
              <select
                value={plan.ddimmidolLoanCapVariant}
                onChange={e =>
                  setPlan(prev => ({
                    ...prev,
                    ddimmidolLoanCapVariant: e.target.value as DdimmidolLoanCapVariant,
                    step3LoanPrincipalManualManwon: null,
                  }))
                }
                className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="general_2eok">{ddimmidolVariantInfo("general_2eok").label}</option>
                <option value="first_home_240">{ddimmidolVariantInfo("first_home_240").label}</option>
                <option value="newlywed_or_multiplier_320">{ddimmidolVariantInfo("newlywed_or_multiplier_320").label}</option>
                <option value="solo_30_inc60m_300">{ddimmidolVariantInfo("solo_30_inc60m_300").label}</option>
              </select>
            </label>
          )}

          {plan.step3PolicyProduct === "bogeumjari" && (
            <div className="space-y-3 rounded-lg border border-border/80 bg-background/60 p-3">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">보금자리론 — 참고 최대 원금 구분</span>
                <select
                  value={plan.bogeumjariLoanCapVariant}
                  onChange={e =>
                    setPlan(prev => ({
                      ...prev,
                      bogeumjariLoanCapVariant: e.target.value as BogeumjariLoanCapVariant,
                      step3LoanPrincipalManualManwon: null,
                    }))
                  }
                  className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="general_360">{bogeumjariVariantInfo("general_360").label}</option>
                  <option value="first_home_420">{bogeumjariVariantInfo("first_home_420").label}</option>
                  <option value="jeonse_victim_400_plus">{bogeumjariVariantInfo("jeonse_victim_400_plus").label}</option>
                </select>
              </label>

              <div className="rounded-md border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                <p className="font-medium text-foreground">작성 참고 · 보금과 DTI(2026년 무렵 자료·설명 회자 예시)</p>
                <p>
                  보금자리론 관련해서는 안내글마다 차이가 있지만, 많은 설명에서 <span className="text-foreground">DSR까지는 보지 않고 DTI 중심</span>
                  이라고 소개되는 경우가 있습니다. 그 경우 같은 소득이라도 이 화면의 Step 2(DSR 역산 포함) 한도보다 실제 접수 한도 안내가{" "}
                  <span className="text-foreground">더 넓게 느껴지기 쉽다</span>는 말과 자주 이어집니다(금융기관·시점·상품마다 확인 필요).
                </p>
                <p>
                  <span className="text-foreground">신용대출·마이너스통장 등</span> 같은 기존 차입에 대해서도,
                  DSR을 전제로 삼으면 연간 채무 부담에 들어가는 <span className="text-foreground">원리금(원금+이자)</span>을 크게 잡는 안내가 많은 반면,
                  보금 접수를 DTI 위주로만 해석하는 글에서는 종종 <span className="text-foreground">이자 부담만</span> 크게 반영하고 원금 상환분은 덜 반영한다는 식으로 설명되는 경우가 있습니다.
                  그래서 Step 2 「연간 다른 대출 원리금」에 넣은 숫자와 실제 접수 시 사용되는 DTI 해석이 어긋날 수 있습니다.
                </p>
                <p className="text-[11px] leading-relaxed border-t border-amber-500/20 pt-1.5">
                  비교 학습 근삿값 예시: 연소득 약 <span className="text-foreground font-medium">7천만 원</span>,
                  신용 <span className="text-foreground font-medium">5천만 원</span>, 연금리 약{" "}
                  <span className="text-foreground font-medium">5%</span>, 만기 약 <span className="text-foreground font-medium">5년</span> 근처일 때 자주 들어오는 근삿값으로는
                  연 이자 부담 약 <span className="text-foreground font-medium">250만 원</span>(5천×5% 근처),
                  연 원리금은 약 <span className="text-foreground font-medium">1,100만 원</span>이라는 설명이 붙습니다.
                  DTI 쪽에서는 이 중 <span className="text-foreground">약 250만 원(이자)</span>만 크게 줄어든다고 가정해 보면,
                  DSR처럼 <span className="text-foreground">약 1,100만 원(원리금)</span>을 통째로 넣었다고 가정할 때보다 소득 대비 여유가 훨씬 크게 보입니다.
                </p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-border bg-muted/25 px-3 py-2.5 leading-snug">
                  <span className="font-medium text-foreground">참고 만 나이 · 내 정보</span>
                  {authMeLoading ? (
                    <p className="text-[13px] text-muted-foreground mt-1">내 정보를 불러오는 중입니다…</p>
                  ) : profileBirthIso === "" ? (
                    <p className="text-[13px] text-muted-foreground mt-1">
                      저장된 생년월일이 없습니다.{" "}
                      <a href="/profile" className="text-primary underline-offset-4 hover:underline font-medium">
                        내 정보
                      </a>
                      에서 입력하면 작성일 기준 만 나이로 장만기를 계산합니다.
                    </p>
                  ) : usableProfileManAgeAtWritten !== null ? (
                    <p className="text-[13px] text-muted-foreground mt-1">
                      작성일 <span className="text-foreground font-medium">{plan.writtenDate}</span>
                      현재 참고 만 <span className="text-foreground font-semibold">{usableProfileManAgeAtWritten}</span>
                      세
                      <span className="block text-[11px] mt-1">
                        생년월일은 「내 정보」에서 관리합니다. 부부 공동 채무는 연장자 기준 안내 등이 적용되는 경우가 있습니다.
                      </span>
                    </p>
                  ) : (
                    <p className="text-[13px] text-amber-600 dark:text-amber-500 mt-1">
                      생년월일 또는 작성일(YYYY-MM-DD)을 확인하지 못했습니다.
                      작성 정보의 날짜와{" "}
                      <a href="/profile" className="underline font-medium">
                        내 정보
                      </a>
                      생년월일을 확인하세요.
                    </p>
                  )}
                </div>
                <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={plan.bogeumTermNewlywedHousehold}
                    onChange={e => setPlan(prev => ({ ...prev, bogeumTermNewlywedHousehold: e.target.checked }))}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="leading-snug">
                    신혼가구 장만기 연령 기준 적용
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      신혼가구 정의 등은 해당 연도 공고 확인(예: 혼인 후 7년 이내 여부 등).
                    </span>
                  </span>
                </label>
              </div>

              {bogeumReferralYears && bogeumReferralYears.years > 0 && bogeumMaturityApprox && (
                <div className="rounded-md border border-primary/35 bg-primary/8 px-3 py-2 text-xs space-y-1">
                  <p className="text-foreground font-medium">
                    참고 최장 거치 약 <span>{bogeumReferralYears.years}</span>
                    년 · 만기예정일(작성일 {plan.writtenDate} 기준 가정)
                  </p>
                  <p className="text-muted-foreground">{formatKoreanLongDate(bogeumMaturityApprox)}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{bogeumReferralYears.ruleLabel}</p>
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer text-foreground font-medium py-1">안내 차이 참고</summary>
                    주택금융공사·은행에서는 「50년: 만 35세 미만 또는 신혼 만 40세 미만」「40년: 만 40세 미만 또는 신혼 만 50세 미만」
                    같은 안내가 많아, 작성 기준값과 불일치할 수 있습니다. 접수 전 최신 상품설명서로 확인하세요.
                  </details>
                </div>
              )}

              {(profileBirthIso === "" || usableProfileManAgeAtWritten === null) && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  내 정보 생년월일과 유효한 작성일로 만 나이를 산출할 수 있어야 참고 장만기·만기예정일이 채워지고, 월 상환 시뮬에도 해당 거치연수가 반영됩니다.
                  그렇지 않으면 Step 2 가정 거치연수 (
                  <span className="text-foreground font-medium">{assumedYears}</span>
                  년)로만 계산합니다.
                </p>
              )}

              {bogeumReferralYears && bogeumReferralYears.years === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">{bogeumReferralYears.ruleLabel}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">
                작성 대출 원금 (만원) — 자동 모드일 때 적용 상한은 {formatAmount(step3PrincipalUpper)}만원
              </span>
              <CurrencyInput
                value={
                  manualPrincipal != null && Number.isFinite(manualPrincipal)
                    ? manualPrincipal
                    : step3PrincipalUpper
                }
                onChange={v =>
                  setPlan(prev => ({
                    ...prev,
                    step3LoanPrincipalManualManwon: Number.isFinite(v) ? v : null,
                  }))
                }
                suffix="만원"
                koreanUnit="manwon"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                  onClick={() => setPlan(prev => ({ ...prev, step3LoanPrincipalManualManwon: step3PrincipalUpper }))}
                >
                  계산값으로 맞추기 ({formatAmount(step3PrincipalUpper)}만원)
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setPlan(prev => ({ ...prev, step3LoanPrincipalManualManwon: null }))}
                >
                  입력 해제·자동
                </button>
              </div>
              {step3PrincipalClampNote && (
                <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                  입력하신 원금은 LTV·DSR 종합 참고 한도 또는 정책 참고 원금 상한보다 크므로, 월 상환 시뮬에는{" "}
                  {formatAmount(appliedStep3PrincipalManwon)}만원까지 적용했습니다.
                </p>
              )}
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium">월 상환 시뮬 연 금리 (%) — 빈 칸 시 상품 기본 참고값</span>
              <div className="relative max-w-xs">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={plan.step3PolicyAnnualRatePct}
                  onChange={e => setPlan(prev => ({ ...prev, step3PolicyAnnualRatePct: e.target.value }))}
                  placeholder={
                    plan.step3PolicyAnnualRatePct.trim()
                      ? undefined
                      : `예: ${step3CapInfo.defaultAnnualRatePct}`
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                적용 역산금리 약 연 <span className="text-foreground font-medium">{step3SimRatePct.toFixed(2)}%</span>,
                상환 거치 약{" "}
                <span className="text-foreground font-medium">{step3AmortYears}</span>
                년
                {plan.step3PolicyProduct === "bogeumjari"
                  ? (bogeumReferralYears?.years
                    ? " (보금자리 참고 최장 장만기 기준)"
                    : " (내 정보 생년 또는 작성일 불능·규격 밖 — Step 2 가정 거치연수 폴백)")
                  : " (Step 2 가정 거치연수)"}
                ·원리금 균등(거치 없음)입니다.
              </p>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Step 2 종합 참고 원금 한도</p>
            <MoneyPrimary amount={estimatedEffectiveLoan} />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {plan.step3PolicyProduct === "bogeumjari"
                ? "보금 선택 시 표시 종합 참고 한도에는 DSR·LTV 결과가 포함됩니다. 많은 작성 참고에서는 보금 접수 분이 DTI 위주 안내라 실제 접수 가능 한도는 이 카드 숫자와 다를 수 있습니다."
                : "LTV와 DSR(스트레스 반영 시) 결과 중 작은 쪽 참고값"}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{step3CapInfo.productLabel} 참고 원금 상한</p>
            {Number.isFinite(step3CapInfo.capManwon) ? (
              <MoneyPrimary amount={step3CapInfo.capManwon} />
            ) : (
              <p className="text-sm text-muted-foreground">정책 미선택</p>
            )}
            <p className="text-[11px] text-muted-foreground leading-snug">{step3CapInfo.capDetailLabel}</p>
          </div>
          <div className="rounded-lg border border-primary/35 bg-primary/8 p-4 space-y-1">
            <p className="text-xs text-muted-foreground">시뮬 적용 작성 원금</p>
            <MoneyPrimary amount={appliedStep3PrincipalManwon} emphasized />
            <p className="text-[11px] text-muted-foreground leading-snug">위 두 참고값과의 최소값 이하로 자동 적용</p>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-1">
            <p className="text-xs text-muted-foreground">예상 월 상환 (원리금 균등)</p>
            <p className="text-lg font-bold text-primary leading-tight">
              {appliedStep3PrincipalManwon > 0 ? `${formatAmount(Math.round(monthlyStep3RepaymentManwon))}만원` : "—"}
            </p>
            {appliedStep3PrincipalManwon > 0 && (
              <>
                <p className="text-xs text-muted-foreground leading-snug">
                  연합산 약 {formatAmount(Math.round(step3AnnualRepaymentApproxManwon))}만원 ({formatManwonEokHybrid(step3AnnualRepaymentApproxManwon)})
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {plan.step3PolicyProduct === "bogeumjari"
                    ? "보금 선택: 많은 작성 참고에서 보금 접수는 DTI를 중시한다는 설명이 많아 이 화면의 DSR 기준 연 원리금 여유와 어긋날 수 있습니다. 위 금액은 선택 원금 기준 작성용 시뮬입니다."
                    : "DSR 허용 연 원리금 여유와 일치하지 않을 수 있습니다. 결과는 작성용 시뮬입니다."}
                </p>
              </>
            )}
          </div>
        </div>

        {(estimatedEffectiveLoan <= 0 && plan.step3PolicyProduct !== "none") && (
          <p className="text-xs text-amber-600 dark:text-amber-500 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 leading-relaxed">
            Step 2에서 아직 종합 참고 한도가 0입니다. 우선 소득·집값·LTV 등을 채워야 「실제 신청 가능」
            과 가깝습니다. 현재 참고값은 선택한 정책 원금 상한까지 열린 「가정 시뮬」에 가깝습니다.
          </p>
        )}
      </section>
      )}

      {activeBudgetTab === 4 && (
      <section className="bg-card border border-border rounded-xl p-5 space-y-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 4</p>
          <h2 className="text-base font-semibold mt-1">월 상환 부담 체크</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            세후 월 실수입은 연 총소득(세전)×연{" "}
            <span className="text-foreground font-medium">{Math.round(STEP4_ANNUAL_NET_RATIO_FROM_PRETAX * 100)}%</span> 근산을 12로 나눈 값으로 먼저 채웁니다. 주택 월 상환은 Step 3 예상액을 기본으로 둡니다. 둘 다 직접 수정할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="text-sm font-medium">세후 월 실수입 (만원)</span>
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline shrink-0"
                onClick={() => setPlan(prev => ({ ...prev, step4NetMonthlyManualManwon: null }))}
              >
                연봉 근산으로 맞추기
              </button>
            </div>
            <CurrencyInput
              value={resolvedStep4NetMonthly}
              onChange={v => setPlan(prev => ({ ...prev, step4NetMonthlyManualManwon: Number.isFinite(v) ? v : null }))}
              suffix="만원"
              koreanUnit="manwon"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              미입력(자동) 근산: 연 총소득 {formatAmount(totalIncome)}만원 × {Math.round(STEP4_ANNUAL_NET_RATIO_FROM_PRETAX * 100)}% ÷ 12 ≈{" "}
              <span className="text-foreground font-medium">{formatAmount(derivedStep4NetMonthly)}만원</span>
              {plan.step4NetMonthlyManualManwon !== null && (
                <span className="text-amber-600 dark:text-amber-500"> · 수동값 적용 중</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="text-sm font-medium">주택 대출 월 상환 (만원)</span>
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline shrink-0"
                onClick={() => setPlan(prev => ({ ...prev, step4HousingMonthlyManualManwon: null }))}
              >
                Step 3 예상으로 맞추기
              </button>
            </div>
            <CurrencyInput
              value={resolvedStep4HousingMonthly}
              onChange={v =>
                setPlan(prev => ({
                  ...prev,
                  step4HousingMonthlyManualManwon: Number.isFinite(v) ? v : null,
                }))
              }
              suffix="만원"
              koreanUnit="manwon"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              자동 기준: Step 3 예상 월 상환{" "}
              <span className="text-foreground font-medium">
                {appliedStep3PrincipalManwon > 0 ? `${formatAmount(Math.round(monthlyStep3RepaymentManwon))}만원` : "—"}
              </span>
              {plan.step4HousingMonthlyManualManwon !== null && (
                <span className="text-amber-600 dark:text-amber-500"> · 수동값 적용 중</span>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4 md:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm font-medium text-foreground">부담비율</p>
            <p className="text-sm text-muted-foreground">
              주택 월 상환 ÷ 세후 월 실수입 ≈{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {burdenPctOrNull !== null ? `${burdenPctOrNull}%` : "— (세후 월 실수입을 입력·근산해 주세요)"}
              </span>
            </p>
          </div>

          <div className="relative pt-9 pb-1">
            <div
              className="absolute top-0 flex flex-col items-center -translate-x-1/2 z-10"
              style={{ left: `${step4GaugePct}%` }}
            >
              <span className="text-[11px] font-bold tabular-nums text-primary bg-background border border-primary/40 rounded-md px-2 py-0.5 shadow-sm whitespace-nowrap">
                {burdenPctOrNull !== null ? `${burdenPctOrNull}%` : resolvedStep4HousingMonthly > 0 ? "입력 필요" : "0%"}
              </span>
              <div className="w-px h-3 bg-primary mt-0.5" />
            </div>
            <div className="flex h-3.5 rounded-full overflow-hidden border border-border/70 shadow-inner">
              <div className="w-[30%] bg-emerald-500/90" title="여유" />
              <div className="w-[10%] bg-amber-400/95" title="적당" />
              <div className="w-[10%] bg-orange-500/90" title="빡빡" />
              <div className="flex-1 bg-red-500/75" title="고부담" />
            </div>
            <div className="flex text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 leading-tight">
              <span className="w-[30%] min-w-0">≤30% 여유</span>
              <span className="w-[10%] text-center min-w-0">30~40%</span>
              <span className="w-[10%] text-center min-w-0">40~50%</span>
              <span className="flex-1 text-right min-w-0">50% 초과</span>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {(
              [
                ["comfort", "여유로움", "약 30% 이하", "emerald"] as const,
                ["moderate", "적당함", "약 30~40%", "amber"] as const,
                ["tight", "빡빡함", "약 40~50%", "orange"] as const,
                ["severe", "고부담", "약 50% 초과", "red"] as const,
              ]
            ).map(([id, title, range, tone]) => {
              const active = step4BurdenBand === id;
              const ring =
                tone === "emerald"
                  ? "ring-emerald-500/40 border-emerald-500/50 bg-emerald-500/[0.08]"
                  : tone === "amber"
                    ? "ring-amber-400/50 border-amber-500/50 bg-amber-400/[0.12]"
                    : tone === "orange"
                      ? "ring-orange-500/40 border-orange-500/50 bg-orange-500/[0.08]"
                      : "ring-red-500/40 border-red-500/50 bg-red-500/[0.08]";
              return (
                <div
                  key={id}
                  className={`rounded-lg border px-2.5 py-2.5 text-center transition-shadow ${
                    active ? `ring-2 shadow-sm ${ring}` : "border-border bg-background/60 opacity-75"
                  }`}
                >
                  <p className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{range}</p>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-center text-muted-foreground leading-relaxed">
            현재 해석은{" "}
            <span className="font-semibold text-foreground">
              {step4BurdenBand === "comfort" && "여유로움"}
              {step4BurdenBand === "moderate" && "적당함"}
              {step4BurdenBand === "tight" && "빡빡함"}
              {step4BurdenBand === "severe" && "고부담"}
            </span>
            구간으로 보는 참고치입니다. 실제 가계는 공과금·생활비·다른 대출 등이 함께 들어갑니다.
          </p>
        </div>
      </section>
      )}

      {activeBudgetTab === 5 && (
      <section
        id="re-budget-vs-target"
        className="relative scroll-mt-20 overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-lg ring-1 ring-black/5 dark:ring-white/10"
        aria-label="내 조달 vs 목표 집값 상세"
      >
        <div className="pointer-events-none absolute -right-24 -top-32 h-56 w-56 rounded-full bg-gradient-to-bl from-primary/25 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-48 w-48 rounded-full bg-gradient-to-tr from-violet-500/20 to-transparent blur-3xl" />

        <div className="relative border-b border-primary/15 bg-gradient-to-r from-primary/[0.1] via-primary/[0.04] to-transparent px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-inner ring-1 ring-primary/20"
              aria-hidden
            >
              <Scale className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary/90">Step 5</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/[0.1] px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-200">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  실시간
                </span>
              </div>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">내 조달 vs 목표 집값</h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                가용 계획·자기자금과 Step 3 작성 원금 또는 상단 「예상 대출 참고 한도」를 더한 근삿값을, Step 2 희망 집값과 나란히 봅니다.
              </p>
            </div>
          </div>
        </div>

        <div className="relative space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <div className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent p-[1px] shadow-sm">
              <div className="relative h-full rounded-2xl bg-card/95 p-4 backdrop-blur-sm dark:bg-card/90">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                      <Home className="h-4 w-4 shrink-0" aria-hidden />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-primary">목표 집값</span>
                  </div>
                  {targetHousePriceManwon > 0 ? (
                    <span className="rounded-md bg-muted/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">Step 2</span>
                  ) : (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">미입력</span>
                  )}
                </div>
                {targetHousePriceManwon > 0 ? (
                  <>
                    <p className="mt-4 text-2xl font-extrabold tabular-nums tracking-tight text-primary sm:text-3xl">{approxEokHeadingFromManwon(targetHousePriceManwon)}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground/90">{formatAmount(targetHousePriceManwon)}</span>
                      만원
                      {" "}
                      <span>{formatManwonEokHybrid(targetHousePriceManwon)}</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-4 py-6 text-center text-sm text-amber-800 dark:text-amber-300">Step 2에서 희망 집가격(억)을 채워야 장벽 분석이 시작됩니다.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
              <div className="flex items-center gap-2 pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500/25">
                  <PiggyBank className="h-4 w-4 shrink-0" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-bold text-foreground">자기자금</p>
                  <p className="text-[10px] text-muted-foreground">가용 계획 활성 합계 또는 억 입력</p>
                </div>
              </div>
              <label className="space-y-1.5 block">
                <span className="sr-only">자기자금 억 단위 입력</span>
                <div className="relative max-w-[17rem]">
                  <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={plan.step5OwnFundsEok}
                    onChange={e => setPlan(prev => ({ ...prev, step5OwnFundsEok: e.target.value }))}
                    placeholder={fundPlanTotalManwon <= 0 ? "예: 2.5" : ""}
                    className="flex h-10 w-full rounded-xl border border-input bg-background/80 pl-9 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    억
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    {step5UsingFundPlanForOwnFunds ? (
                      <>
                        계획서 반영&nbsp;
                        <span className="font-semibold text-foreground tabular-nums">{formatAmount(fundPlanTotalManwon)}</span>
                        만원
                        {fundPlanTotalManwon > 0 && <span className="text-muted-foreground/90"> {formatManwonEokHybrid(fundPlanTotalManwon)}</span>}
                      </>
                    ) : (
                      <>
                        직접 입력&nbsp;<span className="font-semibold text-foreground tabular-nums">{formatAmount(resolvedOwnFundsManwon)}</span>만원
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => setPlan(prev => ({ ...prev, step5OwnFundsEok: "" }))}
                  >
                    계획서 합으로 되돌리기
                  </button>
                </div>
                {fundPlanTotalManwon <= 0 && step5UsingFundPlanForOwnFunds && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 pt-1">가용 계획 페이지에서 활성·금액을 채워 주세요.</p>
                )}
              </label>

              <details className="mt-3 rounded-xl border border-dashed border-border/80 bg-background/60 p-3 text-[11px]">
                <summary className="cursor-pointer font-medium text-foreground">조합 숫자가 무엇인가요?</summary>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted-foreground leading-relaxed">
                  <li>
                    <strong className="text-foreground">정책·시뮬:</strong> Step 3 시뮬 적용 작성 원금 + 자기자금입니다.
                  </li>
                  <li>
                    <strong className="text-foreground">일반 참고:</strong> 상단 요약 「예상 적용 대출」한도 + 자기자금입니다.
                  </li>
                </ul>
              </details>
            </div>
          </div>

          {targetHousePriceManwon > 0 ? (
            <>
              <div className="rounded-2xl border border-border bg-muted/[0.35] p-4 sm:p-5">
                <p className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-background text-foreground ring-1 ring-border">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  세 금액 스케일 비교
                  <span className="text-[10px] font-normal lowercase text-muted-foreground/90">
                    가장 큰 근삿값을 100%로 둠
                  </span>
                </p>
                <div className="grid gap-6 sm:grid-cols-3">
                  <BudgetVsScaleBar
                    title="목표 집값"
                    subtitle={`${formatAmount(targetHousePriceManwon)}만원`}
                    manwon={targetHousePriceManwon}
                    pct={vsTargetBarPct}
                    gradientClass="from-sky-500 to-primary"
                    amountClassName="text-primary"
                  />
                  <BudgetVsScaleBar
                    title="정책·시뮬 합계"
                    subtitle={`작성 원금 포함 · ${formatAmount(sumStep5PolicyCombinationManwon)}만원`}
                    manwon={sumStep5PolicyCombinationManwon}
                    pct={vsPolicyBarPct}
                    gradientClass="from-emerald-500 to-teal-600"
                    amountClassName="text-emerald-700 dark:text-emerald-400"
                  />
                  <BudgetVsScaleBar
                    title="일반 참고 합계"
                    subtitle={`LTV·DSR 참고 한도 포함 · ${formatAmount(sumStep5GeneralCombinationManwon)}만원`}
                    manwon={sumStep5GeneralCombinationManwon}
                    pct={vsGeneralBarPct}
                    gradientClass="from-slate-500 to-zinc-600"
                    amountClassName="text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div
                  className={`relative overflow-hidden rounded-2xl border p-[1px] shadow-md transition-shadow hover:shadow-lg ${
                    step5TargetGapPolicyManwon !== null && step5TargetGapPolicyManwon < 0
                      ? "border-amber-500/55 bg-gradient-to-br from-amber-500/20 to-transparent"
                      : "border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.12] to-transparent"
                  }`}
                >
                  <div className="relative h-full rounded-2xl border border-transparent bg-card/95 px-4 py-4 backdrop-blur-sm dark:bg-card/90">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30">
                          <Shield className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">정책·시뮬</p>
                          <p className="text-xs font-semibold text-foreground">목표까지 여유?</p>
                        </div>
                      </div>
                      {targetHousePriceManwon > 0 && Number.isFinite(policyReachOfTargetPct) && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-foreground ring-1 ring-border">
                          {Math.round(Math.min(999, policyReachOfTargetPct))}%
                          <span className="hidden sm:inline font-normal text-muted-foreground"> vs 목표</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-xl font-extrabold tabular-nums text-primary">{approxEokHeadingFromManwon(sumStep5PolicyCombinationManwon)}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      자기 + 작성 원금&nbsp;
                      <span className="font-medium text-foreground/90">{formatAmount(sumStep5PolicyCombinationManwon)}</span>
                      만원
                      {formatManwonEokHybrid(sumStep5PolicyCombinationManwon)}
                    </p>
                    {step5TargetGapPolicyManwon !== null && (
                      <div
                        className={`mt-3 rounded-xl border px-3 py-2.5 ${
                          step5TargetGapPolicyManwon >= 0
                            ? "border-emerald-500/40 bg-emerald-500/[0.1]"
                            : "border-amber-600/50 bg-amber-500/[0.12]"
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-muted-foreground">목표 대비</p>
                        {step5TargetGapPolicyManwon >= 0 ? (
                          <p className="mt-0.5 font-bold tabular-nums text-emerald-800 dark:text-emerald-400">
                            여유 +{formatAmount(step5TargetGapPolicyManwon)}
                            만원 · {formatManwonEokHybrid(step5TargetGapPolicyManwon)}
                          </p>
                        ) : (
                          <p className="mt-0.5 font-bold tabular-nums text-amber-950 dark:text-amber-100">
                            부족 −{formatAmount(Math.abs(step5TargetGapPolicyManwon))}
                            만원 · {formatManwonEokHybrid(Math.abs(step5TargetGapPolicyManwon))}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`relative overflow-hidden rounded-2xl border p-[1px] shadow-md transition-shadow hover:shadow-lg ${
                    step5TargetGapGeneralManwon !== null && step5TargetGapGeneralManwon < 0
                      ? "border-amber-500/55 bg-gradient-to-br from-amber-500/20 to-transparent"
                      : "border-violet-500/25 bg-gradient-to-br from-violet-500/[0.1] to-transparent"
                  }`}
                >
                  <div className="relative h-full rounded-2xl border border-transparent bg-card/95 px-4 py-4 backdrop-blur-sm dark:bg-card/90">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-400 ring-1 ring-violet-500/30">
                          <Building2 className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">일반 주담대</p>
                          <p className="text-xs font-semibold text-foreground">참고 한도 포함</p>
                        </div>
                      </div>
                      {targetHousePriceManwon > 0 && Number.isFinite(generalReachOfTargetPct) && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-foreground ring-1 ring-border">
                          {Math.round(Math.min(999, generalReachOfTargetPct))}%
                          <span className="hidden sm:inline font-normal text-muted-foreground"> vs 목표</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-xl font-extrabold tabular-nums text-foreground">{approxEokHeadingFromManwon(sumStep5GeneralCombinationManwon)}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      자기 + 참고 한도&nbsp;
                      <span className="font-medium text-foreground/90">{formatAmount(sumStep5GeneralCombinationManwon)}</span>
                      만원
                      {formatManwonEokHybrid(sumStep5GeneralCombinationManwon)}
                    </p>
                    {step5TargetGapGeneralManwon !== null && (
                      <div
                        className={`mt-3 rounded-xl border px-3 py-2.5 ${
                          step5TargetGapGeneralManwon >= 0
                            ? "border-emerald-500/40 bg-emerald-500/[0.1]"
                            : "border-amber-600/50 bg-amber-500/[0.12]"
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-muted-foreground">목표 대비</p>
                        {step5TargetGapGeneralManwon >= 0 ? (
                          <p className="mt-0.5 font-bold tabular-nums text-emerald-800 dark:text-emerald-400">
                            여유 +{formatAmount(step5TargetGapGeneralManwon)}
                            만원 · {formatManwonEokHybrid(step5TargetGapGeneralManwon)}
                          </p>
                        ) : (
                          <p className="mt-0.5 font-bold tabular-nums text-amber-950 dark:text-amber-100">
                            부족 −{formatAmount(Math.abs(step5TargetGapGeneralManwon))}
                            만원 · {formatManwonEokHybrid(Math.abs(step5TargetGapGeneralManwon))}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/[0.2] px-4 py-6 text-center text-xs text-muted-foreground">
              <Home className="h-8 w-8 shrink-0 text-muted-foreground/50" aria-hidden />
              <span>목표 금액을 넣으면 스케일 막대·조합 카드와 부족액까지 한 번에 확인할 수 있습니다.</span>
            </div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
