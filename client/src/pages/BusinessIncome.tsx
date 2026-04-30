import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Briefcase, TrendingUp, CheckCircle2, Clock, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);

function calcDeposit(workAmount: number, depositPercent: number) {
  return Math.round(workAmount * depositPercent / 100);
}

type RecBase = {
  workAmount: number;
  depositPercent: number;
  workStartDate: string | null;
  isCompleted: boolean;
  settlementDate?: string | null;
};

// 레코드 단건 기준 현재까지 인식된 총액 (테이블 표시용)
function recognizedRevenue(r: RecBase): number {
  const deposit = calcDeposit(r.workAmount, r.depositPercent);
  if (r.isCompleted) return r.workAmount;
  if (r.workStartDate && r.workStartDate <= todayStr()) return deposit;
  return 0;
}

// 특정 년/월에 인식되는 금액 (계약금 → workStartDate 월, 잔금 → settlementDate 월)
function recognizedInMonth(r: RecBase, yr: number, mo: number): number {
  let amount = 0;
  if (r.workStartDate) {
    const [y, m] = r.workStartDate.split("-").map(Number);
    if (y === yr && m === mo) amount += calcDeposit(r.workAmount, r.depositPercent);
  }
  if (r.isCompleted && r.settlementDate) {
    const [y, m] = r.settlementDate.split("-").map(Number);
    if (y === yr && m === mo) amount += r.workAmount - calcDeposit(r.workAmount, r.depositPercent);
  }
  return amount;
}

// 특정 연도에 인식되는 금액
function recognizedInYear(r: RecBase, yr: number): number {
  let amount = 0;
  if (r.workStartDate && Number(r.workStartDate.slice(0, 4)) === yr)
    amount += calcDeposit(r.workAmount, r.depositPercent);
  if (r.isCompleted && r.settlementDate && Number(r.settlementDate.slice(0, 4)) === yr)
    amount += r.workAmount - calcDeposit(r.workAmount, r.depositPercent);
  return amount;
}

// ─── 정산 완료 다이얼로그 ─────────────────────────────────────────────────────
function SettlementDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (settlementDate: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>작업 완료 처리</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">잔금 정산날짜를 입력하세요.</p>
          <div className="space-y-1">
            <Label>정산날짜</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => { if (date) onConfirm(date); }}>완료 처리</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 다이얼로그 폼 ────────────────────────────────────────────────────────────
type FormState = {
  clientName: string;
  clientType: "회사" | "개인" | null;
  depositorName: string;
  phoneNumber: string;
  workAmount: number;
  depositPercent: number;
  workStartDate: string;
  note: string;
};

const defaultForm = (): FormState => ({
  clientName: "",
  clientType: null,
  depositorName: "",
  phoneNumber: "",
  workAmount: 0,
  depositPercent: 50,
  workStartDate: "",
  note: "",
});

const expenseCategories = ["광고", "대납", "세금", "수수료", "소모품", "인건비", "기타"] as const;
type ExpenseCategory = typeof expenseCategories[number];

type ExpenseRow = {
  id: number;
  expenseDate: string | Date;
  year: number;
  month: number;
  category: ExpenseCategory;
  vendor: string | null;
  description: string;
  amount: number;
  paymentMethod: string | null;
  isTaxDeductible: boolean;
  note: string | null;
};

type CardRow = {
  id: number;
  cardType: "신용카드" | "체크카드";
  cardCompany: string;
  cardName: string | null;
};

type AccountRow = {
  id: number;
  bankName: string;
  accountType: string;
  accountNumber: string | null;
};

type ExpenseFormState = {
  expenseDate: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  paymentMethod: string;
  isTaxDeductible: boolean;
  note: string;
};

const defaultExpenseForm = (): ExpenseFormState => ({
  expenseDate: todayStr(),
  category: "광고",
  vendor: "",
  description: "",
  amount: 0,
  paymentMethod: "",
  isTaxDeductible: true,
  note: "",
});

function BusinessIncomeDialog({
  open, onClose, editing, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: ({ id: number } & FormState) | null;
  onSave: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(editing ?? defaultForm());
  const [depositPercentStr, setDepositPercentStr] = useState(String(editing?.depositPercent ?? 50));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const parsedPercent = Math.min(100, Math.max(1, parseInt(depositPercentStr) || 1));
  const depositAmount = calcDeposit(form.workAmount, parsedPercent);
  const balanceAmount = form.workAmount - depositAmount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "사업소득 수정" : "사업소득 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>업체명 *</Label>
            <div className="flex gap-2">
              <Input placeholder="예: (주)ABC 기획" value={form.clientName} onChange={e => set("clientName", e.target.value)} className="flex-1" />
              <div className="flex gap-1">
                {(["회사", "개인"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("clientType", form.clientType === t ? null : t)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      form.clientType === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>입금자명</Label>
              <Input placeholder="예: 홍길동" value={form.depositorName} onChange={e => set("depositorName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>전화번호</Label>
              <Input placeholder="예: 010-1234-5678" value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>작업금액 *</Label>
            <CurrencyInput value={form.workAmount} onChange={v => set("workAmount", v)} placeholder="작업 총 금액 입력" />
          </div>

          <div className="space-y-1">
            <Label>계약금 비율 (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                value={depositPercentStr}
                onChange={e => setDepositPercentStr(e.target.value)}
                onBlur={() => {
                  const clamped = Math.min(100, Math.max(1, parseInt(depositPercentStr) || 1));
                  setDepositPercentStr(String(clamped));
                  set("depositPercent", clamped);
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <div className="flex gap-1.5 ml-2">
                {[30, 50, 70].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setDepositPercentStr(String(p)); set("depositPercent", p); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      parsedPercent === p && depositPercentStr === String(p)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {form.workAmount > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">계약금액</p>
                <p className="font-bold text-primary">{fmt(depositAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">잔금</p>
                <p className="font-bold text-foreground">{fmt(balanceAmount)}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>작업시작일</Label>
            <Input type="date" value={form.workStartDate} onChange={e => set("workStartDate", e.target.value)} />
            <p className="text-xs text-muted-foreground">시작일이 오늘 이전이면 계약금이 수익에 반영됩니다</p>
          </div>

          <div className="space-y-1">
            <Label>메모</Label>
            <Textarea value={form.note} onChange={e => set("note", e.target.value)} placeholder="메모 (선택사항)" rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!form.clientName.trim()) { toast.error("업체명을 입력하세요"); return; }
              if (form.workAmount <= 0) { toast.error("작업금액을 입력하세요"); return; }
              onSave({ ...form, depositPercent: parsedPercent });
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BusinessExpenseDialog({
  open, onClose, editing, onSave, cardList, accountList,
}: {
  open: boolean;
  onClose: () => void;
  editing: ({ id: number } & ExpenseFormState) | null;
  onSave: (form: ExpenseFormState) => void;
  cardList: CardRow[];
  accountList: AccountRow[];
}) {
  const [form, setForm] = useState<ExpenseFormState>(editing ?? defaultExpenseForm());
  const set = <K extends keyof ExpenseFormState>(k: K, v: ExpenseFormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const paymentOptions = [
    ...cardList.map(c => `${c.cardCompany} ${c.cardName || c.cardType}`),
    ...accountList.map(a => `${a.bankName} ${a.accountType}${a.accountNumber ? ` (${a.accountNumber.slice(-4)})` : ""}`),
    "현금",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "사업비용 수정" : "사업비용 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>비용일 *</Label>
              <Input type="date" value={form.expenseDate} onChange={e => set("expenseDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>카테고리</Label>
              <select
                value={form.category}
                onChange={e => set("category", e.target.value as ExpenseCategory)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>거래처/플랫폼</Label>
              <Input placeholder="예: 당근, Instagram, 홈택스" value={form.vendor} onChange={e => set("vendor", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>결제수단</Label>
              <select
                value={form.paymentMethod}
                onChange={e => set("paymentMethod", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">선택 안 함</option>
                {paymentOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>내용 *</Label>
            <Input placeholder="예: 당근 광고비, 고객 대신 결제, 종소세 납부" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>금액 *</Label>
            <CurrencyInput value={form.amount} onChange={v => set("amount", v)} placeholder="비용 금액 입력" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label>비용처리 대상</Label>
              <p className="text-xs text-muted-foreground mt-0.5">세금 신고/정산에 반영할 비용이면 켜두세요.</p>
            </div>
            <Switch checked={form.isTaxDeductible} onCheckedChange={v => set("isTaxDeductible", v)} />
          </div>

          <div className="space-y-1">
            <Label>메모</Label>
            <Textarea value={form.note} onChange={e => set("note", e.target.value)} placeholder="영수증, 고객명, 처리 메모 등" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!form.expenseDate) { toast.error("비용일을 입력하세요"); return; }
              if (!form.description.trim()) { toast.error("내용을 입력하세요"); return; }
              if (form.amount <= 0) { toast.error("금액을 입력하세요"); return; }
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
export default function BusinessIncome() {
  const utils = trpc.useUtils();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [section, setSection] = useState<"income" | "expense">("income");

  const { data: list = [], isLoading } = trpc.businessIncome.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: accountList = [] } = trpc.account.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<({ id: number } & FormState) | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<number | null>(null);

  const [hiddenYearly, setHiddenYearly] = useState<Record<string, boolean>>({});
  const [hiddenStatus, setHiddenStatus] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const { data: expenseList = [], isLoading: expenseLoading } = trpc.businessExpense.list.useQuery();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseEditing, setExpenseEditing] = useState<({ id: number } & ExpenseFormState) | null>(null);
  const [expenseDeleteId, setExpenseDeleteId] = useState<number | null>(null);

  const createMutation = trpc.businessIncome.create.useMutation({
    onSuccess: () => { utils.businessIncome.list.invalidate(); toast.success("사업소득이 추가되었습니다"); setDialogOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.businessIncome.update.useMutation({
    onSuccess: () => { utils.businessIncome.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); setEditing(null); },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.businessIncome.delete.useMutation({
    onSuccess: () => { utils.businessIncome.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: e => toast.error(e.message),
  });
  const createExpenseMutation = trpc.businessExpense.create.useMutation({
    onSuccess: () => { utils.businessExpense.list.invalidate(); toast.success("사업비용이 추가되었습니다"); setExpenseDialogOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateExpenseMutation = trpc.businessExpense.update.useMutation({
    onSuccess: () => { utils.businessExpense.list.invalidate(); toast.success("사업비용이 수정되었습니다"); setExpenseDialogOpen(false); setExpenseEditing(null); },
    onError: e => toast.error(e.message),
  });
  const deleteExpenseMutation = trpc.businessExpense.delete.useMutation({
    onSuccess: () => { utils.businessExpense.list.invalidate(); toast.success("사업비용이 삭제되었습니다"); setExpenseDeleteId(null); },
    onError: e => toast.error(e.message),
  });

  function handleSave(form: FormState) {
    const payload = {
      clientName: form.clientName,
      clientType: form.clientType ?? null,
      depositorName: form.depositorName || null,
      phoneNumber: form.phoneNumber || null,
      workAmount: form.workAmount,
      depositPercent: form.depositPercent,
      workStartDate: form.workStartDate || null,
      note: form.note || null,
      isCompleted: false,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  function handleExpenseSave(form: ExpenseFormState) {
    const [y, m] = form.expenseDate.split("-").map(Number);
    const payload = {
      expenseDate: form.expenseDate,
      year: y,
      month: m,
      category: form.category,
      vendor: form.vendor || null,
      description: form.description,
      amount: form.amount,
      paymentMethod: form.paymentMethod || null,
      isTaxDeductible: form.isTaxDeductible,
      note: form.note || null,
    };
    if (expenseEditing) updateExpenseMutation.mutate({ id: expenseEditing.id, data: payload });
    else createExpenseMutation.mutate(payload);
  }

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  // 월별 필터: workStartDate(계약금) 또는 settlementDate(잔금)가 해당 월인 레코드
  const monthlyRecords = useMemo(() =>
    list.filter(r => {
      if (r.workStartDate) {
        const [y, m] = r.workStartDate.split("-").map(Number);
        if (y === year && m === month) return true;
      }
      if (r.isCompleted && r.settlementDate) {
        const [y, m] = r.settlementDate.split("-").map(Number);
        if (y === year && m === month) return true;
      }
      return false;
    }),
    [list, year, month]
  );

  // 날짜 미설정 항목
  const undatedRecords = useMemo(() => list.filter(r => !r.workStartDate), [list]);

  // 월별 요약 (계약금은 workStartDate 월, 잔금은 settlementDate 월 기준)
  const { monthRevenue, monthTotal, monthCompleted, monthInProgress } = useMemo(() => {
    let monthRevenue = 0, monthTotal = 0, monthCompleted = 0, monthInProgress = 0;
    for (const r of list) {
      monthRevenue += recognizedInMonth(r as RecBase, year, month);
      if (r.workStartDate) {
        const [y, m] = r.workStartDate.split("-").map(Number);
        if (y === year && m === month) {
          monthTotal++;
          if (r.isCompleted) monthCompleted++; else monthInProgress++;
        }
      }
    }
    return { monthRevenue, monthTotal, monthCompleted, monthInProgress };
  }, [list, year, month]);

  const expenseRows = expenseList as ExpenseRow[];
  const monthlyExpenses = useMemo(
    () => expenseRows.filter(e => e.year === year && e.month === month),
    [expenseRows, year, month]
  );
  const monthExpenseTotal = useMemo(
    () => monthlyExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthlyExpenses]
  );
  const monthNetProfit = monthRevenue - monthExpenseTotal;
  const yearExpenseTotal = useMemo(
    () => expenseRows.filter(e => e.year === year).reduce((sum, e) => sum + e.amount, 0),
    [expenseRows, year]
  );
  const yearTaxDeductibleExpense = useMemo(
    () => expenseRows.filter(e => e.year === year && e.isTaxDeductible).reduce((sum, e) => sum + e.amount, 0),
    [expenseRows, year]
  );

  // ─── 차트 데이터 ───────────────────────────────────────────────────────────
  // 연간 월별 (작업금액은 workStartDate 기준, 인식수익은 날짜 분리)
  const yearlyChart = useMemo(() => {
    const map: Record<number, { workAmount: number; revenue: number }> = {};
    for (let m = 1; m <= 12; m++) map[m] = { workAmount: 0, revenue: 0 };
    for (const r of list) {
      if (r.workStartDate) {
        const [y, m] = r.workStartDate.split("-").map(Number);
        if (y === year) {
          map[m].workAmount += r.workAmount;
          map[m].revenue += calcDeposit(r.workAmount, r.depositPercent);
        }
      }
      if (r.isCompleted && r.settlementDate) {
        const [y, m] = r.settlementDate.split("-").map(Number);
        if (y === year) map[m].revenue += r.workAmount - calcDeposit(r.workAmount, r.depositPercent);
      }
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}월`,
      작업금액: map[i + 1].workAmount,
      인식수익: map[i + 1].revenue,
    }));
  }, [list, year]);

  const expenseMonthlyChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    for (const e of expenseRows) {
      if (e.year === year) map[e.month] += e.amount;
    }
    return Array.from({ length: 12 }, (_, i) => ({ month: `${i + 1}월`, 비용: map[i + 1] }));
  }, [expenseRows, year]);

  const yearlyNetProfitChart = useMemo(() => {
    const incomeMap: Record<number, number> = {};
    const expenseMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      incomeMap[m] = 0;
      expenseMap[m] = 0;
    }
    for (const r of list) {
      for (let m = 1; m <= 12; m++) {
        incomeMap[m] += recognizedInMonth(r as RecBase, year, m);
      }
    }
    for (const e of expenseRows) {
      if (e.year === year) expenseMap[e.month] += e.amount;
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return {
        month: `${m}월`,
        순이익: incomeMap[m] - expenseMap[m],
      };
    });
  }, [list, expenseRows, year]);

  const yearNetProfit = useMemo(
    () => yearlyNetProfitChart.reduce((sum, row) => sum + row.순이익, 0),
    [yearlyNetProfitChart]
  );

  const yearlyNetProfitByYearChart = useMemo(() => {
    const incomeMap: Record<number, number> = {};
    const expenseMap: Record<number, number> = {};
    for (const r of list) {
      if (r.workStartDate) {
        const y = Number(r.workStartDate.slice(0, 4));
        incomeMap[y] = (incomeMap[y] ?? 0) + calcDeposit(r.workAmount, r.depositPercent);
      }
      if (r.isCompleted && r.settlementDate) {
        const y = Number(r.settlementDate.slice(0, 4));
        incomeMap[y] = (incomeMap[y] ?? 0) + (r.workAmount - calcDeposit(r.workAmount, r.depositPercent));
      }
    }
    for (const e of expenseRows) {
      expenseMap[e.year] = (expenseMap[e.year] ?? 0) + e.amount;
    }

    const years = Array.from(new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)].map(Number))).sort();
    return years.map(y => ({
      year: `${y}년`,
      순이익: (incomeMap[y] ?? 0) - (expenseMap[y] ?? 0),
    }));
  }, [list, expenseRows]);

  const expenseCategoryChart = useMemo(() => {
    const colors = ["#f97316", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#64748b"];
    const map: Record<string, number> = {};
    for (const e of expenseRows) {
      if (e.year !== year) continue;
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    }
    return Object.entries(map)
      .map(([name, value], idx) => ({ name, value, color: colors[idx % colors.length] }))
      .filter(d => d.value > 0);
  }, [expenseRows, year]);

  // 월별 현금영수증 처리 수익 (계약금→workStartDate, 잔금→settlementDate)
  const monthlyCashReceiptChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    for (const r of list) {
      if (!r.cashReceiptDone) continue;
      if (r.workStartDate) {
        const [y, m] = r.workStartDate.split("-").map(Number);
        if (y === year) map[m] += calcDeposit(r.workAmount, r.depositPercent);
      }
      if (r.isCompleted && r.settlementDate) {
        const [y, m] = r.settlementDate.split("-").map(Number);
        if (y === year) map[m] += r.workAmount - calcDeposit(r.workAmount, r.depositPercent);
      }
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}월`,
      금액: map[i + 1],
    }));
  }, [list, year]);

  // 년별 인식수익 (계약금→workStartDate 연도, 잔금→settlementDate 연도)
  const yearlyRevenueChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of list) {
      if (r.workStartDate) {
        const y = Number(r.workStartDate.slice(0, 4));
        map[y] = (map[y] ?? 0) + calcDeposit(r.workAmount, r.depositPercent);
      }
      if (r.isCompleted && r.settlementDate) {
        const y = Number(r.settlementDate.slice(0, 4));
        map[y] = (map[y] ?? 0) + (r.workAmount - calcDeposit(r.workAmount, r.depositPercent));
      }
    }
    return Object.keys(map).map(Number).sort().map(y => ({ year: `${y}년`, 인식수익: map[y] }));
  }, [list]);

  // 년별 현금영수증 인식수익
  const yearlyCashReceiptChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of list) {
      if (!r.cashReceiptDone) continue;
      if (r.workStartDate) {
        const y = Number(r.workStartDate.slice(0, 4));
        map[y] = (map[y] ?? 0) + calcDeposit(r.workAmount, r.depositPercent);
      }
      if (r.isCompleted && r.settlementDate) {
        const y = Number(r.settlementDate.slice(0, 4));
        map[y] = (map[y] ?? 0) + (r.workAmount - calcDeposit(r.workAmount, r.depositPercent));
      }
    }
    return Object.keys(map).map(Number).sort().map(y => ({ year: `${y}년`, 금액: map[y] }));
  }, [list]);

  // 선택 연도 인식수익 합계
  const yearRevenue = useMemo(() =>
    list.reduce((sum, r) => sum + recognizedInYear(r as RecBase, year), 0),
    [list, year]
  );

  // 선택 연도 현금영수증 인식수익 합계
  const yearCashReceiptRevenue = useMemo(() =>
    list.reduce((sum, r) => r.cashReceiptDone ? sum + recognizedInYear(r as RecBase, year) : sum, 0),
    [list, year]
  );

  // 전체 완료/진행중/대기 파이
  const statusChart = useMemo(() => {
    let completed = 0, inProgress = 0, waiting = 0;
    for (const r of list) {
      if (r.isCompleted) { completed++; continue; }
      const started = r.workStartDate ? r.workStartDate <= todayStr() : false;
      if (started) inProgress++; else waiting++;
    }
    return [
      { name: "완료", value: completed, color: "#10b981" },
      { name: "진행중", value: inProgress, color: "#5b7cfa" },
      { name: "대기", value: waiting, color: "#f59e0b" },
    ].filter(d => d.value > 0);
  }, [list]);

  function openEdit(r: typeof list[number]) {
    setEditing({
      id: r.id,
      clientName: r.clientName,
      clientType: (r as typeof r & { clientType?: "회사" | "개인" | null }).clientType ?? null,
      depositorName: (r as typeof r & { depositorName?: string | null }).depositorName ?? "",
      phoneNumber: (r as typeof r & { phoneNumber?: string | null }).phoneNumber ?? "",
      workAmount: r.workAmount,
      depositPercent: r.depositPercent,
      workStartDate: r.workStartDate ?? "",
      note: r.note ?? "",
    });
    setDialogOpen(true);
  }

  function renderTable(records: typeof list, showDate = true, yr?: number, mo?: number) {
    if (records.length === 0) return null;
    const monthMode = yr !== undefined && mo !== undefined;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              {showDate && <th className="text-left py-2 px-3 font-medium">작업시작일</th>}
              <th className="text-left py-2 px-3 font-medium">업체명</th>
              <th className="text-right py-2 px-3 font-medium">작업금액</th>
              <th className="text-right py-2 px-3 font-medium">계약금</th>
              <th className="text-right py-2 px-3 font-medium">잔금</th>
              <th className="text-right py-2 px-3 font-medium">{monthMode ? "이번달 인식" : "인식 수익"}</th>
              <th className="text-center py-2 px-3 font-medium">상태</th>
              <th className="text-left py-2 px-3 font-medium">정산날짜</th>
              <th className="text-center py-2 px-3 font-medium">현금영수증</th>
              <th className="text-center py-2 px-3 font-medium">완료</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {records.map(r => {
              const deposit = calcDeposit(r.workAmount, r.depositPercent);
              const balance = r.workAmount - deposit;
              const revenue = monthMode
                ? recognizedInMonth(r as RecBase, yr, mo)
                : recognizedRevenue(r as RecBase);
              const started = r.workStartDate ? r.workStartDate <= todayStr() : false;
              return (
                <tr key={r.id} className={`border-b hover:bg-muted/30 transition-colors ${r.isCompleted ? "opacity-60" : ""}`}>
                  {showDate && (
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {r.workStartDate ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium ${r.isCompleted ? "line-through text-muted-foreground" : ""}`}>{r.clientName}</span>
                      {(r as typeof r & { clientType?: string | null }).clientType && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {(r as typeof r & { clientType?: string | null }).clientType}
                        </Badge>
                      )}
                    </div>
                    {((r as typeof r & { depositorName?: string | null }).depositorName || (r as typeof r & { phoneNumber?: string | null }).phoneNumber) && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                        {(r as typeof r & { depositorName?: string | null }).depositorName && (
                          <span>{(r as typeof r & { depositorName?: string | null }).depositorName}</span>
                        )}
                        {(r as typeof r & { phoneNumber?: string | null }).phoneNumber && (
                          <span>{(r as typeof r & { phoneNumber?: string | null }).phoneNumber}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">{fmt(r.workAmount)}</td>
                  <td className="py-2.5 px-3 text-right text-primary font-semibold">
                    {fmt(deposit)}
                    <span className="text-xs text-muted-foreground ml-1">({r.depositPercent}%)</span>
                  </td>
                  <td className="py-2.5 px-3 text-right">{fmt(balance)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    <span className={revenue > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                      {revenue > 0 ? fmt(revenue) : "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {r.isCompleted ? (
                      <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">완료</Badge>
                    ) : started ? (
                      <Badge variant="secondary" className="text-xs">진행중</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">대기</Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted-foreground">
                    {(r as typeof r & { settlementDate?: string | null }).settlementDate ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Switch
                      checked={(r as typeof r & { cashReceiptDone?: boolean }).cashReceiptDone ?? false}
                      onCheckedChange={() => updateMutation.mutate({
                        id: r.id,
                        data: { cashReceiptDone: !((r as typeof r & { cashReceiptDone?: boolean }).cashReceiptDone ?? false) },
                      })}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Switch
                      checked={r.isCompleted}
                      onCheckedChange={() => {
                        if (!r.isCompleted) setSettlementTarget(r.id);
                        else updateMutation.mutate({ id: r.id, data: { isCompleted: false, settlementDate: null } });
                      }}
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function openExpenseEdit(e: ExpenseRow) {
    const d = e.expenseDate instanceof Date ? e.expenseDate.toISOString().split("T")[0] : String(e.expenseDate).split("T")[0];
    setExpenseEditing({
      id: e.id,
      expenseDate: d,
      category: e.category,
      vendor: e.vendor ?? "",
      description: e.description,
      amount: e.amount,
      paymentMethod: e.paymentMethod ?? "",
      isTaxDeductible: e.isTaxDeductible,
      note: e.note ?? "",
    });
    setExpenseDialogOpen(true);
  }

  function renderExpenseTable(records: ExpenseRow[]) {
    if (records.length === 0) return null;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-3 font-medium">비용일</th>
              <th className="text-left py-2 px-3 font-medium">카테고리</th>
              <th className="text-left py-2 px-3 font-medium">내용</th>
              <th className="text-left py-2 px-3 font-medium">거래처/결제</th>
              <th className="text-right py-2 px-3 font-medium">금액</th>
              <th className="text-center py-2 px-3 font-medium">비용처리</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {records.map(e => {
              const d = e.expenseDate instanceof Date ? e.expenseDate.toISOString().split("T")[0] : String(e.expenseDate).split("T")[0];
              return (
                <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 text-muted-foreground">{d}</td>
                  <td className="py-2.5 px-3"><Badge variant="secondary" className="text-xs">{e.category}</Badge></td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium">{e.description}</p>
                    {e.note && <p className="text-xs text-muted-foreground mt-0.5">{e.note}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">
                    <p>{e.vendor ?? "—"}</p>
                    {e.paymentMethod && <p className="text-xs">{e.paymentMethod}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-red-500">{fmt(e.amount)}</td>
                  <td className="py-2.5 px-3 text-center">
                    {e.isTaxDeductible ? <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">대상</Badge> : <Badge variant="outline" className="text-xs">제외</Badge>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openExpenseEdit(e)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setExpenseDeleteId(e.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">사업 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">사업소득과 사업비용을 월별로 나눠 관리합니다</p>
        </div>
        {section === "income" ? (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> 사업소득 추가
          </Button>
        ) : (
          <Button onClick={() => { setExpenseEditing(null); setExpenseDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> 사업비용 추가
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-5">
          <div>
          <p className="text-xs text-muted-foreground">조회 월</p>
          <p className="text-sm font-semibold">{year}년 {month}월 기준</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div>
            <p className="text-xs text-muted-foreground">순이익 (사업소득 - 사업비용)</p>
            <p className={`text-lg font-bold ${monthNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {fmt(monthNetProfit)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 mr-1"
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
            >
              오늘
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <Popover open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (open) setPickerYear(year); }}>
            <PopoverTrigger asChild>
              <button className="text-sm font-medium w-20 text-center hover:bg-muted rounded px-2 py-1 transition-colors">
                {year}.{String(month).padStart(2, "0")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="center">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold">{pickerYear}년</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const isSelected = pickerYear === year && m === month;
                  return (
                    <button
                      key={m}
                      onClick={() => { setYear(pickerYear); setMonth(m); setPickerOpen(false); }}
                      className={`rounded py-1.5 text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {m}월
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{year}년 월별 순이익</CardTitle>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">연간 순이익</p>
                <p className={`text-lg font-bold ${yearNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                  {fmt(yearNetProfit)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {yearlyNetProfitChart.every(d => d.순이익 === 0) ? (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yearlyNetProfitChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "순이익"]} />
                  <Bar dataKey="순이익" radius={[4, 4, 0, 0]}>
                    {yearlyNetProfitChart.map((entry, i) => (
                      <Cell key={i} fill={entry.순이익 >= 0 ? "#5b7cfa" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">년별 순이익</CardTitle>
          </CardHeader>
          <CardContent>
            {yearlyNetProfitByYearChart.length === 0 ? (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yearlyNetProfitByYearChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "순이익"]} />
                  <Bar dataKey="순이익" radius={[4, 4, 0, 0]}>
                    {yearlyNetProfitByYearChart.map((entry, i) => (
                      <Cell key={i} fill={entry.순이익 >= 0 ? "#0d9488" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={section} onValueChange={v => setSection(v as "income" | "expense")} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="income">사업소득</TabsTrigger>
          <TabsTrigger value="expense">사업비용</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-6">

      {/* 요약 카드 — 월별 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{month}월 인식 수익</p>
                <p className="text-xl font-bold text-foreground">{fmt(monthRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">계약금·완료 기준</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Briefcase className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{month}월 프로젝트</p>
                <p className="text-xl font-bold text-foreground">{monthTotal}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="w-5 h-5 text-amber-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">진행중</p>
                <p className="text-xl font-bold text-foreground">{monthInProgress}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">완료</p>
                <p className="text-xl font-bold text-foreground">{monthCompleted}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 요약 카드 — 연간 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{year}년 인식수익</p>
                <p className="text-xl font-bold text-foreground">{fmt(yearRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">계약금·완료 기준 연간 합계</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10"><Receipt className="w-5 h-5 text-violet-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{year}년 현금영수증 인식수익</p>
                <p className="text-xl font-bold text-foreground">{fmt(yearCashReceiptRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">현금영수증 처리 항목 기준</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">월별 내역</TabsTrigger>
          <TabsTrigger value="all">전체 내역</TabsTrigger>
          <TabsTrigger value="chart">그래프</TabsTrigger>
        </TabsList>

        {/* ─── 월별 내역 탭 ─── */}
        <TabsContent value="monthly" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{year}년 {month}월 사업소득 내역</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
              ) : monthlyRecords.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">이번 달 사업소득 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                  </Button>
                </div>
              ) : (
                <>
                  {renderTable(monthlyRecords, true, year, month)}
                  <div className="mt-2 pt-2 border-t flex justify-end gap-8 text-sm px-3">
                    <span className="text-muted-foreground font-medium">합계</span>
                    <span className="font-bold text-emerald-600">{fmt(monthRevenue)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 날짜 미설정 항목 */}
          {undatedRecords.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">작업시작일 미설정</CardTitle>
              </CardHeader>
              <CardContent>
                {renderTable(undatedRecords, false)}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── 전체 내역 탭 ─── */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">전체 사업소득 내역 ({list.length}건)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
              ) : list.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">사업소득 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                  </Button>
                </div>
              ) : (
                <>
                  {renderTable([...list].sort((a, b) => {
                    const da = a.workStartDate ?? "";
                    const db = b.workStartDate ?? "";
                    if (!da && !db) return 0;
                    if (!da) return 1;
                    if (!db) return -1;
                    return db.localeCompare(da);
                  }))}
                  <div className="mt-2 pt-2 border-t flex justify-end gap-8 text-sm px-3">
                    <span className="text-muted-foreground font-medium">총 인식수익</span>
                    <span className="font-bold text-emerald-600">
                      {fmt(list.reduce((sum, r) => sum + recognizedRevenue(r as RecBase), 0))}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── 그래프 탭 ─── */}
        <TabsContent value="chart" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 연간 월별 바 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{year}년 월별 사업소득</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearlyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, name: string) => [`₩${v.toLocaleString("ko-KR")}`, name]} />
                    <Bar dataKey="작업금액" fill="#5b7cfa" radius={[4, 4, 0, 0]} hide={!!hiddenYearly["작업금액"]} />
                    <Bar dataKey="인식수익" fill="#10b981" radius={[4, 4, 0, 0]} hide={!!hiddenYearly["인식수익"]} />
                    <Legend
                      onClick={(e: any) => {
                        const key = String(e.dataKey ?? "");
                        if (key) setHiddenYearly(prev => ({ ...prev, [key]: !prev[key] }));
                      }}
                      formatter={(value: string) => (
                        <span style={{ opacity: hiddenYearly[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                      )}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 상태별 파이 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">전체 프로젝트 상태</CardTitle>
              </CardHeader>
              <CardContent>
                {statusChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={statusChart.filter(d => !hiddenStatus[d.name])}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {statusChart.filter(d => !hiddenStatus[d.name]).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v}건`} />
                      <Legend
                        payload={statusChart.map(d => ({ value: d.name, type: "square" as const, color: d.color }))}
                        onClick={(e: any) => {
                          const key = String(e.value ?? "");
                          if (key) setHiddenStatus(prev => ({ ...prev, [key]: !prev[key] }));
                        }}
                        formatter={(value: string) => (
                          <span style={{ opacity: hiddenStatus[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 월별 현금영수증 처리 수익 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{year}년 월별 현금영수증 처리 수익</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyCashReceiptChart.every(d => d.금액 === 0) ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">데이터 없음</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyCashReceiptChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "현금영수증 수익"]} />
                    <Bar dataKey="금액" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 년별 차트 2개 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 년별 인식수익 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">년별 인식수익</CardTitle>
              </CardHeader>
              <CardContent>
                {yearlyRevenueChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={yearlyRevenueChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "인식수익"]} />
                      <Bar dataKey="인식수익" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 년별 현금영수증 처리 합계 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">년별 현금영수증 처리 합계</CardTitle>
              </CardHeader>
              <CardContent>
                {yearlyCashReceiptChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={yearlyCashReceiptChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "현금영수증 처리액"]} />
                      <Bar dataKey="금액" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
        </TabsContent>

        <TabsContent value="expense" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">사업비용</h2>
            <p className="text-sm text-muted-foreground mt-0.5">광고비·대납·세금 등 사업 관련 지출을 월별로 관리합니다</p>
          </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10"><Receipt className="w-5 h-5 text-red-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{month}월 사업비용</p>
                  <p className="text-xl font-bold text-foreground">{fmt(monthExpenseTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10"><Receipt className="w-5 h-5 text-orange-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{year}년 사업비용</p>
                  <p className="text-xl font-bold text-foreground">{fmt(yearExpenseTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{year}년 비용처리 대상</p>
                  <p className="text-xl font-bold text-foreground">{fmt(yearTaxDeductibleExpense)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="monthly">
          <TabsList>
            <TabsTrigger value="monthly">월별 내역</TabsTrigger>
            <TabsTrigger value="all">전체 내역</TabsTrigger>
            <TabsTrigger value="chart">그래프</TabsTrigger>
          </TabsList>
          <TabsContent value="monthly" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{year}년 {month}월 사업비용 내역</CardTitle>
              </CardHeader>
              <CardContent>
                {expenseLoading ? (
                  <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
                ) : monthlyExpenses.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">이번 달 사업비용 내역이 없습니다</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setExpenseEditing(null); setExpenseDialogOpen(true); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                    </Button>
                  </div>
                ) : (
                  <>
                    {renderExpenseTable(monthlyExpenses)}
                    <div className="mt-2 pt-2 border-t flex justify-end gap-8 text-sm px-3">
                      <span className="text-muted-foreground font-medium">합계</span>
                      <span className="font-bold text-red-500">{fmt(monthExpenseTotal)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">전체 사업비용 내역 ({expenseRows.length}건)</CardTitle>
              </CardHeader>
              <CardContent>
                {expenseLoading ? (
                  <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
                ) : expenseRows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">사업비용 내역이 없습니다</div>
                ) : (
                  renderExpenseTable(expenseRows)
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="chart" className="mt-4 grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{year}년 월별 사업비용</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={expenseMonthlyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`₩${v.toLocaleString("ko-KR")}`, "사업비용"]} />
                    <Bar dataKey="비용" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{year}년 카테고리별 사업비용</CardTitle></CardHeader>
              <CardContent>
                {expenseCategoryChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={expenseCategoryChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {expenseCategoryChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `₩${v.toLocaleString("ko-KR")}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </TabsContent>
      </Tabs>

      {/* 정산 완료 다이얼로그 */}
      <SettlementDialog
        open={settlementTarget !== null}
        onClose={() => setSettlementTarget(null)}
        onConfirm={(settlementDate) => {
          if (settlementTarget !== null) {
            updateMutation.mutate({ id: settlementTarget, data: { isCompleted: true, settlementDate } });
            setSettlementTarget(null);
          }
        }}
      />

      {/* 추가/수정 다이얼로그 */}
      {dialogOpen && (
        <BusinessIncomeDialog
          key={editing ? `edit-${editing.id}` : "new"}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          editing={editing}
          onSave={handleSave}
        />
      )}

      {expenseDialogOpen && (
        <BusinessExpenseDialog
          key={expenseEditing ? `expense-edit-${expenseEditing.id}` : "expense-new"}
          open={expenseDialogOpen}
          onClose={() => { setExpenseDialogOpen(false); setExpenseEditing(null); }}
          editing={expenseEditing}
          onSave={handleExpenseSave}
          cardList={cardList as CardRow[]}
          accountList={accountList as AccountRow[]}
        />
      )}

      {/* 삭제 확인 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>사업소득 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseDeleteId !== null} onOpenChange={() => setExpenseDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>사업비용 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 사업비용 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => expenseDeleteId !== null && deleteExpenseMutation.mutate({ id: expenseDeleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
