import { trpc } from "@/lib/trpc";
import { formatAmount, MONTH_NAMES, currentYear } from "@/lib/utils";
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
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Shield, Coins, Building2 } from "lucide-react";

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

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = trpc.dashboard.summary.useQuery();
  const { data: yearly, isLoading: yearlyLoading } = trpc.dashboard.yearlySummary.useQuery({ year: currentYear });

  // 월별 수입/지출/저축 데이터 가공
  const monthlyData = MONTH_NAMES.map((name, idx) => {
    const month = idx + 1;
    const rows = (yearly ?? []).filter((r) => r.month === month);
    const income = rows.find((r) => r.mainCategory === "수입")?.total ?? 0;
    const fixedExp = rows.find((r) => r.mainCategory === "고정지출")?.total ?? 0;
    const varExp = rows.find((r) => r.mainCategory === "변동지출")?.total ?? 0;
    const savings = rows.find((r) => r.mainCategory === "저축/투자")?.total ?? 0;
    const totalExp = fixedExp + varExp;
    return { name, income, expense: totalExp, savings };
  });

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

  if (summaryLoading || yearlyLoading) {
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
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

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 월별 수입/지출 바 차트 */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{currentYear}년 월별 수입 · 지출</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `${Math.round(v / 10000)}만`}
              />
              <Tooltip
                formatter={(value: number) => [`₩${formatAmount(value)}`, ""]}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="income" name="수입" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="지출" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="savings" name="저축" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
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
                  data={assetPieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {assetPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`₩${formatAmount(value)}`, ""]}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
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
    </div>
  );
}
