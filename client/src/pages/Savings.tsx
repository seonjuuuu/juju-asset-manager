import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const CATEGORIES = ["예적금", "파킹통장", "현금성통장", "투자", "연금저축", "주택청약", "기타저축"];

const EMPTY_FORM = {
  category: "예적금", description: "", bank: "", accountNumber: "",
  monthlyDeposit: "", interestRate: "", totalAmount: "", expiryDate: "", note: "",
};

type SavingsAsset = {
  id: number;
  category: string;
  description: string;
  bank: string | null;
  accountNumber: string | null;
  monthlyDeposit: string | null;
  interestRate: string | null;
  totalAmount: string | null;
  expiryDate: string | null;
  note: string | null;
  isActive: boolean;
};

export default function Savings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsAsset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: assets = [], isLoading } = trpc.savings.list.useQuery();

  const createMutation = trpc.savings.create.useMutation({
    onSuccess: () => { utils.savings.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.savings.update.useMutation({
    onSuccess: () => { utils.savings.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.savings.delete.useMutation({
    onSuccess: () => { utils.savings.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const total = assets.reduce((s, a) => s + parseFloat(String(a.totalAmount ?? 0)), 0);

  const byCategory = CATEGORIES.map(cat => ({
    cat,
    items: assets.filter(a => a.category === cat),
    total: assets.filter(a => a.category === cat).reduce((s, a) => s + parseFloat(String(a.totalAmount ?? 0)), 0),
  }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (a: SavingsAsset) => {
    setEditing(a);
    setForm({
      category: a.category,
      description: a.description,
      bank: a.bank ?? "",
      accountNumber: a.accountNumber ?? "",
      monthlyDeposit: a.monthlyDeposit ?? "",
      interestRate: a.interestRate ?? "",
      totalAmount: a.totalAmount ?? "",
      expiryDate: a.expiryDate ?? "",
      note: a.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      category: form.category,
      description: form.description,
      bank: form.bank || undefined,
      accountNumber: form.accountNumber || undefined,
      monthlyDeposit: form.monthlyDeposit || undefined,
      interestRate: form.interestRate || undefined,
      totalAmount: form.totalAmount || undefined,
      expiryDate: form.expiryDate || undefined,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const catColors: Record<string, string> = {
    "예적금": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "파킹통장": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    "현금성통장": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "투자": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    "연금저축": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    "주택청약": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "기타저축": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    "입출금통장": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "기타(달러/주식통장)": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">저축 및 현금성 자산</h1>
          <p className="text-sm text-muted-foreground mt-0.5">예적금·통장·기타 현금성 자산 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      {/* Total */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">저축 및 현금성 자산 합계</p>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">₩{formatAmount(total)}</p>
        </div>
        <div className="flex gap-4">
          {byCategory.map(({ cat, total: catTotal }) => (
            <div key={cat} className="text-right">
              <p className="text-xs text-muted-foreground">{cat}</p>
              <p className="text-sm font-semibold">₩{formatAmount(catTotal)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">구분</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상품명</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">은행/증권사</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 납입액</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">이자율</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">잔액/평가액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">만기일</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">등록된 자산이 없습니다</td></tr>
            ) : (
              assets.map(a => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColors[a.category] ?? "bg-muted text-muted-foreground"}`}>
                      {a.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{a.description}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{a.bank ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-right">{a.monthlyDeposit ? `₩${formatAmount(a.monthlyDeposit)}` : "-"}</td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">{a.interestRate ? `${a.interestRate}%` : "-"}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(a.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{a.expiryDate ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(a as SavingsAsset)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteMutation.mutate({ id: a.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "자산 수정" : "자산 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">구분</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">상품명 *</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="예: 청년우대청약" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">은행/증권사</Label>
                <Input value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} placeholder="예: 국민은행" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">계좌번호</Label>
                <Input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="선택" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">월 납입액 (원)</Label>
                <CurrencyInput value={Number(form.monthlyDeposit) || 0} onChange={v => setForm(f => ({ ...f, monthlyDeposit: v ? String(v) : "" }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">이자율 (%)</Label>
                <Input value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} placeholder="예: 3.5" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">잔액/평가액 (원)</Label>
                <CurrencyInput value={Number(form.totalAmount) || 0} onChange={v => setForm(f => ({ ...f, totalAmount: v ? String(v) : "" }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">만기일</Label>
                <Input
                  value={form.expiryDate}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, "");
                    let formatted = e.target.value;
                    if (digits.length === 8) formatted = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
                    else if (digits.length === 6) formatted = `${digits.slice(0,4)}-${digits.slice(4,6)}`;
                    setForm(f => ({ ...f, expiryDate: formatted }));
                  }}
                  placeholder="예: 2026-12"
                  className="mt-1"
                />
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
