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

const EMPTY_FORM = {
  entryDate: new Date().toISOString().split("T")[0],
  year: currentYear,
  month: currentMonth,
  mainCategory: "소득",
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

  const sortedTableRows = useMemo(() => {
    type EntryRow = { kind: "entry"; sortDate: string; entry: LedgerEntry };
    type SubRow = { kind: "sub"; sortDate: string; sub: (typeof subscriptionRows)[number] };
    type FixedRow = { kind: "fixed"; sortDate: string; fixed: (typeof fixedExpenseRows)[number] };
    const entryRows: EntryRow[] = entries.map((entry) => {
      const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
      return { kind: "entry", sortDate: d, entry: entry as LedgerEntry };
    });
    const subRows: SubRow[] = subscriptionRows.map((sub) => ({ kind: "sub", sortDate: sub.displayDate, sub }));
    const fixedRows: FixedRow[] = fixedExpenseRows.map((fixed) => ({ kind: "fixed", sortDate: fixed.displayDate, fixed }));
    return [...entryRows, ...fixedRows, ...subRows].sort((a, b) => {
      const cmp = a.sortDate.localeCompare(b.sortDate);
      if (cmp !== 0) return cmp;
      if (a.kind === "entry" && b.kind === "entry") return a.entry.id - b.entry.id;
      if (a.kind === "sub" && b.kind === "sub") return a.sub.id - b.sub.id;
      if (a.kind === "fixed" && b.kind === "fixed") return a.fixed.id - b.fixed.id;
      return a.kind === "entry" ? -1 : 1;
    });
  }, [entries, fixedExpenseRows, subscriptionRows]);

  const totalSubCost = subscriptionRows.reduce((sum, r) => sum + r.cost, 0);
  const totalManagedFixedCost = fixedExpenseRows.reduce((sum, r) => sum + r.amount, 0);
  const fixedExpWithSubscriptions = fixedExp + totalManagedFixedCost + totalSubCost;
  const totalExp = fixedExp + totalManagedFixedCost + varExp + businessExp + savings + totalSubCost;
  const balance = income - totalExp;

  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const mainCategoryNames = categoryList.map((c) => c.name);
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
    setForm({
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "소득", value: income, cls: "text-emerald-600 dark:text-emerald-400" },
          { label: "고정지출", value: fixedExpWithSubscriptions, cls: "text-blue-600 dark:text-blue-400" },
          { label: "변동지출", value: varExp, cls: "text-orange-600 dark:text-orange-400" },
          { label: "사업지출", value: businessExp, cls: "text-rose-600 dark:text-rose-400" },
          { label: "저축/투자", value: savings, cls: "text-purple-600 dark:text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.cls}`}>₩{formatAmount(s.value)}</p>
          </div>
        ))}
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
                        <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(-row.fixed.amount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{row.fixed.paymentAccount ?? row.fixed.note ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`sub-${row.sub.id}`} className="border-t border-border bg-blue-50/40 dark:bg-blue-900/10">
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
                      <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(-row.sub.cost)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.sub.billingCycle}{row.sub.paymentMethod ? ` · ${row.sub.paymentMethod}` : ""}</td>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">날짜</Label>
                <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value, year: new Date(e.target.value).getFullYear(), month: new Date(e.target.value).getMonth() + 1 }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">대분류</Label>
                <Select value={form.mainCategory} onValueChange={v => setForm(f => ({ ...f, mainCategory: v, subCategory: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mainCategoryNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
