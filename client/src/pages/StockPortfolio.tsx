import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount, formatReturnRate, returnRateColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#5b7cfa", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b", "#6c5ce7", "#fd79a8", "#00b894"];
const SECTORS = ["IT", "금융", "헬스케어", "소비재", "에너지", "산업재", "ETF", "기타"];

const EMPTY_FORM = {
  market: "국내" as "국내" | "해외",
  broker: "", sector: "", stockName: "", ticker: "",
  avgBuyPrice: 0, quantity: "", buyAmount: 0,
  currentPrice: 0, currentAmount: 0, returnRate: "",
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
  const [priceFetching, setPriceFetching] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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

  // 현재가 변경 시 평가금액·수익률 자동 계산
  useEffect(() => {
    const qty = parseFloat(form.quantity);
    const currentPrice = typeof form.currentPrice === "number" ? form.currentPrice : parseFloat(String(form.currentPrice));
    const avgBuy = typeof form.avgBuyPrice === "number" ? form.avgBuyPrice : parseFloat(String(form.avgBuyPrice));
    if (!isNaN(qty) && !isNaN(currentPrice) && qty > 0 && currentPrice > 0) {
      const currentAmount = Math.round(currentPrice * qty);
      const buyAmount = !isNaN(avgBuy) && avgBuy > 0 ? Math.round(avgBuy * qty) : (typeof form.buyAmount === "number" ? form.buyAmount : parseFloat(String(form.buyAmount))) || 0;
      const returnRate = buyAmount > 0 ? (((currentAmount - buyAmount) / buyAmount) * 100).toFixed(2) : "";
      setForm(f => ({
        ...f,
        currentAmount: currentAmount,
        buyAmount: !isNaN(avgBuy) && avgBuy > 0 ? Math.round(avgBuy * qty) : f.buyAmount,
        returnRate,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.currentPrice, form.quantity, form.avgBuyPrice]);

  // 현재가 조회 함수
  const fetchPrice = useCallback(async (ticker: string, market: "국내" | "해외") => {
    const apiMarket = market === "해외" ? "US" : "KR";
    try {
      const result = await utils.etfPrice.getPrice.fetch({ ticker: ticker.trim(), market: apiMarket });
      return result;
    } catch {
      return null;
    }
  }, [utils]);

  // 단일 종목 현재가 조회
  const handleFetchPrice = async () => {
    if (!form.ticker.trim()) {
      toast.error("종목코드(티커)를 입력해주세요");
      return;
    }
    setPriceFetching(true);
    const result = await fetchPrice(form.ticker.trim(), form.market);
    setPriceFetching(false);
    if (result) {
      setForm(f => ({
        ...f,
        currentPrice: result.price,
        stockName: f.stockName || result.name,
      }));
      setLastUpdated(new Date().toLocaleString("ko-KR"));
      toast.success(`현재가 조회 완료: ${form.market === "해외" ? "$" : "₩"}${result.price.toLocaleString("ko-KR")}`);
    } else {
      toast.error("현재가 조회 실패. 종목코드를 확인해주세요.");
    }
  };

  // 전체 종목 일괄 업데이트
  const handleBulkUpdate = async () => {
    const tickerStocks = stocks.filter(s => s.ticker);
    if (tickerStocks.length === 0) {
      toast.info("종목코드가 등록된 종목이 없습니다");
      return;
    }
    setBulkUpdating(true);
    let successCount = 0;
    let failCount = 0;
    for (const stock of tickerStocks) {
      const market = stock.market === "해외" ? "해외" : "국내";
      const result = await fetchPrice(stock.ticker!, market as "국내" | "해외");
      if (result) {
        const qty = parseFloat(stock.quantity ?? "0");
        const currentAmount = qty > 0 ? Math.round(result.price * qty) : undefined;
        const buyAmount = stock.buyAmount ?? 0;
        const returnRate = buyAmount > 0 && currentAmount
          ? (((currentAmount - buyAmount) / buyAmount) * 100).toFixed(2)
          : stock.returnRate ?? undefined;
        await updateMutation.mutateAsync({
          id: stock.id,
          data: {
            currentPrice: result.price,
            currentAmount: currentAmount ?? stock.currentAmount ?? undefined,
            returnRate,
          },
        }).then(() => successCount++).catch(() => failCount++);
      } else {
        failCount++;
      }
    }
    setBulkUpdating(false);
    setLastUpdated(new Date().toLocaleString("ko-KR"));
    utils.stock.list.invalidate();
    if (successCount > 0) toast.success(`${successCount}개 종목 현재가 업데이트 완료`);
    if (failCount > 0) toast.error(`${failCount}개 종목 업데이트 실패`);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (s: Stock) => {
    setEditing(s);
    setForm({
      market: (s.market ?? "국내") as "국내" | "해외",
      broker: s.broker ?? "",
      sector: s.sector ?? "",
      stockName: s.stockName,
      ticker: s.ticker ?? "",
      avgBuyPrice: s.avgBuyPrice ?? 0,
      quantity: s.quantity ?? "",
      buyAmount: s.buyAmount ?? 0,
      currentPrice: s.currentPrice ?? 0,
      currentAmount: s.currentAmount ?? 0,
      returnRate: s.returnRate ?? "",
      snapshotMonth: s.snapshotMonth ?? new Date().toISOString().slice(0, 7),
      note: s.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.stockName.trim()) { toast.error("종목명을 입력해주세요"); return; }
    const data = {
      market: form.market || undefined,
      broker: form.broker || undefined,
      sector: form.sector || undefined,
      stockName: form.stockName,
      ticker: form.ticker || undefined,
      avgBuyPrice: form.avgBuyPrice || undefined,
      quantity: form.quantity || undefined,
      buyAmount: form.buyAmount || undefined,
      currentPrice: form.currentPrice || undefined,
      currentAmount: form.currentAmount || undefined,
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
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">업데이트: {lastUpdated}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkUpdate}
            disabled={bulkUpdating}
            className="gap-1.5"
          >
            {bulkUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            현재가 일괄 업데이트
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> 종목 추가
          </Button>
        </div>
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

      {/* 자동 조회 안내 */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
        <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">현재가 자동 조회</span>
          <span className="ml-1">— 종목코드(티커)가 등록된 종목은 상단 <strong>현재가 일괄 업데이트</strong> 버튼으로 한 번에 업데이트할 수 있습니다. 한국 주식은 숫자 코드(예: 005930), 해외 주식은 티커(예: AAPL, QQQ)를 입력하세요.</span>
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
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">종목명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">시장</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">섹터</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">현재가</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">매수원금</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">평가금액</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">수익률</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">등록된 종목이 없습니다</td></tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            {s.stockName}
                            {s.ticker && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono">{s.ticker}</Badge>
                            )}
                          </p>
                          {s.broker && <p className="text-xs text-muted-foreground">{s.broker}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.market === "해외" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                          {s.market ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.sector ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {s.currentPrice ? `${s.market === "해외" ? "$" : "₩"}${s.currentPrice.toLocaleString("ko-KR")}` : "-"}
                      </td>
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">시장</Label>
                <Select value={form.market} onValueChange={v => setForm(f => ({ ...f, market: v as "국내" | "해외" }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="국내">국내</SelectItem>
                    <SelectItem value="해외">해외</SelectItem>
                  </SelectContent>
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
                <Label className="text-xs">종목명 *</Label>
                <Input value={form.stockName} onChange={e => setForm(f => ({ ...f, stockName: e.target.value }))} placeholder="예: 삼성전자" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">종목코드 (티커)</Label>
                <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder={form.market === "해외" ? "예: AAPL" : "예: 005930"} className="mt-1 font-mono" />
              </div>
            </div>

            {/* 현재가 자동 조회 섹션 */}
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                현재가 자동 조회
                <span className="font-normal ml-1 text-blue-500">
                  — {form.market === "해외" ? "해외 티커(AAPL, QQQ 등)" : "한국 종목코드(005930 등)"}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs">현재가</Label>
                  <CurrencyInput
                    value={form.currentPrice}
                    onChange={(v) => setForm(f => ({ ...f, currentPrice: v }))}
                    placeholder="조회 버튼 클릭 또는 직접 입력"
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-5 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                  onClick={handleFetchPrice}
                  disabled={priceFetching || !form.ticker.trim()}
                >
                  {priceFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  조회
                </Button>
              </div>
              {form.currentPrice && form.quantity && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  ✓ 수량 입력 시 평가금액·수익률이 자동 계산됩니다
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">평균 매수가 (원)</Label>
                <CurrencyInput value={form.avgBuyPrice} onChange={(v) => setForm(f => ({ ...f, avgBuyPrice: v }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">수량</Label>
                <Input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">매수원금 (원)</Label>
                <CurrencyInput
                  value={form.buyAmount}
                  onChange={(v) => setForm(f => ({ ...f, buyAmount: v }))}
                  placeholder="매수가×수량 자동 계산"
                  className="mt-1"
                  disabled={!!form.avgBuyPrice && !!form.quantity}
                />
              </div>
              <div>
                <Label className="text-xs">평가금액 (원)</Label>
                <CurrencyInput
                  value={form.currentAmount}
                  onChange={(v) => setForm(f => ({ ...f, currentAmount: v }))}
                  placeholder="현재가×수량 자동 계산"
                  className="mt-1"
                  disabled={!!form.currentPrice && !!form.quantity}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">수익률 (%)</Label>
                <Input
                  value={form.returnRate}
                  onChange={e => setForm(f => ({ ...f, returnRate: e.target.value }))}
                  placeholder="자동 계산"
                  className="mt-1"
                  readOnly={!!form.buyAmount && !!form.currentAmount}
                />
              </div>
              <div>
                <Label className="text-xs">스냅샷 월</Label>
                <Input type="month" value={form.snapshotMonth} onChange={e => setForm(f => ({ ...f, snapshotMonth: e.target.value }))} className="mt-1" />
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
