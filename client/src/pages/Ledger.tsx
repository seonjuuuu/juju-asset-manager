import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount, currentYear, currentMonth, MONTH_NAMES } from "@/lib/utils";
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

const EMPTY_FORM = {
  entryDate: new Date().toISOString().split("T")[0],
  year: currentYear,
  month: currentMonth,
  mainCategory: "수입",
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

  const income = summaryMap["수입"] ?? 0;
  const fixedExp = summaryMap["고정지출"] ?? 0;
  const varExp = summaryMap["변동지출"] ?? 0;
  const savings = summaryMap["저축/투자"] ?? 0;
  const totalExp = fixedExp + varExp + savings;
  const balance = income - totalExp;

  const { data: categoryList = [] } = trpc.categories.list.useQuery();
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

  const categoryColor: Record<string, string> = {
    "수입": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "고정지출": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "변동지출": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "저축/투자": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "수입", value: income, cls: "text-emerald-600 dark:text-emerald-400" },
          { label: "고정지출", value: fixedExp, cls: "text-blue-600 dark:text-blue-400" },
          { label: "변동지출", value: varExp, cls: "text-orange-600 dark:text-orange-400" },
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
        <span className="text-sm font-medium text-muted-foreground">잔액 (수입 - 지출/저축)</span>
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
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">이번 달 내역이 없습니다</td></tr>
            ) : (
              entries.map((entry) => {
                const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
                return (
                  <tr key={entry.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{d}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor[entry.mainCategory] ?? "bg-muted text-muted-foreground"}`}>
                        {entry.mainCategory}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.subCategory ?? "-"}</td>
                    <td className="px-4 py-3 text-sm">{entry.description ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(entry.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.note ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(entry as LedgerEntry)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate({ id: entry.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
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
