import { useMemo, useState } from "react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { FlexibleDateField } from "@/components/FlexibleDateField";
import { trpc } from "@/lib/trpc";
import { isCompleteCalendarDate } from "@/lib/flexibleDateInput";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";

type RepaymentType = "일시상환" | "할부상환" | "자유상환";
type ShareStatus = "private" | "pending" | "accepted" | "rejected" | "shared";

type BorrowedMoneyRow = {
  id: number;
  userId: number;
  lenderUserId: number | null;
  borrowerUserId: number | null;
  shareStatus: ShareStatus;
  lenderName: string;
  principalAmount: number;
  repaidAmount: number;
  borrowedDate: string | null;
  repaymentType: RepaymentType;
  repaymentStartDate: string | null;
  repaymentDueDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  totalInstallments: number | null;
  installmentMode: "equal" | "custom";
  repaymentSchedule: string | null;
  note: string | null;
};

type BorrowedMoneyForm = {
  direction: "pay" | "receive";
  lenderName: string;
  sharedBorrowerUserId: number | null;
  principalAmount: number;
  repaidAmount: number;
  borrowedDate: string;
  repaymentType: RepaymentType;
  repaymentStartDate: string;
  repaymentDueDate: string;
  paymentDay: number;
  monthlyPayment: number;
  totalInstallments: number;
  installmentMode: "equal" | "custom";
  repaymentSchedule: number[];
  note: string;
};

type BorrowedMoneyPaymentRow = {
  id: number;
  borrowedMoneyId: number;
  paymentDate: string;
  amount: number;
  installmentNo: number | null;
  note: string | null;
};

type PaymentForm = {
  borrowedMoneyId: number;
  paymentDate: string;
  amount: number;
  installmentNo: number;
  note: string;
};

type ShareableUser = {
  id: number;
  name: string | null;
  email: string | null;
};

type UserContact = {
  id: number;
  contactUserId: number;
  nickname: string;
  name: string | null;
  email: string | null;
};

const EMPTY_FORM: BorrowedMoneyForm = {
  direction: "pay",
  lenderName: "",
  sharedBorrowerUserId: null,
  principalAmount: 0,
  repaidAmount: 0,
  borrowedDate: "",
  repaymentType: "자유상환",
  repaymentStartDate: "",
  repaymentDueDate: "",
  paymentDay: 10,
  monthlyPayment: 0,
  totalInstallments: 1,
  installmentMode: "equal",
  repaymentSchedule: [0],
  note: "",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function addOneMonth(dateValue: string) {
  if (!isCompleteCalendarDate(dateValue)) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  const next = new Date(year, month, 1);
  const nextYear = next.getFullYear();
  const nextMonth = next.getMonth() + 1;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  return `${nextYear}-${pad2(nextMonth)}-${pad2(Math.min(day, lastDay))}`;
}

function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

function remainingAmount(item: Pick<BorrowedMoneyRow, "principalAmount" | "repaidAmount">) {
  return Math.max(0, item.principalAmount - item.repaidAmount);
}

function installmentAmount(principalAmount: number, repaidAmount: number, totalInstallments: number) {
  const remaining = Math.max(0, principalAmount - repaidAmount);
  if (remaining <= 0 || totalInstallments <= 0) return 0;
  return Math.ceil(remaining / totalInstallments);
}

function normalizeSchedule(values: number[], count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => Math.max(0, values[index] ?? 0));
}

function parseSchedule(value: string | null | undefined, count: number) {
  if (!value) return normalizeSchedule([], count);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return normalizeSchedule([], count);
    return normalizeSchedule(parsed.map((item) => Number(item) || 0), count);
  } catch {
    return normalizeSchedule([], count);
  }
}

function installmentAmountForNo(item: BorrowedMoneyRow, no: number) {
  if (item.installmentMode === "custom") {
    const schedule = parseSchedule(item.repaymentSchedule, item.totalInstallments ?? 1);
    return schedule[no - 1] ?? 0;
  }
  return item.monthlyPayment;
}

function oneTimeApplies(item: BorrowedMoneyRow, year: number, month: number) {
  if (!item.repaymentDueDate || remainingAmount(item) <= 0) return false;
  return item.repaymentDueDate.slice(0, 7) === `${year}-${pad2(month)}`;
}

function installmentNo(item: BorrowedMoneyRow, year: number, month: number) {
  if (!item.repaymentStartDate || item.repaymentType !== "할부상환") return null;
  const [sy, sm] = item.repaymentStartDate.split("-").map(Number);
  const diff = monthIndex(year, month) - monthIndex(sy, sm) + 1;
  if (diff < 1) return null;
  if (item.totalInstallments && diff > item.totalInstallments) return null;
  return diff;
}

function scheduledAmountForMonth(item: BorrowedMoneyRow, year: number, month: number) {
  if (item.shareStatus !== "private" && item.shareStatus !== "accepted" && item.shareStatus !== "shared") return 0;
  const remain = remainingAmount(item);
  if (remain <= 0) return 0;
  if (item.repaymentType === "할부상환") {
    const no = installmentNo(item, year, month);
    if (!no) return 0;
    const amount = installmentAmountForNo(item, no);
    if (!amount || amount <= 0) return 0;
    return Math.min(remain, amount);
  }
  if (item.repaymentType === "일시상환" && oneTimeApplies(item, year, month)) return remain;
  if (item.repaymentType === "자유상환" && oneTimeApplies(item, year, month)) return remain;
  return 0;
}

export default function BorrowedMoney() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const [viewMode, setViewMode] = useState<"all" | "pay" | "receive">("all");
  const [lenderInputFocused, setLenderInputFocused] = useState(false);
  const [lenderSuggestionIndex, setLenderSuggestionIndex] = useState(0);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactNickname, setContactNickname] = useState("");
  const [selectedContactUser, setSelectedContactUser] = useState<ShareableUser | null>(null);
  const [todayAlertDismissed, setTodayAlertDismissed] = useState(false);
  const [editing, setEditing] = useState<BorrowedMoneyRow | null>(null);
  const [form, setForm] = useState<BorrowedMoneyForm>(EMPTY_FORM);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    borrowedMoneyId: 0,
    paymentDate: `${currentYear}-${pad2(currentMonth)}-${pad2(now.getDate())}`,
    amount: 0,
    installmentNo: 1,
    note: "",
  });

  const { data: me } = trpc.auth.me.useQuery();
  const { data: contacts = [] } = trpc.auth.contacts.useQuery();
  const { data: searchedUsers = [] } = trpc.auth.searchUsers.useQuery(
    { query: contactSearch },
    { enabled: contactSearch.trim().length >= 2 },
  );
  const { data: rows = [], isLoading } = trpc.borrowedMoney.list.useQuery();
  const { data: payments = [] } = trpc.borrowedMoney.listPayments.useQuery({});

  const activeRows = rows as BorrowedMoneyRow[];
  const currentUserId = typeof (me as { id?: unknown } | null | undefined)?.id === "number" ? (me as { id: number }).id : null;
  const contactOptions = contacts as UserContact[];
  const userOptions = contactOptions.map((contact) => ({
    id: contact.contactUserId,
    name: contact.nickname,
    email: contact.email,
  }));
  const contactSearchResults = searchedUsers as ShareableUser[];
  const displayUserName = (user: ShareableUser) => user.name?.trim() || user.email?.split("@")[0] || `사용자 ${user.id}`;
  const userNameById = new Map(userOptions.map((user) => [user.id, displayUserName(user)]));
  const lenderQuery = form.lenderName.trim().toLowerCase();
  const lenderSuggestions = lenderQuery
    ? userOptions
      .filter((user) => displayUserName(user).toLowerCase().includes(lenderQuery))
      .slice(0, 5)
    : [];
  const showLenderSuggestions = lenderInputFocused && lenderSuggestions.length > 0;
  const selectLenderUser = (user: ShareableUser) => {
    setForm((prev) => ({
      ...prev,
      lenderName: displayUserName(user),
      sharedBorrowerUserId: user.id,
    }));
    setLenderInputFocused(false);
  };
  const upsertContact = trpc.auth.upsertContact.useMutation({
    onSuccess: () => {
      utils.auth.contacts.invalidate();
      toast.success("연락처가 저장되었습니다");
      if (selectedContactUser) {
        setForm((prev) => ({
          ...prev,
          lenderName: contactNickname.trim(),
          sharedBorrowerUserId: selectedContactUser.id,
        }));
      }
      setContactDialogOpen(false);
      setContactSearch("");
      setContactNickname("");
      setSelectedContactUser(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const isAcceptedShared = (item: BorrowedMoneyRow) => item.shareStatus === "accepted" || item.shareStatus === "shared";
  const isSharedRow = (item: BorrowedMoneyRow) => item.shareStatus !== "private";
  const isReceiveRow = (item: BorrowedMoneyRow) => currentUserId !== null && isSharedRow(item) && item.lenderUserId === currentUserId;
  const isPayRow = (item: BorrowedMoneyRow) => currentUserId === null || !isSharedRow(item) || item.borrowerUserId === currentUserId;
  const isIncomingPending = (item: BorrowedMoneyRow) => currentUserId !== null && item.shareStatus === "pending" && item.borrowerUserId === currentUserId;
  const visibleRows = activeRows.filter((item) => {
    if (viewMode === "receive") return isReceiveRow(item);
    if (viewMode === "pay") return isPayRow(item);
    return true;
  });
  const confirmedVisibleRows = visibleRows.filter((item) => item.shareStatus === "private" || isAcceptedShared(item));
  const paymentRows = payments as BorrowedMoneyPaymentRow[];
  const selectedDate = new Date(currentYear, currentMonth - 1 + monthOffset, 1);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth() + 1;
  const selectedMonthKey = `${selectedYear}-${pad2(selectedMonth)}`;
  const totalPrincipal = confirmedVisibleRows.reduce((sum, item) => sum + item.principalAmount, 0);
  const totalRepaid = confirmedVisibleRows.reduce((sum, item) => sum + item.repaidAmount, 0);
  const totalRemaining = confirmedVisibleRows.reduce((sum, item) => sum + remainingAmount(item), 0);
  const thisMonthScheduled = confirmedVisibleRows.reduce((sum, item) => sum + scheduledAmountForMonth(item, currentYear, currentMonth), 0);
  const selectedMonthSchedule = useMemo(() => {
    return visibleRows
      .map((item) => {
        const amount = scheduledAmountForMonth(item, selectedYear, selectedMonth);
        if (amount <= 0) return null;
        const no = installmentNo(item, selectedYear, selectedMonth);
        const fallbackDay = Number(item.repaymentStartDate?.slice(8, 10)) || 1;
        const paymentDay = item.paymentDay ?? fallbackDay;
        const date =
          item.repaymentType === "할부상환"
            ? `${selectedMonthKey}-${pad2(Math.min(Math.max(paymentDay, 1), new Date(selectedYear, selectedMonth, 0).getDate()))}`
            : item.repaymentDueDate ?? `${selectedMonthKey}-01`;
        const progress = item.principalAmount > 0 ? Math.min(100, Math.round((item.repaidAmount / item.principalAmount) * 100)) : 0;
        return { item, amount, date, installmentNo: no, progress };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedMonth, selectedMonthKey, selectedYear, visibleRows]);
  const selectedMonthScheduledTotal = selectedMonthSchedule.reduce((sum, entry) => sum + entry.amount, 0);
  const todayKey = `${currentYear}-${pad2(currentMonth)}-${pad2(now.getDate())}`;
  const todayDueItems = useMemo(() => {
    return activeRows
      .map((item) => {
        const amount = scheduledAmountForMonth(item, currentYear, currentMonth);
        if (amount <= 0) return null;
        const fallbackDay = Number(item.repaymentStartDate?.slice(8, 10)) || 1;
        const paymentDay = item.paymentDay ?? fallbackDay;
        const date = item.repaymentType === "할부상환"
          ? `${currentYear}-${pad2(currentMonth)}-${pad2(Math.min(Math.max(paymentDay, 1), new Date(currentYear, currentMonth, 0).getDate()))}`
          : item.repaymentDueDate ?? "";
        if (date !== todayKey) return null;
        return { item, amount };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [activeRows, currentMonth, currentYear, todayKey]);

  const summaryRows = useMemo(
    () => visibleRows.map((item) => ({
      ...item,
      remaining: remainingAmount(item),
      progress: item.principalAmount > 0 ? Math.min(100, Math.round((item.repaidAmount / item.principalAmount) * 100)) : 0,
      scheduled: scheduledAmountForMonth(item, currentYear, currentMonth),
    })),
    [currentMonth, currentYear, visibleRows],
  );

  const invalidate = () => {
    utils.borrowedMoney.list.invalidate();
    utils.borrowedMoney.listPayments.invalidate();
    utils.ledger.list.invalidate();
    utils.ledger.monthSummary.invalidate();
  };

  const create = trpc.borrowedMoney.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("빌린돈이 추가되었습니다");
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.borrowedMoney.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("수정되었습니다");
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.borrowedMoney.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("삭제되었습니다");
    },
    onError: (error) => toast.error(error.message),
  });
  const addPayment = trpc.borrowedMoney.addPayment.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("상환 기록이 추가되었습니다");
      setPaymentDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const deletePayment = trpc.borrowedMoney.deletePayment.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("상환 기록이 삭제되었습니다");
    },
    onError: (error) => toast.error(error.message),
  });
  const acceptShare = trpc.borrowedMoney.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("요청을 수락했습니다");
    },
    onError: (error) => toast.error(error.message),
  });
  const rejectShare = trpc.borrowedMoney.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("요청을 거절했습니다");
    },
    onError: (error) => toast.error(error.message),
  });

  const openContactDialog = () => {
    setContactSearch(form.lenderName.trim());
    setContactNickname(form.lenderName.trim());
    setSelectedContactUser(null);
    setContactDialogOpen(true);
  };

  const handleContactSave = () => {
    if (!selectedContactUser) {
      toast.error("추가할 사용자를 선택해주세요");
      return;
    }
    if (!contactNickname.trim()) {
      toast.error("별칭을 입력해주세요");
      return;
    }
    upsertContact.mutate({
      contactUserId: selectedContactUser.id,
      nickname: contactNickname.trim(),
    });
  };

  const set = (key: keyof BorrowedMoneyForm, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const setInstallmentForm = (patch: Partial<BorrowedMoneyForm>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (
        next.repaymentType === "할부상환"
        && (
          "principalAmount" in patch
          || "repaidAmount" in patch
          || "totalInstallments" in patch
          || "repaymentType" in patch
          || "installmentMode" in patch
        )
      ) {
        const equalAmount = installmentAmount(next.principalAmount, next.repaidAmount, next.totalInstallments);
        next.repaymentSchedule = normalizeSchedule(next.repaymentSchedule, next.totalInstallments);
        if (next.installmentMode === "equal") {
          next.monthlyPayment = equalAmount;
        }
      }
      return next;
    });
  };

  const handleBorrowedDateChange = (value: string) => {
    setForm((prev) => {
      const nextDate = addOneMonth(value);
      return {
        ...prev,
        borrowedDate: value,
        repaymentStartDate: nextDate && (!prev.repaymentStartDate || prev.repaymentStartDate === addOneMonth(prev.borrowedDate)) ? nextDate : prev.repaymentStartDate,
        repaymentDueDate: nextDate && (!prev.repaymentDueDate || prev.repaymentDueDate === addOneMonth(prev.borrowedDate)) ? nextDate : prev.repaymentDueDate,
      };
    });
  };

  const openCreate = (direction: "pay" | "receive" = "pay") => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, direction });
    setDialogOpen(true);
  };

  const openEdit = (item: BorrowedMoneyRow) => {
    setEditing(item);
    const isReceivingItem = isReceiveRow(item);
    setForm({
      direction: isReceivingItem ? "receive" : "pay",
      lenderName: item.lenderName,
      sharedBorrowerUserId: item.shareStatus !== "private" ? (isReceivingItem ? item.borrowerUserId : item.lenderUserId) : null,
      principalAmount: item.principalAmount,
      repaidAmount: item.repaidAmount,
      borrowedDate: item.borrowedDate ?? "",
      repaymentType: item.repaymentType,
      repaymentStartDate: item.repaymentStartDate ?? "",
      repaymentDueDate: item.repaymentDueDate ?? "",
      paymentDay: item.paymentDay ?? 10,
      monthlyPayment: item.monthlyPayment,
      totalInstallments: item.totalInstallments ?? 1,
      installmentMode: item.installmentMode ?? "equal",
      repaymentSchedule: parseSchedule(item.repaymentSchedule, item.totalInstallments ?? 1),
      note: item.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.lenderName.trim()) {
      toast.error(form.direction === "receive" ? "받을 사람을 입력해주세요" : "빌린 사람/기관을 입력해주세요");
      return;
    }
    if (form.principalAmount <= 0) {
      toast.error(form.direction === "receive" ? "받을 금액을 입력해주세요" : "빌린 금액을 입력해주세요");
      return;
    }
    if (form.repaidAmount > form.principalAmount) {
      toast.error(form.direction === "receive" ? "받은 금액은 받을 금액보다 클 수 없습니다" : "갚은 금액은 빌린 금액보다 클 수 없습니다");
      return;
    }
    if (form.direction === "receive" && !form.sharedBorrowerUserId) {
      toast.error("받을돈은 친구를 선택해야 공유 알림을 보낼 수 있습니다");
      return;
    }
    if (form.borrowedDate && !isCompleteCalendarDate(form.borrowedDate)) {
      toast.error("빌린 날짜를 끝까지 입력해주세요");
      return;
    }
    if (form.repaymentType === "할부상환" && (!form.repaymentStartDate || form.totalInstallments <= 0)) {
      toast.error("할부상환은 시작일과 나눠 낼 회차가 필요합니다");
      return;
    }
    if (form.repaymentType === "할부상환" && form.installmentMode === "equal" && form.monthlyPayment <= 0) {
      toast.error("회차별 상환액을 입력해주세요");
      return;
    }
    if (form.repaymentType === "할부상환" && form.installmentMode === "custom") {
      const schedule = normalizeSchedule(form.repaymentSchedule, form.totalInstallments);
      if (schedule.some((amount) => amount <= 0)) {
        toast.error("회차별 금액을 모두 입력해주세요");
        return;
      }
    }
    if (form.repaymentStartDate && !isCompleteCalendarDate(form.repaymentStartDate)) {
      toast.error("상환 시작일을 끝까지 입력해주세요");
      return;
    }
    if (form.repaymentDueDate && !isCompleteCalendarDate(form.repaymentDueDate)) {
      toast.error("상환 예정일을 끝까지 입력해주세요");
      return;
    }

    const payload = {
      lenderName: form.lenderName.trim(),
      lenderUserId: form.sharedBorrowerUserId && currentUserId ? (form.direction === "receive" ? currentUserId : form.sharedBorrowerUserId) : null,
      borrowerUserId: form.sharedBorrowerUserId && currentUserId ? (form.direction === "receive" ? form.sharedBorrowerUserId : currentUserId) : null,
      shareStatus: form.sharedBorrowerUserId
        ? (editing && editing.shareStatus !== "private" ? (editing.shareStatus === "shared" ? "accepted" as const : editing.shareStatus) : "pending" as const)
        : "private" as const,
      principalAmount: form.principalAmount,
      repaidAmount: form.repaidAmount,
      borrowedDate: form.borrowedDate || null,
      repaymentType: form.repaymentType,
      repaymentStartDate: form.repaymentStartDate || null,
      repaymentDueDate: form.repaymentDueDate || null,
      paymentDay: form.paymentDay || null,
      monthlyPayment: form.repaymentType === "할부상환" && form.installmentMode === "equal" ? form.monthlyPayment : 0,
      totalInstallments: form.repaymentType === "할부상환" ? form.totalInstallments : null,
      installmentMode: form.repaymentType === "할부상환" ? form.installmentMode : "equal",
      repaymentSchedule: form.repaymentType === "할부상환" && form.installmentMode === "custom"
        ? JSON.stringify(normalizeSchedule(form.repaymentSchedule, form.totalInstallments))
        : null,
      note: form.note || null,
    };

    if (editing) update.mutate({ id: editing.id, data: payload });
    else create.mutate(payload);
  };

  const openPaymentDialog = (item: BorrowedMoneyRow, amount?: number) => {
    const scheduledNo = installmentNo(item, currentYear, currentMonth);
    setPaymentForm({
      borrowedMoneyId: item.id,
      paymentDate: `${currentYear}-${pad2(currentMonth)}-${pad2(now.getDate())}`,
      amount: amount ?? (scheduledAmountForMonth(item, currentYear, currentMonth) || remainingAmount(item)),
      installmentNo: scheduledNo ?? 1,
      note: "",
    });
    setPaymentDialogOpen(true);
  };

  const handlePaymentSubmit = () => {
    const target = activeRows.find((item) => item.id === paymentForm.borrowedMoneyId);
    if (!target) {
      toast.error("상환 대상을 선택해주세요");
      return;
    }
    if (!paymentForm.paymentDate) {
      toast.error("상환일을 입력해주세요");
      return;
    }
    if (!isCompleteCalendarDate(paymentForm.paymentDate)) {
      toast.error("상환일을 끝까지 입력해주세요");
      return;
    }
    if (paymentForm.amount <= 0) {
      toast.error("상환 금액을 입력해주세요");
      return;
    }
    if (paymentForm.amount > remainingAmount(target)) {
      toast.error("상환 금액은 남은 금액보다 클 수 없습니다");
      return;
    }
    addPayment.mutate({
      borrowedMoneyId: paymentForm.borrowedMoneyId,
      paymentDate: paymentForm.paymentDate,
      amount: paymentForm.amount,
      installmentNo: target.repaymentType === "할부상환" ? paymentForm.installmentNo : null,
      note: paymentForm.note || null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">빌린돈</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">내가 갚을 돈과 공유 사용자에게 받을 돈을 함께 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openCreate("pay")} size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" /> 빌린돈 추가
          </Button>
          <Button onClick={() => openCreate("receive")} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> 받을돈 추가
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as typeof viewMode)}>
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pay">내가 갚을 돈</TabsTrigger>
          <TabsTrigger value="receive">내가 받을 돈</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset((value) => value - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (open) setPickerYear(selectedYear); }}>
          <PopoverTrigger asChild>
            <button className="text-base font-semibold w-32 text-center px-2 py-1 rounded-lg hover:bg-muted transition-colors">
              {selectedYear}년 {pad2(selectedMonth)}월
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear((year) => year - 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold">{pickerYear}년</span>
              <button onClick={() => setPickerYear((year) => year + 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                const isSelected = pickerYear === selectedYear && month === selectedMonth;
                return (
                  <button
                    key={month}
                    onClick={() => {
                      setMonthOffset((pickerYear - currentYear) * 12 + (month - currentMonth));
                      setPickerOpen(false);
                    }}
                    className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {month}월
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <button onClick={() => setMonthOffset((value) => value + 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {monthOffset !== 0 && (
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)}>이번 달</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">이달 상환 예정</p>
            <p className="text-xl font-bold">₩{formatAmount(selectedMonthScheduledTotal)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <ReceiptText className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">이달 상환 건수</p>
            <p className="text-xl font-bold">{selectedMonthSchedule.length}건</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">총 빌린 금액</p>
            <p className="mt-1 text-base font-bold">₩{formatAmount(totalPrincipal)}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">갚은 금액</p>
            <p className="mt-1 text-base font-bold text-emerald-600">₩{formatAmount(totalRepaid)}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">남은 금액</p>
            <p className="mt-1 text-base font-bold text-rose-600">₩{formatAmount(totalRemaining)}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-1">월별 상환 예정</h3>
        <p className="text-xs text-muted-foreground mb-4">{selectedYear}년 {pad2(selectedMonth)}월 기준 · 예정 ₩{formatAmount(selectedMonthScheduledTotal)}</p>
        {selectedMonthSchedule.length === 0 ? (
          <div className="rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
            이달 상환 예정 내역이 없습니다
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상환일</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">빌린 곳</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">예정 금액</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">진행률</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {selectedMonthSchedule.map((entry) => (
                  <tr key={`${entry.item.id}-${entry.date}-${entry.installmentNo ?? "due"}`} className="border-t border-border transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{entry.date}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{entry.item.lenderName}</p>
                      <p className="text-xs text-muted-foreground">
                        {isReceiveRow(entry.item) ? "받을 돈" : "갚을 돈"} ·{" "}
                        {entry.item.repaymentType}
                        {entry.installmentNo && entry.item.totalInstallments ? ` · ${entry.installmentNo}/${entry.item.totalInstallments}회` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-primary">₩{formatAmount(entry.amount)}</span>
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>상환 진행</span>
                          <span>{entry.progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${entry.progress}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openPaymentDialog(entry.item, entry.amount)}>
                        {isReceiveRow(entry.item) ? "받음" : "상환"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">상환 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : summaryRows.length === 0 ? (
            <div className="py-14 text-center">
              <Wallet className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">등록된 빌린돈이 없습니다</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => openCreate("pay")}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 추가하기
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">빌린 곳</th>
                    <th className="px-3 py-2 text-right font-medium">총액</th>
                    <th className="px-3 py-2 text-right font-medium">남은 금액</th>
                    <th className="hidden px-3 py-2 text-center font-medium sm:table-cell">상환 방식</th>
                    <th className="hidden px-3 py-2 text-left font-medium md:table-cell">다음/이번달</th>
                    <th className="px-3 py-2 text-center font-medium">진행</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((item) => (
                    <tr key={item.id} className="border-b transition-colors hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <div className="font-medium">{item.lenderName}</div>
                        <div className="text-xs text-muted-foreground">
                          {isSharedRow(item) ? (
                            isReceiveRow(item)
                              ? `${userNameById.get(item.borrowerUserId ?? 0) ?? "공유 사용자"}에게 받을 돈`
                              : `${userNameById.get(item.lenderUserId ?? 0) ?? "공유 사용자"}에게 갚을 돈`
                          ) : "개인 기록"}
                          {" · "}
                          {item.borrowedDate || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">₩{formatAmount(item.principalAmount)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-rose-600">₩{formatAmount(item.remaining)}</td>
                      <td className="hidden px-3 py-3 text-center sm:table-cell">
                        <div className="flex justify-center gap-1">
                          <Badge variant={item.repaymentType === "할부상환" ? "default" : "secondary"}>{item.repaymentType}</Badge>
                          {isSharedRow(item) && <Badge variant="outline">{isReceiveRow(item) ? "받을 돈" : "갚을 돈"}</Badge>}
                          {item.shareStatus === "pending" && <Badge variant="secondary">{isIncomingPending(item) ? "승인 요청" : "승인 대기"}</Badge>}
                          {item.shareStatus === "rejected" && <Badge variant="destructive">거절됨</Badge>}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                        {item.shareStatus === "pending" ? (
                          <span className="text-xs text-muted-foreground">상대 승인 후 반영</span>
                        ) : item.shareStatus === "rejected" ? (
                          <span className="text-xs text-destructive">거절된 요청</span>
                        ) : item.scheduled > 0 ? (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <CalendarDays className="h-3.5 w-3.5" /> ₩{formatAmount(item.scheduled)}
                          </span>
                        ) : item.repaymentDueDate ? item.repaymentDueDate : "-"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="mx-auto h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-emerald-500" style={{ width: `${item.progress}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.progress}%</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {isIncomingPending(item) && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => acceptShare.mutate({ id: item.id, data: { shareStatus: "accepted" } })}
                                disabled={acceptShare.isPending}
                              >
                                수락
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-destructive hover:text-destructive"
                                onClick={() => rejectShare.mutate({ id: item.id, data: { shareStatus: "rejected" } })}
                                disabled={rejectShare.isPending}
                              >
                                거절
                              </Button>
                            </>
                          )}
                          {item.remaining > 0 && (item.shareStatus === "private" || isAcceptedShared(item)) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPaymentDialog(item)} title={isReceiveRow(item) ? "받음 기록" : "상환 기록"}>
                              <ReceiptText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {item.remaining > 0 && (item.shareStatus === "private" || isAcceptedShared(item)) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPaymentDialog(item, item.remaining)} title="완납 기록">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("삭제하시겠습니까?")) remove.mutate({ id: item.id }); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">최근 상환 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">상환 기록이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {paymentRows.slice(0, 8).map((payment) => {
                const target = activeRows.find((item) => item.id === payment.borrowedMoneyId);
                return (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{target?.lenderName ?? "삭제된 내역"}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.paymentDate}
                        {payment.installmentNo ? ` · ${payment.installmentNo}회차` : ""}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-600">₩{formatAmount(payment.amount)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("상환 기록을 삭제하시겠습니까? 가계부 자동연동 항목도 함께 삭제됩니다.")) deletePayment.mutate({ id: payment.id }); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? (form.direction === "receive" ? "받을돈 수정" : "빌린돈 수정") : (form.direction === "receive" ? "받을돈 추가" : "빌린돈 추가")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative space-y-1.5">
                <Label>{form.direction === "receive" ? "받을 사람 *" : "빌린 사람/기관 *"}</Label>
                <Input
                  value={form.lenderName}
                  onFocus={() => {
                    setLenderInputFocused(true);
                    setLenderSuggestionIndex(0);
                  }}
                  onBlur={() => window.setTimeout(() => setLenderInputFocused(false), 120)}
                  onChange={(event) => {
                    setLenderSuggestionIndex(0);
                    setForm((prev) => ({
                      ...prev,
                      lenderName: event.target.value,
                      sharedBorrowerUserId: null,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (!showLenderSuggestions) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setLenderSuggestionIndex((index) => (index + 1) % lenderSuggestions.length);
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setLenderSuggestionIndex((index) => (index - 1 + lenderSuggestions.length) % lenderSuggestions.length);
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      selectLenderUser(lenderSuggestions[lenderSuggestionIndex] ?? lenderSuggestions[0]);
                    }
                    if (event.key === "Escape") {
                      setLenderInputFocused(false);
                    }
                  }}
                  placeholder={form.direction === "receive" ? "친구를 검색해서 선택" : "이름을 검색하거나 직접 입력"}
                />
                {showLenderSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    {lenderSuggestions.map((user, index) => {
                      const name = displayUserName(user);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted ${
                            index === lenderSuggestionIndex ? "bg-muted" : ""
                          }`}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setLenderSuggestionIndex(index)}
                          onClick={() => selectLenderUser(user)}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {name.slice(0, 1)}
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {form.sharedBorrowerUserId && (
                  <p className="text-xs text-muted-foreground">
                    {form.direction === "receive" ? "선택한 사용자에게 갚을 돈으로 공유됩니다." : "선택한 사용자와 공유됩니다. 다시 타이핑하면 일반 텍스트 기록으로 저장됩니다."}
                  </p>
                )}
                {!form.sharedBorrowerUserId && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    onClick={openContactDialog}
                  >
                    아이디/이메일로 친구 추가
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <FlexibleDateField label={form.direction === "receive" ? "빌려준 날짜" : "빌린 날짜"} value={form.borrowedDate} onChange={handleBorrowedDateChange} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{form.direction === "receive" ? "받을 금액 *" : "빌린 금액 *"}</Label>
                <CurrencyInput value={form.principalAmount} onChange={(value) => setInstallmentForm({ principalAmount: value })} suffix="원" />
              </div>
              <div className="space-y-1.5">
                <Label>{form.direction === "receive" ? "이미 받은 금액" : "이미 갚은 금액"}</Label>
                <CurrencyInput value={form.repaidAmount} onChange={(value) => setInstallmentForm({ repaidAmount: value })} suffix="원" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>상환 방식</Label>
              <Select value={form.repaymentType} onValueChange={(value) => setInstallmentForm({ repaymentType: value as RepaymentType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="자유상환">자유상환</SelectItem>
                  <SelectItem value="일시상환">일시상환</SelectItem>
                  <SelectItem value="할부상환">할부상환</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.repaymentType === "할부상환" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FlexibleDateField label="시작일 *" value={form.repaymentStartDate} onChange={(value) => set("repaymentStartDate", value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>매월 상환일</Label>
                  <Input type="number" min={1} max={31} value={form.paymentDay || ""} onChange={(event) => set("paymentDay", Number(event.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>나눠 낼 회차</Label>
                  <Input type="number" min={1} value={form.totalInstallments || ""} onChange={(event) => setInstallmentForm({ totalInstallments: Number(event.target.value) })} />
                  <p className="text-xs text-muted-foreground">예: 6개월 동안 갚으면 6회</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>상환 금액 방식</Label>
                  <Select value={form.installmentMode} onValueChange={(value) => setInstallmentForm({ installmentMode: value as "equal" | "custom" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">동일하게 낼 때</SelectItem>
                      <SelectItem value="custom">다르게 낼 때</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.installmentMode === "equal" ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>회차별 상환액 *</Label>
                    <CurrencyInput value={form.monthlyPayment} onChange={(value) => set("monthlyPayment", value)} suffix="원" />
                    <p className="text-xs text-muted-foreground">회차 입력 시 남은 원금 기준으로 자동 계산됩니다</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>회차별 금액</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {normalizeSchedule(form.repaymentSchedule, form.totalInstallments).map((amount, index) => (
                        <div key={index} className="space-y-1">
                          <Label className="text-xs">{index + 1}회차</Label>
                          <CurrencyInput
                            value={amount}
                            onChange={(value) => {
                              const next = normalizeSchedule(form.repaymentSchedule, form.totalInstallments);
                              next[index] = value;
                              setForm((prev) => ({ ...prev, repaymentSchedule: next }));
                            }}
                            suffix="원"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <FlexibleDateField label="상환 예정일" value={form.repaymentDueDate} onChange={(value) => set("repaymentDueDate", value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Textarea value={form.note} onChange={(event) => set("note", event.target.value)} rows={3} placeholder="상환 약속이나 계좌 정보 등을 적어둘 수 있어요" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!todayAlertDismissed && todayDueItems.length > 0} onOpenChange={(open) => !open && setTodayAlertDismissed(true)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>오늘 확인할 빌린돈</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {todayDueItems.map(({ item, amount }) => {
              const receiving = isReceiveRow(item);
              return (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{receiving ? `${item.lenderName} 입금 확인` : `${item.lenderName} 상환 예정`}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.repaymentType}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold">₩{formatAmount(amount)}</p>
                  </div>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => {
                      setTodayAlertDismissed(true);
                      openPaymentDialog(item, amount);
                    }}
                  >
                    {receiving ? "받음 기록하기" : "상환 기록하기"}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTodayAlertDismissed(true)}>나중에</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>친구 추가</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>아이디 또는 이메일 검색</Label>
              <Input
                value={contactSearch}
                onChange={(event) => {
                  setContactSearch(event.target.value);
                  setSelectedContactUser(null);
                }}
                placeholder="이메일, 이름, 사용자 ID"
              />
            </div>
            {contactSearch.trim().length >= 2 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                {contactSearchResults.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">검색된 사용자가 없습니다</p>
                ) : (
                  contactSearchResults.map((user) => {
                    const name = displayUserName(user);
                    const selected = selectedContactUser?.id === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted ${
                          selected ? "bg-muted" : ""
                        }`}
                        onClick={() => {
                          setSelectedContactUser(user);
                          setContactNickname((prev) => prev.trim() || name);
                        }}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {name.slice(0, 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">ID {user.id}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>내가 부를 이름</Label>
              <Input
                value={contactNickname}
                onChange={(event) => setContactNickname(event.target.value)}
                placeholder="예: 동생, 엄마, 철수"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>취소</Button>
            <Button onClick={handleContactSave} disabled={upsertContact.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>상환 기록 추가</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>상환 대상</Label>
              <Select
                value={paymentForm.borrowedMoneyId ? String(paymentForm.borrowedMoneyId) : ""}
                onValueChange={(value) => {
                  const target = activeRows.find((item) => item.id === Number(value));
                  setPaymentForm((prev) => ({
                    ...prev,
                    borrowedMoneyId: Number(value),
                    amount: target ? scheduledAmountForMonth(target, currentYear, currentMonth) || remainingAmount(target) : 0,
                    installmentNo: target ? installmentNo(target, currentYear, currentMonth) ?? 1 : 1,
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="상환 대상 선택" /></SelectTrigger>
                <SelectContent>
                  {activeRows.filter((item) => remainingAmount(item) > 0).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.lenderName} · 남은 ₩{formatAmount(remainingAmount(item))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FlexibleDateField label="상환일" value={paymentForm.paymentDate} onChange={(value) => setPaymentForm((prev) => ({ ...prev, paymentDate: value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>상환 금액</Label>
                <CurrencyInput value={paymentForm.amount} onChange={(value) => setPaymentForm((prev) => ({ ...prev, amount: value }))} suffix="원" />
              </div>
            </div>
            {activeRows.find((item) => item.id === paymentForm.borrowedMoneyId)?.repaymentType === "할부상환" && (
              <div className="space-y-1.5">
                <Label>회차</Label>
                <Input type="number" min={1} value={paymentForm.installmentNo || ""} onChange={(event) => setPaymentForm((prev) => ({ ...prev, installmentNo: Number(event.target.value) }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Textarea value={paymentForm.note} onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))} rows={2} placeholder="계좌이체, 현금 등" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>취소</Button>
            <Button onClick={handlePaymentSubmit} disabled={addPayment.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
