import { CurrencyInput } from "@/components/ui/currency-input";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ledgerSubCostForMonth } from "@/lib/subscriptionLedger";

const COLORS = ["#5b7cfa", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b", "#6c5ce7", "#fd79a8", "#00b894", "#e17055", "#74b9ff"];
const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const EMPTY_FORM = {
  mainCategory: "",
  subCategory: "",
  description: "",
  paymentAccount: "",
  monthlyAmount: 0,
  totalAmount: 0,
  interestRate: "",
  startDate: "",
  expiryDate: "",
  paymentDay: "",
  note: "",
};

type FixedExpense = {
  id: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  paymentAccount: string | null;
  monthlyAmount: number;
  totalAmount: number | null;
  interestRate: string | null;
  startDate: string | null;
  expiryDate: string | null;
  paymentDay: number | null;
  note: string | null;
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function selectedMonthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function formatLocalYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isValidDateInput(value: string) {
  if (!value) return true;
  if (/^\d{4}-\d{2}$/.test(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function comparableDateKey(value: string, boundary: "start" | "end") {
  if (!value) return "";
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-${boundary === "start" ? "01" : "31"}`;
  return value;
}

function DateInputWithCalendar({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const invalid = !isValidDateInput(value);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) && !invalid ? new Date(value) : undefined;

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={invalid ? "border-destructive" : ""}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="flex-shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={date => {
                if (!date) return;
                onChange(formatLocalYmd(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid && <p className="text-xs text-destructive mt-1">YYYY-MM 또는 YYYY-MM-DD 형식으로 입력하세요</p>}
    </div>
  );
}

function fixedExpenseAppliesToMonth(expense: FixedExpense, year: number, month: number) {
  const key = selectedMonthKey(year, month);
  if (expense.startDate && expense.startDate.slice(0, 7) > key) return false;
  if (expense.expiryDate && expense.expiryDate.slice(0, 7) < key) return false;
  return true;
}

function insuranceAppliesToMonth(ins: InsuranceRow, year: number, month: number) {
  const key = selectedMonthKey(year, month);
  if (ins.startDate && ins.startDate.slice(0, 7) > key) return false;
  if (ins.endDate && ins.endDate.slice(0, 7) < key) return false;
  if (ins.paymentType === "annual") {
    const payMonth = ins.startDate ? Number(ins.startDate.slice(5, 7)) : 1;
    return payMonth === month;
  }
  return true;
}

function insuranceMonthAmount(ins: InsuranceRow, year: number, month: number) {
  if (!insuranceAppliesToMonth(ins, year, month)) return 0;
  return ins.paymentType === "monthly" ? ins.paymentAmount : ins.paymentAmount;
}

export default function FixedExpenses() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: expenses = [], isLoading } = trpc.fixedExpense.list.useQuery();
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = trpc.subscription.list.useQuery();
  const { data: insuranceList = [], isLoading: insuranceLoading } = trpc.insurance.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: accountList = [] } = trpc.account.list.useQuery();
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const paymentOptions = [
    ...cardList.map(c => ({
      label: `[카드] ${c.cardCompany} ${c.cardName ?? ""}`.trim(),
      value: `[카드] ${c.cardCompany} ${c.cardName ?? ""}`.trim(),
    })),
    ...accountList.map(a => ({
      label: `[계좌] ${a.bankName} ${a.accountType}`,
      value: `[계좌] ${a.bankName} ${a.accountType}`,
    })),
  ];
  const mainCategoryNames = categoryList.map((c) => c.name);
  const getSubCategories = (main: string) => {
    const cat = categoryList.find((c) => c.name === main);
    return cat ? cat.subCategories.map((s) => s.name) : [];
  };

  const createMutation = trpc.fixedExpense.create.useMutation({
    onSuccess: () => { utils.fixedExpense.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.fixedExpense.update.useMutation({
    onSuccess: () => { utils.fixedExpense.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.fixedExpense.delete.useMutation({
    onSuccess: () => { utils.fixedExpense.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const activeExpenses = (expenses as FixedExpense[]).filter(e => fixedExpenseAppliesToMonth(e, year, month));
  const directTotalMonthly = activeExpenses.reduce((s, e) => s + (e.monthlyAmount ?? 0), 0);
  const subscriptionRows = (subscriptions as SubscriptionRow[]).map(sub => ({
    ...sub,
    monthlyAmount: ledgerSubCostForMonth(year, month, sub),
  })).filter(sub => sub.monthlyAmount > 0);
  const subscriptionTotalMonthly = subscriptionRows.reduce((s, e) => s + e.monthlyAmount, 0);
  const insuranceRows = insuranceList as InsuranceRow[];
  const selectedInsuranceRows = insuranceRows
    .map(ins => ({ ...ins, monthAmount: insuranceMonthAmount(ins, year, month) }))
    .filter(ins => ins.monthAmount > 0);
  const insuranceTotalMonthly = selectedInsuranceRows.reduce((s, e) => s + e.monthAmount, 0);
  const totalMonthly = directTotalMonthly + subscriptionTotalMonthly + insuranceTotalMonthly;

  const pieData = activeExpenses
    .filter(e => (e.monthlyAmount ?? 0) > 0)
    .map(e => ({ name: e.subCategory ?? e.mainCategory, value: e.monthlyAmount }));
  const combinedPieData = [
    ...pieData,
    ...(subscriptionTotalMonthly > 0 ? [{ name: "구독서비스", value: subscriptionTotalMonthly }] : []),
    ...(insuranceTotalMonthly > 0 ? [{ name: "보험", value: insuranceTotalMonthly }] : []),
  ];
  const pieTotal = combinedPieData.reduce((sum, item) => sum + item.value, 0);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (e: FixedExpense) => {
    setEditing(e);
    setForm({
      mainCategory: e.mainCategory,
      subCategory: e.subCategory ?? "",
      description: e.description ?? "",
      paymentAccount: e.paymentAccount ?? "",
      monthlyAmount: e.monthlyAmount ?? 0,
      totalAmount: e.totalAmount ?? 0,
      interestRate: e.interestRate ?? "",
      startDate: e.startDate ?? "",
      expiryDate: e.expiryDate ?? "",
      paymentDay: String(e.paymentDay ?? ""),
      note: e.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!isValidDateInput(form.startDate)) {
      toast.error("시작일 형식을 확인해주세요");
      return;
    }
    if (!isValidDateInput(form.expiryDate)) {
      toast.error("만기일 형식을 확인해주세요");
      return;
    }
    if (
      form.startDate &&
      form.expiryDate &&
      comparableDateKey(form.expiryDate, "end") < comparableDateKey(form.startDate, "start")
    ) {
      toast.error("만기일은 시작일보다 이전일 수 없습니다");
      return;
    }
    const data = {
      mainCategory: form.mainCategory,
      subCategory: form.subCategory || undefined,
      description: form.description || undefined,
      paymentAccount: form.paymentAccount || undefined,
      monthlyAmount: form.monthlyAmount || 0,
      totalAmount: form.totalAmount || undefined,
      interestRate: form.interestRate || undefined,
      startDate: form.startDate || undefined,
      expiryDate: form.expiryDate || undefined,
      paymentDay: form.paymentDay ? Number(form.paymentDay) : undefined,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  function renderFixedExpenseTable(rows: FixedExpense[], emptyText: string) {
    return (
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대분류</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">중분류</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">내용</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">결제 계좌</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 금액</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">납입일</th>
            <th className="px-4 py-3 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">{emptyText}</td></tr>
          ) : (
            rows.map((e) => (
              <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{e.mainCategory}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{e.subCategory ?? "-"}</td>
                <td className="px-4 py-3 text-sm">{e.description ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{e.paymentAccount ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(e.monthlyAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-muted-foreground">{e.paymentDay ? `${e.paymentDay}일` : "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate({ id: e.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">고정지출 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">월별 고정지출·구독·보험 항목</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-semibold w-24 text-center">{year}년 {MONTH_NAMES[month - 1]}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
          <Button variant="outline" size="sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>
            이번 달
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{year}년 {month}월 고정지출 합계</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">₩{formatAmount(totalMonthly)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            직접입력 ₩{formatAmount(directTotalMonthly)} · 구독 ₩{formatAmount(subscriptionTotalMonthly)} · 보험 ₩{formatAmount(insuranceTotalMonthly)}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{activeExpenses.length + subscriptionRows.length + selectedInsuranceRows.length}개 항목</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          {renderFixedExpenseTable(activeExpenses, "등록된 고정지출이 없습니다")}
        </div>

        {/* Pie Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">항목별 비율</h2>
          {combinedPieData.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={combinedPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {combinedPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`₩${formatAmount(v)}`, ""]} contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {combinedPieData.map((item, i) => {
                  const percent = pieTotal > 0 ? (item.value / pieTotal) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="truncate text-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold">{percent.toFixed(1)}%</span>
                        <span className="text-muted-foreground">₩{formatAmount(item.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">구독서비스</h2>
            <p className="text-xs text-muted-foreground mt-0.5">고정지출 &gt; 구독서비스</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">중분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">서비스</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">결제수단</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 금액</th>
              </tr>
            </thead>
            <tbody>
              {subscriptionsLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">불러오는 중...</td></tr>
              ) : subscriptionRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">이번 달 구독 고정지출이 없습니다</td></tr>
              ) : (
                subscriptionRows.map(sub => (
                  <tr key={sub.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium">고정지출</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">구독서비스</td>
                    <td className="px-4 py-3 text-sm">{sub.serviceName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{sub.paymentMethod ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(sub.monthlyAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">보험</h2>
            <p className="text-xs text-muted-foreground mt-0.5">고정지출 &gt; 보험</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">중분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">보험명</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">결제수단</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 금액</th>
              </tr>
            </thead>
            <tbody>
              {insuranceLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">불러오는 중...</td></tr>
              ) : selectedInsuranceRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">등록된 보험이 없습니다</td></tr>
              ) : (
                selectedInsuranceRows.map(ins => (
                  <tr key={ins.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium">고정지출</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">보험</td>
                    <td className="px-4 py-3 text-sm">{ins.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{ins.paymentMethod ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(ins.monthAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "고정지출 수정" : "고정지출 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">대분류</Label>
                <Select value={form.mainCategory} onValueChange={v => setForm(f => ({ ...f, mainCategory: v, subCategory: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {mainCategoryNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">중분류</Label>
                <Select value={form.subCategory} onValueChange={v => setForm(f => ({ ...f, subCategory: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {getSubCategories(form.mainCategory).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="예: 관리비, 렌탈료, 회비" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">결제 계좌</Label>
              <Select value={form.paymentAccount} onValueChange={v => setForm(f => ({ ...f, paymentAccount: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="카드/계좌 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {paymentOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">월 금액 (원)</Label>
                <CurrencyInput value={form.monthlyAmount} onChange={(v) => setForm(f => ({ ...f, monthlyAmount: v }))} placeholder="0" suffix="원" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">납입일</Label>
                <Input type="number" value={form.paymentDay} onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))} placeholder="예: 25" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateInputWithCalendar
                label="시작일"
                value={form.startDate}
                onChange={value => setForm(f => ({ ...f, startDate: value }))}
                placeholder="예: 2026-04 또는 2026-04-28"
              />
              <DateInputWithCalendar
                label="만기일"
                value={form.expiryDate}
                onChange={value => setForm(f => ({ ...f, expiryDate: value }))}
                placeholder="예: 2026-12 또는 2026-12-31"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">이자율 (%)</Label>
                <Input value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} placeholder="예: 3.5" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "수정" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
