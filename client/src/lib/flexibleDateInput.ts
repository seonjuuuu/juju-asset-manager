/** 숫자만 입력해도 YYYY-MM-DD 형태로 표시·저장 (예: 20260501, 260501 → 2026-05-01) */

export function digitsFromDateInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * 입력 문자열을 숫자 기준으로 정규화해 표시용 문자열 반환 (저장과 동일 규칙).
 * - 8자리: YYYYMMDD
 * - 6자리 + 앞이 19/20: YYYYMM (월까지)
 * - 그 외 6자리: YYMMDD → 20YY-MM-DD
 */
export function formatFlexibleDateDigits(raw: string): string {
  let digits = digitsFromDateInput(raw);
  if (!digits) return "";

  if (digits.length === 6) {
    if (digits.startsWith("19") || digits.startsWith("20")) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    }
    const yy = parseInt(digits.slice(0, 2), 10);
    const year = Number.isFinite(yy) ? (yy <= 69 ? 2000 : 1900) + yy : yy;
    digits = `${year}${digits.slice(2)}`;
  }

  digits = digits.slice(0, 8);
  const y = digits.slice(0, 4);
  if (digits.length <= 4) return y;
  const m = digits.slice(4, 6);
  if (digits.length <= 6) return `${y}-${m}`;
  const d = digits.slice(6, 8);
  return `${y}-${m}-${d}`;
}

/** 완전한 달력 날짜인지 (저장·서버 전송용) */
export function isCompleteCalendarDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [yy, mm, dd] = iso.split("-").map(Number);
  const dt = new Date(yy, mm - 1, dd);
  return dt.getFullYear() === yy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
}
