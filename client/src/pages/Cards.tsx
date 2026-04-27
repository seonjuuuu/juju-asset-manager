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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Coins,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── 타입 ──────────────────────────────────────────────────────────────────
type CardRow = {
  id: number;
  cardType: "신용카드" | "체크카드";
  cardCompany: string;
  cardName: string | null;
  benefits: string | null;
  annualFee: number | null;
  performance: string | null;
  purpose: string | null;
  creditLimit: number | null;
  expiryDate: string | null;
  paymentDate: string | null;
  paymentAccount: string | null;
  note: string | null;
};

type PointRow = {
  id: number;
  name: string;
  benefits: string | null;
  balance: number | null;
  purpose: string | null;
  note: string | null;
};

const emptyCard = {
  cardType: "신용카드" as "신용카드" | "체크카드",
  cardCompany: "",
  cardName: "",
  benefits: "",
  annualFee: 0,
  performance: "",
  purpose: "",
  creditLimit: 0,
  expiryDate: "",
  paymentDate: "",
  paymentAccount: "",
  note: "",
};

const emptyPoint = {
  name: "",
  benefits: "",
  balance: 0,
  purpose: "",
  note: "",
};


function formatAmount(v: number | null | undefined) {
  if (!v) return "-";
  return "₩" + v.toLocaleString("ko-KR");
}

// ─── 카드 다이얼로그 ───────────────────────────────────────────────────────────
function CardDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: typeof emptyCard;
  onSave: (data: typeof emptyCard) => void;
}) {
  const [form, setForm] = useState(initial);

  const set = (k: keyof typeof emptyCard, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
            {initial.cardCompany ? "카드 수정" : "카드 추가"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {/* 대분류 */}
          <div className="space-y-1.5">
            <Label>대분류</Label>
            <Select
              value={form.cardType}
              onValueChange={(v) => set("cardType", v as "신용카드" | "체크카드")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="신용카드">신용카드</SelectItem>
                <SelectItem value="체크카드">체크카드</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 카드사 */}
          <div className="space-y-1.5">
            <Label>카드사</Label>
            <Input
              value={form.cardCompany}
              onChange={(e) => set("cardCompany", e.target.value)}
              placeholder="예: 삼성카드, 신한카드"
            />
          </div>

          {/* 카드명 */}
          <div className="col-span-2 space-y-1.5">
            <Label>카드명</Label>
            <Input
              value={form.cardName}
              onChange={(e) => set("cardName", e.target.value)}
              placeholder="카드 이름을 입력하세요"
            />
          </div>

          {/* 혜택 */}
          <div className="col-span-2 space-y-1.5">
            <Label>혜택</Label>
            <Textarea
              value={form.benefits}
              onChange={(e) => set("benefits", e.target.value)}
              placeholder="카드 혜택을 자유롭게 입력하세요&#10;예: 편의점 10% 할인&#10;    주유 리터당 60원 할인&#10;    스타벅스 50% 할인"
              rows={6}
              className="resize-none"
            />
          </div>

          {/* 연회비 */}
          <div className="space-y-1.5">
            <Label>연회비 (원)</Label>
            <Input
              type="number"
              value={form.annualFee}
              onChange={(e) => set("annualFee", Number(e.target.value))}
              placeholder="0"
            />
          </div>

          {/* 실적 */}
          <div className="space-y-1.5">
            <Label>실적</Label>
            <Input
              value={form.performance}
              onChange={(e) => set("performance", e.target.value)}
              placeholder="예: 월 30만원 이상"
            />
          </div>

          {/* 용도 */}
          <div className="space-y-1.5">
            <Label>용도</Label>
            <Input
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              placeholder="예: 생활비, 온라인쇼핑"
            />
          </div>

          {/* 카드한도 */}
          <div className="space-y-1.5">
            <Label>카드한도 (원)</Label>
            <Input
              type="number"
              value={form.creditLimit}
              onChange={(e) => set("creditLimit", Number(e.target.value))}
              placeholder="0"
            />
          </div>

          {/* 유효기간 */}
          <div className="space-y-1.5">
            <Label>유효기간 (MM/YY)</Label>
            <Input
              value={form.expiryDate}
              onChange={(e) => set("expiryDate", e.target.value)}
              placeholder="예: 12/28"
              maxLength={5}
            />
          </div>

          {/* 결제일 */}
          <div className="space-y-1.5">
            <Label>결제일</Label>
            <Input
              value={form.paymentDate}
              onChange={(e) => set("paymentDate", e.target.value)}
              placeholder="예: 매월 15일"
            />
          </div>

          {/* 결제계좌 */}
          <div className="col-span-2 space-y-1.5">
            <Label>결제계좌</Label>
            <Input
              value={form.paymentAccount}
              onChange={(e) => set("paymentAccount", e.target.value)}
              placeholder="예: 신한은행 110-123-456789"
            />
          </div>

          {/* 비고 */}
          <div className="col-span-2 space-y-1.5">
            <Label>비고</Label>
            <Textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="기타 메모"
              rows={3}
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
              if (!form.cardCompany.trim()) {
                toast.error("카드사를 입력해주세요");
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

// ─── 포인트 다이얼로그 ────────────────────────────────────────────────────────
function PointDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: typeof emptyPoint;
  onSave: (data: typeof emptyPoint) => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof emptyPoint, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
            {initial.name ? "포인트/마일리지 수정" : "포인트/마일리지 추가"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>카드/포인트명</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 신한 마이신한포인트, 아시아나 마일리지"
            />
          </div>
          <div className="space-y-1.5">
            <Label>혜택</Label>
            <Textarea
              value={form.benefits}
              onChange={(e) => set("benefits", e.target.value)}
              placeholder="포인트/마일리지 혜택 및 사용처를 입력하세요"
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>잔액 (포인트/마일)</Label>
            <Input
              type="number"
              value={form.balance}
              onChange={(e) => set("balance", Number(e.target.value))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>용도</Label>
            <Input
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              placeholder="예: 항공권, 쇼핑, 현금전환"
            />
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
              if (!form.name.trim()) {
                toast.error("카드/포인트명을 입력해주세요");
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

// ─── 카드 카드 컴포넌트 ───────────────────────────────────────────────
function CardItem({
  card,
  onEdit,
  onDelete,
}: {
  card: CardRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden"
      style={{ borderColor: "var(--border)" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background:
                card.cardType === "신용카드"
                  ? "linear-gradient(135deg, var(--primary) 0%, oklch(0.45 0.12 260) 100%)"
                  : "linear-gradient(135deg, oklch(0.50 0.14 150) 0%, oklch(0.40 0.12 150) 100%)",
            }}
          >
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{card.cardCompany}</span>
              {card.cardName && (
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {card.cardName}
                </span>
              )}
              <Badge
                variant="secondary"
                className="text-xs flex-shrink-0"
                style={{
                  backgroundColor:
                    card.cardType === "신용카드"
                      ? "oklch(0.90 0.04 260)"
                      : "oklch(0.90 0.04 150)",
                  color:
                    card.cardType === "신용카드"
                      ? "var(--primary)"
                      : "oklch(0.40 0.12 150)",
                }}
              >
                {card.cardType}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {card.purpose && <span>용도: {card.purpose}</span>}
              {card.paymentDate && <span>결제일: {card.paymentDate}</span>}
              {card.expiryDate && <span>유효기간: {card.expiryDate}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 상세 */}
      {expanded && (
        <div
          className="px-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
        >
          <div className="col-span-2 pt-3" />
          {card.annualFee != null && card.annualFee > 0 && (
            <div>
              <span className="text-muted-foreground text-xs">연회비</span>
              <p className="font-medium">{formatAmount(card.annualFee)}</p>
            </div>
          )}
          {card.creditLimit != null && card.creditLimit > 0 && (
            <div>
              <span className="text-muted-foreground text-xs">카드한도</span>
              <p className="font-medium">{formatAmount(card.creditLimit)}</p>
            </div>
          )}
          {card.performance && (
            <div>
              <span className="text-muted-foreground text-xs">실적</span>
              <p className="font-medium">{card.performance}</p>
            </div>
          )}
          {card.paymentAccount && (
            <div>
              <span className="text-muted-foreground text-xs">결제계좌</span>
              <p className="font-medium">{card.paymentAccount}</p>
            </div>
          )}
          {card.benefits && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">혜택</span>
              <p className="font-medium whitespace-pre-wrap leading-relaxed mt-0.5">
                {card.benefits}
              </p>
            </div>
          )}
          {card.note && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">비고</span>
              <p className="font-medium whitespace-pre-wrap">{card.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function Cards() {
  const utils = trpc.useUtils();

  // 카드
  const { data: cardList = [], isLoading: cardsLoading } = trpc.card.list.useQuery();
  const createCard = trpc.card.create.useMutation({
    onSuccess: () => {
      utils.card.list.invalidate();
      toast.success("카드가 추가되었습니다");
      setCardDialog(null);
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });
  const updateCard = trpc.card.update.useMutation({
    onSuccess: () => {
      utils.card.list.invalidate();
      toast.success("카드가 수정되었습니다");
      setCardDialog(null);
    },
    onError: () => toast.error("수정에 실패했습니다"),
  });
  const deleteCard = trpc.card.delete.useMutation({
    onSuccess: () => {
      utils.card.list.invalidate();
      toast.success("카드가 삭제되었습니다");
    },
    onError: () => toast.error("삭제에 실패했습니다"),
  });

  // 포인트
  const { data: pointList = [], isLoading: pointsLoading } = trpc.cardPoint.list.useQuery();
  const createPoint = trpc.cardPoint.create.useMutation({
    onSuccess: () => {
      utils.cardPoint.list.invalidate();
      toast.success("포인트/마일리지가 추가되었습니다");
      setPointDialog(null);
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });
  const updatePoint = trpc.cardPoint.update.useMutation({
    onSuccess: () => {
      utils.cardPoint.list.invalidate();
      toast.success("포인트/마일리지가 수정되었습니다");
      setPointDialog(null);
    },
    onError: () => toast.error("수정에 실패했습니다"),
  });
  const deletePoint = trpc.cardPoint.delete.useMutation({
    onSuccess: () => {
      utils.cardPoint.list.invalidate();
      toast.success("포인트/마일리지가 삭제되었습니다");
    },
    onError: () => toast.error("삭제에 실패했습니다"),
  });


  // 다이얼로그 상태
  const [cardDialog, setCardDialog] = useState<{
    mode: "create" | "edit";
    data: typeof emptyCard;
    id?: number;
  } | null>(null);
  const [pointDialog, setPointDialog] = useState<{
    mode: "create" | "edit";
    data: typeof emptyPoint;
    id?: number;
  } | null>(null);

  // 집계
  const creditCards = (cardList as CardRow[]).filter((c) => c.cardType === "신용카드");
  const checkCards = (cardList as CardRow[]).filter((c) => c.cardType === "체크카드");
  const totalAnnualFee = (cardList as CardRow[]).reduce(
    (s, c) => s + (c.annualFee ?? 0),
    0
  );
  const totalPoints = (pointList as PointRow[]).reduce(
    (s, p) => s + (p.balance ?? 0),
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
          보유카드 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          신용카드·체크카드 정보 및 포인트/마일리지를 관리합니다
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "신용카드", value: `${creditCards.length}장`, icon: CreditCard, color: "var(--primary)" },
          { label: "체크카드", value: `${checkCards.length}장`, icon: CreditCard, color: "oklch(0.50 0.14 150)" },
          { label: "연간 연회비", value: formatAmount(totalAnnualFee), icon: CreditCard, color: "oklch(0.58 0.16 30)" },
          { label: "포인트/마일리지", value: `${totalPoints.toLocaleString("ko-KR")}P`, icon: Coins, color: "var(--gold)" },
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
              <item.icon className="w-5 h-5" style={{ color: item.color }} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-bold text-sm">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <Tabs defaultValue="cards">
        <TabsList className="mb-4">
          <TabsTrigger value="cards">
            <CreditCard className="w-4 h-4 mr-1.5" />
            보유카드 ({(cardList as CardRow[]).length})
          </TabsTrigger>
          <TabsTrigger value="points">
            <Coins className="w-4 h-4 mr-1.5" />
            포인트/마일리지 ({(pointList as PointRow[]).length})
          </TabsTrigger>
        </TabsList>

        {/* ── 보유카드 탭 ── */}
        <TabsContent value="cards" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setCardDialog({ mode: "create", data: { ...emptyCard } })
              }
            >
              <Plus className="w-4 h-4 mr-1.5" />
              카드 추가
            </Button>
          </div>

          {cardsLoading ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : (cardList as CardRow[]).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">등록된 카드가 없습니다</p>
              <p className="text-xs mt-1">카드 추가 버튼을 눌러 시작하세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 신용카드 */}
              {creditCards.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    신용카드 ({creditCards.length})
                  </h3>
                  {creditCards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      onEdit={() =>
                        setCardDialog({
                          mode: "edit",
                          id: card.id,
                          data: {
                            cardType: card.cardType,
                            cardCompany: card.cardCompany,
                            cardName: card.cardName ?? "",
                            benefits: card.benefits ?? "",
                            annualFee: card.annualFee ?? 0,
                            performance: card.performance ?? "",
                            purpose: card.purpose ?? "",
                            creditLimit: card.creditLimit ?? 0,
                            expiryDate: card.expiryDate ?? "",
                            paymentDate: card.paymentDate ?? "",
                            paymentAccount: card.paymentAccount ?? "",
                            note: card.note ?? "",
                          },
                        })
                      }
                      onDelete={() => {
                        if (confirm("이 카드를 삭제하시겠습니까?")) {
                          deleteCard.mutate({ id: card.id });
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 체크카드 */}
              {checkCards.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    체크카드 ({checkCards.length})
                  </h3>
                  {checkCards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      onEdit={() =>
                        setCardDialog({
                          mode: "edit",
                          id: card.id,
                          data: {
                            cardType: card.cardType,
                            cardCompany: card.cardCompany,
                            cardName: card.cardName ?? "",
                            benefits: card.benefits ?? "",
                            annualFee: card.annualFee ?? 0,
                            performance: card.performance ?? "",
                            purpose: card.purpose ?? "",
                            creditLimit: card.creditLimit ?? 0,
                            expiryDate: card.expiryDate ?? "",
                            paymentDate: card.paymentDate ?? "",
                            paymentAccount: card.paymentAccount ?? "",
                            note: card.note ?? "",
                          },
                        })
                      }
                      onDelete={() => {
                        if (confirm("이 카드를 삭제하시겠습니까?")) {
                          deleteCard.mutate({ id: card.id });
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── 포인트/마일리지 탭 ── */}
        <TabsContent value="points" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setPointDialog({ mode: "create", data: { ...emptyPoint } })
              }
            >
              <Plus className="w-4 h-4 mr-1.5" />
              포인트/마일리지 추가
            </Button>
          </div>

          {pointsLoading ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : (pointList as PointRow[]).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">등록된 포인트/마일리지가 없습니다</p>
              <p className="text-xs mt-1">추가 버튼을 눌러 시작하세요</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(pointList as PointRow[]).map((pt) => (
                <div
                  key={pt.id}
                  className="rounded-xl border bg-card p-4 space-y-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "oklch(0.90 0.06 75)" }}
                      >
                        <Coins className="w-4 h-4" style={{ color: "var(--gold)" }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{pt.name}</p>
                        {pt.purpose && (
                          <p className="text-xs text-muted-foreground">{pt.purpose}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setPointDialog({
                            mode: "edit",
                            id: pt.id,
                            data: {
                              name: pt.name,
                              benefits: pt.benefits ?? "",
                              balance: pt.balance ?? 0,
                              purpose: pt.purpose ?? "",
                              note: pt.note ?? "",
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
                          if (confirm("삭제하시겠습니까?")) {
                            deletePoint.mutate({ id: pt.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">잔액</span>
                    <span className="font-bold text-sm" style={{ color: "var(--gold)" }}>
                      {(pt.balance ?? 0).toLocaleString("ko-KR")} P
                    </span>
                  </div>

                  {pt.benefits && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">혜택</p>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">
                        {pt.benefits}
                      </p>
                    </div>
                  )}

                  {pt.note && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">비고</p>
                      <p className="text-xs text-muted-foreground">{pt.note}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* 카드 다이얼로그 */}
      {cardDialog && (
        <CardDialog
          open={true}
          onClose={() => setCardDialog(null)}
          initial={cardDialog.data}
          onSave={(data) => {
            if (cardDialog.mode === "create") {
              createCard.mutate(data);
            } else if (cardDialog.id) {
              updateCard.mutate({ id: cardDialog.id, data });
            }
          }}
        />
      )}

      {/* 포인트 다이얼로그 */}
      {pointDialog && (
        <PointDialog
          open={true}
          onClose={() => setPointDialog(null)}
          initial={pointDialog.data}
          onSave={(data) => {
            if (pointDialog.mode === "create") {
              createPoint.mutate(data);
            } else if (pointDialog.id) {
              updatePoint.mutate({ id: pointDialog.id, data });
            }
          }}
        />
      )}

    </div>
  );
}
