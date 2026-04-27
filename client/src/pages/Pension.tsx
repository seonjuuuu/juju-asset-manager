import { CurrencyInput } from "@/components/ui/currency-input";
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

const PENSION_TYPES = ["개인연금(연금저축펀드)", "개인연금(연금저축보험)", "퇴직연금(DC)", "퇴직연금(DB)", "퇴직연금(IRP)"];
const ASSET_TYPES = ["ETF", "펀드", "예금", "채권", "기타"];

const EMPTY_FORM = {
  pensionType: "개인연금(연금저축펀드)", company: "", assetType: "ETF",
  stockName: "", ticker: "", market: "KR" as "KR" | "US",
  avgBuyPrice: 0, quantity: "",
  buyAmount: 0, currentPrice: 0, currentAmount: 0, returnRate: "", note: "",
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

// ETF 현재가 조회 훅
function useEtfPrice() {
  const utils = trpc.useUtils();
  const [fetchingTicker, setFetchingTicker] = useState<string | null>(null);

  const fetchPrice = useCallback(async (ticker: string, market: "KR" | "US") => {
    if (!ticker.trim()) return null;
    setFetchingTicker(ticker);
    try {
      const result = await utils.etfPrice.getPrice.fetch({ ticker: ticker.trim(), market });
      return result;
    } catch {
      return null;
    } finally {
      setFetchingTicker(null);
    }
  }, [utils]);

  return { fetchPrice, fetchingTicker };
}

export default function Pension() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PensionAsset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [etfFetching, setEtfFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // 전체 일괄 업데이트 진행 상태
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const utils = trpc.useUtils();
  const { data: assets = [], isLoading } = trpc.pension.list.useQuery();
  const { fetchPrice } = useEtfPrice();

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
      market: "KR",
      avgBuyPrice: a.avgBuyPrice ?? 0,
      quantity: a.quantity ?? "",
      buyAmount: a.buyAmount ?? 0,
      currentPrice: a.currentPrice ?? 0,
      currentAmount: a.currentAmount ?? 0,
      returnRate: a.returnRate ?? "",
      note: a.note ?? "",
    });
    setDialogOpen(true);
  };

  // ETF일 때 종목코드 + 수량 + 매수가 변경 시 자동 계산 (현재가는 버튼으로만)
  useEffect(() => {
    if (form.assetType !== "ETF") return;
    const qty = parseFloat(form.quantity);
    const currentPrice = typeof form.currentPrice === 'number' ? form.currentPrice : parseFloat(String(form.currentPrice));
    const avgBuy = typeof form.avgBuyPrice === 'number' ? form.avgBuyPrice : parseFloat(String(form.avgBuyPrice));
    if (!isNaN(qty) && !isNaN(currentPrice) && qty > 0 && currentPrice > 0) {
      const currentAmount = Math.round(currentPrice * qty);
      const buyAmount = !isNaN(avgBuy) && avgBuy > 0 ? Math.round(avgBuy * qty) : (typeof form.buyAmount === 'number' ? form.buyAmount : parseFloat(String(form.buyAmount))) || 0;
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

  // ETF 현재가 조회 버튼 핸들러
  const handleFetchEtfPrice = async () => {
    if (!form.ticker.trim()) {
      toast.error("종목코드를 입력해주세요");
      return;
    }
    setEtfFetching(true);
    const result = await fetchPrice(form.ticker.trim(), form.market);
    setEtfFetching(false);
    if (result) {
      setForm(f => ({ ...f, currentPrice: result.price, stockName: f.stockName || result.name }));
      toast.success(`현재가 조회 완료: ₩${result.price.toLocaleString("ko-KR")}`);
    } else {
      toast.error("현재가 조회 실패. 종목코드를 확인해주세요.");
    }
  };

  // 전체 ETF 일괄 현재가 업데이트
  const handleBulkUpdate = async () => {
    const etfAssets = assets.filter(a => a.assetType === "ETF" && a.ticker);
    if (etfAssets.length === 0) {
      toast.info("업데이트할 ETF 종목이 없습니다");
      return;
    }
    setBulkUpdating(true);
    let successCount = 0;
    let failCount = 0;
    for (const asset of etfAssets) {
      const result = await fetchPrice(asset.ticker!, "KR");
      if (result) {
        const qty = parseFloat(asset.quantity ?? "0");
        const currentAmount = qty > 0 ? Math.round(result.price * qty) : undefined;
        const buyAmount = asset.buyAmount ?? 0;
        const returnRate = buyAmount > 0 && currentAmount
          ? (((currentAmount - buyAmount) / buyAmount) * 100).toFixed(2)
          : asset.returnRate ?? undefined;
        await updateMutation.mutateAsync({
          id: asset.id,
          data: {
            currentPrice: result.price,
            currentAmount: currentAmount ?? asset.currentAmount ?? undefined,
            returnRate,
          },
        }).then(() => successCount++).catch(() => failCount++);
      } else {
        failCount++;
      }
    }
    setBulkUpdating(false);
    setLastUpdated(new Date().toLocaleString("ko-KR"));
    utils.pension.list.invalidate();
    if (successCount > 0) toast.success(`${successCount}개 종목 현재가 업데이트 완료`);
    if (failCount > 0) toast.error(`${failCount}개 종목 업데이트 실패`);
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

  const isETF = form.assetType === "ETF";

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>연금 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">개인연금·퇴직연금 종목 관리</p>
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
            ETF 현재가 일괄 업데이트
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> 종목 추가
          </Button>
        </div>
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

      {/* ETF 자동 업데이트 안내 */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
        <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">ETF 자동 현재가 조회</span>
          <span className="ml-1">— ETF 구분 종목에 종목코드를 입력하면 Yahoo Finance에서 실시간 현재가를 조회합니다. 종목코드는 한국 ETF의 경우 숫자 코드(예: 360750), 해외 ETF는 티커(예: QQQ)를 입력하세요.</span>
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
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">종목코드</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">운용사</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">수량</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">현재가</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">매수원금</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">평가금액</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">수익률</th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(a => (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex items-center gap-1.5">
                          {a.stockName ?? "-"}
                          {a.assetType === "ETF" && a.ticker && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">ETF</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.assetType ?? "-"}</td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{a.ticker ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.company ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{a.quantity ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {a.currentPrice ? `₩${a.currentPrice.toLocaleString("ko-KR")}` : "-"}
                      </td>
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
                <Input value={form.stockName} onChange={e => setForm(f => ({ ...f, stockName: e.target.value }))} placeholder="예: TIGER 미국S&P500" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">운용사</Label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="예: 미래에셋" className="mt-1" />
              </div>
            </div>

            {/* ETF 전용: 종목코드 + 현재가 자동 조회 */}
            {isETF && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  ETF 자동 현재가 조회
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">종목코드</Label>
                    <Input
                      value={form.ticker}
                      onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
                      placeholder="예: 360750 또는 QQQ"
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">시장</Label>
                    <Select value={form.market} onValueChange={v => setForm(f => ({ ...f, market: v as "KR" | "US" }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KR">한국 (KR)</SelectItem>
                        <SelectItem value="US">해외 (US)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">현재가 (자동 조회)</Label>
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
                    onClick={handleFetchEtfPrice}
                    disabled={etfFetching}
                  >
                    {etfFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    조회
                  </Button>
                </div>
                {form.currentPrice && form.quantity && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    ✓ 수량 입력 시 평가금액·수익률이 자동 계산됩니다
                  </p>
                )}
              </div>
            )}

            {/* 비ETF 종목코드 */}
            {!isETF && (
              <div>
                <Label className="text-xs">종목코드 (선택)</Label>
                <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="선택 입력" className="mt-1 font-mono" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">평균 매수가</Label>
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
                  placeholder={isETF ? "매수가×수량 자동 계산" : "0"}
                  className="mt-1"
                  disabled={isETF && !!form.avgBuyPrice && !!form.quantity}
                />
              </div>
              <div>
                <Label className="text-xs">평가금액 (원)</Label>
                <CurrencyInput
                  value={form.currentAmount}
                  onChange={(v) => setForm(f => ({ ...f, currentAmount: v }))}
                  placeholder={isETF ? "현재가×수량 자동 계산" : "0"}
                  className="mt-1"
                  disabled={isETF && !!form.currentPrice && !!form.quantity}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">수익률 (%)</Label>
                <Input
                  value={form.returnRate}
                  onChange={e => setForm(f => ({ ...f, returnRate: e.target.value }))}
                  placeholder={isETF ? "자동 계산" : "예: 12.5"}
                  className="mt-1"
                  readOnly={isETF && !!form.buyAmount && !!form.currentAmount}
                />
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
