import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 금액을 한국식 숫자 포맷으로 변환 (예: 1,234,567) */
export function formatAmount(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  return Math.round(num).toLocaleString("ko-KR");
}

/** 금액을 만원 단위로 변환 */
export function formatAmountInManwon(amount: number | null | undefined): string {
  if (!amount) return "0만원";
  const manwon = Math.round(amount / 10000);
  return `${manwon.toLocaleString("ko-KR")}만원`;
}

/** 수익률을 % 포맷으로 변환 */
export function formatReturnRate(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined) return "0%";
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (isNaN(num)) return "0%";
  const pct = Math.abs(num) < 10 ? num * 100 : num;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

/** 수익률 색상 클래스 반환 */
export function returnRateColor(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined) return "text-muted-foreground";
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (isNaN(num)) return "text-muted-foreground";
  if (num > 0) return "text-emerald-600 dark:text-emerald-400";
  if (num < 0) return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

/** 브라우저 로컬 기준 YYYY-MM-DD (일시정지·가계부 날짜에 사용, UTC toISOString 지양) */
export function formatLocalDateYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 날짜 포맷 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export const currentYear = new Date().getFullYear();
export const currentMonth = new Date().getMonth() + 1;
export const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
export const MAIN_CATEGORIES = ["소득", "고정지출", "변동지출", "사업지출", "저축/투자"];
export const VARIABLE_SUB_CATEGORIES = ["식비","교통비","꾸밈비","교육비","자기개발","여가","생활용품","선물/경조","변동 세금","건강1","변동 업무"];
export const INCOME_SUB_CATEGORIES = ["급여","사업소득","부수입","투자수익","기타수입"];
export const FIXED_SUB_CATEGORIES = ["주거비","통신비","보험료","OTT","모임회비","교통/차량","업무"];
export const SAVINGS_SUB_CATEGORIES = ["예적금","현금성통장","투자","연금저축","주택청약","기타저축"];
