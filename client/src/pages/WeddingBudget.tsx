import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FlexibleDateField } from "@/components/FlexibleDateField";
import { isCompleteCalendarDate } from "@/lib/flexibleDateInput";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { CalendarDays, CheckCircle2, HeartHandshake, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const WEDDING_CATEGORIES = [
  "예식장",
  "스드메",
  "예복/한복",
  "예물/예단",
  "혼수/가전",
  "신혼여행",
  "청첩장/답례품",
  "본식 스냅/DVD",
  "사회/축가/주례",
  "기타",
];

const STATUS_OPTIONS = ["견적", "계약", "결제중", "완료"] as const;

type Status = typeof STATUS_OPTIONS[number];

type WeddingBudgetItem = {
  id: number;
  category: string;
  itemName: string;
  vendorName: string | null;
  estimatedAmount: number;
  contractAmount: number;
  paidAmount: number;
  dueDate: string | null;
  paymentMethod: string | null;
  status: Status | string;
  note: string | null;
};

const emptyItem = {
  category: "예식장",
  itemName: "",
  vendorName: "",
  estimatedAmount: 0,
  contractAmount: 0,
  paidAmount: 0,
  dueDate: "",
  paymentMethod: "",
  status: "견적" as Status,
  note: "",
};

function ddayLabel(weddingDate?: string | null) {
  if (!weddingDate) return "예정일 미입력";
  const target = new Date(weddingDate);
  if (Number.isNaN(target.getTime())) return "예정일 확인 필요";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function statusClass(status: string) {
  if (status === "완료") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "결제중") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (status === "계약") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export default function WeddingBudget() {
  const utils = trpc.useUtils();
  const { data: setting } = trpc.weddingBudget.setting.useQuery();
  const { data: items = [], isLoading } = trpc.weddingBudget.listItems.useQuery();

  const [settingForm, setSettingForm] = useState({
    weddingDate: "",
    venueName: "",
    totalBudget: 0,
    note: "",
  });
  const [itemDialog, setItemDialog] = useState<null | { mode: "create" } | { mode: "edit"; item: WeddingBudgetItem }>(null);
  const [itemForm, setItemForm] = useState({ ...emptyItem });

  useEffect(() => {
    if (!setting) return;
    setSettingForm({
      weddingDate: setting.weddingDate ?? "",
      venueName: setting.venueName ?? "",
      totalBudget: setting.totalBudget ?? 0,
      note: setting.note ?? "",
    });
  }, [setting]);

  const saveSetting = trpc.weddingBudget.upsertSetting.useMutation({
    onSuccess: () => {
      utils.weddingBudget.setting.invalidate();
      toast.success("결혼예산 설정을 저장했습니다");
    },
    onError: () => toast.error("설정 저장 실패"),
  });

  const createItem = trpc.weddingBudget.createItem.useMutation({
    onSuccess: () => {
      utils.weddingBudget.listItems.invalidate();
      toast.success("예산 항목이 추가되었습니다");
      setItemDialog(null);
    },
    onError: () => toast.error("항목 추가 실패"),
  });

  const updateItem = trpc.weddingBudget.updateItem.useMutation({
    onSuccess: () => {
      utils.weddingBudget.listItems.invalidate();
      toast.success("예산 항목을 수정했습니다");
      setItemDialog(null);
    },
    onError: () => toast.error("항목 수정 실패"),
  });

  const deleteItem = trpc.weddingBudget.deleteItem.useMutation({
    onSuccess: () => {
      utils.weddingBudget.listItems.invalidate();
      toast.success("예산 항목을 삭제했습니다");
    },
    onError: () => toast.error("항목 삭제 실패"),
  });

  const rows = items as WeddingBudgetItem[];
  const totals = useMemo(() => {
    const estimated = rows.reduce((sum, item) => sum + (item.estimatedAmount ?? 0), 0);
    const contracted = rows.reduce((sum, item) => sum + (item.contractAmount ?? 0), 0);
    const paid = rows.reduce((sum, item) => sum + (item.paidAmount ?? 0), 0);
    const remaining = Math.max(0, contracted - paid);
    return { estimated, contracted, paid, remaining };
  }, [rows]);

  const categorySummary = useMemo(() => {
    const map = new Map<string, { estimated: number; paid: number; count: number }>();
    for (const item of rows) {
      const current = map.get(item.category) ?? { estimated: 0, paid: 0, count: 0 };
      current.estimated += item.estimatedAmount ?? 0;
      current.paid += item.paidAmount ?? 0;
      current.count += 1;
      map.set(item.category, current);
    }
    return Array.from(map.entries()).map(([category, value]) => ({ category, ...value }));
  }, [rows]);

  const openCreate = () => {
    setItemForm({ ...emptyItem });
    setItemDialog({ mode: "create" });
  };

  const openEdit = (item: WeddingBudgetItem) => {
    setItemForm({
      category: item.category,
      itemName: item.itemName,
      vendorName: item.vendorName ?? "",
      estimatedAmount: item.estimatedAmount ?? 0,
      contractAmount: item.contractAmount ?? 0,
      paidAmount: item.paidAmount ?? 0,
      dueDate: item.dueDate ?? "",
      paymentMethod: item.paymentMethod ?? "",
      status: (STATUS_OPTIONS.includes(item.status as Status) ? item.status : "견적") as Status,
      note: item.note ?? "",
    });
    setItemDialog({ mode: "edit", item });
  };

  const saveItem = () => {
    if (!itemForm.itemName.trim()) {
      toast.error("항목명을 입력해주세요");
      return;
    }
    const payload = {
      category: itemForm.category,
      itemName: itemForm.itemName.trim(),
      vendorName: itemForm.vendorName.trim() || undefined,
      estimatedAmount: itemForm.estimatedAmount,
      contractAmount: itemForm.contractAmount,
      paidAmount: itemForm.paidAmount,
      dueDate: (() => {
        const d = itemForm.dueDate.trim();
        if (!d) return undefined;
        if (isCompleteCalendarDate(d)) return d;
        return itemDialog?.mode === "edit" ? itemDialog.item.dueDate ?? undefined : undefined;
      })(),
      paymentMethod: itemForm.paymentMethod.trim() || undefined,
      status: itemForm.status,
      note: itemForm.note.trim() || undefined,
    };
    if (itemDialog?.mode === "edit") updateItem.mutate({ id: itemDialog.item.id, data: payload });
    else createItem.mutate(payload);
  };

  const budgetGap = (settingForm.totalBudget ?? 0) - totals.contracted;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">결혼예산</h1>
          <p className="text-sm text-muted-foreground mt-0.5">예정일, 예산 항목, 계약금과 잔금을 기록합니다</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 항목 추가
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="w-full shrink-0 rounded-xl border border-border bg-card p-4 lg:w-[360px]">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">기본 설정</h2>
          </div>
          <div className="mt-4 space-y-3">
            <FlexibleDateField
              label="결혼 예정일"
              value={settingForm.weddingDate}
              onChange={(v) => setSettingForm((f) => ({ ...f, weddingDate: v }))}
            />
            <div>
              <Label className="text-xs">예식장/장소</Label>
              <Input
                className="mt-1"
                value={settingForm.venueName}
                onChange={(e) => setSettingForm((f) => ({ ...f, venueName: e.target.value }))}
                placeholder="예: OO웨딩홀"
              />
            </div>
            <div>
              <Label className="text-xs">총 목표 예산</Label>
              <CurrencyInput
                className="mt-1"
                value={settingForm.totalBudget}
                onChange={(v) => setSettingForm((f) => ({ ...f, totalBudget: v }))}
                suffix="원"
              />
            </div>
            <div>
              <Label className="text-xs">메모</Label>
              <Textarea
                className="mt-1 min-h-[76px]"
                value={settingForm.note}
                onChange={(e) => setSettingForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="예산 기준, 양가 분담 기준 등"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const wd = settingForm.weddingDate.trim();
                let weddingDateOut: string | undefined;
                if (!wd) weddingDateOut = undefined;
                else if (isCompleteCalendarDate(wd)) weddingDateOut = wd;
                else weddingDateOut = setting?.weddingDate ?? undefined;
                saveSetting.mutate({
                  weddingDate: weddingDateOut,
                  venueName: settingForm.venueName || undefined,
                  totalBudget: settingForm.totalBudget,
                  note: settingForm.note || undefined,
                });
              }}
            >
              설정 저장
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3">
          {[
            { label: "결혼식", value: ddayLabel(settingForm.weddingDate), icon: CalendarDays, color: "var(--primary)" },
            { label: "확정 지출", value: `₩${formatAmount(totals.contracted)}`, icon: Wallet, color: "oklch(0.58 0.16 30)" },
            { label: "결제 완료", value: `₩${formatAmount(totals.paid)}`, icon: CheckCircle2, color: "oklch(0.50 0.14 150)" },
            { label: budgetGap >= 0 ? "예산 여유" : "예산 초과", value: `₩${formatAmount(Math.abs(budgetGap))}`, icon: HeartHandshake, color: budgetGap >= 0 ? "oklch(0.50 0.14 150)" : "oklch(0.58 0.16 30)" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-lg font-bold truncate">{item.value}</p>
                </div>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: item.color + "22" }}>
                  <item.icon className="h-4 w-4" style={{ color: item.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {categorySummary.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">카테고리별 현황</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {categorySummary.map((row) => (
              <div key={row.category} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{row.category}</p>
                  <span className="text-xs text-muted-foreground">{row.count}건</span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>예상 ₩{formatAmount(row.estimated)}</span>
                  <span>결제 ₩{formatAmount(row.paid)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">카테고리</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">항목</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">업체</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">예상금액</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">확정금액</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">결제완료</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">결제예정일</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">상태</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">등록된 결혼예산 항목이 없습니다</td></tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3 font-medium">{item.itemName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.vendorName ?? "-"}</td>
                    <td className="px-4 py-3 text-right">₩{formatAmount(item.estimatedAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium">₩{formatAmount(item.contractAmount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">₩{formatAmount(item.paidAmount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.dueDate ?? "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={statusClass(item.status)}>{item.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteItem.mutate({ id: item.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!itemDialog} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent className="max-w-lg max-h-[86vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{itemDialog?.mode === "edit" ? "예산 항목 수정" : "예산 항목 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">카테고리</Label>
                <Select value={itemForm.category} onValueChange={(v) => setItemForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{WEDDING_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">상태</Label>
                <Select value={itemForm.status} onValueChange={(v) => setItemForm((f) => ({ ...f, status: v as Status }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">항목명 *</Label>
              <Input className="mt-1" value={itemForm.itemName} onChange={(e) => setItemForm((f) => ({ ...f, itemName: e.target.value }))} placeholder="예: 웨딩홀 대관료" />
            </div>
            <div>
              <Label className="text-xs">업체명</Label>
              <Input className="mt-1" value={itemForm.vendorName} onChange={(e) => setItemForm((f) => ({ ...f, vendorName: e.target.value }))} placeholder="예: OO웨딩홀" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">예상금액</Label>
                <CurrencyInput className="mt-1" value={itemForm.estimatedAmount} onChange={(v) => setItemForm((f) => ({ ...f, estimatedAmount: v }))} suffix="원" />
              </div>
              <div>
                <Label className="text-xs">확정금액</Label>
                <CurrencyInput className="mt-1" value={itemForm.contractAmount} onChange={(v) => setItemForm((f) => ({ ...f, contractAmount: v }))} suffix="원" />
              </div>
              <div>
                <Label className="text-xs">결제완료</Label>
                <CurrencyInput className="mt-1" value={itemForm.paidAmount} onChange={(v) => setItemForm((f) => ({ ...f, paidAmount: v }))} suffix="원" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FlexibleDateField
                label="결제예정일"
                value={itemForm.dueDate}
                onChange={(v) => setItemForm((f) => ({ ...f, dueDate: v }))}
              />
              <div>
                <Label className="text-xs">결제수단</Label>
                <Input className="mt-1" value={itemForm.paymentMethod} onChange={(e) => setItemForm((f) => ({ ...f, paymentMethod: e.target.value }))} placeholder="예: 신용카드, 계좌이체" />
              </div>
            </div>
            <div>
              <Label className="text-xs">메모</Label>
              <Textarea className="mt-1 min-h-[72px]" value={itemForm.note} onChange={(e) => setItemForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(null)}>취소</Button>
            <Button onClick={saveItem}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
