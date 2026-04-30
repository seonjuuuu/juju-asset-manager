import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Wallet } from "lucide-react";

const LOAN_TYPES = ["주택담보대출", "신용대출", "전세대출", "사업자대출", "마이너스통장", "기타"] as const;
const REPAYMENT_TYPES = ["원리금균등", "원금균등", "만기일시", "체납식", "수동입력"] as const;

type Loan = {
  id: number;
  name: string;
  loanType: string;
  lender: string | null;
  principalAmount: number;
  remainingPrincipal: number;
  interestRate: string | null;
  repaymentType: string;
  startDate: string;
  maturityDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  graceMonths: number | null;
  note: string | null;
  isActive: boolean;
};

const EMPTY_FORM = {
  name: "",
  loanType: "신용대출",
  lender: "",
  principalAmount: 0,
  remainingPrincipal: 0,
  interestRate: "",
  repaymentType: "수동입력",
  startDate: "",
  maturityDate: "",
  paymentDay: "",
  monthlyPayment: 0,
  graceMonths: 0,
  note: "",
};

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function loanAppliesToMonth(loan: Loan, year: number, month: number) {
  const key = monthKey(year, month);
  if (loan.startDate && loan.startDate.slice(0, 7) > key) return false;
  if (loan.maturityDate && loan.maturityDate.slice(0, 7) < key) return false;
  if (loan.remainingPrincipal <= 0) return false;
  return true;
}

function isLoanDone(loan: Loan) {
  const today = new Date().toISOString().slice(0, 10);
  return loan.remainingPrincipal <= 0 || (!!loan.maturityDate && loan.maturityDate < today);
}

function progressPercent(loan: Loan) {
  if (!loan.principalAmount) return 0;
  return Math.min(100, Math.max(0, Math.round(((loan.principalAmount - loan.remainingPrincipal) / loan.principalAmount) * 100)));
}

function LoanDialog({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Loan | null;
  onClose: () => void;
  onSave: (form: typeof EMPTY_FORM) => void;
}) {
  const [form, setForm] = useState(() => editing ? {
    name: editing.name,
    loanType: editing.loanType,
    lender: editing.lender ?? "",
    principalAmount: editing.principalAmount,
    remainingPrincipal: editing.remainingPrincipal,
    interestRate: editing.interestRate ?? "",
    repaymentType: editing.repaymentType,
    startDate: editing.startDate,
    maturityDate: editing.maturityDate ?? "",
    paymentDay: editing.paymentDay ? String(editing.paymentDay) : "",
    monthlyPayment: editing.monthlyPayment,
    graceMonths: editing.graceMonths ?? 0,
    note: editing.note ?? "",
  } : { ...EMPTY_FORM });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "대출 수정" : "대출 추가"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1">
            <Label>대출명 *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 우리은행 신용대출" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>대출종류</Label>
              <Select value={form.loanType} onValueChange={(value) => setForm((f) => ({ ...f, loanType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOAN_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>상환방식</Label>
              <Select value={form.repaymentType} onValueChange={(value) => setForm((f) => ({ ...f, repaymentType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPAYMENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>금융기관</Label>
            <Input value={form.lender} onChange={(e) => setForm((f) => ({ ...f, lender: e.target.value }))} placeholder="예: 국민은행" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>대출원금</Label>
              <CurrencyInput value={form.principalAmount} onChange={(value) => setForm((f) => ({ ...f, principalAmount: value, remainingPrincipal: f.remainingPrincipal || value }))} />
            </div>
            <div className="space-y-1">
              <Label>남은 원금</Label>
              <CurrencyInput value={form.remainingPrincipal} onChange={(value) => setForm((f) => ({ ...f, remainingPrincipal: value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>금리(%)</Label>
              <Input value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="예: 4.5" />
            </div>
            <div className="space-y-1">
              <Label>상환일</Label>
              <Input type="number" min={1} max={31} value={form.paymentDay} onChange={(e) => setForm((f) => ({ ...f, paymentDay: e.target.value }))} placeholder="예: 25" />
            </div>
            <div className="space-y-1">
              <Label>거치기간(개월)</Label>
              <Input type="number" min={0} value={form.graceMonths} onChange={(e) => setForm((f) => ({ ...f, graceMonths: Number(e.target.value) || 0 }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>시작일 *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>만기일</Label>
              <Input type="date" value={form.maturityDate} onChange={(e) => setForm((f) => ({ ...f, maturityDate: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>월 상환액</Label>
            <CurrencyInput value={form.monthlyPayment} onChange={(value) => setForm((f) => ({ ...f, monthlyPayment: value }))} />
            <p className="text-xs text-muted-foreground">현재는 직접 입력 기준으로 월별 합계를 계산합니다.</p>
          </div>

          <div className="space-y-1">
            <Label>메모</Label>
            <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="중도상환 계획, 우대금리 조건 등" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => {
            if (!form.name.trim()) { toast.error("대출명을 입력하세요"); return; }
            if (!form.startDate) { toast.error("시작일을 입력하세요"); return; }
            onSave(form);
          }}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Loans() {
  const utils = trpc.useUtils();
  const { data: loans = [] } = trpc.loan.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [statusTab, setStatusTab] = useState<"active" | "completed">("active");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const activeLoans = (loans as Loan[]).filter((loan) => !isLoanDone(loan));
  const completedLoans = (loans as Loan[]).filter(isLoanDone);
  const visibleLoans = statusTab === "completed" ? completedLoans : activeLoans;
  const monthLoans = activeLoans.filter((loan) => loanAppliesToMonth(loan, year, month));
  const monthlyTotal = monthLoans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);
  const remainingTotal = activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);

  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, month - 1 + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const total = activeLoans
        .filter((loan) => loanAppliesToMonth(loan, y, m))
        .reduce((sum, loan) => sum + loan.monthlyPayment, 0);
      return { month: `${y !== year ? `${String(y).slice(2)}년 ` : ""}${String(m).padStart(2, "0")}월`, total, isCurrent: i === 0 };
    });
  }, [activeLoans, year, month]);

  const createMutation = trpc.loan.create.useMutation({
    onSuccess: () => { utils.loan.list.invalidate(); toast.success("대출이 추가되었습니다"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.loan.update.useMutation({
    onSuccess: () => { utils.loan.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.loan.delete.useMutation({
    onSuccess: () => { utils.loan.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  function handleSave(form: typeof EMPTY_FORM) {
    const payload = {
      name: form.name,
      loanType: form.loanType as (typeof LOAN_TYPES)[number],
      lender: form.lender || null,
      principalAmount: form.principalAmount,
      remainingPrincipal: form.remainingPrincipal,
      interestRate: form.interestRate || "0",
      repaymentType: form.repaymentType as (typeof REPAYMENT_TYPES)[number],
      startDate: form.startDate,
      maturityDate: form.maturityDate || null,
      paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
      monthlyPayment: form.monthlyPayment,
      graceMonths: form.graceMonths,
      note: form.note || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">대출</h1>
          <p className="text-muted-foreground text-sm mt-0.5">대출 원금, 상환 방식, 월 상환액 관리</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> 대출 추가
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">이달 상환 예정액</p>
            <p className="text-xl font-bold">₩{formatAmount(monthlyTotal)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">남은 원금</p>
            <p className="text-xl font-bold">₩{formatAmount(remainingTotal)}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list" className="text-sm">목록</TabsTrigger>
          <TabsTrigger value="chart" className="text-sm">그래프</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{statusTab === "completed" ? "완납된 대출 목록" : "진행중 대출 목록"}</p>
            <div className="inline-flex rounded-full border border-border bg-background p-1">
              {[
                { key: "active", label: `진행중 ${activeLoans.length}` },
                { key: "completed", label: `완납 ${completedLoans.length}` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusTab(tab.key as "active" | "completed")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">대출명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">종류</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상환방식</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">월 상환액</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">남은 원금</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">진행률</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상환일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">만기일</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLoans.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                        {statusTab === "completed" ? "완납된 대출이 없습니다" : "진행중 대출이 없습니다"}
                      </td>
                    </tr>
                  ) : visibleLoans.map((loan) => {
                    const progress = progressPercent(loan);
                    return (
                      <tr key={loan.id} className="border-t border-border transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{loan.name}</p>
                          <p className="text-xs text-muted-foreground">{loan.lender ?? "-"}</p>
                          {loan.note && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">{loan.note}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{loan.loanType}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{loan.repaymentType}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-primary">₩{formatAmount(loan.monthlyPayment)}</td>
                        <td className="px-4 py-3 text-sm text-right">₩{formatAmount(loan.remainingPrincipal)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{progress}% 상환</span>
                              <span>{loan.interestRate ?? "0"}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{loan.paymentDay ? `${loan.paymentDay}일` : "-"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{loan.maturityDate ?? "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => { setEditing(loan); setDialogOpen(true); }} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteId(loan.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
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
          </div>
        </TabsContent>
        <TabsContent value="chart" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-1">월별 대출 상환 예정</h3>
            <p className="text-xs text-muted-foreground mb-4">이번 달부터 12개월 기준</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip
                  formatter={(value: number) => [`₩${formatAmount(value)}`, "상환 예정액"]}
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isCurrent ? "#f97316" : "#5b7cfa"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>

      {dialogOpen && (
        <LoanDialog
          open={dialogOpen}
          editing={editing}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>대출 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 대출을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
