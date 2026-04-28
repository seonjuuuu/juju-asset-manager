import { trpc } from "@/lib/trpc";
import { formatAmount, MONTH_NAMES, currentYear } from "@/lib/utils";
import { ledgerSubCostForMonth } from "@/lib/subscriptionLedger";
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
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Shield, Coins, Briefcase } from "lucide-react";
import { useMemo, useState } from "react";

function getInstallmentCostForMonth(
  inst: { totalAmount: number; months: number; startDate: string; endDate: string },
  yr: number, mo: number
): number {
  const key = `${yr}-${String(mo).padStart(2, "0")}`;
  if (inst.startDate.slice(0, 7) <= key && inst.endDate.slice(0, 7) >= key) {
    return Math.round(inst.totalAmount / inst.months);
  }
  return 0;
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

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

const EXPENSE_COLORS = [
  "#5b7cfa","#f97316","#22c55e","#a855f7","#ec4899",
  "#14b8a6","#f59e0b","#ef4444","#06b6d4","#84cc16",
  "#8b5cf6","#f43f5e",
];

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = trpc.dashboard.summary.useQuery();
  const { data: yearly, isLoading: yearlyLoading } = trpc.dashboard.yearlySummary.useQuery({ year: currentYear });

  // 구독결제 목록 (전체)
  const { data: subscriptions, isLoading: subsLoading } = trpc.subscription.list.useQuery();

  // 부수입 연간 월별 합계
  const { data: sideIncomeSummary, isLoading: sideIncomeLoading } = trpc.sideIncome.yearlySummary.useQuery({ year: currentYear });

  // 사업소득 전체 목록
  const { data: businessIncomeList = [] } = trpc.businessIncome.list.useQuery();

  // 할부 목록
  const { data: installmentList = [] } = trpc.installment.list.useQuery();

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

  // 월별 구독결제 구독비 (모든 달에 동일하게 적용)
  const monthlySubCost = useMemo(() => {
    if (!subscriptions) return 0;
    const mo = new Date().getMonth() + 1;
    return subscriptions.reduce((sum, sub) => {
      const s = sub as {
        price: number;
        billingCycle: string;
        sharedCount?: number;
        billingDay?: number | null;
        startDate?: string | null;
        isPaused?: boolean | null;
        pausedFrom?: string | null;
      };
      return sum + ledgerSubCostForMonth(currentYear, mo, s);
    }, 0);
  }, [subscriptions]);

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
      const ledgerIncome = rows.find((r) => r.mainCategory === "소득")?.total ?? 0;
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
        const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string };
        return sum + getInstallmentCostForMonth(i, currentYear, month);
      }, 0);
      const totalExp = fixedExp + varExp + businessExp + subCostThisMonth + installmentThisMonth;

      // 총 수입 = 가계부 수입 (부수입이 가계부에 자동 반영되므로 ledgerIncome 사용)
      // 단, 부수입이 가계부에 반영되지 않은 경우를 대비해 sideIncome도 함께 표시
      const totalIncome = ledgerIncome;

      return { name, income: totalIncome, expense: totalExp, savings, sideIncome };
    });
  }, [yearly, subscriptions, sideIncomeByMonth, installmentList]);

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
        const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string };
        return sum + getInstallmentCostForMonth(i, currentYear, month);
      }, 0);
      if (installCost > 0) entry["할부"] = ((entry["할부"] as number) || 0) + installCost;

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
  }, [subCatExpense, insuranceList, subscriptions, installmentList]);

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

  // 이번 달 구독결제 총 구독비 (monthlySubCost가 이미 현재 월 기준으로 계산됨)
  const currentMonthSubCost = monthlySubCost;

  // 이번 달 부수입 합계
  const currentMonthSideIncome = sideIncomeByMonth[currentMonth] ?? 0;

  // 이달 사업소득 인식수익
  const currentMonthBusinessIncome = businessIncomeByMonth[currentMonth] ?? 0;

  // 이달 수입·지출 요약 (monthlyData 기준)
  const currentMonthIncome = (yearly ?? []).filter(r => r.month === currentMonth)
    .find(r => r.mainCategory === "소득")?.total ?? 0;
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
      const i = inst as { totalAmount: number; months: number; startDate: string; endDate: string };
      return sum + getInstallmentCostForMonth(i, currentYear, currentMonth);
    }, 0);
    return fixedExp + varExp + businessExp + subCost + installCost;
  })();

  // 월별 수입 현황 스택 바 (사업소득 + 부수입 + 기타수입)
  const incomeStackData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const month = idx + 1;
      const bizIncome = businessIncomeByMonth[month] ?? 0;
      const sideIncome = sideIncomeByMonth[month] ?? 0;
      const rows = (yearly ?? []).filter(r => r.month === month);
      const ledgerIncome = rows.find(r => r.mainCategory === "소득")?.total ?? 0;
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

  const totalAsset = summary
    ? summary.stockTotal + summary.savingsTotal + summary.pensionTotal + summary.otherTotal
    : 0;

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
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          대시보드
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{currentYear}년 자산 현황</p>
      </div>

      {/* 총 자산 요약 */}
      <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground">
        <p className="text-sm font-medium opacity-80 mb-1">순 자산 (총자산 - 부채)</p>
        <p className="text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
          ₩{formatAmount(summary?.netAsset ?? 0)}
        </p>
        <div className="flex gap-6 mt-4 text-sm opacity-80">
          <span>총자산 ₩{formatAmount(totalAsset)}</span>
          <span>부채 ₩{formatAmount(summary?.debtTotal ?? 0)}</span>
        </div>
      </div>

      {/* 자산 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="주식투자"
          value={`₩${formatAmount(summary?.stockTotal ?? 0)}`}
          icon={TrendingUp}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          title="저축/현금성"
          value={`₩${formatAmount(summary?.savingsTotal ?? 0)}`}
          icon={PiggyBank}
          color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
        />
        <StatCard
          title="연금"
          value={`₩${formatAmount(summary?.pensionTotal ?? 0)}`}
          icon={Shield}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <StatCard
          title="기타 자산"
          value={`₩${formatAmount(summary?.otherTotal ?? 0)}`}
          icon={Coins}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

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
              <p className="text-xs text-muted-foreground mt-1">가계부 + 구독 + 할부</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 이달 세부 수입 배너 */}
      {(currentMonthSubCost > 0 || currentMonthSideIncome > 0 || currentMonthBusinessIncome > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {currentMonthBusinessIncome > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">이달 사업소득</p>
                <p className="text-lg font-bold text-foreground">₩{formatAmount(currentMonthBusinessIncome)}</p>
                <p className="text-xs text-muted-foreground">{currentYear}년 {currentMonth}월 인식수익</p>
              </div>
            </div>
          )}
          {currentMonthSideIncome > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">이달 부수입</p>
                <p className="text-lg font-bold text-foreground">₩{formatAmount(currentMonthSideIncome)}</p>
                <p className="text-xs text-muted-foreground">{currentYear}년 {currentMonth}월 합계</p>
              </div>
            </div>
          )}
          {currentMonthSubCost > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">이달 구독결제 부담액</p>
                <p className="text-lg font-bold text-foreground">₩{formatAmount(currentMonthSubCost)}</p>
                <p className="text-xs text-muted-foreground">{subscriptions?.length ?? 0}개 서비스 · 월 합산</p>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* 부채 현황 */}
      {(summary?.debtTotal ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-foreground">부채 현황</h2>
          </div>
          <p className="text-2xl font-bold text-red-500">₩{formatAmount(summary?.debtTotal ?? 0)}</p>
        </div>
      )}

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
          <p className="text-xs text-muted-foreground mb-4">중분류 기준 · 가계부 지출 + 보험 + 구독 + 할부</p>
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
  );
}
