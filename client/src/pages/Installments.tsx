import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, CheckCircle2, Clock, TrendingDown, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface Installment {
  id: number;
  name: string;
  cardId: number | null;
  totalAmount: number;
  months: number;
  startDate: string;
  endDate: string;
  isInterestFree: boolean;
  interestRate: string | null;
  categoryId: number | null;
  subCategoryId: number | null;
  note: string | null;
}

interface Card {
  id: number;
  cardCompany: string;
  cardName: string | null;
  paymentDate: string | null;
}

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────
function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

/** 할부 종료일 계산:
 * 구매일 기준으로 다음달 카드결제일부터 N회 청구됨.
 * 예: 구매일 2/2, 카드결제일 14일, 3개월 → 3/14, 4/14, 5/14 → endDate = 5/14
 * endDate = (구매월 + months)월의 카드결제일
 */
function calcEndDate(purchaseDate: string, months: number, paymentDay?: number | null): string {
  if (!purchaseDate || !months) return "";
  const [y, m, d] = purchaseDate.split("-").map(Number);
  // 마지막 청구월 = 구매월 + months (다음달부터 시작하므로 +1, 마지막은 +months)
  const endMonth = m + months;
  const endYear = y + Math.floor((endMonth - 1) / 12);
  const endMonthNorm = ((endMonth - 1) % 12) + 1;
  // 카드 결제일이 있으면 그 날짜로, 없으면 구매일의 일(day)로
  const endDay = paymentDay ?? d;
  const mm = String(endMonthNorm).padStart(2, "0");
  const dd = String(Math.min(endDay, 28)).padStart(2, "0"); // 월말 안전처리
  return `${endYear}-${mm}-${dd}`;
}

/** 주어진 연/월에 할부 청구가 발생하는지 확인 (첫 청구 = 구매월 +1) */
function isActiveInMonth(inst: { startDate: string; months: number; endDate: string; paymentDay?: number | null }, y: number, m: number): boolean {
  if (!inst.startDate || !inst.months) return false;
  const [py, pm] = inst.startDate.split("-").map(Number);
  // 첫 청구 월 = 구매월 + 1
  const firstBillingAbsolute = py * 12 + pm + 1;
  const lastBillingAbsolute = py * 12 + pm + inst.months;
  const targetAbsolute = y * 12 + m;
  return targetAbsolute >= firstBillingAbsolute && targetAbsolute <= lastBillingAbsolute;
}

/** 할부 완료 여부 */
function isCompleted(endDate: string): boolean {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
}

/** 현재 진행 회차 */
/** 실제 납부 완료된 회차 수 (진행바 전용) */
function completedPaymentCount(purchaseDate: string, months: number, paymentDay?: number | null): number {
  if (!purchaseDate) return 0;
  const [py, pm] = purchaseDate.split("-").map(Number);
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  const nowD = now.getDate();
  const firstPayDay = paymentDay ?? 1;
  let completed = 0;
  for (let k = 1; k <= months; k++) {
    const payMonth = pm + k;
    const payYear = py + Math.floor((payMonth - 1) / 12);
    const payMonthNorm = ((payMonth - 1) % 12) + 1;
    const payDay = Math.min(firstPayDay, 28);
    if (payYear < nowY || (payYear === nowY && payMonthNorm < nowM) ||
        (payYear === nowY && payMonthNorm === nowM && payDay <= nowD)) {
      completed = k;
    } else {
      break;
    }
  }
  return completed;
}

/** 현재 진행 회차: 납부완료 + 1 (이번달 청구 포함, 최소 1회차 표시) */
function currentInstallmentNo(purchaseDate: string, months: number, paymentDay?: number | null): number {
  const completed = completedPaymentCount(purchaseDate, months, paymentDay);
  return Math.max(1, Math.min(completed + (completed < months ? 1 : 0), months));
}

/** 월 할부금 계산 (무이자: totalAmount/months, 유이자: 원리금균등) */
function monthlyPayment(totalAmount: number, months: number, isInterestFree: boolean, interestRate: string | null): number {
  if (!totalAmount || !months) return 0;
  if (isInterestFree || !interestRate || parseFloat(interestRate) === 0) {
    return Math.round(totalAmount / months);
  }
  const r = parseFloat(interestRate) / 100 / 12;
  if (r === 0) return Math.round(totalAmount / months);
  const payment = (totalAmount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(payment);
}

// ─── 다이얼로그 폼 ────────────────────────────────────────────────────────────
const defaultForm = {
  name: "",
  cardId: "" as string,
  totalAmount: 0,
  months: 3,
  startDate: "",
  endDate: "",
  isInterestFree: true,
  interestRate: "",
  categoryId: "" as string,
  subCategoryId: "" as string,
  note: "",
};

function InstallmentDialog({
  open,
  onClose,
  editing,
  cards,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: Installment | null;
  cards: Card[];
  onSave: (data: typeof defaultForm) => void;
}) {
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name,
          cardId: editing.cardId ? String(editing.cardId) : "",
          totalAmount: editing.totalAmount,
          months: editing.months,
          startDate: editing.startDate,
          endDate: editing.endDate,
          isInterestFree: editing.isInterestFree,
          interestRate: editing.interestRate ?? "",
          categoryId: editing.categoryId ? String(editing.categoryId) : "",
          subCategoryId: editing.subCategoryId ? String(editing.subCategoryId) : "",
          note: editing.note ?? "",
        }
      : { ...defaultForm }
  );

  const selectedCard = cards.find((c) => String(c.id) === form.cardId);
  const paymentDay = selectedCard?.paymentDate
    ? parseInt(selectedCard.paymentDate.replace(/[^0-9]/g, ""))
    : null;

  // 선택된 대분류의 중분류 목록
  const subCategories = form.categoryId
    ? (categoryList.find((c) => String(c.id) === form.categoryId)?.subCategories ?? [])
    : [];

  function handleStartOrMonthsChange(newStart: string, newMonths: number) {
    const end = calcEndDate(newStart, newMonths, paymentDay);
    setForm((f) => ({ ...f, startDate: newStart, months: newMonths, endDate: end }));
  }

  function handleCardChange(cardId: string) {
    const card = cards.find((c) => String(c.id) === cardId);
    const day = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, "")) : null;
    const end = calcEndDate(form.startDate, form.months, day);
    setForm((f) => ({ ...f, cardId, endDate: end }));
  }

  function handleCategoryChange(categoryId: string) {
    setForm((f) => ({ ...f, categoryId, subCategoryId: "" }));
  }

  const monthly = monthlyPayment(form.totalAmount, form.months, form.isInterestFree, form.interestRate);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "할부 수정" : "할부 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* 할부명 */}
          <div className="space-y-1">
            <Label>할부명 *</Label>
            <Input
              placeholder="예: 맥북 프로 할부"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          {/* 대분류 / 중분류 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>대분류</Label>
              <Select value={form.categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="대분류 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {categoryList.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>중분류</Label>
              <Select
                value={form.subCategoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, subCategoryId: v }))}
                disabled={!form.categoryId || form.categoryId === "none"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="중분류 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {subCategories.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 결제 카드 */}
          <div className="space-y-1">
            <Label>결제 카드</Label>
            <Select value={form.cardId} onValueChange={handleCardChange}>
              <SelectTrigger>
                <SelectValue placeholder="카드 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">카드 없음</SelectItem>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.cardCompany} {c.cardName ?? ""}
                    {c.paymentDate ? ` (매월 ${c.paymentDate}일)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* 할부 금액 */}
          <div className="space-y-1">
            <Label>할부 총금액 *</Label>
            <CurrencyInput
              value={form.totalAmount}
              onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))}
              placeholder="할부 총금액 입력"
            />
          </div>
          {/* 할부 개월수 */}
          <div className="space-y-1">
            <Label>할부 개월수 *</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={form.months}
              onChange={(e) => handleStartOrMonthsChange(form.startDate, parseInt(e.target.value) || 1)}
              placeholder="예: 12"
            />
          </div>
          {/* 시작일 */}
          <div className="space-y-1">
            <Label>카드 결제일 (구매일) *</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => handleStartOrMonthsChange(e.target.value, form.months)}
            />
          </div>
          {/* 종료일 */}
          <div className="space-y-1">
            <Label>
              할부 종료일{" "}
              <span className="text-xs text-muted-foreground">(자동 계산, 수정 가능)</span>
            </Label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
          {/* 무이자/유이자 토글 */}
          <div className="flex items-center gap-3">
            <Label>무이자</Label>
            <Switch
              checked={!form.isInterestFree}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isInterestFree: !v, interestRate: v ? f.interestRate : "" }))}
            />
            <Label>유이자</Label>
          </div>
          {/* 유이자 수수료 */}
          {!form.isInterestFree && (
            <div className="space-y-1">
              <Label>할부 수수료율 (연 %)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.interestRate}
                onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                placeholder="예: 15.9"
              />
            </div>
          )}
          {/* 메모 */}
          <div className="space-y-1">
            <Label>메모</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="메모 (선택사항)"
            />
          </div>
          {/* 월 할부금 미리보기 */}
          {form.totalAmount > 0 && form.months > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">월 할부금: </span>
              <span className="font-semibold text-primary">{formatKRW(monthly)}</span>
              <span className="text-muted-foreground ml-2">× {form.months}개월</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!form.name.trim()) { toast.error("할부명을 입력하세요"); return; }
              if (!form.startDate) { toast.error("카드 결제일(구매일)을 입력하세요"); return; }
              if (!form.endDate) { toast.error("종료일을 입력하세요"); return; }
              onSave(form);
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
const CARD_COLORS = ["#5b7cfa", "#f97316", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444"];

export default function Installments() {
  const utils = trpc.useUtils();
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const selectedDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth() + 1;

  const createMutation = trpc.installment.create.useMutation({
    onSuccess: () => { utils.installment.list.invalidate(); toast.success("할부가 추가되었습니다"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.installment.update.useMutation({
    onSuccess: () => { utils.installment.list.invalidate(); toast.success("할부가 수정되었습니다"); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.installment.delete.useMutation({
    onSuccess: () => { utils.installment.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  function handleSave(form: typeof defaultForm) {
    const payload = {
      name: form.name,
      cardId: form.cardId && form.cardId !== "none" ? parseInt(form.cardId) : null,
      totalAmount: form.totalAmount,
      months: form.months,
      startDate: form.startDate,
      endDate: form.endDate,
      isInterestFree: form.isInterestFree,
      interestRate: form.interestRate || "0",
      categoryId: form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null,
      subCategoryId: form.subCategoryId && form.subCategoryId !== "none" ? parseInt(form.subCategoryId) : null,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // 카드 이름 조회 헬퍼
  function getCardName(cardId: number | null) {
    if (!cardId) return null;
    const c = cardList.find((c) => c.id === cardId);
    return c ? `${c.cardCompany} ${c.cardName ?? ""}`.trim() : null;
  }

  // 진행중 / 완료 분류
  const activeInstallments = installmentList.filter((i) => !isCompleted(i.endDate));
  const completedInstallments = installmentList.filter((i) => isCompleted(i.endDate));

  // 선택 월에 청구되는 할부 목록
  const selectedMonthInstallments = useMemo(() => {
    return installmentList.filter((i) => isActiveInMonth(i, selectedYear, selectedMonth));
  }, [installmentList, selectedYear, selectedMonth]);

  // 선택 월 총 할부금
  const selectedMonthTotal = useMemo(() => {
    return selectedMonthInstallments.reduce((sum, i) => {
      return sum + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate);
    }, 0);
  }, [selectedMonthInstallments]);

  // 카드별 선택 월 할부 합계
  const cardSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of selectedMonthInstallments) {
      const key = i.cardId ? getCardName(i.cardId) ?? "카드 미지정" : "카드 미지정";
      map[key] = (map[key] ?? 0) + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate);
    }
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [selectedMonthInstallments, cardList]);

  // 최근 1년 월별 총 할부금 차트
  const pastYearChart = useMemo(() => {
    const result: { month: string; total: number }[] = [];
    for (let i = -11; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const label = `${String(m).padStart(2, "0")}월`;
      const total = installmentList
        .filter((inst) => isActiveInMonth(inst, y, m))
        .reduce((sum, inst) => sum + monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate), 0);
      result.push({ month: label, total });
    }
    return result;
  }, [installmentList]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">대출 / 할부</h1>
          <p className="text-muted-foreground text-sm mt-1">카드 할부 현황을 관리합니다</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> 할부 추가
        </Button>
      </div>

      {/* 최근 1년 할부 현황 차트 */}
      {installmentList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">최근 1년 할부 총액</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pastYearChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v))}
                  tick={{ fontSize: 11 }}
                  width={40}
                />
                <Tooltip
                  formatter={(value: number) => [formatKRW(value), "총 할부금"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="total" fill="#5b7cfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 월 네비게이터 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-semibold w-28 text-center">
          {selectedYear}년 {String(selectedMonth).padStart(2, "0")}월
        </span>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><TrendingDown className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">이달 총 할부금</p>
                <p className="text-xl font-bold text-foreground">{formatKRW(selectedMonthTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Layers className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">이달 청구 건수</p>
                <p className="text-xl font-bold text-foreground">{selectedMonthInstallments.length}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">완료된 할부</p>
                <p className="text-xl font-bold text-foreground">{completedInstallments.length}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 카드별 이달 할부 합계 */}
      {cardSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">카드별 이달 할부금</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {cardSummary.map((s, idx) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2"
                  style={{ borderColor: CARD_COLORS[idx % CARD_COLORS.length] + "60" }}
                >
                  <CreditCard
                    className="w-4 h-4"
                    style={{ color: CARD_COLORS[idx % CARD_COLORS.length] }}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-sm font-bold" style={{ color: CARD_COLORS[idx % CARD_COLORS.length] }}>
                    {formatKRW(s.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 이달 청구 할부 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {selectedYear}년 {String(selectedMonth).padStart(2, "0")}월 청구 목록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedMonthInstallments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">이달 청구되는 할부가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {selectedMonthInstallments.map((inst) => {
                const monthly = monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
                const cardName = getCardName(inst.cardId);
                const [py, pm] = inst.startDate.split("-").map(Number);
                const instNo = (selectedYear * 12 + selectedMonth) - (py * 12 + pm);
                return (
                  <div key={inst.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{inst.name}</p>
                        {cardName && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CreditCard className="w-3 h-3" /> {cardName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{instNo}/{inst.months}회차</span>
                      <span className="font-bold text-primary text-sm">{formatKRW(monthly)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 진행중 할부 목록 */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" /> 진행중 할부
        </h2>
        {activeInstallments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              진행중인 할부가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeInstallments.map((inst) => {
              const monthly = monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
              const instCard = cardList?.find((c: {id: number}) => c.id === inst.cardId) as {paymentDate?: string} | undefined;
              const instPayDay = instCard?.paymentDate ? parseInt(instCard.paymentDate.replace(/[^0-9]/g, "")) : null;
              const currentNo = currentInstallmentNo(inst.startDate, inst.months, instPayDay);
              const completedNo = completedPaymentCount(inst.startDate, inst.months, instPayDay);
              const remaining = inst.months - currentNo;
              const cardName = getCardName(inst.cardId);
              const progress = Math.round((completedNo / inst.months) * 100);
              return (
                <Card key={inst.id} className="relative overflow-hidden">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-base">{inst.name}</p>
                        {cardName && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CreditCard className="w-3 h-3" /> {cardName}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Badge variant={inst.isInterestFree ? "secondary" : "destructive"} className="text-xs">
                          {inst.isInterestFree ? "무이자" : `유이자 ${inst.interestRate}%`}
                        </Badge>
                      </div>
                    </div>
                    {/* 금액 정보 */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">월 할부금</p>
                        <p className="font-bold text-primary">{formatKRW(monthly)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">총 할부금액</p>
                        <p className="font-semibold">{formatKRW(inst.totalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">진행 회차</p>
                        <p className="font-semibold">{currentNo} / {inst.months}회</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">남은 회차</p>
                        <p className="font-semibold">{remaining}회</p>
                      </div>
                    </div>
                    {/* 진행바 */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>구매일: {inst.startDate}</span>
                        <span>{inst.endDate}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right mt-0.5">{progress}% 완료</p>
                    </div>
                    {inst.note && <p className="text-xs text-muted-foreground">{inst.note}</p>}
                    {/* 액션 버튼 */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setEditing(inst as Installment); setDialogOpen(true); }}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> 수정
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(inst.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 완료된 할부 목록 */}
      {completedInstallments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="w-5 h-5" /> 완료된 할부
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {completedInstallments.map((inst) => {
              const cardName = getCardName(inst.cardId);
              return (
                <Card key={inst.id} className="opacity-60">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{inst.name}</p>
                        {cardName && (
                          <p className="text-xs text-muted-foreground">{cardName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">완료</Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{formatKRW(inst.totalAmount)} / {inst.months}개월</span>
                      <span>구매일 {inst.startDate} ~ {inst.endDate}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => { setEditing(inst as Installment); setDialogOpen(true); }}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> 수정
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive text-xs"
                        onClick={() => setDeleteId(inst.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 추가/수정 다이얼로그 */}
      {dialogOpen && (
        <InstallmentDialog
          key={editing ? `edit-${editing.id}` : "new"}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          editing={editing}
          cards={cardList as Card[]}
          onSave={handleSave}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>할부 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 할부 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
