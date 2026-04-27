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
import { Plus, Pencil, Trash2, CreditCard, CheckCircle2, Clock } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

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

/** 할부 종료일 계산: 시작일 + 개월수 - 1, 카드 결제일에 맞춤 */
function calcEndDate(startDate: string, months: number, paymentDay?: number | null): string {
  if (!startDate || !months) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  // 종료 월 = 시작월 + months - 1
  const endMonth = m + months - 1;
  const endYear = y + Math.floor((endMonth - 1) / 12);
  const endMonthNorm = ((endMonth - 1) % 12) + 1;
  // 결제일이 있으면 그 날짜로, 없으면 시작일의 일(day)로
  const endDay = paymentDay ?? d;
  const mm = String(endMonthNorm).padStart(2, "0");
  const dd = String(Math.min(endDay, 28)).padStart(2, "0"); // 월말 안전처리
  return `${endYear}-${mm}-${dd}`;
}

/** 할부 완료 여부 */
function isCompleted(endDate: string): boolean {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
}

/** 현재 진행 회차 */
function currentInstallmentNo(startDate: string, months: number): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const diffMonths =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    1;
  return Math.max(1, Math.min(diffMonths, months));
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
          note: editing.note ?? "",
        }
      : { ...defaultForm }
  );

  // 카드 결제일 조회
  const selectedCard = cards.find((c) => String(c.id) === form.cardId);
  const paymentDay = selectedCard?.paymentDate
    ? parseInt(selectedCard.paymentDate.replace(/[^0-9]/g, ""))
    : null;

  // 시작일 또는 개월수 변경 시 종료일 자동 계산
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

  const monthly = monthlyPayment(form.totalAmount, form.months, form.isInterestFree, form.interestRate);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
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
            <Label>할부 시작일 *</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => handleStartOrMonthsChange(e.target.value, form.months)}
            />
          </div>
          {/* 종료일 (자동 계산, 수정 가능) */}
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
              if (!form.startDate) { toast.error("시작일을 입력하세요"); return; }
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

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

  // 이번달 총 할부금
  const thisMonthTotal = useMemo(() => {
    return activeInstallments.reduce((sum, i) => {
      return sum + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate);
    }, 0);
  }, [activeInstallments]);

  // 카드별 이번달 할부 합계
  const cardSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of activeInstallments) {
      const key = i.cardId ? getCardName(i.cardId) ?? "카드 미지정" : "카드 미지정";
      map[key] = (map[key] ?? 0) + monthlyPayment(i.totalAmount, i.months, i.isInterestFree, i.interestRate);
    }
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [activeInstallments, cardList]);

  // 월별 할부 현황 (향후 12개월)
  const monthlyChart = useMemo(() => {
    const now = new Date();
    const result: { month: string; [key: string]: number | string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry: { month: string; [key: string]: number | string } = { month: label };
      for (const inst of installmentList) {
        const start = new Date(inst.startDate);
        const end = new Date(inst.endDate);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        if (start <= monthEnd && end >= monthStart) {
          const cardName = inst.cardId ? getCardName(inst.cardId) ?? "미지정" : "미지정";
          const key = `${inst.name}`;
          entry[key] = (Number(entry[key]) || 0) + monthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
        }
      }
      result.push(entry);
    }
    return result;
  }, [installmentList, cardList]);

  // 차트에 표시할 할부 키 목록
  const chartKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const inst of installmentList) {
      keys.add(inst.name);
    }
    return Array.from(keys);
  }, [installmentList]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">대출 / 할부</h1>
          <p className="text-muted-foreground text-sm mt-1">카드 할부 현황을 관리합니다</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> 할부 추가
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">이번달 총 할부금</p>
            <p className="text-2xl font-bold text-primary mt-1">{formatKRW(thisMonthTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">진행중 할부</p>
            <p className="text-2xl font-bold mt-1">{activeInstallments.length}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">완료된 할부</p>
            <p className="text-2xl font-bold text-muted-foreground mt-1">{completedInstallments.length}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 카드별 이번달 할부 합계 */}
      {cardSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">카드별 이번달 할부금</CardTitle>
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

      {/* 월별 할부 현황 그래프 */}
      {installmentList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">향후 12개월 할부 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v))}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatKRW(value), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                {chartKeys.map((key, idx) => (
                  <Bar key={key} dataKey={key} stackId="a" fill={CARD_COLORS[idx % CARD_COLORS.length]} radius={idx === chartKeys.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
              const currentNo = currentInstallmentNo(inst.startDate, inst.months);
              const remaining = inst.months - currentNo;
              const cardName = getCardName(inst.cardId);
              const progress = Math.round((currentNo / inst.months) * 100);
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
                        <span>{inst.startDate}</span>
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
                      <span>{inst.startDate} ~ {inst.endDate}</span>
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
