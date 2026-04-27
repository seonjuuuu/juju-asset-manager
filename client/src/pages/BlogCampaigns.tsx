import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, CalendarIcon, BarChart2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const CAMPAIGN_TYPES = ["방문형", "배송형", "원고형", "기타"];
const CATEGORIES = ["카페", "맛집", "숙소", "뷰티", "생활용품", "식품", "기타"];

const EMPTY_FORM = {
  platform: "", campaignType: "방문형", category: "카페", businessName: "",
  amount: 0, endDate: "", visitDate: "", reviewDone: false, completed: false, note: "",
};

type Campaign = {
  id: number;
  platform: string | null;
  campaignType: string | null;
  category: string | null;
  businessName: string | null;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  visitDate: string | null;
  reviewDone: boolean | null;
  completed: boolean | null;
  note: string | null;
};

// ─── D-day 계산 ───────────────────────────────────────────────────────────────
function isValidDate(value: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDday(endDate: string | null): { label: string; className: string; isExpired: boolean } | null {
  if (!endDate || !isValidDate(endDate)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "마감", className: "bg-muted text-muted-foreground", isExpired: true };
  if (diff === 0) return { label: "D-day", className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", isExpired: false };
  if (diff <= 3) return { label: `D-${diff}`, className: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400", isExpired: false };
  return { label: `D-${diff}`, className: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", isExpired: false };
}

// ─── 날짜 선택기 ──────────────────────────────────────────────────────────────
function DatePickerField({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const invalid = value.length > 0 && !isValidDate(value);
  const selected = !invalid && value ? new Date(value) : undefined;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 ${invalid ? "border-red-400 focus-visible:ring-red-400" : ""}`}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  onChange(format(d, "yyyy-MM-dd"));
                  setOpen(false);
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid && (
        <p className="text-xs text-red-500">날짜를 올바르게 입력해주세요 (예: 2026-05-20)</p>
      )}
    </div>
  );
}

export default function BlogCampaigns() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterCompleted, setFilterCompleted] = useState<"전체" | "완료">("전체");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const utils = trpc.useUtils();
  const { data: campaigns = [], isLoading } = trpc.blogCampaign.list.useQuery();

  const createMutation = trpc.blogCampaign.create.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.blogCampaign.update.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.blogCampaign.delete.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });
  const toggleMutation = trpc.blogCampaign.update.useMutation({
    onSuccess: () => utils.blogCampaign.list.invalidate(),
  });

  const [showStats, setShowStats] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const filtered = campaigns.filter(c => {
    if (filterCompleted === "완료") return c.completed;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalAmount = campaigns.reduce((s, c) => s + (c.amount ?? 0), 0);
  const completedCount = campaigns.filter(c => c.completed).length;
  const reviewDoneCount = campaigns.filter(c => c.reviewDone).length;

  // 월별 리스트 (방문/수령일 기준)
  const selectedMonthData = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    const items = campaigns.filter(c => c.visitDate?.startsWith(key));
    return { label, key, items };
  }, [monthOffset, campaigns]);

  // 월별 통계 (방문/수령일 기준, 최근 12개월)
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const rows: {
      month: string;
      건수: number;
      완료: number;
      혜택금액: number;
      리뷰완료: number;
    }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthly = campaigns.filter(c => c.visitDate?.startsWith(key));
      rows.push({
        month: label,
        건수: monthly.length,
        완료: monthly.filter(c => c.completed).length,
        혜택금액: monthly.reduce((s, c) => s + (c.amount ?? 0), 0),
        리뷰완료: monthly.filter(c => c.reviewDone).length,
      });
    }
    return rows;
  }, [campaigns]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      platform: c.platform ?? "",
      campaignType: c.campaignType ?? "방문형",
      category: c.category ?? "카페",
      businessName: c.businessName ?? "",
      amount: c.amount ?? 0,
      endDate: c.endDate ?? "",
      visitDate: c.visitDate ?? "",
      reviewDone: c.reviewDone ?? false,
      completed: c.completed ?? false,
      note: c.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      platform: form.platform || undefined,
      campaignType: form.campaignType || undefined,
      category: form.category || undefined,
      businessName: form.businessName || undefined,
      amount: form.amount || undefined,
      endDate: form.endDate || undefined,
      visitDate: form.visitDate || undefined,
      reviewDone: form.reviewDone,
      completed: form.completed,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const typeColors: Record<string, string> = {
    "방문형": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "배송형": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "원고형": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "기타": "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">블로그 체험단</h1>
          <p className="text-sm text-muted-foreground mt-0.5">체험단 활동 기록 및 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 체험단 추가
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">총 체험단 수</p>
          <p className="text-xl font-bold">{campaigns.length}건</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">완료 / 리뷰 완료</p>
          <p className="text-xl font-bold">{completedCount} / {reviewDoneCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">총 혜택 금액</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₩{formatAmount(totalAmount)}</p>
        </div>
      </div>

      {/* 월별 통계 토글 */}
      <Card>
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => setShowStats(v => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              월별 통계 (최근 12개월 · 방문/수령일 기준)
            </CardTitle>
            <span className="text-xs text-muted-foreground">{showStats ? "접기 ▲" : "펼치기 ▼"}</span>
          </div>
        </CardHeader>

        {showStats && (
          <CardContent className="pt-0 space-y-4">
            {/* 바 차트 */}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyStats} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "혜택금액" ? [`₩${formatAmount(value)}`, "혜택금액"] : [value, name]
                  }
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                <Bar yAxisId="right" dataKey="혜택금액" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* 월별 상세 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">월</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">건수</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">완료</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">리뷰완료</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">혜택금액</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyStats.map(row => (
                    <tr
                      key={row.month}
                      className={`border-b border-border/50 hover:bg-muted/30 ${row.건수 === 0 ? "opacity-40" : ""}`}
                    >
                      <td className="py-2 px-3 font-medium">{row.month}</td>
                      <td className="py-2 px-3 text-center">
                        {row.건수 > 0 ? `${row.건수}건` : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={row.완료 > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}>
                          {row.완료 > 0 ? `${row.완료}건` : "-"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={row.리뷰완료 > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-muted-foreground"}>
                          {row.리뷰완료 > 0 ? `${row.리뷰완료}건` : "-"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.혜택금액 > 0 ? `₩${formatAmount(row.혜택금액)}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 월별 리스트 */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <p className="text-base font-bold">{selectedMonthData.label}</p>
              <p className="text-xs text-muted-foreground">방문/수령일 기준 · {selectedMonthData.items.length}건</p>
              {monthOffset !== 0 && (
                <button className="text-xs text-primary underline underline-offset-2" onClick={() => setMonthOffset(0)}>
                  이번달로
                </button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {selectedMonthData.items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">이 달에 방문/수령 예정인 체험단이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {selectedMonthData.items.map(c => {
                const dday = getDday(c.endDate);
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {/* 타입 뱃지 */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${typeColors[c.campaignType ?? "기타"] ?? typeColors["기타"]}`}>
                      {c.campaignType ?? "-"}
                    </span>
                    {/* 업체명 + 카테고리 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{c.businessName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.category && `${c.category} · `}
                        {c.platform && c.platform}
                        {c.visitDate && ` · 방문 ${c.visitDate}`}
                      </p>
                    </div>
                    {/* D-day */}
                    {dday && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${dday.className}`}>
                        {dday.label}
                      </span>
                    )}
                    {/* 금액 */}
                    {c.amount ? (
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        ₩{formatAmount(c.amount)}
                      </span>
                    ) : null}
                    {/* 리뷰 / 완료 토글 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="리뷰 완료"
                        onClick={() => toggleMutation.mutate({ id: c.id, data: { reviewDone: !c.reviewDone } })}
                        className={`transition-colors ${c.reviewDone ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400"}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        title="체험단 완료"
                        onClick={() => toggleMutation.mutate({ id: c.id, data: { completed: !c.completed } })}
                        className={`transition-colors ${c.completed ? "text-blue-500" : "text-muted-foreground hover:text-blue-400"}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex gap-2">
        {(["전체", "완료"] as const).map(f => (
          <button key={f} onClick={() => { setFilterCompleted(f); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterCompleted === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">플랫폼</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">타입</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">업체명</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">금액</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">마감일</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">D-day</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">방문/수령일</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">리뷰</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">완료</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">체험단 내역이 없습니다</td></tr>
              ) : (
                paginated.map(c => {
                  const dday = getDday(c.endDate);
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm">{c.platform ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[c.campaignType ?? "기타"] ?? typeColors["기타"]}`}>
                          {c.campaignType ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{c.businessName ?? "-"}</p>
                          {c.category && <p className="text-xs text-muted-foreground">{c.category}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {c.amount ? `₩${formatAmount(c.amount)}` : "-"}
                      </td>
                      {/* 마감일 */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {c.endDate ?? "-"}
                      </td>
                      {/* D-day */}
                      <td className="px-4 py-3 text-center">
                        {dday ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dday.className}`}>
                            {dday.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      {/* 방문/수령일 */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {c.visitDate ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleMutation.mutate({ id: c.id, data: { reviewDone: !c.reviewDone } })}
                          className={`transition-colors ${c.reviewDone ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400"}`}
                        >
                          {c.reviewDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleMutation.mutate({ id: c.id, data: { completed: !c.completed } })}
                          className={`transition-colors ${c.completed ? "text-blue-500" : "text-muted-foreground hover:text-blue-400"}`}
                        >
                          {c.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMutation.mutate({ id: c.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* 페이지 컨트롤 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / 총 {filtered.length}건
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="icon" className="h-7 w-7"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline" size="icon" className="h-7 w-7"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "체험단 수정" : "체험단 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">플랫폼</Label>
                <Input value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="예: 디너의여왕" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">타입</Label>
                <Select value={form.campaignType} onValueChange={v => setForm(f => ({ ...f, campaignType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPAIGN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">업체명</Label>
                <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="업체명" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">카테고리</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} placeholder="0" suffix="원" className="mt-1" />
            </div>
            {/* 마감일 - 달력 선택 */}
            <div>
              <Label className="text-xs">마감일</Label>
              <div className="mt-1">
                <DatePickerField
                  value={form.endDate}
                  onChange={(v) => setForm(f => ({ ...f, endDate: v }))}
                  placeholder="마감일 선택"
                />
              </div>
              {/* D-day 미리보기 */}
              {form.endDate && (() => {
                const dday = getDday(form.endDate);
                return dday ? (
                  <span className={`inline-block text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${dday.className}`}>
                    {dday.label}
                  </span>
                ) : null;
              })()}
            </div>
            {/* 방문/수령일 - 달력 선택 */}
            <div>
              <Label className="text-xs">방문/수령일</Label>
              <div className="mt-1">
                <DatePickerField
                  value={form.visitDate}
                  onChange={(v) => setForm(f => ({ ...f, visitDate: v }))}
                  placeholder="방문/수령일 선택"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.reviewDone} onChange={e => setForm(f => ({ ...f, reviewDone: e.target.checked }))} className="rounded" />
                리뷰 완료
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.completed} onChange={e => setForm(f => ({ ...f, completed: e.target.checked }))} className="rounded" />
                체험단 완료
              </label>
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "수정" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
