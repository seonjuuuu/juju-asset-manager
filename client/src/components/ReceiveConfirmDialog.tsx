import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { CalendarDays, AlertCircle } from "lucide-react";

type ShareStatus = "private" | "pending" | "accepted" | "rejected" | "shared";
type RepaymentType = "일시상환" | "할부상환" | "자유상환";

type BorrowedMoneyRow = {
  id: number;
  lenderUserId: number | null;
  borrowerUserId: number | null;
  lenderUserName?: string | null;
  borrowerUserName?: string | null;
  shareStatus: ShareStatus;
  lenderName: string;
  principalAmount: number;
  repaidAmount: number;
  repaymentType: RepaymentType;
  repaymentStartDate: string | null;
  repaymentDueDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  totalInstallments: number | null;
  installmentMode: "equal" | "custom";
  repaymentSchedule: string | null;
};

type PaymentRow = {
  borrowedMoneyId: number;
  installmentNo: number | null;
};

type PendingItem = {
  item: BorrowedMoneyRow;
  installmentNo: number | null;
  scheduledDate: string;
  suggestedAmount: number;
  daysOverdue: number;
  displayName: string;
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function monthIndex(y: number, m: number) { return y * 12 + m; }

function installmentNo(item: BorrowedMoneyRow, year: number, month: number): number | null {
  if (!item.repaymentStartDate || item.repaymentType !== "할부상환") return null;
  const [sy, sm] = item.repaymentStartDate.split("-").map(Number);
  const diff = monthIndex(year, month) - monthIndex(sy, sm) + 1;
  if (diff < 1) return null;
  if (item.totalInstallments && diff > item.totalInstallments) return null;
  return diff;
}

function installmentAmountForNo(item: BorrowedMoneyRow, no: number): number {
  if (item.installmentMode === "custom") {
    try {
      const schedule = JSON.parse(item.repaymentSchedule ?? "[]") as number[];
      return schedule[no - 1] ?? 0;
    } catch { return 0; }
  }
  return item.monthlyPayment;
}

function scheduledDateForMonth(item: BorrowedMoneyRow, year: number, month: number): string {
  const monthKey = `${year}-${pad2(month)}`;
  if (item.repaymentType === "할부상환") {
    const fallbackDay = Number(item.repaymentStartDate?.slice(8, 10)) || 1;
    const paymentDay = item.paymentDay ?? fallbackDay;
    const lastDay = new Date(year, month, 0).getDate();
    return `${monthKey}-${pad2(Math.min(Math.max(paymentDay, 1), lastDay))}`;
  }
  return item.repaymentDueDate ?? "";
}

function diffDays(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86400000);
}

export default function ReceiveConfirmDialog() {
  const { data: me } = trpc.auth.me.useQuery();
  const currentUserId = typeof (me as { id?: unknown } | null | undefined)?.id === "number"
    ? (me as { id: number }).id
    : null;

  const { data: borrowedList = [] } = trpc.borrowedMoney.list.useQuery();
  const { data: allPayments = [] } = trpc.borrowedMoney.listPayments.useQuery();
  const { data: contacts = [] } = trpc.auth.contacts.useQuery();
  const { data: shareableUsers = [] } = trpc.auth.shareableUsers.useQuery();

  const utils = trpc.useUtils();
  const addPayment = trpc.borrowedMoney.addPayment.useMutation({
    onSuccess: () => utils.borrowedMoney.list.invalidate(),
  });
  const createLedger = trpc.ledger.create.useMutation();

  const contactNicknameById = useMemo(() =>
    new Map((contacts as { contactUserId: number; nickname: string }[]).map((c) => [c.contactUserId, c.nickname.trim()])),
    [contacts]
  );
  const userNameById = useMemo(() =>
    new Map((shareableUsers as { id: number; name?: string | null; email?: string | null }[]).map((u) => [
      u.id,
      u.name?.trim() || u.email?.split("@")[0] || `사용자 ${u.id}`,
    ])),
    [shareableUsers]
  );

  const getDisplayName = (item: BorrowedMoneyRow): string => {
    const cpId = item.borrowerUserId;
    const officialName = item.borrowerUserName;
    if (cpId) {
      return contactNicknameById.get(cpId) || userNameById.get(cpId) || officialName?.split("@")[0] || item.lenderName;
    }
    return item.lenderName;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const pendingItems = useMemo((): PendingItem[] => {
    if (currentUserId === null) return [];
    const payments = allPayments as PaymentRow[];
    const result: PendingItem[] = [];

    for (const raw of borrowedList as BorrowedMoneyRow[]) {
      const item = raw;
      if (item.shareStatus === "private" || item.shareStatus === "pending" || item.shareStatus === "rejected") continue;
      if (item.lenderUserId !== currentUserId) continue;
      const remaining = Math.max(0, item.principalAmount - item.repaidAmount);
      if (remaining <= 0) continue;

      const displayName = getDisplayName(item);

      if (item.repaymentType === "할부상환") {
        if (!item.repaymentStartDate) continue;
        const [sy, sm] = item.repaymentStartDate.split("-").map(Number);
        const maxYear = today.getFullYear();
        const maxMonth = today.getMonth() + 1;
        const maxNo = monthIndex(maxYear, maxMonth) - monthIndex(sy, sm) + 1;
        if (maxNo < 1) continue;

        const paidNos = new Set(
          payments.filter((p) => p.borrowedMoneyId === item.id && p.installmentNo != null).map((p) => p.installmentNo!)
        );

        for (let no = 1; no <= Math.min(maxNo, item.totalInstallments ?? maxNo); no++) {
          if (paidNos.has(no)) continue;
          const monthOffset = monthIndex(sy, sm) + no - 1;
          const y = Math.floor(monthOffset / 12);
          const m = monthOffset % 12 || 12;
          const adjustedY = m === 12 ? y - 1 : y;
          const scheduledDate = scheduledDateForMonth(item, adjustedY, m);
          if (!scheduledDate || scheduledDate > todayStr) continue;
          const suggestedAmount = Math.min(remaining, installmentAmountForNo(item, no));
          result.push({ item, installmentNo: no, scheduledDate, suggestedAmount, daysOverdue: diffDays(scheduledDate), displayName });
        }
      } else {
        if (!item.repaymentDueDate || item.repaymentDueDate > todayStr) continue;
        const hasPayment = payments.some((p) => p.borrowedMoneyId === item.id);
        if (hasPayment && remaining <= 0) continue;
        result.push({
          item,
          installmentNo: null,
          scheduledDate: item.repaymentDueDate,
          suggestedAmount: remaining,
          daysOverdue: diffDays(item.repaymentDueDate),
          displayName,
        });
      }
    }

    return result.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }, [borrowedList, allPayments, currentUserId, contactNicknameById, userNameById, todayStr]);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const visibleItems = pendingItems.filter((p) => {
    const key = `${p.item.id}-${p.installmentNo ?? "x"}`;
    return !dismissedIds.has(key);
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const current = visibleItems[Math.min(currentIndex, visibleItems.length - 1)];

  if (!current) return null;

  const key = `${current.item.id}-${current.installmentNo ?? "x"}`;
  const amount = amounts[key] ?? current.suggestedAmount;

  const handleDismiss = () => {
    setDismissedIds((prev) => { const s = new Set(Array.from(prev)); s.add(key); return s; });
    setCurrentIndex((i) => Math.max(0, Math.min(i, visibleItems.length - 2)));
  };

  const handleConfirm = async () => {
    if (amount <= 0) { toast.error("받은 금액을 입력해주세요"); return; }
    const now = new Date();
    const paymentDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const noteText = current.installmentNo && current.item.totalInstallments
      ? `[빌린돈 받음] ${current.displayName} ${current.installmentNo}/${current.item.totalInstallments}회차`
      : `[빌린돈 받음] ${current.displayName}`;

    try {
      await addPayment.mutateAsync({
        borrowedMoneyId: current.item.id,
        paymentDate,
        amount,
        installmentNo: current.installmentNo ?? undefined,
        note: noteText,
      });
      await createLedger.mutateAsync({
        entryDate: paymentDate,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        mainCategory: "기타소득",
        subCategory: "빌린돈 회수",
        description: current.displayName,
        amount,
        note: noteText,
      });
      await utils.borrowedMoney.listPayments.invalidate();
      await utils.ledger.list.invalidate();
      toast.success(`${current.displayName}에게 ₩${formatAmount(amount)} 받음 처리 완료`);
      setDismissedIds((prev) => { const s = new Set(Array.from(prev)); s.add(key); return s; });
      setCurrentIndex((i) => Math.max(0, Math.min(i, visibleItems.length - 2)));
    } catch (e) {
      toast.error("처리 중 오류가 발생했습니다");
    }
  };

  const total = visibleItems.length;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            받을 돈 확인
            {total > 1 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {Math.min(currentIndex, total - 1) + 1} / {total}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-base font-semibold text-foreground">
              <span className="text-emerald-700 dark:text-emerald-400">{current.displayName}</span>에게 받을 돈이 있어요
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                예정일 {current.scheduledDate}
              </span>
              {current.daysOverdue > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {current.daysOverdue}일 지남
                </span>
              )}
              {current.installmentNo && current.item.totalInstallments && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {current.installmentNo}/{current.item.totalInstallments}회차
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>받은 금액</Label>
            <CurrencyInput
              value={amount}
              onChange={(v) => setAmounts((prev) => ({ ...prev, [key]: v }))}
              suffix="원"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {total > 1 && currentIndex > 0 && (
            <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setCurrentIndex((i) => i - 1)}>
              이전
            </Button>
          )}
          <Button variant="outline" onClick={handleDismiss} disabled={addPayment.isPending}>
            아직이요
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={addPayment.isPending || createLedger.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {addPayment.isPending ? "처리 중…" : "받았어요"}
          </Button>
        </DialogFooter>

        {total > 1 && currentIndex < total - 1 && (
          <p
            className="cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setCurrentIndex((i) => i + 1)}
          >
            다음 항목 보기 →
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
