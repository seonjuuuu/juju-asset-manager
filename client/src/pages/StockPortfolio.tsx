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
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#5b7cfa", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b", "#6c5ce7", "#fd79a8", "#00b894"];
const MARKETS = ["국내", "해외"];
const SECTORS = ["IT", "금융", "헬스케어", "소비재", "에너지", "산업재", "ETF", "기타"];

const EMPTY_FORM = {
  market: "국내", broker: "", sector: "", stockName: "", ticker: "",
  avgBuyPrice: "", quantity: "", buyAmount: "", currentPrice: "", currentAmount: "", returnRate: "",
  snapshotMonth: new Date().toISOString().slice(0, 7), note: "",
};

type Stock = {
  id: number;
  market: string | null;
  broker: string | null;
  sector: string | null;
  stockName: string;
  ticker: string | null;
  avgBuyPrice: number | null;
  quantity: string | null;
  buyAmount: number | null;
  currentPrice: number | null;
  currentAmount: number | null;
  returnRate: string | null;
  snapshotMonth: string | null;
  note: string | null;
};

export default function StockPortfolio() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterMarket, setFilterMarket] = useState<string>("전체");

  const utils = trpc.useUtils();
  const { data: stocks = [], isLoading } = trpc.stock.list.useQuery({});

  const createMutation = trpc.stock.create.useMutation({
    onSuccess: () => { utils.stock.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.stock.update.useMutation({
    onSuccess: () => { utils.stock.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.stock.delete.useMutation({
    onSuccess: () => { utils.stock.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const filtered = filterMarket === "전체" ? stocks : stocks.filter(s => s.market === filterMarket);
  const totalBuy = filtered.reduce((s, r) => s + (r.buyAmount ?? 0), 0);
  const totalCurrent = filtered.reduce((s, r) => s + (r.currentAmount ?? 0), 0);
  const totalReturn = totalBuy > 0 ? ((totalCurrent - totalBuy) / totalBuy) * 100 : 0;

  // 섹터별 파이 차트
  const sectorMap: Record<string, number> = {};
  filtered.forEach(s => {
    const key = s.sector ?? "기타";
    sectorMap[key] = (sectorMap[key] ?? 0) + (s.currentAmount ?? 0);
  });
  const pieData = Object.entries(sectorMap).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (s: Stock) => {
    setEditing(s);
    setForm({
      market: s.market ?? "국내",
      broker: s.broker ?? "",
      sector: s.sector ?? "",
      stockName: s.stockName,
      ticker: s.ticker ?? "",
      avgBuyPrice: String(s.avgBuyPrice ?? ""),
      quantity: s.quantity ?? "",
      buyAmount: String(s.buyAmount ?? ""),
      currentPrice: String(s.currentPrice ?? ""),
      currentAmount: String(s.currentAmount ?? ""),
      returnRate: s.returnRate ?? "",
      snapshotMonth: s.snapshotMonth ?? new Date().toISOString().slice(0, 7),
      note: s.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      market: form.market || undefined,
      broker: form.broker || undefined,
      sector: form.sector || undefined,
      stockName: form.stockName,
      ticker: form.ticker || undefined,
      avgBuyPrice: form.avgBuyPrice ? Number(form.avgBuyPrice) : undefined,
      quantity: form.quantity || undefined,
      buyAmount: form.buyAmount ? Number(form.buyAmount) : undefined,
      currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
      currentAmount: form.currentAmount ? Number(form.currentAmount) : undefined,
      returnRate: form.returnRate || undefined,
      snapshotMonth: form.snapshotMonth || undefined,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>주식 포트폴리오</h1>
          <p className="text-sm text-muted-foreground mt-0.5">국내·해외 주식 종목 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 종목 추가
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">매수원금</p>
          <p className="text-xl font-bold">₩{formatAmount(totalBuy)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">평가금액</p>
          <p className="text-xl font-bold">₩{formatAmount(totalCurrent)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">수익률</p>
          <p className={`text-xl font-bold ${returnRateColor(totalReturn)}`}>{formatReturnRate(totalReturn)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["전체", "국내", "해외"].map(m => (
          <button key={m} onClick={() => setFilterMarket(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMarket === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">종목명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">시장</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">섹터</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">매수원금</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">평가금액</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">수익률</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">등록된 종목이 없습니다</td></tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{s.stockName}</p>
                          {s.ticker && <p className="text-xs text-muted-foreground">{s.ticker}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.market === "해외" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                          {s.market ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.sector ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right">₩{formatAmount(s.buyAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">₩{formatAmount(s.currentAmount)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${returnRateColor(s.returnRate)}`}>
                        {formatReturnRate(s.returnRate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(s as Stock)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMutation.mutate({ id: s.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
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
        </div>

        {/* Sector Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">섹터별 비중</h2>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "종목 수정" : "종목 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">종목명 *</Label>
                <Input value={form.stockName} onChange={e => setForm(f => ({ ...f, stockName: e.target.value }))} placeholder="예: 삼성전자" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">티커</Label>
                <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="예: 005930" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">시장</Label>
                <Select value={form.market} onValueChange={v => setForm(f => ({ ...f, market: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MARKETS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">증권사</Label>
                <Input value={form.broker} onChange={e => setForm(f => ({ ...f, broker: e.target.value }))} placeholder="예: 키움" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">섹터</Label>
                <Select value={form.sector} onValueChange={v => setForm(f => ({ ...f, sector: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">평균 매수가 (원)</Label>
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
                <Label className="text-xs">현재가 (원)</Label>
                <Input type="number" value={form.currentPrice} onChange={e => setForm(f => ({ ...f, currentPrice: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">평가금액 (원)</Label>
                <Input type="number" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">수익률 (%)</Label>
                <Input value={form.returnRate} onChange={e => setForm(f => ({ ...f, returnRate: e.target.value }))} placeholder="예: 12.5" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">스냅샷 월</Label>
                <Input type="month" value={form.snapshotMonth} onChange={e => setForm(f => ({ ...f, snapshotMonth: e.target.value }))} className="mt-1" />
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
