import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount, formatReturnRate, returnRateColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const PENSION_TYPES = ["개인연금(연금저축펀드)", "개인연금(연금저축보험)", "퇴직연금(DC)", "퇴직연금(DB)", "퇴직연금(IRP)"];
const ASSET_TYPES = ["ETF", "펀드", "예금", "채권", "기타"];

const EMPTY_FORM = {
  pensionType: "개인연금(연금저축펀드)", company: "", assetType: "ETF",
  stockName: "", ticker: "", avgBuyPrice: "", quantity: "",
  buyAmount: "", currentPrice: "", currentAmount: "", returnRate: "", note: "",
};

type PensionAsset = {
  id: number;
  pensionType: string;
  company: string | null;
  assetType: string | null;
  stockName: string | null;
  ticker: string | null;
  avgBuyPrice: number | null;
  quantity: string | null;
  buyAmount: number | null;
  currentPrice: number | null;
  currentAmount: number | null;
  returnRate: string | null;
  note: string | null;
};

export default function Pension() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PensionAsset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: assets = [], isLoading } = trpc.pension.list.useQuery();

  const createMutation = trpc.pension.create.useMutation({
    onSuccess: () => { utils.pension.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.pension.update.useMutation({
    onSuccess: () => { utils.pension.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.pension.delete.useMutation({
    onSuccess: () => { utils.pension.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const totalBuy = assets.reduce((s, a) => s + (a.buyAmount ?? 0), 0);
  const totalCurrent = assets.reduce((s, a) => s + (a.currentAmount ?? 0), 0);
  const totalReturn = totalBuy > 0 ? ((totalCurrent - totalBuy) / totalBuy) * 100 : 0;

  const grouped = PENSION_TYPES.map(type => ({
    type,
    items: assets.filter(a => a.pensionType === type),
    buyTotal: assets.filter(a => a.pensionType === type).reduce((s, a) => s + (a.buyAmount ?? 0), 0),
    currentTotal: assets.filter(a => a.pensionType === type).reduce((s, a) => s + (a.currentAmount ?? 0), 0),
  })).filter(g => g.items.length > 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (a: PensionAsset) => {
    setEditing(a);
    setForm({
      pensionType: a.pensionType,
      company: a.company ?? "",
      assetType: a.assetType ?? "ETF",
      stockName: a.stockName ?? "",
      ticker: a.ticker ?? "",
      avgBuyPrice: String(a.avgBuyPrice ?? ""),
      quantity: a.quantity ?? "",
      buyAmount: String(a.buyAmount ?? ""),
      currentPrice: String(a.currentPrice ?? ""),
      currentAmount: String(a.currentAmount ?? ""),
      returnRate: a.returnRate ?? "",
      note: a.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      pensionType: form.pensionType,
      company: form.company || undefined,
      assetType: form.assetType || undefined,
      stockName: form.stockName || undefined,
      ticker: form.ticker || undefined,
      avgBuyPrice: form.avgBuyPrice ? Number(form.avgBuyPrice) : undefined,
      quantity: form.quantity || undefined,
      buyAmount: form.buyAmount ? Number(form.buyAmount) : undefined,
      currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
      currentAmount: form.currentAmount ? Number(form.currentAmount) : undefined,
      returnRate: form.returnRate || undefined,
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>연금 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">개인연금·퇴직연금 종목 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 종목 추가
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">매수원금 합계</p>
          <p className="text-xl font-bold">₩{formatAmount(totalBuy)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">평가금액 합계</p>
          <p className="text-xl font-bold">₩{formatAmount(totalCurrent)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">총 수익률</p>
          <p className={`text-xl font-bold ${returnRateColor(totalReturn)}`}>{formatReturnRate(totalReturn)}</p>
        </div>
      </div>

      {/* Grouped Tables */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">로딩 중...</div>
      ) : assets.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">
          등록된 연금 자산이 없습니다
        </div>
      ) : (
        grouped.map(({ type, items, buyTotal, currentTotal }) => {
          const groupReturn = buyTotal > 0 ? ((currentTotal - buyTotal) / buyTotal) * 100 : 0;
          return (
            <div key={type} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold">{type}</h3>
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">원금 <span className="font-medium text-foreground">₩{formatAmount(buyTotal)}</span></span>
                  <span className="text-muted-foreground">평가 <span className="font-medium text-foreground">₩{formatAmount(currentTotal)}</span></span>
                  <span className={`font-semibold ${returnRateColor(groupReturn)}`}>{formatReturnRate(groupReturn)}</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/20">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">종목명</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">유형</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">운용사</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">수량</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">매수원금</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">평가금액</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">수익률</th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(a => (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{a.stockName ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.assetType ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.company ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{a.quantity ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right">₩{formatAmount(a.buyAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(a.currentAmount)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${returnRateColor(a.returnRate)}`}>
                        {formatReturnRate(a.returnRate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(a as PensionAsset)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMutation.mutate({ id: a.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "종목 수정" : "종목 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">연금 유형</Label>
                <Select value={form.pensionType} onValueChange={v => setForm(f => ({ ...f, pensionType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PENSION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">자산 유형</Label>
                <Select value={form.assetType} onValueChange={v => setForm(f => ({ ...f, assetType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">종목명</Label>
                <Input value={form.stockName} onChange={e => setForm(f => ({ ...f, stockName: e.target.value }))} placeholder="예: KODEX 200" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">운용사</Label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="예: 삼성자산운용" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">평균 매수가</Label>
                <Input type="number" value={form.avgBuyPrice} onChange={e => setForm(f => ({ ...f, avgBuyPrice: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">수량</Label>
                <Input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">매수원금 (원)</Label>
                <Input type="number" value={form.buyAmount} onChange={e => setForm(f => ({ ...f, buyAmount: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">평가금액 (원)</Label>
                <Input type="number" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">수익률 (%)</Label>
                <Input value={form.returnRate} onChange={e => setForm(f => ({ ...f, returnRate: e.target.value }))} placeholder="예: 12.5" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">비고</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
              </div>
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
