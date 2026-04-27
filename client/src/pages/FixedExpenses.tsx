import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#5b7cfa", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b", "#6c5ce7", "#fd79a8", "#00b894", "#e17055", "#74b9ff"];

const EMPTY_FORM = {
  mainCategory: "",
  subCategory: "",
  paymentAccount: "",
  monthlyAmount: "",
  totalAmount: "",
  interestRate: "",
  expiryDate: "",
  paymentDay: "",
  note: "",
};

type FixedExpense = {
  id: number;
  mainCategory: string;
  subCategory: string | null;
  paymentAccount: string | null;
  monthlyAmount: number;
  totalAmount: number | null;
  interestRate: string | null;
  expiryDate: string | null;
  paymentDay: number | null;
  note: string | null;
  isActive: boolean;
};

export default function FixedExpenses() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: expenses = [], isLoading } = trpc.fixedExpense.list.useQuery();

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

  const totalMonthly = expenses.reduce((s, e) => s + (e.monthlyAmount ?? 0), 0);

  const pieData = expenses
    .filter(e => (e.monthlyAmount ?? 0) > 0)
    .map(e => ({ name: e.subCategory ?? e.mainCategory, value: e.monthlyAmount }));

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
      paymentAccount: e.paymentAccount ?? "",
      monthlyAmount: String(e.monthlyAmount ?? ""),
      totalAmount: String(e.totalAmount ?? ""),
      interestRate: e.interestRate ?? "",
      expiryDate: e.expiryDate ?? "",
      paymentDay: String(e.paymentDay ?? ""),
      note: e.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      mainCategory: form.mainCategory,
      subCategory: form.subCategory || undefined,
      paymentAccount: form.paymentAccount || undefined,
      monthlyAmount: Number(form.monthlyAmount) || 0,
      totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
      interestRate: form.interestRate || undefined,
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

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>고정지출 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">매월 정기적으로 지출되는 항목</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      {/* Summary */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">월 고정지출 합계</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">₩{formatAmount(totalMonthly)}</p>
        </div>
        <div className="text-sm text-muted-foreground">{expenses.length}개 항목</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">중분류</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">결제 계좌</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 금액</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">납입일</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">등록된 고정지출이 없습니다</td></tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{e.mainCategory}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.subCategory ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.paymentAccount ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(e.monthlyAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{e.paymentDay ? `${e.paymentDay}일` : "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(e as FixedExpense)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
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
        </div>

        {/* Pie Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">항목별 비율</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`₩${formatAmount(v)}`, ""]} contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
          )}
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
                <Input value={form.mainCategory} onChange={e => setForm(f => ({ ...f, mainCategory: e.target.value }))} placeholder="예: 주거비" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">중분류</Label>
                <Input value={form.subCategory} onChange={e => setForm(f => ({ ...f, subCategory: e.target.value }))} placeholder="예: 관리비" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">결제 계좌</Label>
              <Input value={form.paymentAccount} onChange={e => setForm(f => ({ ...f, paymentAccount: e.target.value }))} placeholder="예: 신한카드" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">월 금액 (원)</Label>
                <Input type="number" value={form.monthlyAmount} onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">납입일</Label>
                <Input type="number" value={form.paymentDay} onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))} placeholder="예: 25" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">만기일</Label>
                <Input value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} placeholder="예: 2026-12" className="mt-1" />
              </div>
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
