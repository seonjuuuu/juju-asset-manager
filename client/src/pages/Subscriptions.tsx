import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Calendar } from "lucide-react";

// ─── 유틸리티 ────────────────────────────────────────────────────────────────
function calcNextPaymentDate(
  startDate: string,
  billingCycle: "매달" | "매주" | "매일"
): string {
  if (!startDate) return "-";
  const today = new Date();
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return "-";
  let next = new Date(start);
  if (billingCycle === "매달") {
    while (next <= today) {
      next = new Date(next);
      next.setMonth(next.getMonth() + 1);
    }
  } else if (billingCycle === "매주") {
    while (next <= today) {
      next = new Date(next);
      next.setDate(next.getDate() + 7);
    }
  } else {
    while (next <= today) {
      next = new Date(next);
      next.setDate(next.getDate() + 1);
    }
  }
  return next.toISOString().slice(0, 10);
}

function calcMonthlyCost(
  price: number,
  billingCycle: "매달" | "매주" | "매일"
): number {
  if (billingCycle === "매달") return price;
  if (billingCycle === "매주") return Math.round((price * 52) / 12);
  return price * 30;
}

function calcYearlyCost(
  price: number,
  billingCycle: "매달" | "매주" | "매일"
): number {
  if (billingCycle === "매달") return price * 12;
  if (billingCycle === "매주") return price * 52;
  return price * 365;
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
type SubscriptionRow = {
  id: number;
  serviceName: string;
  category: "비즈니스" | "미디어" | "자기계발" | "기타";
  billingCycle: "매달" | "매주" | "매일";
  price: number;
  startDate: string | null;
  paymentMethod: string | null;
  note: string | null;
};

type CardRow = {
  id: number;
  cardType: "신용카드" | "체크카드";
  cardCompany: string;
  cardName: string | null;
};

const emptySubscription = {
  serviceName: "",
  category: "기타" as "비즈니스" | "미디어" | "자기계발" | "기타",
  billingCycle: "매달" as "매달" | "매주" | "매일",
  price: 0,
  startDate: "",
  paymentMethod: "",
  note: "",
};

const CATEGORY_COLORS: Record<string, string> = {
  비즈니스: "var(--primary)",
  미디어: "oklch(0.58 0.16 30)",
  자기계발: "oklch(0.50 0.14 150)",
  기타: "oklch(0.55 0.10 260)",
};

// ─── 다이얼로그 ───────────────────────────────────────────────────────────────
function SubscriptionDialog({
  open,
  onClose,
  initial,
  onSave,
  cardList,
}: {
  open: boolean;
  onClose: () => void;
  initial: typeof emptySubscription;
  onSave: (data: typeof emptySubscription) => void;
  cardList: CardRow[];
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof emptySubscription, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const monthlyCost = calcMonthlyCost(form.price, form.billingCycle);
  const yearlyCost = calcYearlyCost(form.price, form.billingCycle);
  const nextPayment = calcNextPaymentDate(form.startDate, form.billingCycle);

  // 결제방법 옵션: 보유카드 + 현금 + 계좌출금
  const paymentOptions = [
    ...cardList.map(
      (c) => `${c.cardCompany} ${c.cardName || c.cardType}`
    ),
    "현금",
    "계좌출금",
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>정기결제 서비스</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>서비스명 *</Label>
            <Input
              value={form.serviceName}
              onChange={(e) => set("serviceName", e.target.value)}
              placeholder="예: Netflix, ChatGPT Plus"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>카테고리</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["비즈니스", "미디어", "자기계발", "기타"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>결제주기</Label>
              <Select
                value={form.billingCycle}
                onValueChange={(v) => set("billingCycle", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["매달", "매주", "매일"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>구독료 (원)</Label>
            <Input
              type="number"
              value={form.price}
              onChange={(e) => set("price", Number(e.target.value))}
              placeholder="0"
            />
          </div>

          {/* 자동 계산 미리보기 */}
          {form.price > 0 && (
            <div
              className="rounded-lg p-3 text-sm space-y-1.5"
              style={{ backgroundColor: "var(--muted)" }}
            >
              <div className="flex justify-between">
                <span className="text-muted-foreground">월 비용</span>
                <span className="font-semibold">
                  ₩{monthlyCost.toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">연 비용</span>
                <span className="font-semibold">
                  ₩{yearlyCost.toLocaleString("ko-KR")}
                </span>
              </div>
              {form.startDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">다음 결제일</span>
                  <span className="font-semibold">{nextPayment}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>구독시작일</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>결제방법</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => set("paymentMethod", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="결제방법 선택" />
              </SelectTrigger>
              <SelectContent>
                {paymentOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="기타 메모"
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => {
              if (!form.serviceName.trim()) {
                toast.error("서비스명을 입력해주세요");
                return;
              }
              onSave(form);
            }}
          >
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function Subscriptions() {
  const utils = trpc.useUtils();

  // 정기결제 데이터
  const { data: subList = [], isLoading: subsLoading } =
    trpc.subscription.list.useQuery();

  // 보유카드 데이터 (결제방법 선택용)
  const { data: cardList = [] } = trpc.card.list.useQuery();

  const createSub = trpc.subscription.create.useMutation({
    onSuccess: () => {
      utils.subscription.list.invalidate();
      toast.success("구독이 추가되었습니다");
      setDialog(null);
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });
  const updateSub = trpc.subscription.update.useMutation({
    onSuccess: () => {
      utils.subscription.list.invalidate();
      toast.success("수정되었습니다");
      setDialog(null);
    },
    onError: () => toast.error("수정에 실패했습니다"),
  });
  const deleteSub = trpc.subscription.delete.useMutation({
    onSuccess: () => {
      utils.subscription.list.invalidate();
      toast.success("삭제되었습니다");
    },
    onError: () => toast.error("삭제에 실패했습니다"),
  });

  const [dialog, setDialog] = useState<{
    mode: "create" | "edit";
    data: typeof emptySubscription;
    id?: number;
  } | null>(null);

  // 집계
  const totalMonthly = (subList as SubscriptionRow[]).reduce(
    (s, sub) => s + calcMonthlyCost(sub.price, sub.billingCycle),
    0
  );
  const totalYearly = (subList as SubscriptionRow[]).reduce(
    (s, sub) => s + calcYearlyCost(sub.price, sub.billingCycle),
    0
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* 헤더 */}
      <div>
        <h1
          className="text-2xl font-bold text-foreground"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          정기결제 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          구독 서비스의 결제 현황을 한눈에 관리합니다
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          {
            label: "총 월 구독비",
            value: `₩${totalMonthly.toLocaleString("ko-KR")}`,
            color: "var(--primary)",
          },
          {
            label: "총 연 구독비",
            value: `₩${totalYearly.toLocaleString("ko-KR")}`,
            color: "oklch(0.58 0.16 30)",
          },
          {
            label: "구독 서비스",
            value: `${(subList as SubscriptionRow[]).length}개`,
            color: "oklch(0.50 0.14 150)",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border bg-card p-4 flex items-center gap-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: item.color + "22" }}
            >
              <RefreshCw className="w-5 h-5" style={{ color: item.color }} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-bold text-sm">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 추가 버튼 */}
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDialog({ mode: "create", data: { ...emptySubscription } })
          }
        >
          <Plus className="w-4 h-4 mr-1.5" />
          구독 추가
        </Button>
      </div>

      {/* 목록 */}
      {subsLoading ? (
        <div className="text-center py-20 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : (subList as SubscriptionRow[]).length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-25" />
          <p className="text-sm font-medium">등록된 정기결제 서비스가 없습니다</p>
          <p className="text-xs mt-1">구독 추가 버튼을 눌러 시작하세요</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["비즈니스", "미디어", "자기계발", "기타"] as const).map((cat) => {
            const items = (subList as SubscriptionRow[]).filter(
              (s) => s.category === cat
            );
            if (items.length === 0) return null;
            const catColor = CATEGORY_COLORS[cat];
            const catMonthly = items.reduce(
              (s, sub) => s + calcMonthlyCost(sub.price, sub.billingCycle),
              0
            );
            return (
              <div key={cat} className="space-y-3">
                {/* 카테고리 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: catColor }}
                    />
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: catColor }}
                    >
                      {cat}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      ({items.length}개)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    월 ₩{catMonthly.toLocaleString("ko-KR")}
                  </span>
                </div>

                {/* 카테고리 내 아이템 */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((sub) => {
                    const monthly = calcMonthlyCost(
                      sub.price,
                      sub.billingCycle
                    );
                    const yearly = calcYearlyCost(sub.price, sub.billingCycle);
                    const nextDate = calcNextPaymentDate(
                      sub.startDate ?? "",
                      sub.billingCycle
                    );
                    return (
                      <div
                        key={sub.id}
                        className="rounded-xl border bg-card p-4 space-y-3"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {/* 상단: 이름 + 버튼 */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: catColor + "22" }}
                            >
                              <RefreshCw
                                className="w-4 h-4"
                                style={{ color: catColor }}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {sub.serviceName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge
                                  variant="secondary"
                                  className="text-xs px-1.5 py-0"
                                >
                                  {sub.billingCycle}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  ₩{sub.price.toLocaleString("ko-KR")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setDialog({
                                  mode: "edit",
                                  id: sub.id,
                                  data: {
                                    serviceName: sub.serviceName,
                                    category: sub.category,
                                    billingCycle: sub.billingCycle,
                                    price: sub.price,
                                    startDate: sub.startDate ?? "",
                                    paymentMethod: sub.paymentMethod ?? "",
                                    note: sub.note ?? "",
                                  },
                                })
                              }
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("이 구독을 삭제하시겠습니까?")) {
                                  deleteSub.mutate({ id: sub.id });
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* 하단: 비용 정보 */}
                        <div
                          className="grid grid-cols-3 gap-2 pt-2 border-t text-xs"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <div>
                            <p className="text-muted-foreground">월 비용</p>
                            <p className="font-semibold">
                              ₩{monthly.toLocaleString("ko-KR")}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">연 비용</p>
                            <p className="font-semibold">
                              ₩{yearly.toLocaleString("ko-KR")}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">다음 결제일</p>
                            <p className="font-semibold flex items-center gap-0.5">
                              <Calendar className="w-3 h-3" />
                              {nextDate}
                            </p>
                          </div>
                        </div>

                        {/* 결제방법 / 비고 */}
                        {(sub.paymentMethod || sub.note) && (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {sub.paymentMethod && (
                              <p>결제: {sub.paymentMethod}</p>
                            )}
                            {sub.note && <p>비고: {sub.note}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 다이얼로그 */}
      {dialog && (
        <SubscriptionDialog
          key={dialog.mode + (dialog.id ?? "new")}
          open={true}
          onClose={() => setDialog(null)}
          initial={dialog.data}
          cardList={cardList as CardRow[]}
          onSave={(data) => {
            if (dialog.mode === "create") {
              createSub.mutate(data);
            } else if (dialog.id) {
              updateSub.mutate({ id: dialog.id, data });
            }
          }}
        />
      )}
    </div>
  );
}
