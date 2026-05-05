import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { ledgerSubCostForMonth, subscriptionLedgerDate } from "@/lib/subscriptionLedger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, Wallet, Clock3 } from "lucide-react";

type PaymentType = "구독결제" | "보험" | "고정지출" | "할부" | "대출" | "빌린돈" | "가계부";

type PaymentEvent = {
  id: string;
  date: string;
  title: string;
  amount: number;
  type: PaymentType;
  method?: string | null;
  detail?: string | null;
  href: string;
};

type FixedExpenseRow = {
  id: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  paymentAccount: string | null;
  monthlyAmount: number;
  startDate: string | null;
  expiryDate: string | null;
  paymentDay: number | null;
  isActive: boolean;
};

type SubscriptionRow = {
  id: number;
  serviceName: string;
  billingCycle: string;
  price: number;
  sharedCount?: number;
  billingDay?: number | null;
  startDate?: string | null;
  paymentMethod?: string | null;
  isPaused?: boolean | null;
  pausedFrom?: string | null;
};

type InsuranceRow = {
  id: number;
  name: string;
  paymentMethod: string | null;
  startDate: string;
  endDate: string | null;
  paymentType: "monthly" | "annual";
  paymentDay: number | null;
  paymentAmount: number;
};

type InstallmentRow = {
  id: number;
  name: string;
  cardId: number | null;
  totalAmount: number;
  months: number;
  startDate: string;
  endDate: string;
  isInterestFree: boolean;
  interestRate: string | null;
  earlyRepaymentAmount: number | null;
};

type LoanRow = {
  id: number;
  name: string;
  loanType: string;
  lender: string | null;
  startDate: string;
  maturityDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  remainingPrincipal: number;
  repaymentType: string;
};

type BorrowedMoneyRow = {
  id: number;
  lenderUserId: number | null;
  borrowerUserId: number | null;
  shareStatus: "private" | "pending" | "accepted" | "rejected" | "shared";
  lenderName: string;
  principalAmount: number;
  repaidAmount: number;
  repaymentType: string;
  repaymentStartDate: string | null;
  repaymentDueDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  totalInstallments: number | null;
  installmentMode: "equal" | "custom";
  repaymentSchedule: string | null;
};

type CardRow = {
  id: number;
  cardCompany: string;
  cardName: string | null;
  paymentDate: string | null;
};

type LedgerEntryRow = {
  id: number;
  entryDate: string | Date;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  note: string | null;
};

const TYPE_STYLE: Record<PaymentType, string> = {
  "구독결제": "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300",
  "보험": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  "고정지출": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  "할부": "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300",
  "대출": "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300",
  "빌린돈": "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300",
  "가계부": "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300",
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function clampDay(year: number, month: number, day: number) {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

function fixedExpenseAppliesToMonth(expense: FixedExpenseRow, year: number, month: number) {
  const key = monthKey(year, month);
  if (expense.isActive === false) return false;
  if (expense.startDate && expense.startDate.slice(0, 7) > key) return false;
  if (expense.expiryDate && expense.expiryDate.slice(0, 7) < key) return false;
  return true;
}

function insuranceAppliesToMonth(ins: InsuranceRow, year: number, month: number) {
  const key = monthKey(year, month);
  if (ins.startDate && ins.startDate.slice(0, 7) > key) return false;
  if (ins.endDate && ins.endDate.slice(0, 7) < key) return false;
  if (ins.paymentType === "annual") {
    const annualMonth = ins.startDate ? Number(ins.startDate.slice(5, 7)) : 1;
    return annualMonth === month;
  }
  return true;
}

function installmentActiveInMonth(inst: InstallmentRow, year: number, month: number) {
  if (inst.earlyRepaymentAmount && inst.earlyRepaymentAmount >= inst.totalAmount) return false;
  if (!inst.startDate || !inst.endDate) return false;
  const [sy, sm] = inst.startDate.split("-").map(Number);
  const [ey, em] = inst.endDate.split("-").map(Number);
  const first = sy * 12 + sm + 1;
  const last = ey * 12 + em;
  const target = year * 12 + month;
  return target >= first && target <= last;
}

function installmentMonthlyPayment(totalAmount: number, months: number, isInterestFree: boolean, interestRate: string | null) {
  if (!totalAmount || !months) return 0;
  if (isInterestFree || !interestRate || parseFloat(interestRate) === 0) return Math.round(totalAmount / months);
  const r = parseFloat(interestRate) / 100 / 12;
  return Math.round((totalAmount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

function loanAppliesToMonth(loan: LoanRow, year: number, month: number) {
  const key = monthKey(year, month);
  if (loan.remainingPrincipal <= 0) return false;
  if (loan.startDate && loan.startDate.slice(0, 7) > key) return false;
  if (loan.maturityDate && loan.maturityDate.slice(0, 7) < key) return false;
  return true;
}

function borrowedRemaining(item: BorrowedMoneyRow) {
  return Math.max(0, item.principalAmount - item.repaidAmount);
}

function borrowedInstallmentNo(item: BorrowedMoneyRow, year: number, month: number) {
  if (!item.repaymentStartDate || item.repaymentType !== "할부상환") return null;
  const [sy, sm] = item.repaymentStartDate.split("-").map(Number);
  const diff = year * 12 + month - (sy * 12 + sm) + 1;
  if (diff < 1) return null;
  if (item.totalInstallments && diff > item.totalInstallments) return null;
  return diff;
}

function parseBorrowedSchedule(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((amount) => Number(amount) || 0) : [];
  } catch {
    return [];
  }
}

function borrowedInstallmentAmount(item: BorrowedMoneyRow, no: number) {
  if (item.installmentMode === "custom") {
    return parseBorrowedSchedule(item.repaymentSchedule)[no - 1] ?? 0;
  }
  return item.monthlyPayment;
}

const LEDGER_EXCLUDED_MAIN_CATEGORIES = new Set(["고정지출", "저축/투자"]);
const LEDGER_EXCLUDED_SUB_CATEGORIES = new Set(["구독서비스", "보험", "할부결제", "대출상환", "빌린돈상환"]);
const LEDGER_EXCLUDED_NOTE_PREFIXES = ["[빌린돈 자동연동]"];

function ledgerDateKey(value: string | Date) {
  if (value instanceof Date) return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  return String(value).split("T")[0];
}

function shouldIncludeLedgerEntry(entry: LedgerEntryRow) {
  if ((entry.amount ?? 0) >= 0) return false;
  if (LEDGER_EXCLUDED_MAIN_CATEGORIES.has(entry.mainCategory)) return false;
  if (entry.subCategory && LEDGER_EXCLUDED_SUB_CATEGORIES.has(entry.subCategory)) return false;
  if (entry.note && LEDGER_EXCLUDED_NOTE_PREFIXES.some((prefix) => entry.note?.startsWith(prefix))) return false;
  return true;
}

function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const last = new Date(year, month, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const days: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export default function PaymentCalendar() {
  const [, setLocation] = useLocation();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [monthOffset, setMonthOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [selectedType, setSelectedType] = useState<PaymentType | null>(null);
  const selectedDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1;
  const key = monthKey(year, month);

  const { data: fixedExpenses = [] } = trpc.fixedExpense.list.useQuery();
  const { data: subscriptions = [] } = trpc.subscription.list.useQuery();
  const { data: insuranceList = [] } = trpc.insurance.list.useQuery();
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: loanList = [] } = trpc.loan.list.useQuery();
  const { data: borrowedMoneyList = [] } = trpc.borrowedMoney.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: ledgerEntries = [] } = trpc.ledger.list.useQuery({ year, month });
  const { data: me } = trpc.auth.me.useQuery();
  const { data: contactList = [] } = trpc.auth.contacts.useQuery();
  const { data: shareableUsers = [] } = trpc.auth.shareableUsers.useQuery();
  const currentUserId = typeof (me as { id?: unknown } | null | undefined)?.id === "number" ? (me as { id: number }).id : null;

  const events = useMemo(() => {
    const cardMap = new Map((cardList as CardRow[]).map((card) => [card.id, card]));
    const contactNicknameById = new Map(
      (contactList as { contactUserId: number; nickname: string }[]).map((c) => [c.contactUserId, c.nickname.trim()])
    );
    const userNameById = new Map(
      (shareableUsers as { id: number; name?: string | null; email?: string | null }[]).map((u) => [
        u.id,
        u.name?.trim() || u.email?.split("@")[0] || `사용자 ${u.id}`,
      ])
    );
    const getBorrowedDisplayName = (borrowed: BorrowedMoneyRow) => {
      const isReceiving = currentUserId !== null && borrowed.shareStatus !== "private" && borrowed.lenderUserId === currentUserId;
      const cpId = isReceiving ? borrowed.borrowerUserId : borrowed.lenderUserId;
      const officialName = isReceiving ? borrowed.borrowerUserName : borrowed.lenderUserName;
      if (cpId) {
        return contactNicknameById.get(cpId) || userNameById.get(cpId) || officialName?.split("@")[0] || borrowed.lenderName;
      }
      return borrowed.lenderName;
    };
    const rows: PaymentEvent[] = [];

    for (const sub of subscriptions as SubscriptionRow[]) {
      const amount = ledgerSubCostForMonth(year, month, sub);
      if (amount <= 0) continue;
      rows.push({
        id: `subscription-${sub.id}`,
        date: subscriptionLedgerDate(year, month, sub.billingCycle, sub.billingDay, sub.startDate),
        title: sub.serviceName,
        amount,
        type: "구독결제",
        method: sub.paymentMethod,
        detail: sub.billingCycle,
        href: "/subscriptions",
      });
    }

    for (const expense of fixedExpenses as FixedExpenseRow[]) {
      if (!fixedExpenseAppliesToMonth(expense, year, month) || expense.monthlyAmount <= 0) continue;
      const day = clampDay(year, month, expense.paymentDay ?? 1);
      rows.push({
        id: `fixed-${expense.id}`,
        date: `${key}-${pad2(day)}`,
        title: expense.description || expense.subCategory || expense.mainCategory,
        amount: expense.monthlyAmount,
        type: "고정지출",
        method: expense.paymentAccount,
        detail: [expense.mainCategory, expense.subCategory].filter(Boolean).join(" > "),
        href: "/fixed-expenses",
      });
    }

    for (const ins of insuranceList as InsuranceRow[]) {
      if (!insuranceAppliesToMonth(ins, year, month) || ins.paymentAmount <= 0) continue;
      const day = clampDay(year, month, ins.paymentDay ?? 1);
      rows.push({
        id: `insurance-${ins.id}`,
        date: `${key}-${pad2(day)}`,
        title: ins.name,
        amount: ins.paymentAmount,
        type: "보험",
        method: ins.paymentMethod,
        detail: ins.paymentType === "annual" ? "연납" : "월납",
        href: "/insurance",
      });
    }

    for (const inst of installmentList as InstallmentRow[]) {
      if (!installmentActiveInMonth(inst, year, month)) continue;
      const card = inst.cardId ? cardMap.get(inst.cardId) : null;
      const paymentDay = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, ""), 10) || 15 : 15;
      const amount = installmentMonthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
      rows.push({
        id: `installment-${inst.id}`,
        date: `${key}-${pad2(clampDay(year, month, paymentDay))}`,
        title: inst.name,
        amount,
        type: "할부",
        method: card ? `${card.cardCompany}${card.cardName ? ` ${card.cardName}` : ""}` : null,
        detail: `${inst.months}개월`,
        href: "/installments",
      });
    }

    for (const loan of loanList as LoanRow[]) {
      if (!loanAppliesToMonth(loan, year, month) || loan.monthlyPayment <= 0) continue;
      rows.push({
        id: `loan-${loan.id}`,
        date: `${key}-${pad2(clampDay(year, month, loan.paymentDay ?? 1))}`,
        title: loan.name,
        amount: loan.monthlyPayment,
        type: "대출",
        method: loan.lender,
        detail: `${loan.loanType} · ${loan.repaymentType}`,
        href: "/loans",
      });
    }

    for (const borrowed of borrowedMoneyList as BorrowedMoneyRow[]) {
      if (borrowed.shareStatus !== "private" && borrowed.shareStatus !== "accepted" && borrowed.shareStatus !== "shared") continue;
      const remain = borrowedRemaining(borrowed);
      if (remain <= 0) continue;
      const isReceiving = currentUserId !== null && borrowed.shareStatus !== "private" && borrowed.lenderUserId === currentUserId;
      const displayName = getBorrowedDisplayName(borrowed);
      const borrowedTitle = isReceiving ? `${displayName} 입금 예정` : `${displayName} 상환`;
      if (borrowed.repaymentType === "할부상환") {
        const no = borrowedInstallmentNo(borrowed, year, month);
        if (!no) continue;
        const installmentAmount = borrowedInstallmentAmount(borrowed, no);
        if (installmentAmount <= 0) continue;
        const fallbackDay = Number(borrowed.repaymentStartDate?.slice(8, 10)) || 1;
        const day = clampDay(year, month, borrowed.paymentDay ?? fallbackDay);
        rows.push({
          id: `borrowed-${borrowed.id}`,
          date: `${key}-${pad2(day)}`,
          title: borrowedTitle,
          amount: Math.min(remain, installmentAmount),
          type: "빌린돈",
          detail: borrowed.totalInstallments ? `${no}/${borrowed.totalInstallments}회` : `${no}회차`,
          href: "/borrowed-money",
        });
      } else if (borrowed.repaymentDueDate?.slice(0, 7) === key) {
        rows.push({
          id: `borrowed-${borrowed.id}`,
          date: borrowed.repaymentDueDate,
          title: borrowedTitle,
          amount: remain,
          type: "빌린돈",
          detail: borrowed.repaymentType,
          href: "/borrowed-money",
        });
      }
    }

    const ledgerByDate = new Map<string, { amount: number; count: number }>();
    for (const entry of ledgerEntries as LedgerEntryRow[]) {
      if (!shouldIncludeLedgerEntry(entry)) continue;
      const date = ledgerDateKey(entry.entryDate);
      const current = ledgerByDate.get(date) ?? { amount: 0, count: 0 };
      current.amount += Math.abs(entry.amount);
      current.count += 1;
      ledgerByDate.set(date, current);
    }
    for (const [date, value] of Array.from(ledgerByDate.entries())) {
      if (value.amount <= 0) continue;
      rows.push({
        id: `ledger-${date}`,
        date,
        title: `가계부 지출 ${value.count}건`,
        amount: value.amount,
        type: "가계부",
        detail: "월별가계부 직접 지출",
        href: "/ledger",
      });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  }, [borrowedMoneyList, cardList, contactList, currentUserId, fixedExpenses, installmentList, insuranceList, key, ledgerEntries, loanList, month, shareableUsers, subscriptions, year]);

  const visibleEvents = useMemo(
    () => selectedType ? events.filter((event) => event.type === selectedType) : events,
    [events, selectedType]
  );

  const typeTotals = useMemo(() => {
    const totals: Record<PaymentType, { amount: number; count: number }> = {
      "구독결제": { amount: 0, count: 0 },
      "보험": { amount: 0, count: 0 },
      "고정지출": { amount: 0, count: 0 },
      "할부": { amount: 0, count: 0 },
      "대출": { amount: 0, count: 0 },
      "빌린돈": { amount: 0, count: 0 },
      "가계부": { amount: 0, count: 0 },
    };
    for (const event of events) {
      totals[event.type].amount += event.amount;
      totals[event.type].count += 1;
    }
    return totals;
  }, [events]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, PaymentEvent[]> = {};
    for (const event of visibleEvents) {
      map[event.date] = [...(map[event.date] ?? []), event];
    }
    return map;
  }, [visibleEvents]);

  const calendarDays = useMemo(() => buildCalendarDays(year, month), [year, month]);
  const monthTotal = events.reduce((sum, event) => sum + event.amount, 0);
  const remainingTotal = events.filter((event) => event.date >= todayKey).reduce((sum, event) => sum + event.amount, 0);
  const visibleTotal = visibleEvents.reduce((sum, event) => sum + event.amount, 0);
  const visibleRemainingTotal = visibleEvents.filter((event) => event.date >= todayKey).reduce((sum, event) => sum + event.amount, 0);
  const nextEvents = visibleEvents.filter((event) => event.date >= todayKey).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">결제 예정 캘린더</h1>
          <p className="text-muted-foreground text-sm mt-0.5">예정 결제와 월별가계부의 기타 지출을 한 달 달력으로 확인합니다</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (open) setPickerYear(year); }}>
          <PopoverTrigger asChild>
            <button className="text-base font-semibold w-28 text-center px-2 py-1 rounded-lg hover:bg-muted transition-colors">
              {year}년 {pad2(month)}월
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear((y) => y - 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold">{pickerYear}년</span>
              <button onClick={() => setPickerYear((y) => y + 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const isSelected = pickerYear === year && m === month;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      const offset = (pickerYear - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
                      setMonthOffset(offset);
                      setPickerOpen(false);
                    }}
                    className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {m}월
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {monthOffset !== 0 && (
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)}>
            이번 달
          </Button>
        )}
        <span className="text-xs text-muted-foreground">총 {events.length}건 예정</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{selectedType ? `${selectedType} 예정액` : "이번 달 예정액"}</p>
            <p className="text-xl font-bold">₩{formatAmount(visibleTotal)}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              구독 ₩{formatAmount(typeTotals["구독결제"].amount)} · 고정 ₩{formatAmount(typeTotals["고정지출"].amount)} · 보험 ₩{formatAmount(typeTotals["보험"].amount)} · 할부 ₩{formatAmount(typeTotals["할부"].amount)} · 대출 ₩{formatAmount(typeTotals["대출"].amount)} · 빌린돈 ₩{formatAmount(typeTotals["빌린돈"].amount)} · 가계부 ₩{formatAmount(typeTotals["가계부"].amount)}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Clock3 className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">오늘 이후 남은 결제</p>
            <p className="mt-1 text-xl font-bold">₩{formatAmount(visibleRemainingTotal)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">다음 결제</p>
            <p className="text-base font-bold">{nextEvents[0] ? `${nextEvents[0].date.slice(5)} ${nextEvents[0].title}` : "예정 없음"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const dateKey = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
              const dayEvents = eventsByDate[dateKey] ?? [];
              const isCurrentMonth = date.getMonth() + 1 === month;
              const isToday = dateKey === todayKey;
              return (
                <div key={dateKey} className={`min-h-[128px] border-r border-b border-border p-2 last:border-r-0 ${isCurrentMonth ? "bg-card" : "bg-muted/20"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        ₩{formatAmount(dayEvents.reduce((sum, event) => sum + event.amount, 0))}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setLocation(event.href)}
                        className={`w-full rounded-md border px-2 py-1 text-left transition-opacity hover:opacity-80 ${TYPE_STYLE[event.type]}`}
                        title={`${event.type} 페이지로 이동`}
                      >
                        <p className="truncate text-[11px] font-semibold">{event.title}</p>
                        <p className="text-[11px] opacity-80">₩{formatAmount(event.amount)}</p>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[11px] text-muted-foreground">+{dayEvents.length - 3}건 더보기</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">결제 예정 목록</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedType ? `${selectedType} 예정 결제` : "선택 월 전체 예정 결제"}
              </p>
            </div>
            <Select
              value={selectedType ?? "전체"}
              onValueChange={(value) => setSelectedType(value === "전체" ? null : value as PaymentType)}
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                <SelectItem value="구독결제">구독결제</SelectItem>
                <SelectItem value="고정지출">고정지출</SelectItem>
                <SelectItem value="보험">보험</SelectItem>
                <SelectItem value="할부">할부</SelectItem>
                <SelectItem value="대출">대출</SelectItem>
                <SelectItem value="빌린돈">빌린돈</SelectItem>
                <SelectItem value="가계부">가계부</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 space-y-2">
            {visibleEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                예정된 결제가 없습니다
              </div>
            ) : (
              visibleEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setLocation(event.href)}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{event.date.slice(5)}</span>
                        <Badge variant="outline" className={TYPE_STYLE[event.type]}>{event.type}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{event.title}</p>
                      {(event.method || event.detail) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[event.detail, event.method].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-bold">₩{formatAmount(event.amount)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
