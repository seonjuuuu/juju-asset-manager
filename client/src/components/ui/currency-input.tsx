import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type KoreanUnit = "won" | "manwon";

function toKoreanWon(n: number): string {
  if (!n || n === 0) return "";
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  const cheon = Math.floor((n % 10_000) / 1000);
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man}만`);
  if (cheon > 0) parts.push(`${cheon}천`);
  if (parts.length === 0) parts.push(String(n));
  return parts.join(" ") + "원";
}

function formatSmallKorean(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}천`;
  if (n >= 1000) return `${Math.floor(n / 1000)}천 ${n % 1000}`;
  return n.toLocaleString("ko-KR");
}

function toKoreanManwon(n: number): string {
  if (!n || n === 0) return "";
  const eok = Math.floor(n / 10_000);
  const manwon = n % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (manwon > 0) parts.push(`${formatSmallKorean(manwon)}만원`);
  return parts.join(" ");
}

interface CurrencyInputProps {
  value: number | string;
  onChange: (numericValue: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  suffix?: string; // 예: "원", "만원"
  koreanUnit?: KoreanUnit;
}

/**
 * 천단위 콤마 자동 삽입 금액 입력 컴포넌트.
 * - 표시값: "1,234,567" (콤마 포함 문자열)
 * - onChange에는 순수 숫자(number)를 전달
 */
export function CurrencyInput({
  value,
  onChange,
  placeholder = "0",
  className,
  disabled,
  suffix,
  koreanUnit = "won",
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 숫자 → 콤마 포함 문자열
  function toDisplay(v: number | string): string {
    const num = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
    if (!num && num !== 0) return "";
    if (num === 0) return "";
    return num.toLocaleString("ko-KR");
  }

  const [display, setDisplay] = useState(() => toDisplay(value));

  // 외부 value가 바뀌면 동기화 (단, 포커스 중엔 무시)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay(toDisplay(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // 숫자와 콤마만 허용, 콤마 제거 후 숫자 추출
    const digitsOnly = raw.replace(/[^0-9]/g, "");
    if (digitsOnly === "") {
      setDisplay("");
      onChange(0);
      return;
    }
    const numeric = parseInt(digitsOnly, 10);
    const formatted = numeric.toLocaleString("ko-KR");
    setDisplay(formatted);
    onChange(numeric);
  }

  function handleBlur() {
    setDisplay(toDisplay(value));
  }

  function handleFocus() {
    // 포커스 시 콤마 없는 숫자만 표시 (편집 편의)
    const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
    if (!num) {
      setDisplay("");
    } else {
      setDisplay(String(num));
    }
  }

  const numericValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) || 0 : value;
  const korean = koreanUnit === "manwon" ? toKoreanManwon(numericValue) : toKoreanWon(numericValue);

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            suffix && "pr-10",
            className
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {korean && (
        <span className="block mt-0.5 text-xs text-muted-foreground">
          {korean}
        </span>
      )}
    </div>
  );
}
