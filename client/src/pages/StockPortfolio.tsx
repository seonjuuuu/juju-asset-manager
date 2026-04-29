import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount, formatReturnRate, returnRateColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Loader2, TrendingUp, Search } from "lucide-react";
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
  const [tickerQuery, setTickerQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 검색어 디바운스 (400ms)
  const handleTickerSearch = () => {
    if (tickerQuery.trim().length >= 1) {
      setDebouncedQuery(tickerQuery.trim());
      setSearchOpen(true);
    }
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const utils = trpc.useUtils();
  const { data: stocks = [], isLoading } = trpc.stock.list.useQuery({});
  const { data: searchResults = [], isFetching: isSearching } = trpc.etfPrice.search.useQuery(
    { query: debouncedQuery, market: form.market },
    { enabled: debouncedQuery.length >= 1 }
  );

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
  // 수익률 + 현재금액 + 수량으로 매수원금·평균매수가 계산
  const calcBuySide = (returnRateStr: string, currentAmt: number, quantityStr: string) => {
    const qty = parseFloat(quantityStr);
    const rate = parseFloat(returnRateStr);
    if (!isNaN(qty) && qty > 0 && !isNaN(rate) && currentAmt > 0) {
      const buyAmount = Math.round(currentAmt / (1 + rate / 100));
      const avgBuyPrice = Math.round(buyAmount / qty);
      return { buyAmount, avgBuyPrice };
    }
    return { buyAmount: 0, avgBuyPrice: 0 };
  };

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

  // 단일 종목 현재가 조회 (해외는 USD→KRW 자동 환산)
  const handleFetchPrice = async () => {
    if (!form.ticker.trim()) {
      toast.error("종목코드(티커)를 입력해주세요");
      return;
    }
    setPriceFetching(true);
    const result = await fetchPrice(form.ticker.trim(), form.market);
    if (result) {
      let krwPrice = result.price;
      if (result.currency && result.currency !== "KRW") {
        try {
          const rateResult = await utils.exchangeRate.get.fetch({ currency: result.currency });
          krwPrice = Math.round(result.price * rateResult.rate);
        } catch {
          toast.error("환율 조회 실패");
          setPriceFetching(false);
          return;
        }
      }
      setForm(f => {
        const qty = parseFloat(f.quantity);
        const currentAmount = qty > 0 ? Math.round(krwPrice * qty) : krwPrice;
        const buySide = calcBuySide(f.returnRate, currentAmount, f.quantity);
        return {
          ...f,
          currentPrice: krwPrice,
          currentAmount,
          stockName: f.stockName || result.name,
          ...(buySide.buyAmount > 0 ? buySide : {}),
        };
      });
      setLastUpdated(new Date().toLocaleString("ko-KR"));
      toast.success(`현재가 조회 완료: ₩${krwPrice.toLocaleString("ko-KR")}`);
    } else {
      toast.error("현재가 조회 실패. 종목코드를 확인해주세요.");
    }
    setPriceFetching(false);
  };

  // 전체 종목 일괄 업데이트 (해외는 USD→KRW 자동 환산)
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
        let krwPrice = result.price;
        if (result.currency && result.currency !== "KRW") {
          try {
            const rateResult = await utils.exchangeRate.get.fetch({ currency: result.currency });
            krwPrice = Math.round(result.price * rateResult.rate);
          } catch {
            failCount++;
            continue;
          }
        }
        const qty = parseFloat(stock.quantity ?? "0");
        const currentAmount = qty > 0 ? Math.round(krwPrice * qty) : undefined;
        const buyAmount = stock.buyAmount ?? 0;
        const returnRate = buyAmount > 0 && currentAmount
          ? (((currentAmount - buyAmount) / buyAmount) * 100).toFixed(2)
          : stock.returnRate ?? undefined;
        await updateMutation.mutateAsync({
          id: stock.id,
          data: {
            currentPrice: krwPrice,
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

  const resetSearch = () => { setTickerQuery(""); setDebouncedQuery(""); setSearchOpen(false); };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    resetSearch();
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
    setTickerQuery(s.ticker ?? "");
    setSearchOpen(false);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">주식 포트폴리오</h1>
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
          <span className="ml-1">— 종목코드가 등록된 국내·해외 종목 모두 <strong>현재가 일괄 업데이트</strong>로 자동 조회합니다. 해외 종목은 달러 현재가를 실시간 환율로 원화 환산합니다.</span>
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
                        {s.currentPrice ? `₩${s.currentPrice.toLocaleString("ko-KR")}` : "-"}
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
            <div>
              <Label className="text-xs">시장</Label>
              <div className="flex mt-1 rounded-lg border border-border overflow-hidden">
                {(["국내", "해외"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, market: m }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.market === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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

            {/* 종목 검색 */}
            <div ref={searchRef} className="relative">
              <Label className="text-xs">종목 검색</Label>
              <div className="flex gap-1.5 mt-1">
                <Input
                  value={tickerQuery}
                  onChange={e => setTickerQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleTickerSearch(); } }}
                  placeholder="종목명 또는 티커 입력 (예: 삼성전자, AAPL)"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleTickerSearch} disabled={isSearching} className="shrink-0 px-3">
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                  {searchResults.map(r => (
                    <button
                      key={r.ticker}
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted transition-colors text-left"
                      onMouseDown={e => {
                        e.preventDefault();
                        setForm(f => ({ ...f, ticker: r.ticker, stockName: f.stockName || r.name }));
                        setTickerQuery(r.ticker);
                        setSearchOpen(false);
                      }}
                    >
                      <div>
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">{r.ticker}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${r.market === "국내" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                        {r.market}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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

            {/* 수익률 계산 카드 */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">수익률 계산</p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">수량</Label>
                  <Input
                    value={form.quantity}
                    onChange={e => {
                      const v = e.target.value;
                      const qty = parseFloat(v);
                      setForm(f => {
                        const currentAmount = f.currentPrice > 0 && !isNaN(qty) && qty > 0
                          ? Math.round(f.currentPrice * qty)
                          : f.currentAmount;
                        return { ...f, quantity: v, currentAmount, ...calcBuySide(f.returnRate, currentAmount, v) };
                      });
                    }}
                    placeholder="예: 10"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">현재 평가금액 (원)</Label>
                  <div className="flex gap-1.5 mt-1">
                    <CurrencyInput
                      value={form.currentAmount}
                      onChange={v => {
                        setForm(f => ({ ...f, currentAmount: v, currentPrice: 0, ...calcBuySide(f.returnRate, v, f.quantity) }));
                      }}
                      placeholder="직접 입력 또는 조회"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchPrice}
                      disabled={priceFetching || !form.ticker.trim()}
                      className="gap-1 shrink-0"
                    >
                      {priceFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      조회
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">수익률 (%)</Label>
                <Input
                  value={form.returnRate}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, returnRate: v, ...calcBuySide(v, f.currentAmount, f.quantity) }));
                  }}
                  placeholder="예: -10.5  (증권앱에서 확인한 수익률 입력)"
                  className="mt-1"
                />
              </div>

              {/* 계산 결과 */}
              {(form.avgBuyPrice > 0 || form.buyAmount > 0) && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                  <div className="bg-background rounded-lg px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">평균매수가</p>
                    <p className="text-base font-bold">₩{formatAmount(form.avgBuyPrice)}</p>
                  </div>
                  <div className="bg-background rounded-lg px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">매수원금</p>
                    <p className="text-base font-semibold">₩{formatAmount(form.buyAmount)}</p>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {form.market === "해외"
                  ? "티커 입력 후 조회 — 달러 현재가를 실시간 환율로 원화 환산"
                  : "티커 입력 후 조회로 현재 평가금액 자동 계산"}
              </p>
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
