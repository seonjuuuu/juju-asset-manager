import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFlexibleDateDigits, isCompleteCalendarDate } from "@/lib/flexibleDateInput";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function FlexibleDateField({
  label,
  value,
  onChange,
  placeholder = "20260501 또는 260501",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    isCompleteCalendarDate(value.trim()) ? new Date(`${value.trim()}T12:00:00`) : undefined;

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-2">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1"
          value={value}
          onChange={(e) => onChange(formatFlexibleDateDigits(e.target.value))}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="달력에서 선택">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => {
                if (!date) return;
                onChange(formatLocalYmd(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
