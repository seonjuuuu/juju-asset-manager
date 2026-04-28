import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, ChevronLeft, ChevronRight, ChevronDown, TrendingDown, Layers } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatAmount } from "@/lib/utils";

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
  earlyRepaymentAmount: number | null;
  earlyRepaymentDate: string | null;
}

interface Card {
  id: number;
  cardCompany: string;
  cardName: string | null;
  paymentDate: string | null;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
/**
 * 할부 종료일 계산: 구매 다음달부터 N회 청구 → 종료월 = 구매월 + months
 * 종료일의 '일'은 카드 결제일 기준, 없으면 구매일 기준
 * 예) 구매 3/20, 결제일 14일, 3개월 → 4/14·5/14·6/14 → 종료 6/14
 */
function calcEndDate(purchaseDate: string, months: number, paymentDay?: number | null): string {
  if (!purchaseDate || !months) return "";
  const [y, m, d] = purchaseDate.split("-").map(Number);
  const endMonthRaw = m + months;
  const endYear = y + Math.floor((endMonthRaw - 1) / 12);
  const endMonthNorm = ((endMonthRaw - 1) % 12) + 1;
  const endDay = paymentDay ?? d;
  return `${endYear}-${String(endMonthNorm).padStart(2, "0")}-${String(Math.min(endDay, 28)).padStart(2, "0")}`;
}

function isActiveInMonth(inst: { startDate: string; endDate: string }, y: number, m: number): boolean {
  if (!inst.startDate || !inst.endDate) return false;
  const [py, pm] = inst.startDate.split("-").map(Number);
  const [ey, em] = inst.endDate.split("-").map(Number);
  const first = py * 12 + pm + 1;
  const last = ey * 12 + em;
  const target = y * 12 + m;
  return target >= first && target <= last;
}

function paymentNoForMonth(startDate: string, y: number, m: number): number {
  const [py, pm] = startDate.split("-").map(Number);
  return (y * 12 + m) - (py * 12 + pm);
}

function monthlyPayment(totalAmount: number, months: number, isInterestFree: boolean, interestRate: string | null): number {
  if (!totalAmount || !months) return 0;
  if (isInterestFree || !interestRate || parseFloat(interestRate) === 0) return Math.round(totalAmount / months);
  const r = parseFloat(interestRate) / 100 / 12;
  if (r === 0) return Math.round(totalAmount / months);
  return Math.round((totalAmount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

// ─── 다이얼로그 ───────────────────────────────────────────────────────────────
const defaultForm = {
  name: "", cardId: "" as string, totalAmount: 0, months: 3,
  startDate: "", endDate: "", isInterestFree: true, interestRate: "",
  categoryId: "" as string, subCategoryId: "" as string, note: "",
  earlyRepaymentAmount: 0, earlyRepaymentDate: "",
};

function InstallmentDialog({ open, onClose, editing, cards, onSave }: {
  open: boolean; onClose: () => void; editing: Installment | null;
  cards: Card[]; onSave: (data: typeof defaultForm) => void;
}) {
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
  });

  const [form, setForm] = useState(() =>
    editing ? {
      name: editing.name, cardId: editing.cardId ? String(editing.cardId) : "",
      totalAmount: editing.totalAmount, months: editing.months,
      startDate: editing.startDate, endDate: editing.endDate,
      isInterestFree: editing.isInterestFree, interestRate: editing.interestRate ?? "",
      categoryId: editing.categoryId ? String(editing.categoryId) : "",
      subCategoryId: editing.subCategoryId ? String(editing.subCategoryId) : "",
      note: editing.note ?? "",
      earlyRepaymentAmount: editing.earlyRepaymentAmount ?? 0,
      earlyRepaymentDate: editing.earlyRepaymentDate ?? "",
    } : { ...defaultForm }
  );
  const [showEarlyRepayment, setShowEarlyRepayment] = useState(
    !!(editing?.earlyRepaymentAmount && editing.earlyRepaymentAmount > 0)
  );

  const selectedCard = cards.find((c) => String(c.id) === form.cardId);
  const paymentDay = selectedCard?.paymentDate ? parseInt(selectedCard.paymentDate.replace(/[^0-9]/g, "")) : null;
  const subCategories = form.categoryId ? (categoryList.find((c) => String(c.id) === form.categoryId)?.subCategories ?? []) : [];

  function handleStartOrMonthsChange(newStart: string, newMonths: number) {
    setForm((f) => ({ ...f, startDate: newStart, months: newMonths, endDate: calcEndDate(newStart, newMonths, paymentDay) }));
  }

  function handleCardChange(cardId: string) {
    const card = cards.find((c) => String(c.id) === cardId);
    const day = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, "")) : null;
    setForm((f) => ({ ...f, cardId, endDate: calcEndDate(f.startDate, f.months, day) }));
  }

  const monthly = monthlyPayment(form.totalAmount, form.months, form.isInterestFree, form.interestRate);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "할부 수정" : "할부 추가"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>할부명 *</Label>
            <Input placeholder="예: 맥북 프로 할부" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>대분류</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, subCategoryId: "" }))}>
                <SelectTrigger><SelectValue placeholder="대분류 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {categoryList.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>중분류</Label>
              <Select value={form.subCategoryId} onValueChange={(v) => setForm((f) => ({ ...f, subCategoryId: v }))} disabled={!form.categoryId || form.categoryId === "none"}>
                <SelectTrigger><SelectValue placeholder="중분류 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {subCategories.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>결제 카드</Label>
            <Select value={form.cardId} onValueChange={handleCardChange}>
              <SelectTrigger><SelectValue placeholder="카드 선택 (선택사항)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">카드 없음</SelectItem>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.cardCompany} {c.cardName ?? ""}{c.paymentDate ? ` (매월 ${c.paymentDate}일)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>할부 총금액 *</Label>
            <CurrencyInput value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} placeholder="할부 총금액 입력" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>할부 개월수 *</Label>
              <Input type="number" min={1} max={60} value={form.months}
                onChange={(e) => handleStartOrMonthsChange(form.startDate, parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1">
              <Label>구매일 *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => handleStartOrMonthsChange(e.target.value, form.months)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>할부 종료일 <span className="text-xs text-muted-foreground">(자동 계산, 수정 가능)</span></Label>
            <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <Label>무이자</Label>
            <Switch checked={!form.isInterestFree} onCheckedChange={(v) => setForm((f) => ({ ...f, isInterestFree: !v, interestRate: v ? f.interestRate : "" }))} />
            <Label>유이자</Label>
          </div>
          {!form.isInterestFree && (
            <div className="space-y-1">
              <Label>할부 수수료율 (연 %)</Label>
              <Input type="number" step="0.01" min={0} value={form.interestRate}
                onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="예: 15.9" />
            </div>
          )}
          <div className="space-y-1">
            <Label>메모</Label>
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="메모 (선택사항)" />
          </div>
          {/* 중도상환 */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setShowEarlyRepayment((v) => !v)}
            >
              <span>중도상환 {form.earlyRepaymentAmount > 0 ? `(₩${formatAmount(form.earlyRepaymentAmount)})` : "(선택)"}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showEarlyRepayment ? "rotate-180" : ""}`} />
            </button>
            {showEarlyRepayment && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">상환일</Label>
                    <Input
                      type="date"
                      value={form.earlyRepaymentDate}
                      onChange={(e) => setForm((f) => ({ ...f, earlyRepaymentDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">상환 금액</Label>
                    <CurrencyInput
                      value={form.earlyRepaymentAmount}
                      onChange={(v) => setForm((f) => ({ ...f, earlyRepaymentAmount: v }))}
                      placeholder="0"
                    />
                  </div>
                </div>
                {form.earlyRepaymentAmount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    잔여 원금: ₩{formatAmount(Math.max(0, form.totalAmount - form.earlyRepaymentAmount))}
                  </p>
                )}
              </div>
            )}
          </div>
          {form.totalAmount > 0 && form.months > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">월 할부금: </span>
              <span className="font-semibold text-primary">₩{formatAmount(monthly)}</span>
              <span className="text-muted-foreground ml-2">× {form.months}개월</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => {
            if (!form.name.trim()) { toast.error("할부명을 입력하세요"); return; }
            if (!form.startDate) { toast.error("구매일을 입력하세요"); return; }
            if (!form.endDate) { toast.error("종료일을 입력하세요"); return; }
            onSave(form);
          }}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
const CARD_COLORS = ["#5b7cfa", "#f97316", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444"];

export default function Installments() {
  const utils = trpc.useUtils();
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, { staleTime: 0, refetchOnMount: "always" });

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
    onSuccess: () => { utils.installment.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); setEditing(null); },
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
      totalAmount: form.totalAmount, months: form.months,
      startDate: form.startDate, endDate: form.endDate,
      isInterestFree: form.isInterestFree, interestRate: form.interestRate || "0",
      categoryId: form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null,
      subCategoryId: form.subCategoryId && form.subCategoryId !== "none" ? parseInt(form.subCategoryId) : null,
      note: form.note || undefined,
      earlyRepaymentAmount: form.earlyRepaymentAmount > 0 ? form.earlyRepaymentAmount : null,
      earlyRepaymentDate: form.earlyRepaymentDate || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  function getCardName(cardId: number | null) {
    if (!cardId) return null;
    const c = cardList.find((c) => c.id === cardId);
    return c ? `${c.cardCompany} ${c.cardName ?? ""}`.trim() : null;
  }

  function getCategoryName(categoryId: number | null) {
    if (!categoryId) return null;
    return categoryList.find((c) => c.id === categoryId)?.name ?? null;
  }

  function getSubCategoryName(categoryId: number | null, subCategoryId: number | null) {
    if (!categoryId || !subCategoryId) return null;
    const cat = categoryList.find((c) => c.id === categoryId);
    return cat?.subCategories.find((s) => s.id === subCategoryId)?.name ?? null;
  }

  // 이달 청구 목록
  const selectedMonthInstallments = useMemo(() =>
    installmentList.filter((i) => isActiveInMonth(i, selectedYear, selectedMonth)),
    [installmentList, selectedYear, selectedMonth]
  );
  const selectedMonthTotal = useMemo(() =>
    selectedMonthInstallments.reduce((sum, i) => sum + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate), 0),
    [selectedMonthInstallments]
  );

  // 카드별 이달 합계
  const cardSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of selectedMonthInstallments) {
      const key = i.cardId ? (getCardName(i.cardId) ?? "카드 미지정") : "카드 미지정";
      map[key] = (map[key] ?? 0) + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate);
    }
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [selectedMonthInstallments, cardList]);

  // 최근 1년 월별 차트
  const pastYearChart = useMemo(() => {
    const result: { month: string; total: number }[] = [];
    for (let i = -11; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      result.push({
        month: `${String(m).padStart(2, "0")}월`,
        total: installmentList.filter((inst) => isActiveInMonth(inst, y, m))
          .reduce((sum, inst) => sum + monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate), 0),
      });
    }
    return result;
  }, [installmentList]);


  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">대출 / 할부</h1>
          <p className="text-muted-foreground text-sm mt-0.5">카드 할부 현황 관리</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> 할부 추가
        </Button>
      </div>

      {/* 월 네비게이터 */}
      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-semibold w-28 text-center">{selectedYear}년 {String(selectedMonth).padStart(2, "0")}월</span>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">이달 총 할부금</p>
            <p className="text-xl font-bold">₩{formatAmount(selectedMonthTotal)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">이달 청구 건수</p>
            <p className="text-xl font-bold">{selectedMonthInstallments.length}건</p>
          </div>
        </div>
      </div>

      {/* 탭: 목록 / 그래프 */}
      <Tabs defaultValue="list">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list" className="text-sm">목록</TabsTrigger>
          <TabsTrigger value="chart" className="text-sm">그래프</TabsTrigger>
        </TabsList>

        {/* ── 목록 탭 ── */}
        <TabsContent value="list" className="mt-4">
          {installmentList.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
              등록된 할부가 없습니다
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">할부명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">대분류</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">중분류</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">카드</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 할부금</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">총금액</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">진행률</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">종료일</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthInstallments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                        이달 청구되는 할부가 없습니다
                      </td>
                    </tr>
                  ) : selectedMonthInstallments.map((inst) => {
                    const fullyRepaid = !!(inst.earlyRepaymentAmount && inst.earlyRepaymentAmount >= inst.totalAmount);
                    const payNo = paymentNoForMonth(inst.startDate, selectedYear, selectedMonth);
                    const repaidRatio = inst.earlyRepaymentAmount && inst.totalAmount > 0
                      ? Math.min(1, inst.earlyRepaymentAmount / inst.totalAmount) : 0;
                    const scheduleProgress = Math.round((payNo / inst.months) * 100);
                    const progress = fullyRepaid ? 100 : Math.max(scheduleProgress, Math.round(repaidRatio * 100));
                    const remainingPrincipal = inst.earlyRepaymentAmount
                      ? Math.max(0, inst.totalAmount - inst.earlyRepaymentAmount) : inst.totalAmount;
                    const monthly = monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
                    const cardName = getCardName(inst.cardId);
                    const categoryName = getCategoryName(inst.categoryId);
                    const subCategoryName = getSubCategoryName(inst.categoryId, inst.subCategoryId);

                    return (
                      <tr key={inst.id} className="border-t border-border transition-colors hover:bg-muted/30">
                        {/* 할부명 */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{inst.name}</p>
                          {inst.note && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[140px]">{inst.note}</p>}
                          <Badge variant="secondary" className={`text-xs mt-0.5 ${inst.isInterestFree ? "" : "text-red-600 bg-red-50 dark:bg-red-900/20"}`}>
                            {inst.isInterestFree ? "무이자" : `유이자 ${inst.interestRate}%`}
                          </Badge>
                          {inst.earlyRepaymentAmount && inst.earlyRepaymentAmount > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                              중도상환 ₩{formatAmount(inst.earlyRepaymentAmount)}
                              {inst.earlyRepaymentDate && ` (${inst.earlyRepaymentDate})`}
                            </p>
                          )}
                        </td>
                        {/* 대분류 */}
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{categoryName ?? "-"}</td>
                        {/* 중분류 */}
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{subCategoryName ?? "-"}</td>
                        {/* 카드 */}
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {cardName ? (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 shrink-0" />
                              {cardName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        {/* 월 할부금 */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-primary">₩{formatAmount(monthly)}</span>
                        </td>
                        {/* 총금액 */}
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">₩{formatAmount(inst.totalAmount)}</span>
                        </td>
                        {/* 진행률 */}
                        <td className="px-4 py-3 min-w-[180px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>
                                {fullyRepaid ? "중도상환 완료" : `${payNo}/${inst.months}회`}
                              </span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${fullyRepaid ? "bg-amber-400" : "bg-primary"}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            {inst.earlyRepaymentAmount && inst.earlyRepaymentAmount > 0 && !fullyRepaid && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">잔여원금 ₩{formatAmount(remainingPrincipal)}</p>
                            )}
                          </div>
                        </td>
                        {/* 종료일 */}
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                          {inst.endDate}
                        </td>
                        {/* 액션 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => { setEditing(inst as Installment); setDialogOpen(true); }}
                              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(inst.id)}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── 그래프 탭 ── */}
        <TabsContent value="chart" className="mt-4 space-y-6">
          {/* 최근 1년 월별 할부 총액 */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-1">최근 1년 월별 할부 총액</h3>
            <p className="text-xs text-muted-foreground mb-4">월별 청구 합산 기준</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pastYearChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip
                  formatter={(value: number) => [`₩${formatAmount(value)}`, "총 할부금"]}
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Bar dataKey="total" fill="#5b7cfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 카드별 이달 할부 합계 */}
          {cardSummary.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">
                {selectedYear}년 {String(selectedMonth).padStart(2, "0")}월 카드별 할부금
              </h3>
              <div className="flex flex-wrap gap-3">
                {cardSummary.map((s, idx) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2 rounded-lg border px-4 py-2.5"
                    style={{ borderColor: CARD_COLORS[idx % CARD_COLORS.length] + "60" }}
                  >
                    <CreditCard className="w-4 h-4" style={{ color: CARD_COLORS[idx % CARD_COLORS.length] }} />
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-sm font-bold" style={{ color: CARD_COLORS[idx % CARD_COLORS.length] }}>
                      ₩{formatAmount(s.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

      {/* 삭제 확인 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>할부 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 할부 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
