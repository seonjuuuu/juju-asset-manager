import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Shield, CalendarIcon } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface InsuranceRecord {
  id: number;
  name: string;
  insuranceType: "보장형" | "저축형" | null;
  paymentMethod: string | null;
  startDate: string;
  endDate: string | null;
  renewalType: "비갱신형" | "갱신형";
  renewalCycleYears: number | null;
  paymentType: "monthly" | "annual";
  paymentDay: number | null;
  paymentAmount: number;
  durationYears: number | null;
  note: string | null;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function isValidDate(value: string): boolean {
  if (!value) return false;
  return !isNaN(new Date(value).getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function totalPayments(rec: InsuranceRecord): number {
  if (!rec.durationYears) return 0;
  return rec.paymentType === "monthly" ? rec.durationYears * 12 : rec.durationYears;
}

function completedPayments(rec: InsuranceRecord): number {
  if (!rec.startDate || !rec.durationYears) return 0;
  const [sy, sm] = rec.startDate.split("-").map(Number);
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  const nowD = now.getDate();
  const payDay = Math.min(rec.paymentDay ?? 1, 28);
  const total = totalPayments(rec);

  if (rec.paymentType === "monthly") {
    let count = 0;
    for (let k = 1; k <= total; k++) {
      const payMonth = sm + k;
      const payYear = sy + Math.floor((payMonth - 1) / 12);
      const payMonthNorm = ((payMonth - 1) % 12) + 1;
      if (
        payYear < nowY ||
        (payYear === nowY && payMonthNorm < nowM) ||
        (payYear === nowY && payMonthNorm === nowM && payDay <= nowD)
      ) {
        count = k;
      } else {
        break;
      }
    }
    return count;
  } else {
    let count = 0;
    for (let k = 1; k <= total; k++) {
      const payYear = sy + k;
      if (
        payYear < nowY ||
        (payYear === nowY && sm < nowM) ||
        (payYear === nowY && sm === nowM && payDay <= nowD)
      ) {
        count = k;
      } else {
        break;
      }
    }
    return count;
  }
}

function totalPremium(rec: InsuranceRecord): number {
  const t = totalPayments(rec);
  return rec.paymentAmount * t;
}

function monthlyEquivalent(rec: InsuranceRecord): number {
  if (rec.paymentType === "monthly") return rec.paymentAmount;
  return Math.round(rec.paymentAmount / 12);
}

function ageAtDate(birthDate: string, targetDate: string): number | null {
  if (!isValidDate(birthDate) || !isValidDate(targetDate)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = targetDate.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

function calcEndDateFromStart(startDate: string, durationYears: number): string {
  if (!startDate || !durationYears) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  const endY = y + durationYears;
  return `${endY}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ─── DatePickerField ──────────────────────────────────────────────────────────
function DatePickerField({
  label,
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const invalid = value && !isValidDate(value);

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const digits = raw.replace(/\D/g, "");
            if (digits.length === 8) {
              onChange(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
            } else {
              onChange(raw);
            }
          }}
          placeholder={placeholder}
          className={invalid ? "border-destructive" : ""}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="flex-shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={isValidDate(value) ? new Date(value) : undefined}
              onSelect={(d) => {
                if (d) {
                  onChange(d.toISOString().slice(0, 10));
                  setOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid && <p className="text-xs text-destructive">날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)</p>}
    </div>
  );
}

// ─── 다이얼로그 폼 ────────────────────────────────────────────────────────────
const defaultForm = {
  name: "",
  insuranceType: null as "보장형" | "저축형" | null,
  paymentMethod: "",
  startDate: "",
  endDate: "",
  renewalType: "비갱신형" as "비갱신형" | "갱신형",
  renewalCycleYears: "" as string,
  paymentType: "monthly" as "monthly" | "annual",
  paymentDay: "" as string,
  paymentAmount: 0,
  durationYears: "" as string,
  note: "",
};

function InsuranceDialog({
  open,
  onClose,
  editing,
  paymentOptions,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: InsuranceRecord | null;
  paymentOptions: { label: string; value: string }[];
  onSave: (data: typeof defaultForm) => void;
}) {
  const [form, setForm] = useState<typeof defaultForm>(() =>
    editing
      ? {
          name: editing.name,
          insuranceType: editing.insuranceType ?? null,
          paymentMethod: editing.paymentMethod ?? "",
          startDate: editing.startDate,
          endDate: editing.endDate ?? "",
          renewalType: editing.renewalType ?? "비갱신형",
          renewalCycleYears: editing.renewalCycleYears ? String(editing.renewalCycleYears) : "",
          paymentType: editing.paymentType,
          paymentDay: editing.paymentDay ? String(editing.paymentDay) : "",
          paymentAmount: editing.paymentAmount,
          durationYears: editing.durationYears ? String(editing.durationYears) : "",
          note: editing.note ?? "",
        }
      : { ...defaultForm }
  );

  const durYears = parseInt(form.durationYears) || 0;
  const total = form.paymentType === "monthly" ? durYears * 12 : durYears;
  const totalAmt = form.paymentAmount * total;
  const autoEndDate = form.startDate && durYears ? calcEndDateFromStart(form.startDate, durYears) : "";

  function handleDurationChange(val: string) {
    setForm((f) => {
      const years = parseInt(val) || 0;
      const end = f.startDate && years ? calcEndDateFromStart(f.startDate, years) : f.endDate;
      return { ...f, durationYears: val, endDate: end };
    });
  }

  function handleStartDateChange(val: string) {
    setForm((f) => {
      const years = parseInt(f.durationYears) || 0;
      const end = val && years ? calcEndDateFromStart(val, years) : f.endDate;
      return { ...f, startDate: val, endDate: end };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "보험 수정" : "보험 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* 보험명 */}
          <div className="space-y-1">
            <Label>보험명 *</Label>
            <Input
              placeholder="예: 삼성생명 종신보험"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* 보험 종류 */}
          <div className="space-y-1">
            <Label>보험 종류</Label>
            <div className="flex gap-2">
              {(["보장형", "저축형"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, insuranceType: f.insuranceType === type ? null : type }))
                  }
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.insuranceType === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* 갱신 여부 */}
          <div className="space-y-1">
            <Label>갱신 여부</Label>
            <div className="flex gap-2">
              {(["비갱신형", "갱신형"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      renewalType: type,
                      renewalCycleYears: type === "갱신형" ? f.renewalCycleYears : "",
                    }))
                  }
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.renewalType === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {form.renewalType === "갱신형" && (
            <div className="space-y-1">
              <Label>갱신 주기 (년) *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                placeholder="예: 3"
                value={form.renewalCycleYears}
                onChange={(e) => setForm((f) => ({ ...f, renewalCycleYears: e.target.value }))}
              />
            </div>
          )}

          {/* 납부 수단 */}
          <div className="space-y-1">
            <Label>납부 수단</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v === "none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="카드/계좌 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">없음</SelectItem>
                {paymentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 보험 가입 시기 */}
          <DatePickerField
            label="보험 가입 시기 *"
            value={form.startDate}
            onChange={handleStartDateChange}
            placeholder="YYYY-MM-DD"
          />

          {/* 납입 주기 */}
          <div className="space-y-1">
            <Label>납입 주기 *</Label>
            <div className="flex gap-2">
              {(["monthly", "annual"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, paymentType: type }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.paymentType === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {type === "monthly" ? "월납" : "연납"}
                </button>
              ))}
            </div>
          </div>

          {/* 납입일 + 납입액 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>납입일</Label>
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="예: 25"
                value={form.paymentDay}
                onChange={(e) => setForm((f) => ({ ...f, paymentDay: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{form.paymentType === "monthly" ? "월 납입액" : "연 납입액"} *</Label>
              <CurrencyInput
                value={form.paymentAmount}
                onChange={(v) => setForm((f) => ({ ...f, paymentAmount: v }))}
                placeholder="납입액 입력"
              />
            </div>
          </div>

          {/* 만기 년수 */}
          <div className="space-y-1">
            <Label>만기 년수</Label>
            <Input
              type="number"
              min={1}
              max={100}
              placeholder="예: 20"
              value={form.durationYears}
              onChange={(e) => handleDurationChange(e.target.value)}
            />
          </div>

          {/* 만기 날짜 */}
          <DatePickerField
            label={`만기 날짜${autoEndDate ? ` (자동계산: ${autoEndDate})` : ""}`}
            value={form.endDate}
            onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
            placeholder="YYYY-MM-DD"
          />

          {/* 납입 정보 미리보기 */}
          {form.paymentAmount > 0 && total > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 납입 횟수</span>
                <span className="font-semibold">{total}회</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 보험료</span>
                <span className="font-semibold text-primary">{formatKRW(totalAmt)}</span>
              </div>
              {form.paymentType === "annual" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">월 환산</span>
                  <span className="font-semibold">{formatKRW(Math.round(form.paymentAmount / 12))}</span>
                </div>
              )}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!form.name.trim()) { toast.error("보험명을 입력하세요"); return; }
              if (!form.startDate || !isValidDate(form.startDate)) { toast.error("보험 가입 시기를 올바르게 입력하세요"); return; }
              if (form.renewalType === "갱신형" && (!form.renewalCycleYears || parseInt(form.renewalCycleYears) <= 0)) { toast.error("갱신 주기를 입력하세요"); return; }
              if (form.paymentAmount <= 0) { toast.error("납입액을 입력하세요"); return; }
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
export default function Insurance() {
  const utils = trpc.useUtils();
  const dbUser = trpc.auth.me.useQuery().data as { name?: string | null; birthDate?: string | null } | null;
  const birthDate = dbUser?.birthDate ?? null;

  const { data: insuranceList = [] } = trpc.insurance.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: accountList = [] } = trpc.account.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMutation = trpc.insurance.create.useMutation({
    onSuccess: () => { utils.insurance.list.invalidate(); toast.success("보험이 추가되었습니다"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.insurance.update.useMutation({
    onSuccess: () => { utils.insurance.list.invalidate(); toast.success("보험이 수정되었습니다"); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.insurance.delete.useMutation({
    onSuccess: () => { utils.insurance.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  // 카드 + 계좌를 납부 수단 옵션으로 통합
  const paymentOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    for (const c of cardList) {
      opts.push({
        label: `[카드] ${c.cardCompany} ${c.cardName ?? ""}`.trim(),
        value: `[카드] ${c.cardCompany} ${c.cardName ?? ""}`.trim(),
      });
    }
    for (const a of accountList) {
      opts.push({
        label: `[계좌] ${a.bankName} ${a.accountType}`,
        value: `[계좌] ${a.bankName} ${a.accountType}`,
      });
    }
    return opts;
  }, [cardList, accountList]);

  function handleSave(form: typeof defaultForm) {
    const payload = {
      name: form.name,
      insuranceType: form.insuranceType ?? null,
      paymentMethod: form.paymentMethod || null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      renewalType: form.renewalType,
      renewalCycleYears: form.renewalType === "갱신형" && form.renewalCycleYears ? parseInt(form.renewalCycleYears) : null,
      paymentType: form.paymentType,
      paymentDay: form.paymentDay ? parseInt(form.paymentDay) : null,
      paymentAmount: form.paymentAmount,
      durationYears: form.durationYears ? parseInt(form.durationYears) : null,
      note: form.note || null,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // 요약
  const monthlyTotal = useMemo(
    () => insuranceList.reduce((sum, r) => sum + monthlyEquivalent(r as InsuranceRecord), 0),
    [insuranceList]
  );
  const annualTotal = useMemo(
    () => monthlyTotal * 12,
    [monthlyTotal]
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">보험</h1>
          <p className="text-muted-foreground text-sm mt-1">보험 납입 현황을 관리합니다</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">보험 추가</span><span className="sm:hidden">추가</span>
        </Button>
      </div>

      {/* 생년월일 미설정 안내 */}
      {!birthDate && insuranceList.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Shield className="w-4 h-4 flex-shrink-0" />
          <span>
            <a href="/profile" className="font-semibold underline underline-offset-2">내 정보</a>에서 생년월일을 입력하면 보험 만기 시 나이를 확인할 수 있습니다.
          </span>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Shield className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">가입 보험</p>
                <p className="text-xl font-bold text-foreground">{insuranceList.length}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><CreditCard className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">월 납입 총액</p>
                <p className="text-xl font-bold text-foreground">{formatKRW(monthlyTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><Shield className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">연간 총 보험료</p>
                <p className="text-xl font-bold text-foreground">{formatKRW(annualTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 보험 목록 */}
      {insuranceList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            등록된 보험이 없습니다. 보험을 추가해 보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(insuranceList as InsuranceRecord[]).map((rec) => {
            const completed = completedPayments(rec);
            const total = totalPayments(rec);
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            const premium = totalPremium(rec);
            const monthly = monthlyEquivalent(rec);
            const isExpired = rec.endDate ? new Date(rec.endDate) < new Date() : false;
            const expiryDate = rec.endDate ?? (rec.durationYears && rec.startDate ? calcEndDateFromStart(rec.startDate, rec.durationYears) : null);
            const ageAtExpiry = birthDate && expiryDate ? ageAtDate(birthDate, expiryDate) : null;

            return (
              <Card key={rec.id} className="relative overflow-hidden">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base truncate">{rec.name}</p>
                      {rec.paymentMethod && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CreditCard className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{rec.paymentMethod}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2 flex-shrink-0 flex-wrap justify-end">
                      {rec.insuranceType && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${rec.insuranceType === "보장형" ? "border-blue-400 text-blue-600 dark:text-blue-400" : "border-emerald-400 text-emerald-600 dark:text-emerald-400"}`}
                        >
                          {rec.insuranceType}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {rec.renewalType === "갱신형" && rec.renewalCycleYears
                          ? `${rec.renewalCycleYears}년 갱신`
                          : "비갱신형"}
                      </Badge>
                      <Badge variant={rec.paymentType === "monthly" ? "secondary" : "outline"} className="text-xs">
                        {rec.paymentType === "monthly" ? "월납" : "연납"}
                      </Badge>
                      {isExpired && <Badge variant="outline" className="text-xs text-muted-foreground">만기</Badge>}
                    </div>
                  </div>

                  {/* 금액 정보 */}
                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">월 납입액</p>
                      <p className="font-bold text-primary">{formatKRW(monthly)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">총 보험료</p>
                      <p className="font-semibold">{premium > 0 ? formatKRW(premium) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">납입 현황</p>
                      <p className="font-semibold">{total > 0 ? `${completed}/${total}회` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">만기일</p>
                      <p className="font-semibold text-xs">{expiryDate ?? "—"}</p>
                      {ageAtExpiry !== null && (
                        <p className="text-xs text-muted-foreground">만기 시 <span className="font-semibold text-foreground">{ageAtExpiry}세</span></p>
                      )}
                    </div>
                  </div>

                  {/* 진행바 */}
                  {total > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>가입: {rec.startDate}</span>
                        <span>{progress}% 납입</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {rec.note && <p className="text-xs text-muted-foreground mb-3">{rec.note}</p>}

                  {/* 액션 */}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setEditing(rec); setDialogOpen(true); }}
                    >
                      <Pencil className="w-3 h-3 mr-1" /> 수정
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(rec.id)}
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

      {/* 추가/수정 다이얼로그 */}
      {dialogOpen && (
        <InsuranceDialog
          key={editing ? `edit-${editing.id}` : "new"}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          editing={editing}
          paymentOptions={paymentOptions}
          onSave={handleSave}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>보험 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 보험 항목을 삭제하시겠습니까?</p>
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
