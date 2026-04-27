import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number | string;
  onChange: (numericValue: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  suffix?: string; // 예: "원", "만원"
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

  return (
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
  );
}
