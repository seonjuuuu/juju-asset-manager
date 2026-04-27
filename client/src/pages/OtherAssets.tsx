import { CurrencyInput } from "@/components/ui/currency-input";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const EMPTY_FORM = {
  category: "", monthlyDeposit: 0, paidAmount: 0, totalAmount: 0, note: "",
};

type OtherAsset = {
  id: number;
  category: string;
  monthlyDeposit: number | null;
  paidAmount: number | null;
  totalAmount: number | null;
  note: string | null;
};

export default function OtherAssets() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OtherAsset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: assets = [], isLoading } = trpc.otherAsset.list.useQuery();

  const createMutation = trpc.otherAsset.create.useMutation({
    onSuccess: () => { utils.otherAsset.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.otherAsset.update.useMutation({
    onSuccess: () => { utils.otherAsset.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.otherAsset.delete.useMutation({
    onSuccess: () => { utils.otherAsset.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const total = assets.reduce((s, a) => s + (a.totalAmount ?? 0), 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (a: OtherAsset) => {
    setEditing(a);
    setForm({
      category: a.category,
      monthlyDeposit: a.monthlyDeposit ?? 0,
      paidAmount: a.paidAmount ?? 0,
      totalAmount: a.totalAmount ?? 0,
      note: a.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      category: form.category,
      monthlyDeposit: form.monthlyDeposit || undefined,
      paidAmount: form.paidAmount || undefined,
      totalAmount: form.totalAmount || undefined,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>기타 자산 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">교직원공제회·저축성보험 등 현금화 불가 미래자산</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      {/* Total */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs text-muted-foreground mb-1">기타 자산 합계</p>
        <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">₩{formatAmount(total)}</p>
        <p className="text-xs text-muted-foreground mt-2">* 현금화 불가 미래자산으로 순자산 계산에서 제외될 수 있습니다</p>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">구분/상품명</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 납입액</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">납입 원금</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">평가/예상액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">비고</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">등록된 기타 자산이 없습니다</td></tr>
            ) : (
              assets.map(a => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">{a.category}</td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {a.monthlyDeposit ? `₩${formatAmount(a.monthlyDeposit)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {a.paidAmount ? `₩${formatAmount(a.paidAmount)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">₩{formatAmount(a.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{a.note ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(a as OtherAsset)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
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
              <Label className="text-xs">구분/상품명 *</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="예: 교직원공제회" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">월 납입액 (원)</Label>
                <CurrencyInput value={form.monthlyDeposit} onChange={(v) => setForm(f => ({ ...f, monthlyDeposit: v }))} placeholder="0" suffix="원" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">납입 원금 (원)</Label>
                <CurrencyInput value={form.paidAmount} onChange={(v) => setForm(f => ({ ...f, paidAmount: v }))} placeholder="0" suffix="원" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">평가/예상액 (원)</Label>
              <CurrencyInput value={form.totalAmount} onChange={(v) => setForm(f => ({ ...f, totalAmount: v }))} placeholder="0" suffix="원" className="mt-1" />
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
