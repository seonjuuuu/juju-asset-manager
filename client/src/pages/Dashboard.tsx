import { trpc } from "@/lib/trpc";
import { formatAmount, MONTH_NAMES, currentYear } from "@/lib/utils";
import { ledgerSubCostForMonth, subscriptionLedgerDate } from "@/lib/subscriptionLedger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { BellRing, CalendarDays, CreditCard, Star, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

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

function isValidDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function daysUntil(date: string, today: Date) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isPastDate(date: string, today: Date) {
  return daysUntil(date, today) < 0;
}

const INCOME_MAIN_CATEGORIES = new Set(["소득", "근로소득", "사업소득", "투자소득", "기타소득"]);

function sumIncomeRows(rows: { mainCategory: string; total: number }[]) {
  return rows.reduce((sum, row) => sum + (INCOME_MAIN_CATEGORIES.has(row.mainCategory) ? row.total : 0), 0);
}

function fixedExpenseAppliesToMonth(
  expense: { isActive?: boolean | null; startDate?: string | null; expiryDate?: string | null },
  year: number,
  month: number,
) {
  const key = monthKey(year, month);
  if (expense.isActive === false) return false;
  if (expense.startDate && expense.startDate.slice(0, 7) > key) return false;
  if (expense.expiryDate && expense.expiryDate.slice(0, 7) < key) return false;
  return true;
}

function insuranceAppliesToMonth(
  ins: { startDate?: string | null; endDate?: string | null; paymentType: string },
  year: number,
  month: number,
) {
  const key = monthKey(year, month);
  if (ins.startDate && ins.startDate.slice(0, 7) > key) return false;
  if (ins.endDate && ins.endDate.slice(0, 7) < key) return false;
  if (ins.paymentType === "annual") {
    const annualMonth = ins.startDate ? Number(ins.startDate.slice(5, 7)) : 1;
    return annualMonth === month;
  }
  return true;
}

function getInstallmentCostForMonth(
  inst: { totalAmount: number; months: number; startDate: string; endDate: string; isInterestFree?: boolean; interestRate?: string | null },
  yr: number, mo: number
): number {
  if (!inst.startDate || !inst.endDate) return 0;
  const [py, pm] = inst.startDate.split("-").map(Number);
  const [ey, em] = inst.endDate.split("-").map(Number);
  // 구매 다음 달부터 청구 (Installments.tsx isActiveInMonth 동일 로직)
  const first = py * 12 + pm + 1;
  const last = ey * 12 + em;
  const target = yr * 12 + mo;
  if (target < first || target > last) return 0;
  if (!inst.isInterestFree && inst.interestRate && parseFloat(inst.interestRate) > 0) {
    const r = parseFloat(inst.interestRate) / 100 / 12;
    return Math.round((inst.totalAmount * r * Math.pow(1 + r, inst.months)) / (Math.pow(1 + r, inst.months) - 1));
  }
  return Math.round(inst.totalAmount / inst.months);
}

function getLoanCostForMonth(
  loan: { startDate: string; maturityDate?: string | null; remainingPrincipal: number; monthlyPayment: number },
  yr: number,
  mo: number
): number {
  const key = `${yr}-${String(mo).padStart(2, "0")}`;
  if (loan.remainingPrincipal <= 0 || loan.monthlyPayment <= 0) return 0;
  if (loan.startDate && loan.startDate.slice(0, 7) > key) return 0;
  if (loan.maturityDate && loan.maturityDate.slice(0, 7) < key) return 0;
  return loan.monthlyPayment;
}

function calcDeposit(workAmount: number, depositPercent: number) {
  return Math.round(workAmount * depositPercent / 100);
}
function bizRecognizedInMonth(
  r: { workAmount: number; depositPercent: number; workStartDate?: string | null; isCompleted: boolean; settlementDate?: string | null },
  yr: number, mo: number
): number {
  let amount = 0;
  if (r.workStartDate) {
    const [y, m] = r.workStartDate.split("-").map(Number);
    if (y === yr && m === mo) amount += calcDeposit(r.workAmount, r.depositPercent);
  }
  if (r.isCompleted && r.settlementDate) {
    const [y, m] = r.settlementDate.split("-").map(Number);
    if (y === yr && m === mo) amount += r.workAmount - calcDeposit(r.workAmount, r.depositPercent);
  }
  return amount;
}

const COLORS = ["#5b7cfa", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b"];

const EXPENSE_COLORS = [
  "#5b7cfa","#f97316","#22c55e","#a855f7","#ec4899",
  "#14b8a6","#f59e0b","#ef4444","#06b6d4","#84cc16",
  "#8b5cf6","#f43f5e",
];

export default function Dashboard() {
  const utils = trpc.useUtils();
  const { data: summary, isLoading: summaryLoading } = trpc.dashboard.summary.useQuery();
  const { data: yearly, isLoading: yearlyLoading } = trpc.dashboard.yearlySummary.useQuery({ year: currentYear });

  // 구독결제 목록 (전체)
  const { data: subscriptions, isLoading: subsLoading } = trpc.subscription.list.useQuery();

  // 부수입 연간 월별 합계
  const { data: sideIncomeSummary, isLoading: sideIncomeLoading } = trpc.sideIncome.yearlySummary.useQuery({ year: currentYear });

  // 사업소득 전체 목록
  const { data: businessIncomeList = [] } = trpc.businessIncome.list.useQuery();
  const { data: blogCampaigns = [] } = trpc.blogCampaign.list.useQuery();

  // 할부 목록
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: loanList = [] } = trpc.loan.list.useQuery();
  const { data: borrowedMoneyList = [] } = trpc.borrowedMoney.list.useQuery();
  const { data: fixedExpenses = [] } = trpc.fixedExpense.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const currentUserId = typeof (me as { id?: unknown } | null | undefined)?.id === "number" ? (me as { id: number }).id : null;

  const pendingBorrowedRequests = useMemo(() => {
    if (currentUserId === null) return [];
    return (borrowedMoneyList as Array<{
      id: number;
      lenderUserId?: number | null;
      borrowerUserId?: number | null;
      lenderUserName?: string | null;
      lenderName: string;
      principalAmount: number;
      repaidAmount: number;
      repaymentType: string;
      repaymentStartDate?: string | null;
      repaymentDueDate?: string | null;
      paymentDay?: number | null;
      totalInstallments?: number | null;
      note?: string | null;
      shareStatus?: string | null;
    }>)
      .filter((item) => item.shareStatus === "pending" && item.borrowerUserId === currentUserId)
      .sort((a, b) => b.id - a.id);
  }, [borrowedMoneyList, currentUserId]);

  const acceptBorrowedRequest = trpc.borrowedMoney.update.useMutation({
    onSuccess: () => {
      utils.borrowedMoney.list.invalidate();
      toast.success("요청을 수락했습니다");
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectBorrowedRequest = trpc.borrowedMoney.update.useMutation({
    onSuccess: () => {
      utils.borrowedMoney.list.invalidate();
      toast.success("요청을 거절했습니다");
    },
    onError: (error) => toast.error(error.message),
  });

  // 차트 legend 토글 state
  const [hiddenMonthly, setHiddenMonthly] = useState<Record<string, boolean>>({});
  const [hiddenIncome, setHiddenIncome] = useState<Record<string, boolean>>({});
  const [hiddenExpense, setHiddenExpense] = useState<Record<string, boolean>>({});
  const [hiddenAsset, setHiddenAsset] = useState<Record<string, boolean>>({});

  // 중분류별 연간 지출 (스택 바 차트용)
  const currentMonth = new Date().getMonth() + 1;
  const { data: subCatExpense = [] } = trpc.ledger.yearlySubCatExpense.useQuery({ year: currentYear });

  // 보험 목록
  const { data: insuranceList = [] } = trpc.insurance.list.useQuery();

  const dashboardAlerts = useMemo(() => {
    const today = new Date();
    const currentYearFromToday = today.getFullYear();
    const currentMonthFromToday = today.getMonth() + 1;
    const key = monthKey(currentYearFromToday, currentMonthFromToday);
    const todayKey = `${key}-${pad2(today.getDate())}`;
    const currentUserId = typeof (me as { id?: unknown } | null | undefined)?.id === "number" ? (me as { id: number }).id : null;
    const cardMap = new Map((cardList as Array<{ id: number; cardCompany: string; cardName?: string | null; paymentDate?: string | null }>).map((card) => [card.id, card]));

    const payments: Array<{ id: string; date: string; title: string; amount: number; type: string }> = [];

    for (const sub of subscriptions ?? []) {
      const s = sub as {
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
      const amount = ledgerSubCostForMonth(currentYearFromToday, currentMonthFromToday, s);
      if (amount <= 0) continue;
      payments.push({
        id: `subscription-${s.id}`,
        date: subscriptionLedgerDate(currentYearFromToday, currentMonthFromToday, s.billingCycle, s.billingDay, s.startDate),
        title: s.serviceName,
        amount,
        type: "구독",
      });
    }

    for (const expense of fixedExpenses as Array<{
      id: number;
      mainCategory: string;
      subCategory?: string | null;
      description?: string | null;
      monthlyAmount: number;
      startDate?: string | null;
      expiryDate?: string | null;
      paymentDay?: number | null;
      isActive?: boolean | null;
    }>) {
      if (!fixedExpenseAppliesToMonth(expense, currentYearFromToday, currentMonthFromToday) || expense.monthlyAmount <= 0) continue;
      const day = clampDay(currentYearFromToday, currentMonthFromToday, expense.paymentDay ?? 1);
      payments.push({
        id: `fixed-${expense.id}`,
        date: `${key}-${pad2(day)}`,
        title: expense.description || expense.subCategory || expense.mainCategory,
        amount: expense.monthlyAmount,
        type: "고정",
      });
    }

    for (const ins of insuranceList as Array<{
      id: number;
      name: string;
      startDate: string;
      endDate?: string | null;
      paymentType: string;
      paymentDay?: number | null;
      paymentAmount: number;
    }>) {
      if (!insuranceAppliesToMonth(ins, currentYearFromToday, currentMonthFromToday) || ins.paymentAmount <= 0) continue;
      const day = clampDay(currentYearFromToday, currentMonthFromToday, ins.paymentDay ?? 1);
      payments.push({
        id: `insurance-${ins.id}`,
        date: `${key}-${pad2(day)}`,
        title: ins.name,
        amount: ins.paymentAmount,
        type: "보험",
      });
    }

    for (const inst of installmentList as Array<{
      id: number;
      name: string;
      cardId?: number | null;
      totalAmount: number;
      months: number;
      startDate: string;
      endDate: string;
      isInterestFree: boolean;
      interestRate: string | null;
    }>) {
      if (getInstallmentCostForMonth(inst, currentYearFromToday, currentMonthFromToday) <= 0) continue;
      const card = inst.cardId ? cardMap.get(inst.cardId) : null;
      const paymentDay = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, ""), 10) || 15 : 15;
      payments.push({
        id: `installment-${inst.id}`,
        date: `${key}-${pad2(clampDay(currentYearFromToday, currentMonthFromToday, paymentDay))}`,
        title: inst.name,
        amount: getInstallmentCostForMonth(inst, currentYearFromToday, currentMonthFromToday),
        type: "할부",
      });
    }

    for (const loan of loanList as Array<{
      id: number;
      name: string;
      startDate: string;
      maturityDate?: string | null;
      paymentDay?: number | null;
      remainingPrincipal: number;
      monthlyPayment: number;
    }>) {
      const amount = getLoanCostForMonth(loan, currentYearFromToday, currentMonthFromToday);
      if (amount <= 0) continue;
      payments.push({
        id: `loan-${loan.id}`,
        date: `${key}-${pad2(clampDay(currentYearFromToday, currentMonthFromToday, loan.paymentDay ?? 1))}`,
        title: loan.name,
        amount,
        type: "대출",
      });
    }

    for (const item of borrowedMoneyList as Array<{
      id: number;
      lenderUserId?: number | null;
      borrowerUserId?: number | null;
      shareStatus?: string | null;
      lenderUserName?: string | null;
      borrowerUserName?: string | null;
      lenderName: string;
      principalAmount: number;
      repaidAmount: number;
      repaymentType: string;
      repaymentStartDate?: string | null;
      repaymentDueDate?: string | null;
      paymentDay?: number | null;
      monthlyPayment: number;
      totalInstallments?: number | null;
      installmentMode?: "equal" | "custom";
      repaymentSchedule?: string | null;
    }>) {
      if (item.shareStatus && item.shareStatus !== "private" && item.shareStatus !== "accepted" && item.shareStatus !== "shared") continue;
      const remain = Math.max(0, item.principalAmount - item.repaidAmount);
      if (remain <= 0) continue;
      const isReceiving = currentUserId !== null && item.shareStatus !== "private" && item.lenderUserId === currentUserId;
      let date = "";
      let amount = 0;
      let detail = item.repaymentType;
      if (item.repaymentType === "할부상환" && item.repaymentStartDate) {
        const [sy, sm] = item.repaymentStartDate.split("-").map(Number);
        const no = currentYearFromToday * 12 + currentMonthFromToday - (sy * 12 + sm) + 1;
        if (no < 1 || (item.totalInstallments && no > item.totalInstallments)) continue;
        const schedule = (() => {
          try {
            const parsed = JSON.parse(item.repaymentSchedule ?? "[]");
            return Array.isArray(parsed) ? parsed.map((v) => Number(v) || 0) : [];
          } catch {
            return [];
          }
        })();
        amount = item.installmentMode === "custom" ? schedule[no - 1] ?? 0 : item.monthlyPayment;
        if (amount <= 0) continue;
        const fallbackDay = Number(item.repaymentStartDate.slice(8, 10)) || 1;
        date = `${key}-${pad2(clampDay(currentYearFromToday, currentMonthFromToday, item.paymentDay ?? fallbackDay))}`;
        detail = item.totalInstallments ? `${no}/${item.totalInstallments}회` : `${no}회차`;
      } else if (item.repaymentDueDate?.slice(0, 7) === key) {
        date = item.repaymentDueDate;
        amount = remain;
      }
      if (!date || amount <= 0) continue;
      const counterpartyName = isReceiving
        ? (item.borrowerUserName?.trim() || item.lenderName)
        : (item.lenderUserName?.trim() || item.lenderName);
      payments.push({
        id: `borrowed-${item.id}`,
        date,
        title: isReceiving ? `${counterpartyName} 입금 예정` : `${counterpartyName} 상환`,
        amount: Math.min(remain, amount),
        type: isReceiving ? "받을돈" : "빌린돈",
      });
    }

    const sortedPayments = payments.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
    const upcomingPayments = sortedPayments.filter((payment) => payment.date >= todayKey);
    const urgentCampaigns = (blogCampaigns as Array<{
      id: number;
      platform?: string | null;
      businessName?: string | null;
      endDate?: string | null;
      completed?: boolean | null;
    }>)
      .filter((campaign) => {
        if (!isValidDate(campaign.endDate) || isPastDate(campaign.endDate, today)) return false;
        const diff = daysUntil(campaign.endDate, today);
        return diff >= 0 && diff <= 7;
      })
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.businessName ?? campaign.platform ?? "체험단",
        endDate: campaign.endDate!,
        daysLeft: daysUntil(campaign.endDate!, today),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const upcomingOutgoingTotal = upcomingPayments.filter((p) => p.type !== "받을돈").reduce((sum, p) => sum + p.amount, 0);
    const upcomingIncomingTotal = upcomingPayments.filter((p) => p.type === "받을돈").reduce((sum, p) => sum + p.amount, 0);
    return {
      paymentCount: sortedPayments.length,
      upcomingPaymentCount: upcomingPayments.length,
      upcomingPaymentTotal: upcomingPayments.reduce((sum, payment) => sum + payment.amount, 0),
      upcomingOutgoingTotal,
      upcomingIncomingTotal,
      upcomingPayments: upcomingPayments.slice(0, 5),
      urgentCampaigns: urgentCampaigns.slice(0, 4),
    };
  }, [blogCampaigns, borrowedMoneyList, cardList, fixedExpenses, installmentList, insuranceList, loanList, me, subscriptions]);

  // 부수입 월별 합계 맵 (month → total)
  const sideIncomeByMonth = useMemo(() => {
    const map: Record<number, number> = {};
    if (!sideIncomeSummary) return map;
    for (const row of sideIncomeSummary) {
      const m = row.month;
      map[m] = (map[m] ?? 0) + (row.amount ?? 0);
    }
    return map;
  }, [sideIncomeSummary]);

  // 월별 수입/지출/저축 데이터 가공 (구독결제 + 부수입 통합)
  const monthlyData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const month = idx + 1;
      const rows = (yearly ?? []).filter((r) => r.month === month);
      const ledgerIncome = sumIncomeRows(rows);
      const fixedExp = rows.find((r) => r.mainCategory === "고정지출")?.total ?? 0;
      const varExp = rows.find((r) => r.mainCategory === "변동지출")?.total ?? 0;
      const businessExp = rows.find((r) => r.mainCategory === "사업지출")?.total ?? 0;
      const savings = rows.find((r) => r.mainCategory === "저축/투자")?.total ?? 0;

      // 부수입 합산 (가계부에 자동 반영되므로 ledgerIncome에 이미 포함될 수 있으나,
      // 별도로 표시하기 위해 sideIncome 데이터를 추가로 합산)
      const sideIncome = sideIncomeByMonth[month] ?? 0;

      // 구독결제: 해당 월에 실제 발생하는 구독비만 합산 (일시정지·결제일 반영)
      const subCostThisMonth = (subscriptions ?? []).reduce((sum, sub) => {
        const s = sub as {
          price: number;
          billingCycle: string;
          sharedCount?: number;
          billingDay?: number | null;
          startDate?: string | null;
          isPaused?: boolean | null;
          pausedFrom?: string | null;
        };
        return sum + ledgerSubCostForMonth(currentYear, month, s);
      }, 0);
      const installmentThisMonth = installmentList.reduce((sum, inst) => {
        const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string; isInterestFree: boolean; interestRate: string | null };
        return sum + getInstallmentCostForMonth(i, currentYear, month);
      }, 0);
      const loanThisMonth = loanList.reduce((sum, loan) => {
        const l = loan as { startDate: string; maturityDate: string | null; remainingPrincipal: number; monthlyPayment: number };
        return sum + getLoanCostForMonth(l, currentYear, month);
      }, 0);
      const totalExp = fixedExp + varExp + businessExp + subCostThisMonth + installmentThisMonth + loanThisMonth;

      // 총 수입 = 가계부 수입 (부수입이 가계부에 자동 반영되므로 ledgerIncome 사용)
      // 단, 부수입이 가계부에 반영되지 않은 경우를 대비해 sideIncome도 함께 표시
      const totalIncome = ledgerIncome;

      return { name, income: totalIncome, expense: totalExp, savings, sideIncome };
    });
  }, [yearly, subscriptions, sideIncomeByMonth, installmentList, loanList]);

  // 연간 중분류별 지출 → 월별 스택 바 차트 데이터
  const { expenseStackData, expenseSubCatKeys } = useMemo(() => {
    // 보험 월 환산액
    const insuranceMonthly = insuranceList.reduce((sum, ins) => {
      const i = ins as { paymentType: string; paymentAmount: number };
      return sum + (i.paymentType === "monthly" ? i.paymentAmount : Math.round(i.paymentAmount / 12));
    }, 0);

    // 전체 중분류 키 집계
    const allKeysSet = new Set<string>();
    if (insuranceMonthly > 0) allKeysSet.add("보험");
    for (const row of subCatExpense) {
      const r = row as { month: number; subCategory?: string | null; total: number };
      allKeysSet.add(r.subCategory?.trim() || "미분류");
    }
    if ((subscriptions ?? []).length > 0) allKeysSet.add("구독서비스");
    if ((installmentList ?? []).length > 0) allKeysSet.add("할부");
    if ((loanList ?? []).length > 0) allKeysSet.add("대출");
    const allKeys = Array.from(allKeysSet);

    // 월별 데이터 빌드
    const data = MONTH_NAMES.map((name, idx) => {
      const month = idx + 1;
      const entry: Record<string, number | string> = { name };

      // 가계부 중분류
      for (const row of subCatExpense) {
        const r = row as { month: number; subCategory?: string | null; total: number };
        if (r.month !== month) continue;
        const key = r.subCategory?.trim() || "미분류";
        entry[key] = ((entry[key] as number) || 0) + r.total;
      }

      // 보험 (매월 동일)
      if (insuranceMonthly > 0) {
        entry["보험"] = ((entry["보험"] as number) || 0) + insuranceMonthly;
      }

      // 구독서비스 (월별 실제 발생 비용)
      const subCost = (subscriptions ?? []).reduce((sum, sub) => {
        const s = sub as {
          price: number;
          billingCycle: string;
          sharedCount?: number;
          billingDay?: number | null;
          startDate?: string | null;
          isPaused?: boolean | null;
          pausedFrom?: string | null;
        };
        return sum + ledgerSubCostForMonth(currentYear, month, s);
      }, 0);
      if (subCost > 0) entry["구독서비스"] = ((entry["구독서비스"] as number) || 0) + subCost;

      // 할부 (해당 월 납부액)
      const installCost = (installmentList ?? []).reduce((sum, inst) => {
        const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string; isInterestFree: boolean; interestRate: string | null };
        return sum + getInstallmentCostForMonth(i, currentYear, month);
      }, 0);
      if (installCost > 0) entry["할부"] = ((entry["할부"] as number) || 0) + installCost;

      const loanCost = (loanList ?? []).reduce((sum, loan) => {
        const l = loan as { startDate: string; maturityDate: string | null; remainingPrincipal: number; monthlyPayment: number };
        return sum + getLoanCostForMonth(l, currentYear, month);
      }, 0);
      if (loanCost > 0) entry["대출"] = ((entry["대출"] as number) || 0) + loanCost;

      return entry;
    });

    // 합계 기준으로 키 정렬 (큰 것이 먼저)
    const keyTotals: Record<string, number> = {};
    for (const row of data) {
      for (const k of allKeys) {
        keyTotals[k] = (keyTotals[k] ?? 0) + ((row[k] as number) || 0);
      }
    }
    const sortedKeys = allKeys.sort((a, b) => (keyTotals[b] ?? 0) - (keyTotals[a] ?? 0));

    return { expenseStackData: data, expenseSubCatKeys: sortedKeys };
  }, [subCatExpense, insuranceList, subscriptions, installmentList, loanList]);

  // 사업소득 월별 인식수익 맵
  const businessIncomeByMonth = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of businessIncomeList) {
      const recognized = bizRecognizedInMonth(r, currentYear, currentMonth);
      if (recognized > 0) map[currentMonth] = (map[currentMonth] ?? 0) + recognized;
    }
    // 연간 전체 월 계산
    const fullMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      fullMap[m] = businessIncomeList.reduce((sum, r) => sum + bizRecognizedInMonth(r, currentYear, m), 0);
    }
    return fullMap;
  }, [businessIncomeList]);

  // 이달 수입·지출 요약 (monthlyData 기준)
  const currentMonthIncome = sumIncomeRows((yearly ?? []).filter(r => r.month === currentMonth));
  const currentMonthExpense = (() => {
    const rows = (yearly ?? []).filter(r => r.month === currentMonth);
    const fixedExp = rows.find(r => r.mainCategory === "고정지출")?.total ?? 0;
    const varExp = rows.find(r => r.mainCategory === "변동지출")?.total ?? 0;
    const businessExp = rows.find(r => r.mainCategory === "사업지출")?.total ?? 0;
    const subCost = (subscriptions ?? []).reduce((sum, sub) => {
      const s = sub as {
        price: number;
        billingCycle: string;
        sharedCount?: number;
        billingDay?: number | null;
        startDate?: string | null;
        isPaused?: boolean | null;
        pausedFrom?: string | null;
      };
      return sum + ledgerSubCostForMonth(currentYear, currentMonth, s);
    }, 0);
    const installCost = installmentList.reduce((sum, inst) => {
      const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string; isInterestFree: boolean; interestRate: string | null };
      return sum + getInstallmentCostForMonth(i, currentYear, currentMonth);
    }, 0);
    const loanCost = loanList.reduce((sum, loan) => {
      const l = loan as { startDate: string; maturityDate: string | null; remainingPrincipal: number; monthlyPayment: number };
      return sum + getLoanCostForMonth(l, currentYear, currentMonth);
    }, 0);
    return fixedExp + varExp + businessExp + subCost + installCost + loanCost;
  })();

  // 월별 수입 현황 스택 바 (사업소득 + 부수입 + 기타수입)
  const incomeStackData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const month = idx + 1;
      const bizIncome = businessIncomeByMonth[month] ?? 0;
      const sideIncome = sideIncomeByMonth[month] ?? 0;
      const rows = (yearly ?? []).filter(r => r.month === month);
      const ledgerIncome = sumIncomeRows(rows);
      const otherIncome = Math.max(0, ledgerIncome - bizIncome - sideIncome);
      return { name, 사업소득: bizIncome, 부수입: sideIncome, 기타수입: otherIncome };
    });
  }, [businessIncomeByMonth, sideIncomeByMonth, yearly]);

  const hasIncomeData = incomeStackData.some(d => d.사업소득 > 0 || d.부수입 > 0 || d.기타수입 > 0);

  // 자산 구성 파이 차트 데이터
  const assetPieData = summary
    ? [
        { name: "주식투자", value: summary.stockTotal },
        { name: "저축/현금성", value: summary.savingsTotal },
        { name: "연금", value: summary.pensionTotal },
        { name: "기타자산", value: summary.otherTotal },
      ].filter((d) => d.value > 0)
    : [];

  if (summaryLoading || yearlyLoading || subsLoading || sideIncomeLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog open={pendingBorrowedRequests.length > 0}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>돈 거래 확인 요청</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              받을돈/갚을돈 공유 요청 또는 상환 조건 변경이 있습니다. 수락하면 월별 예정 금액에 반영됩니다.
            </p>
            {pendingBorrowedRequests.map((request) => {
              const remaining = Math.max(0, request.principalAmount - request.repaidAmount);
              const isChangeApproval = request.lenderUserId === currentUserId;
              const lenderDisplayName = request.lenderUserName?.trim() || request.lenderName;
              return (
                <div key={request.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{lenderDisplayName}</p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        {isChangeApproval ? "상대방이 상환 조건을 변경했습니다" : "상대방이 돈 거래 확인을 요청했습니다"}
                      </p>
                      {request.note && (
                        <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground">
                          요청 건: {request.note}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {request.repaymentType}
                        {request.totalInstallments ? ` · ${request.totalInstallments}회` : ""}
                        {request.paymentDay ? ` · 매월 ${request.paymentDay}일` : ""}
                        {request.repaymentDueDate ? ` · ${request.repaymentDueDate}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-foreground">₩{formatAmount(remaining)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rejectBorrowedRequest.mutate({ id: request.id, data: { shareStatus: "rejected" } })}
                      disabled={rejectBorrowedRequest.isPending || acceptBorrowedRequest.isPending}
                    >
                      거절
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptBorrowedRequest.mutate({ id: request.id, data: { shareStatus: "accepted" } })}
                      disabled={rejectBorrowedRequest.isPending || acceptBorrowedRequest.isPending}
                    >
                      수락
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <p className="text-xs text-muted-foreground">확인 전까지 대시보드에서 계속 표시됩니다.</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          대시보드
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{currentYear}년 자산 현황</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6 min-w-0">
      {/* 이달 수입·지출 요약 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">이달 수입</p>
              <p className="text-2xl font-bold text-foreground">₩{formatAmount(currentMonthIncome)}</p>
              <p className="text-xs text-muted-foreground mt-1">{currentYear}년 {currentMonth}월 가계부 기준</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">이달 지출</p>
              <p className="text-2xl font-bold text-foreground">₩{formatAmount(currentMonthExpense)}</p>
              <p className="text-xs text-muted-foreground mt-1">가계부 + 구독 + 할부 + 대출</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 차트 영역 — 수입·지출·저축 합산 + 자산 파이 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 월별 수입·지출·저축 (합산 바 차트) */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">{currentYear}년 월별 수입·지출</h2>
          <p className="text-xs text-muted-foreground mb-4">수입 · 지출 · 저축/투자</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { income: "수입", expense: "지출", savings: "저축/투자" };
                  return [`₩${formatAmount(value)}`, labels[name] ?? name];
                }}
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                onClick={(e: any) => {
                  const key = String(e.dataKey ?? "");
                  if (key) setHiddenMonthly(prev => ({ ...prev, [key]: !prev[key] }));
                }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = { income: "수입", expense: "지출", savings: "저축/투자" };
                  return <span style={{ opacity: hiddenMonthly[value] ? 0.35 : 1, cursor: "pointer" }}>{labels[value] ?? value}</span>;
                }}
              />
              <Bar dataKey="income" name="income" fill="#0369a1" radius={[3, 3, 0, 0]} hide={!!hiddenMonthly["income"]} />
              <Bar dataKey="expense" name="expense" fill="#ef4444" radius={[3, 3, 0, 0]} hide={!!hiddenMonthly["expense"]} />
              <Bar dataKey="savings" name="savings" fill="#0d9488" radius={[3, 3, 0, 0]} hide={!!hiddenMonthly["savings"]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 자산 구성 파이 차트 */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">자산 구성 비율</h2>
          {assetPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={assetPieData.filter(d => !hiddenAsset[d.name])}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {assetPieData.filter(d => !hiddenAsset[d.name]).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`₩${formatAmount(value)}`, ""]}
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  payload={assetPieData.map((d, i) => ({ value: d.name, type: "square" as const, color: COLORS[i % COLORS.length] }))}
                  onClick={(e: any) => {
                    const key = String(e.value ?? "");
                    if (key) setHiddenAsset(prev => ({ ...prev, [key]: !prev[key] }));
                  }}
                  formatter={(value: string) => (
                    <span style={{ opacity: hiddenAsset[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              자산 데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 연간 수입 현황 (스택 바) */}
      {hasIncomeData && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-0.5">
            {currentYear}년 월별 수입 현황
          </h2>
          <p className="text-xs text-muted-foreground mb-4">사업소득 (인식수익 기준) · 부수입 · 기타수입</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={incomeStackData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `${Math.round(v / 10000)}만`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`₩${formatAmount(value)}`, name]}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                onClick={(e: any) => {
                  const key = String(e.dataKey ?? "");
                  if (key) setHiddenIncome(prev => ({ ...prev, [key]: !prev[key] }));
                }}
                formatter={(value: string) => (
                  <span style={{ opacity: hiddenIncome[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                )}
              />
              <Bar dataKey="사업소득" stackId="income" fill="#0369a1" radius={[0, 0, 0, 0]} hide={!!hiddenIncome["사업소득"]} />
              <Bar dataKey="부수입" stackId="income" fill="#0d9488" radius={[0, 0, 0, 0]} hide={!!hiddenIncome["부수입"]} />
              <Bar dataKey="기타수입" stackId="income" fill="#b45309" radius={[3, 3, 0, 0]} hide={!!hiddenIncome["기타수입"]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 연간 지출 중분류 현황 (스택 바) */}
      {expenseSubCatKeys.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-0.5">
            {currentYear}년 월별 지출 현황
          </h2>
          <p className="text-xs text-muted-foreground mb-4">중분류 기준 · 가계부 지출 + 보험 + 구독 + 할부 + 대출</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={expenseStackData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `${Math.round(v / 10000)}만`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`₩${formatAmount(value)}`, name]}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                onClick={(e: any) => {
                  const key = String(e.dataKey ?? "");
                  if (key) setHiddenExpense(prev => ({ ...prev, [key]: !prev[key] }));
                }}
                formatter={(value: string) => (
                  <span style={{ opacity: hiddenExpense[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                )}
              />
              {expenseSubCatKeys.map((key, idx) => {
                const visibleKeys = expenseSubCatKeys.filter(k => !hiddenExpense[k]);
                const isTopVisible = visibleKeys[visibleKeys.length - 1] === key;
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="expense"
                    fill={EXPENSE_COLORS[idx % EXPENSE_COLORS.length]}
                    radius={isTopVisible ? [3, 3, 0, 0] : undefined}
                    hide={!!hiddenExpense[key]}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">알림</h2>
                <p className="text-xs text-muted-foreground mt-0.5">오늘 기준 확인할 일</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <BellRing className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  이번 달 결제
                </div>
                <p className="mt-1 text-xl font-bold text-foreground">{dashboardAlerts.paymentCount}건</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  남은 결제
                </div>
                <p className="mt-1 text-xl font-bold text-foreground">{dashboardAlerts.upcomingPaymentCount}건</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-2">오늘 이후 결제 예정액</p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[11px] text-rose-500 font-medium">지출</p>
                  <p className="text-base font-bold text-foreground">₩{formatAmount(dashboardAlerts.upcomingOutgoingTotal)}</p>
                </div>
                {dashboardAlerts.upcomingIncomingTotal > 0 && (
                  <div>
                    <p className="text-[11px] text-emerald-500 font-medium">입금</p>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">₩{formatAmount(dashboardAlerts.upcomingIncomingTotal)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">다가오는 결제</h3>
              <span className="text-[11px] text-muted-foreground">{currentMonth}월</span>
            </div>
            <div className="mt-3 space-y-2">
              {dashboardAlerts.upcomingPayments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  남은 결제가 없습니다
                </div>
              ) : (
                dashboardAlerts.upcomingPayments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{payment.date.slice(5)}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{payment.type}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">{payment.title}</p>
                      </div>
                      <p className="shrink-0 text-xs font-bold text-foreground">₩{formatAmount(payment.amount)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">체험단 마감</h3>
              <Star className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-3 space-y-2">
              {dashboardAlerts.urgentCampaigns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  7일 이내 마감이 없습니다
                </div>
              ) : (
                dashboardAlerts.urgentCampaigns.map((campaign) => {
                  const isToday = campaign.daysLeft === 0;
                  return (
                    <div
                      key={campaign.id}
                      className={`rounded-lg border p-3 ${
                        isToday
                          ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
                          : "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{campaign.title}</p>
                        <span className={`shrink-0 text-xs font-bold ${isToday ? "text-red-600" : "text-orange-600"}`}>
                          {isToday ? "D-day" : `D-${campaign.daysLeft}`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">마감 {campaign.endDate}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
