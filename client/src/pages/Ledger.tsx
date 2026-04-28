import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount, currentYear, currentMonth, MONTH_NAMES } from "@/lib/utils";
import { ledgerSubCostForMonth, subscriptionLedgerDate } from "@/lib/subscriptionLedger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

type LedgerEntry = {
  id: number;
  entryDate: string | Date;
  year: number;
  month: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  note: string | null;
};

type FixedExpenseRow = {
  id: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  paymentAccount: string | null;
  monthlyAmount: number;
  paymentDay: number | null;
  startDate: string | null;
  expiryDate: string | null;
  note: string | null;
};

function instIsActiveInMonth(inst: { startDate: string; endDate: string }, y: number, m: number): boolean {
  if (!inst.startDate || !inst.endDate) return false;
  const [py, pm] = inst.startDate.split("-").map(Number);
  const [ey, em] = inst.endDate.split("-").map(Number);
  const first = py * 12 + pm + 1;
  const last = ey * 12 + em;
  const target = y * 12 + m;
  return target >= first && target <= last;
}

function instMonthlyPayment(totalAmount: number, months: number, isInterestFree: boolean, interestRate: string | null): number {
  if (!totalAmount || !months) return 0;
  if (isInterestFree || !interestRate || parseFloat(interestRate) === 0) return Math.round(totalAmount / months);
  const r = parseFloat(interestRate) / 100 / 12;
  if (r === 0) return Math.round(totalAmount / months);
  return Math.round((totalAmount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

const EMPTY_FORM = {
  entryType: "expense" as "expense" | "income",
  entryDate: new Date().toISOString().split("T")[0],
  year: currentYear,
  month: currentMonth,
  mainCategory: "",
  subCategory: "",
  description: "",
  amount: 0,
  note: "",
};

export default function Ledger() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.ledger.list.useQuery({ year, month });
  const { data: summary = [] } = trpc.ledger.monthSummary.useQuery({ year, month });
  const { data: subscriptions = [] } = trpc.subscription.list.useQuery();
  const { data: fixedExpenses = [] } = trpc.fixedExpense.list.useQuery();
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const createMutation = trpc.ledger.create.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("항목이 추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.ledger.update.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.ledger.delete.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const summaryMap = useMemo(() => {
    const m: Record<string, number> = {};
    summary.forEach((s) => { m[s.mainCategory] = Number(s.total); });
    return m;
  }, [summary]);

  const income = summaryMap["소득"] ?? 0;
  const fixedExp = summaryMap["고정지출"] ?? 0;
  const varExp = summaryMap["변동지출"] ?? 0;
  const businessExp = summaryMap["사업지출"] ?? 0;
  const savings = summaryMap["저축/투자"] ?? 0;

  // 해당 월 구독결제 가상 행 (날짜 = 결제일 기준 해당 월 일자)
  const subscriptionRows = useMemo(() => {
    return subscriptions
      .map(sub => {
        const s = sub as {
          id: number;
          serviceName: string;
          price: number;
          billingCycle: string;
          sharedCount?: number;
          billingDay?: number | null;
          startDate?: string | null;
          paymentMethod?: string | null;
          note?: string | null;
          isPaused?: boolean | null;
          pausedFrom?: string | null;
        };
        const cost = ledgerSubCostForMonth(year, month, s);
        if (cost === 0) return null;
        const displayDate = subscriptionLedgerDate(year, month, s.billingCycle, s.billingDay, s.startDate);
        return { id: s.id, serviceName: s.serviceName, cost, billingCycle: s.billingCycle, paymentMethod: s.paymentMethod ?? null, note: s.note ?? null, displayDate };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [subscriptions, month, year]);

  const fixedExpenseRows = useMemo(() => {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return (fixedExpenses as FixedExpenseRow[])
      .filter(expense => !expense.startDate || expense.startDate.slice(0, 7) <= monthKey)
      .filter(expense => !expense.expiryDate || expense.expiryDate.slice(0, 7) >= monthKey)
      .filter(expense => (expense.monthlyAmount ?? 0) > 0)
      .map(expense => {
        const day = Math.min(Math.max(expense.paymentDay ?? 1, 1), 28);
        return {
          ...expense,
          displayDate: `${monthKey}-${String(day).padStart(2, "0")}`,
          amount: expense.monthlyAmount,
        };
      });
  }, [fixedExpenses, year, month]);

  const installmentRows = useMemo(() => {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return (installmentList as {
      id: number; name: string; cardId: number | null; totalAmount: number; months: number;
      startDate: string; endDate: string; isInterestFree: boolean; interestRate: string | null;
      categoryId: number | null; subCategoryId: number | null;
      earlyRepaymentAmount: number | null; earlyRepaymentDate: string | null;
    }[]).filter(inst => instIsActiveInMonth(inst, year, month))
      .map(inst => {
        const card = (cardList as { id: number; cardCompany: string; cardName: string | null; paymentDate: string | null }[])
          .find(c => c.id === inst.cardId);
        const paymentDay = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, "")) || 15 : 15;
        const displayDate = `${monthKey}-${String(Math.min(paymentDay, 28)).padStart(2, "0")}`;
        const amount = instMonthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
        const cardLabel = card ? `${card.cardCompany}${card.cardName ? ` ${card.cardName}` : ""}` : "";
        const cat = categoryList.find(c => c.id === inst.categoryId);
        const categoryName = cat?.name ?? null;
        const subCategoryName = cat?.subCategories.find(s => s.id === inst.subCategoryId)?.name ?? null;
        return { id: inst.id, name: inst.name, amount, cardLabel, displayDate, categoryName, subCategoryName };
      });
  }, [installmentList, cardList, categoryList, year, month]);

  const sortedTableRows = useMemo(() => {
    type EntryRow = { kind: "entry"; sortDate: string; entry: LedgerEntry };
    type SubRow = { kind: "sub"; sortDate: string; sub: (typeof subscriptionRows)[number] };
    type FixedRow = { kind: "fixed"; sortDate: string; fixed: (typeof fixedExpenseRows)[number] };
    type InstRow = { kind: "installment"; sortDate: string; inst: (typeof installmentRows)[number] };
    const entryRows: EntryRow[] = entries.map((entry) => {
      const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
      return { kind: "entry", sortDate: d, entry: entry as LedgerEntry };
    });
    const subRows: SubRow[] = subscriptionRows.map((sub) => ({ kind: "sub", sortDate: sub.displayDate, sub }));
    const fixedRows: FixedRow[] = fixedExpenseRows.map((fixed) => ({ kind: "fixed", sortDate: fixed.displayDate, fixed }));
    const instRows: InstRow[] = installmentRows.map((inst) => ({ kind: "installment", sortDate: inst.displayDate, inst }));
    return [...entryRows, ...fixedRows, ...subRows, ...instRows].sort((a, b) => {
      const cmp = a.sortDate.localeCompare(b.sortDate);
      if (cmp !== 0) return cmp;
      if (a.kind === "entry" && b.kind === "entry") return a.entry.id - b.entry.id;
      if (a.kind === "sub" && b.kind === "sub") return a.sub.id - b.sub.id;
      if (a.kind === "fixed" && b.kind === "fixed") return a.fixed.id - b.fixed.id;
      if (a.kind === "installment" && b.kind === "installment") return a.inst.id - b.inst.id;
      return a.kind === "entry" ? -1 : 1;
    });
  }, [entries, fixedExpenseRows, subscriptionRows, installmentRows]);

  const totalSubCost = subscriptionRows.reduce((sum, r) => sum + r.cost, 0);
  const totalManagedFixedCost = fixedExpenseRows.reduce((sum, r) => sum + r.amount, 0);
  const totalInstallmentCost = installmentRows.reduce((sum, r) => sum + r.amount, 0);
  const fixedExpWithSubscriptions = Math.abs(fixedExp) + totalManagedFixedCost + totalSubCost;
  const totalExp = Math.abs(fixedExp) + totalManagedFixedCost + Math.abs(varExp) + Math.abs(businessExp) + Math.abs(savings) + totalSubCost + totalInstallmentCost;
  const balance = income - totalExp;


  const getFilteredCategories = (entryType: "expense" | "income") =>
    categoryList.filter(c => entryType === "income" ? (c.type === "income" || c.type === "both") : (c.type === "expense" || c.type === "both"));

  const getSubCategories = (main: string) => {
    const cat = categoryList.find((c) => c.name === main);
    return cat ? cat.subCategories.map((s) => s.name) : [];
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, year, month, entryDate: `${year}-${String(month).padStart(2, "0")}-01` });
    setDialogOpen(true);
  };

  const openEdit = (entry: LedgerEntry) => {
    setEditing(entry);
    const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
    const cat = categoryList.find(c => c.name === entry.mainCategory);
    const entryType = cat?.type === "income" ? "income" : "expense";
    setForm({
      entryType,
      entryDate: d,
      year: entry.year,
      month: entry.month,
      mainCategory: entry.mainCategory,
      subCategory: entry.subCategory ?? "",
      description: entry.description ?? "",
      amount: entry.amount ?? 0,
      note: entry.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      entryDate: form.entryDate,
      year: form.year,
      month: form.month,
      mainCategory: form.mainCategory,
      subCategory: form.subCategory || undefined,
      description: form.description || undefined,
      amount: form.amount,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const ledgerTypeColor: Record<string, string> = {
    "수입": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "지출": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "저축": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const getLedgerType = (mainCategory: string, amount: number) => {
    if (mainCategory === "저축/투자") return "저축";
    if (mainCategory === "소득" || amount > 0) return "수입";
    return "지출";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">월별 가계부</h1>
          <p className="text-sm text-muted-foreground mt-0.5">수입·지출·저축 내역 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-semibold w-24 text-center">{year}년 {MONTH_NAMES[month - 1]}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* 소득 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">소득</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₩{formatAmount(income)}</p>
        </div>
        {/* 지출 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">지출</p>
          <p className="text-xl font-bold text-red-500 dark:text-red-400">₩{formatAmount(totalExp)}</p>
          <div className="mt-2 pt-2 border-t border-border space-y-0.5">
            {[
              { label: "고정지출", value: fixedExpWithSubscriptions },
              { label: "변동지출", value: varExp },
              { label: "사업지출", value: businessExp },
              { label: "할부결제", value: totalInstallmentCost },
              { label: "저축/투자", value: savings },
            ].filter(item => Math.abs(item.value) > 0).map(item => (
              <div key={item.label} className="flex justify-between text-xs text-muted-foreground">
                <span>{item.label}</span>
                <span>₩{formatAmount(Math.abs(item.value))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">잔액 (소득 - 지출/저축)</span>
        <span className={`text-xl font-bold ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          ₩{formatAmount(balance)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">날짜</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">구분</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대분류</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">중분류</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">내용</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">금액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">비고</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : sortedTableRows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">이번 달 내역이 없습니다</td></tr>
            ) : (
              <>
                {sortedTableRows.map((row) => {
                  if (row.kind === "entry") {
                    const entry = row.entry;
                    const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
                    const ledgerType = getLedgerType(entry.mainCategory, entry.amount);
                    return (
                      <tr key={`e-${entry.id}`} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{d}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ledgerTypeColor[ledgerType]}`}>
                            {ledgerType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">{entry.mainCategory}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">{entry.subCategory ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{entry.description ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(entry.amount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{entry.note ?? "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(entry)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteMutation.mutate({ id: entry.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  if (row.kind === "fixed") {
                    return (
                      <tr key={`f-${row.fixed.id}`} className="border-t border-border bg-blue-50/40 dark:bg-blue-900/10">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{row.fixed.displayDate}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ledgerTypeColor["지출"]}`}>
                            지출
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">{row.fixed.mainCategory}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{row.fixed.subCategory ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.fixed.description ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400">-₩{formatAmount(row.fixed.amount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{row.fixed.paymentAccount ?? row.fixed.note ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                      </tr>
                    );
                  }
                  if (row.kind === "sub") return (
                    <tr key={`sub-${row.sub.id}`} className="border-t border-border bg-violet-50/40 dark:bg-violet-900/10">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.sub.displayDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ledgerTypeColor["지출"]}`}>
                          지출
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">고정지출</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">구독서비스</td>
                      <td className="px-4 py-3 text-sm">{row.sub.serviceName}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400">-₩{formatAmount(row.sub.cost)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.sub.billingCycle}{row.sub.paymentMethod ? ` · ${row.sub.paymentMethod}` : ""}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                    </tr>
                  );
                  return (
                    <tr key={`inst-${row.inst.id}`} className="border-t border-border bg-amber-50/40 dark:bg-amber-900/10">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.inst.displayDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ledgerTypeColor["지출"]}`}>
                          지출
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{row.inst.categoryName ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.inst.subCategoryName ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{row.inst.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">할부</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400">-₩{formatAmount(row.inst.amount)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.inst.cardLabel || "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "항목 수정" : "항목 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* 수입 / 지출 선택 */}
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, entryType: type, mainCategory: "", subCategory: "" }))}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.entryType === type
                      ? type === "income"
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-red-500 text-white border-red-500"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {type === "income" ? "수입" : "지출"}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-xs">날짜</Label>
              <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value, year: new Date(e.target.value).getFullYear(), month: new Date(e.target.value).getMonth() + 1 }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">대분류</Label>
                <Select value={form.mainCategory} onValueChange={v => setForm(f => ({ ...f, mainCategory: v, subCategory: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {getFilteredCategories(form.entryType).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">중분류</Label>
                <Select value={form.subCategory} onValueChange={v => setForm(f => ({ ...f, subCategory: v }))} disabled={!form.mainCategory}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {getSubCategories(form.mainCategory).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="내용 입력" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} placeholder="0" suffix="원" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
