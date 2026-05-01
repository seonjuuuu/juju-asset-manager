import { CurrencyInput } from "@/components/ui/currency-input";
import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, CheckCircle2, CalendarIcon,
  ChevronDown, ChevronLeft, ChevronRight, BellRing, Settings2, X, TrendingUp, ListChecks, Star,
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const CAMPAIGN_TYPES = ["방문형", "배송형", "원고형", "기타"];
const CATEGORIES = ["카페", "맛집", "숙소", "뷰티", "생활용품", "식품", "여가", "기타"];
const PLATFORM_OPTIONS = ["디너의여왕", "레뷰", "리뷰노트", "와이리"];

const TYPE_COLORS: Record<string, string> = {
  "방문형": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "배송형": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "원고형": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "기타": "bg-muted text-muted-foreground",
};

const TYPE_CHART_COLORS: Record<string, string> = {
  "방문형": "#5b7cfa",
  "배송형": "#a855f7",
  "원고형": "#f59e0b",
  "기타": "#94a3b8",
};

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

const fmt = (n: number) => `₩${formatAmount(n)}`;

// ─── D-day 계산 ───────────────────────────────────────────────────────────────
function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return trimmed;
}

function isValidDate(value: string): boolean {
  const normalized = normalizeDateInput(value);
  if (!normalized) return false;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === Number(match[1]) &&
    d.getMonth() + 1 === Number(match[2]) &&
    d.getDate() === Number(match[3])
  );
}

function getDday(endDate: string | null): { label: string; className: string; isExpired: boolean } | null {
  if (!endDate || !isValidDate(endDate)) return null;
  const normalizedEndDate = normalizeDateInput(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(normalizedEndDate);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "마감", className: "bg-muted text-muted-foreground", isExpired: true };
  if (diff === 0) return { label: "D-day", className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", isExpired: false };
  if (diff <= 3) return { label: `D-${diff}`, className: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400", isExpired: false };
  return { label: `D-${diff}`, className: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", isExpired: false };
}

function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function isPastDeadline(endDate: string | null): boolean {
  if (!endDate || !isValidDate(endDate)) return false;
  return getDday(endDate)?.isExpired ?? false;
}

function isCampaignCompleted(campaign: Pick<Campaign, "endDate">): boolean {
  return isPastDeadline(campaign.endDate);
}

function isVisitDueOrPassed(visitDate: string | null): boolean {
  if (!visitDate || !isValidDate(visitDate)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visit = new Date(normalizeDateInput(visitDate));
  visit.setHours(0, 0, 0, 0);
  return visit.getTime() <= today.getTime();
}

function isVisitCompleted(campaign: Pick<Campaign, "completed" | "visitDate">): boolean {
  return !!campaign.completed || isVisitDueOrPassed(campaign.visitDate);
}

// ─── 날짜 선택기 ──────────────────────────────────────────────────────────────
function DatePickerField({ value, onChange, placeholder = "YYYY-MM-DD", autoOpenKey = 0 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoOpenKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeDateInput(value);
  const invalid = value.length > 0 && !isValidDate(value);
  const selected = !invalid && normalizedValue ? new Date(normalizedValue) : undefined;
  useEffect(() => {
    if (autoOpenKey > 0) setOpen(true);
  }, [autoOpenKey]);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            const digits = next.replace(/\D/g, "");
            onChange(digits.length === 8 ? normalizeDateInput(next) : next);
          }}
          onBlur={() => {
            if (value) onChange(normalizeDateInput(value));
          }}
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
              onSelect={(d) => { if (d) { onChange(format(d, "yyyy-MM-dd")); setOpen(false); } }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid && <p className="text-xs text-red-500">날짜를 올바르게 입력해주세요 (예: 2026-05-20)</p>}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function BlogCampaigns() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([]);
  const [visitDatePickerOpenKey, setVisitDatePickerOpenKey] = useState(0);
  const [platformPickerOpen, setPlatformPickerOpen] = useState(false);
  const [platformActiveIndex, setPlatformActiveIndex] = useState(0);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const addCustomCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    setCustomCategories((prev) => (prev.includes(value) || CATEGORIES.includes(value) ? prev : [...prev, value]));
    setForm(f => ({ ...f, category: value }));
    setNewCategory("");
  };
  const deleteCustomCategory = (category: string) => {
    setCustomCategories((prev) => prev.filter((item) => item !== category));
    setForm((f) => ({ ...f, category: f.category === category ? "카페" : f.category }));
  };
  const platformSuggestions = useMemo(() => {
    const query = form.platform.trim();
    if (!query) return PLATFORM_OPTIONS;
    return PLATFORM_OPTIONS.filter((platform) => platform.includes(query));
  }, [form.platform]);
  const categoryOptions = useMemo(() => Array.from(new Set([...CATEGORIES, ...customCategories])), [customCategories]);

  useEffect(() => {
    setPlatformActiveIndex(0);
  }, [form.platform]);

  const utils = trpc.useUtils();
  const { data: campaigns = [], isLoading } = trpc.blogCampaign.list.useQuery();

  const createMutation = trpc.blogCampaign.create.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("추가되었습니다"); closeDialog(); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.blogCampaign.update.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("수정되었습니다"); closeDialog(); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.blogCampaign.delete.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: () => toast.error("삭제 실패"),
  });

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  // ─── 마감 임박 알림 ───────────────────────────────────────────────────────
  const urgentCampaigns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return campaigns
      .filter((c) => {
        if (isCampaignCompleted(c)) return false;
        if (!c.endDate || !isValidDate(c.endDate)) return false;
        if (dismissedAlerts.includes(c.id)) return false;
        const end = new Date(normalizeDateInput(c.endDate));
        end.setHours(0, 0, 0, 0);
        const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 7;
      })
      .sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""));
  }, [campaigns, dismissedAlerts]);

  // ─── 월별 필터 (visitDate 기준) ───────────────────────────────────────────
  const monthlyRecords = useMemo(() =>
    campaigns.filter(c => {
      if (!c.visitDate) return false;
      const [y, m] = c.visitDate.split("-").map(Number);
      return y === year && m === month;
    }),
    [campaigns, year, month]
  );

  // ─── 요약 ─────────────────────────────────────────────────────────────────
  const monthAmount = useMemo(() => monthlyRecords.reduce((s, c) => s + (c.amount ?? 0), 0), [monthlyRecords]);
  const monthCompleted = useMemo(() => monthlyRecords.filter(c => isCampaignCompleted(c)).length, [monthlyRecords]);
  const monthReviewDone = useMemo(() => monthlyRecords.filter(c => c.reviewDone).length, [monthlyRecords]);

  const yearAmount = useMemo(() =>
    campaigns.reduce((s, c) => {
      if (!c.visitDate) return s;
      if (Number(c.visitDate.slice(0, 4)) !== year) return s;
      return s + (c.amount ?? 0);
    }, 0),
    [campaigns, year]
  );

  // ─── 차트 데이터 ─────────────────────────────────────────────────────────
  const yearlyChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    for (const c of campaigns) {
      if (!c.visitDate) continue;
      const [y, m] = c.visitDate.split("-").map(Number);
      if (y === year) map[m] += c.amount ?? 0;
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}월`,
      혜택금액: map[i + 1],
    }));
  }, [campaigns, year]);

  const fiveYearChart = useMemo(() => {
    const currentYear = now.getFullYear();
    const map: Record<number, number> = {};
    for (let y = currentYear - 4; y <= currentYear; y++) map[y] = 0;
    for (const c of campaigns) {
      if (!c.visitDate) continue;
      const y = Number(c.visitDate.slice(0, 4));
      if (y in map) map[y] += c.amount ?? 0;
    }
    return Object.keys(map).map(Number).sort().map(y => ({ year: `${y}년`, 혜택금액: map[y] }));
  }, [campaigns]);

  const typeChart = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      const t = c.campaignType ?? "기타";
      map[t] = (map[t] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value, color: TYPE_CHART_COLORS[name] ?? "#94a3b8" }));
  }, [campaigns]);

  const CATEGORY_COLORS = ["#10b981", "#5b7cfa", "#f59e0b", "#a855f7", "#f97316", "#06b6d4", "#94a3b8"];
  const categoryChart = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      const cat = c.category ?? "기타";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [campaigns]);

  const [hiddenType, setHiddenType] = useState<Record<string, boolean>>({});
  const [hiddenCategory, setHiddenCategory] = useState<Record<string, boolean>>({});

  // ─── 폼 핸들러 ───────────────────────────────────────────────────────────
  const closeDialog = () => {
    setDialogOpen(false);
    setVisitDatePickerOpenKey(0);
    setPlatformPickerOpen(false);
    setAddingCategory(false);
    setNewCategory("");
  };
  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setVisitDatePickerOpenKey(0);
    setPlatformPickerOpen(false);
    setAddingCategory(false);
    setNewCategory("");
    setDialogOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      platform: c.platform ?? "", campaignType: c.campaignType ?? "방문형",
      category: c.category ?? "카페", businessName: c.businessName ?? "",
      amount: c.amount ?? 0, endDate: c.endDate ?? "", visitDate: c.visitDate ?? "",
      reviewDone: c.reviewDone ?? false, completed: c.completed ?? false, note: c.note ?? "",
    });
    setPlatformPickerOpen(false);
    setAddingCategory(false);
    setNewCategory("");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const normalizedEndDate = form.endDate ? normalizeDateInput(form.endDate) : "";
    const normalizedVisitDate = form.visitDate ? normalizeDateInput(form.visitDate) : "";
    if (normalizedEndDate && !isValidDate(normalizedEndDate)) {
      toast.error("마감일을 올바르게 입력해주세요");
      return;
    }
    if (normalizedVisitDate && !isValidDate(normalizedVisitDate)) {
      toast.error("방문/수령일을 올바르게 입력해주세요");
      return;
    }
    const data = {
      platform: form.platform || undefined, campaignType: form.campaignType || undefined,
      category: form.category || undefined, businessName: form.businessName || undefined,
      amount: form.amount || undefined, endDate: normalizedEndDate || undefined,
      visitDate: normalizedVisitDate || undefined,
      reviewDone: normalizedVisitDate && (form.completed || isVisitDueOrPassed(normalizedVisitDate)) ? form.reviewDone : false,
      completed: !!normalizedVisitDate && (form.completed || isVisitDueOrPassed(normalizedVisitDate)),
      note: form.note || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  // ─── 테이블 렌더 ─────────────────────────────────────────────────────────
  function renderTable(records: Campaign[]) {
    if (records.length === 0) return null;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-3 font-medium">방문/수령 예정일</th>
              <th className="text-left py-2 px-3 font-medium">업체명</th>
              <th className="text-center py-2 px-3 font-medium">타입</th>
              <th className="text-right py-2 px-3 font-medium">혜택금액</th>
              <th className="text-left py-2 px-3 font-medium">마감일</th>
              <th className="text-center py-2 px-3 font-medium">D-day</th>
              <th className="text-center py-2 px-3 font-medium">방문</th>
              <th className="text-center py-2 px-3 font-medium">리뷰</th>
              <th className="text-center py-2 px-3 font-medium">상태</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {records.map(c => {
              const dday = getDday(c.endDate);
              const completed = isCampaignCompleted(c);
              const visited = isVisitCompleted(c);
              return (
                <tr key={c.id} className={`border-b hover:bg-muted/30 transition-colors ${completed ? "opacity-60" : ""}`}>
                  <td className="py-2.5 px-3 text-muted-foreground">{c.visitDate ?? "—"}</td>
                  <td className="py-2.5 px-3">
                    <p className={`font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>
                      {c.businessName ?? "—"}
                    </p>
                    {(c.category || c.platform) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[c.category, c.platform].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[c.campaignType ?? "기타"] ?? TYPE_COLORS["기타"]}`}>
                      {c.campaignType ?? "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                    {c.amount ? fmt(c.amount) : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">{c.endDate ?? "—"}</td>
                  <td className="py-2.5 px-3 text-center">
                    {dday ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dday.className}`}>{dday.label}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Switch
                      checked={visited}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          openEdit(c);
                          setVisitDatePickerOpenKey((key) => key + 1);
                          return;
                        }
                        updateMutation.mutate({
                          id: c.id,
                          data: {
                            completed: checked,
                            visitDate: checked && !c.visitDate ? todayString() : c.visitDate,
                            reviewDone: checked ? c.reviewDone ?? false : false,
                          },
                        });
                      }}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Switch
                      checked={c.reviewDone ?? false}
                      disabled={!visited}
                      onCheckedChange={() => updateMutation.mutate({ id: c.id, data: { reviewDone: !c.reviewDone } })}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {completed ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">체험단 완료</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">진행중</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
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
          <h1 className="text-xl font-bold text-foreground">블로그 체험단</h1>
          <p className="text-sm text-muted-foreground mt-0.5">체험단 활동 기록 및 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 체험단 추가
        </Button>
      </div>

      {/* D-day 알림 배너 */}
      {urgentCampaigns.length > 0 && (
        <div className="space-y-2">
          {urgentCampaigns.map((c) => {
            const dday = getDday(c.endDate);
            const isToday = dday?.label === "D-day";
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                  isToday
                    ? "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800"
                    : "border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800"
                }`}
              >
                <BellRing className={`w-4 h-4 flex-shrink-0 ${isToday ? "text-red-500" : "text-orange-500"}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-semibold mr-2 ${isToday ? "text-red-700 dark:text-red-400" : "text-orange-700 dark:text-orange-400"}`}>
                    {dday?.label}
                  </span>
                  <span className="text-foreground font-medium truncate">{c.businessName ?? c.platform ?? "체험단"}</span>
                  {c.endDate && <span className="text-muted-foreground ml-2 text-xs">마감 {c.endDate}</span>}
                </div>
                <button
                  onClick={() => setDismissedAlerts((prev) => [...prev, c.id])}
                  className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-500/10"><TrendingUp className="w-5 h-5 text-teal-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{year}년 혜택금액</p>
                <p className="text-xl font-bold text-teal-600">{fmt(yearAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{month}월 혜택금액</p>
                <p className="text-xl font-bold text-emerald-600">{fmt(monthAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><ListChecks className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{month}월 체험단</p>
                <p className="text-xl font-bold">{monthlyRecords.length}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10"><CheckCircle2 className="w-5 h-5 text-violet-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">완료</p>
                <p className="text-xl font-bold">{monthCompleted}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><Star className="w-5 h-5 text-amber-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">리뷰 완료</p>
                <p className="text-xl font-bold">{monthReviewDone}건</p>
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
        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{year}년 {month}월 체험단 내역</CardTitle>
                <div className="flex items-center gap-1">
                  {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs px-2 mr-1"
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
                                isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
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
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
              ) : monthlyRecords.length === 0 ? (
                <div className="text-center py-12">
                  <ListChecks className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">이번 달 체험단 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                  </Button>
                </div>
              ) : (
                <>
                  {renderTable(monthlyRecords)}
                  <div className="mt-2 pt-2 border-t flex justify-end gap-8 text-sm px-3">
                    <span className="text-muted-foreground font-medium">합계</span>
                    <span className="font-bold text-emerald-600">{fmt(monthAmount)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── 전체 내역 탭 ─── */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">전체 체험단 내역 ({campaigns.length}건)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <ListChecks className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">체험단 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                  </Button>
                </div>
              ) : (
                <>
                  {renderTable([...campaigns].sort((a, b) => {
                    const da = a.visitDate ?? "";
                    const db = b.visitDate ?? "";
                    if (!da && !db) return 0;
                    if (!da) return 1;
                    if (!db) return -1;
                    return db.localeCompare(da);
                  }))}
                  <div className="mt-2 pt-2 border-t flex justify-end gap-8 text-sm px-3">
                    <span className="text-muted-foreground font-medium">총 혜택금액</span>
                    <span className="font-bold text-emerald-600">
                      {fmt(campaigns.reduce((s, c) => s + (c.amount ?? 0), 0))}
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
            {/* 연간 월별 혜택금액 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{year}년 월별 혜택금액</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearlyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`₩${formatAmount(v)}`, "혜택금액"]} />
                    <Bar dataKey="혜택금액" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 최근 5개년 혜택금액 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">최근 5개년 혜택금액 합계</CardTitle>
              </CardHeader>
              <CardContent>
                {fiveYearChart.every(d => d.혜택금액 === 0) ? (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={fiveYearChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`₩${formatAmount(v)}`, "혜택금액"]} />
                      <Bar dataKey="혜택금액" fill="#5b7cfa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 타입별 · 카테고리별 파이 차트 */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">전체 타입 분포</CardTitle>
              </CardHeader>
              <CardContent>
                {typeChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={typeChart.filter(d => !hiddenType[d.name])}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {typeChart.filter(d => !hiddenType[d.name]).map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v}건`} />
                      <Legend
                        payload={typeChart.map(d => ({ value: d.name, type: "square" as const, color: d.color }))}
                        onClick={(e: any) => {
                          const key = String(e.value ?? "");
                          if (key) setHiddenType(prev => ({ ...prev, [key]: !prev[key] }));
                        }}
                        formatter={(value: string) => (
                          <span style={{ opacity: hiddenType[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">전체 카테고리 분포</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categoryChart.filter(d => !hiddenCategory[d.name])}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {categoryChart.filter(d => !hiddenCategory[d.name]).map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v}건`} />
                      <Legend
                        payload={categoryChart.map(d => ({ value: d.name, type: "square" as const, color: d.color }))}
                        onClick={(e: any) => {
                          const key = String(e.value ?? "");
                          if (key) setHiddenCategory(prev => ({ ...prev, [key]: !prev[key] }));
                        }}
                        formatter={(value: string) => (
                          <span style={{ opacity: hiddenCategory[value] ? 0.35 : 1, cursor: "pointer" }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "체험단 수정" : "체험단 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">플랫폼</Label>
                <div className="relative mt-1">
                  <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <input
                      value={form.platform}
                      onChange={e => {
                        const value = e.target.value;
                        setForm(f => ({ ...f, platform: value }));
                        setPlatformPickerOpen(value.trim().length > 0);
                      }}
                      onKeyDown={(e) => {
                        if (!platformPickerOpen || platformSuggestions.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setPlatformActiveIndex((idx) => (idx + 1) % platformSuggestions.length);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setPlatformActiveIndex((idx) => (idx - 1 + platformSuggestions.length) % platformSuggestions.length);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          setForm(f => ({ ...f, platform: platformSuggestions[platformActiveIndex] }));
                          setPlatformPickerOpen(false);
                        } else if (e.key === "Escape") {
                          setPlatformPickerOpen(false);
                        }
                      }}
                      onBlur={() => window.setTimeout(() => setPlatformPickerOpen(false), 120)}
                      placeholder="예: 디너의여왕"
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      className="flex w-9 shrink-0 items-center justify-center border-l border-input text-muted-foreground hover:bg-muted hover:text-foreground"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setPlatformPickerOpen((open) => !open)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  {platformPickerOpen && platformSuggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                      {platformSuggestions.map((platform, index) => (
                        <button
                          key={platform}
                          type="button"
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${index === platformActiveIndex ? "bg-muted" : "hover:bg-muted"}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setForm(f => ({ ...f, platform }));
                            setPlatformPickerOpen(false);
                          }}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                <div className="mt-1 flex gap-1">
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setAddingCategory((open) => !open)}>
                    {addingCategory ? <Settings2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
                {addingCategory && (
                  <div className="mt-2 rounded-md border border-border p-2">
                    <div className="flex gap-1">
                      <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          addCustomCategory();
                        }}
                        placeholder="새 카테고리"
                        className="h-9"
                        autoFocus
                      />
                      <Button type="button" size="sm" className="h-9 shrink-0" onClick={addCustomCategory}>
                        추가
                      </Button>
                    </div>
                    {customCategories.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {customCategories.map((category) => (
                          <span key={category} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-1 text-xs">
                            {category}
                            <button
                              type="button"
                              className="rounded-full text-muted-foreground hover:text-destructive"
                              onClick={() => deleteCustomCategory(category)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} placeholder="0" suffix="원" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">마감일</Label>
              <div className="mt-1">
                <DatePickerField value={form.endDate} onChange={(v) => setForm(f => ({ ...f, endDate: v }))} placeholder="마감일 선택" />
              </div>
              {form.endDate && (() => {
                const dday = getDday(form.endDate);
                return dday ? (
                  <span className={`inline-block text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${dday.className}`}>{dday.label}</span>
                ) : null;
              })()}
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">방문/수령 예정일</Label>
                <div className="mt-1">
                  <DatePickerField
                    value={form.visitDate}
                    onChange={(v) => {
                      const normalized = normalizeDateInput(v);
                      setForm(f => ({
                        ...f,
                        visitDate: v,
                        completed: isVisitDueOrPassed(normalized),
                        reviewDone: isVisitDueOrPassed(normalized) ? f.reviewDone : false,
                      }));
                    }}
                    placeholder="방문/수령 예정일 선택"
                    autoOpenKey={visitDatePickerOpenKey}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.completed || isVisitDueOrPassed(form.visitDate)}
                  onChange={e => {
                    if (e.target.checked) setVisitDatePickerOpenKey((key) => key + 1);
                    setForm(f => ({
                      ...f,
                      completed: e.target.checked,
                      visitDate: e.target.checked ? f.visitDate || todayString() : f.visitDate,
                      reviewDone: e.target.checked ? f.reviewDone : false,
                    }));
                  }}
                  className="rounded"
                />
                방문완료
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.reviewDone}
                  disabled={!(form.completed || isVisitDueOrPassed(form.visitDate))}
                  onChange={e => setForm(f => ({ ...f, reviewDone: e.target.checked }))}
                  className="rounded disabled:opacity-50"
                />
                리뷰 완료
              </label>
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>체험단 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
